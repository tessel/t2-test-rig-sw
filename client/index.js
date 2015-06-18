var express = require("express")
  , path = require('path')
  , rig_usb = require('./rig-usb.js')
  , configs = require('./config.json')
  , child_process = require('child_process')
  , request = require('request')
  , async = require('async')
  , fs = require('fs')
  , crypto = require('crypto')
  , path = require('path')
  ;

var DEBUG = true;
configs.host = require(path.join(__dirname, configs.hostPath));
var BUILD_PATH = configs.host.server+"builds/";
var BUILDS = require(path.join(__dirname, '../config.json')).builds;
var LOG_STATUS = {"inProgress": 0, "pass": 1, "fail": -1};
var LOG_NUMBERS = [];
Object.keys(LOG_STATUS).forEach(function(status){
  LOG_NUMBERS.push(LOG_STATUS[status]);
});


var lockedTesting = false;

var app = express();
var http = require('http');
var server = http.createServer(app);

var io = require('socket.io').listen(server);
io.set('transports', ['xhr-polling']);
io.set('polling duration', 10);

app.use(express.logger());

app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));
app.use("/bin", express.static(path.join(__dirname, 'bin')));
app.use(express.favicon('public/images/favicon.ico')); 

app.get('/', function(req, res) {
  var rigs = rig_usb.rigs.map(function(r){
    return parseRig(r);
  });

  res.render('index', {host: configs.host, rigs: rigs, 
    tests: configs.tests, builds: configs.builds})
});

function parseRig(dev){
  return {serialNumber: dev.serialNumber, build: dev.build};
}

String.prototype.escapeSpecialChars = function() {
    return this.replace(/\n/g, "")
               .replace(/\&/g, "\\&")
               .replace(/\r/g, "\\r")
               .replace(/\t/g, "\\t")
               .replace(/\f/g, "\\f");
};

function postRigs(rigs) {
  rigs = rigs.map(function(r){
    return r.serialNumber
  });

  request.post(configs.server+'bench', {body: {id: configs.host.name, 
    time: new Date().getTime(), build: configs.host.build, ip: '0.0.0.0', 
    gateway:'0.0.0.0', ssh: '0.0.0.0', port:'2222', rigs: rigs}
    , json: true});
}

function updateDeviceStatus(data){
  io.sockets.emit("updateTest", {serialNumber: data.serialNumber
    , test: data.test, deviceId: data.device, status: data.data.status});

  request.post(configs.server+'d/'+data.device+'/test', {"body": {"id": data.device, 
    "bench": configs.host.name, "time": new Date().getTime(), 
    "build": configs.host.build, "rig": data.serialNumber, 
    "test": data.test, "status": data.data.status}, json: true});
}

function reportLog(data, isJSON, isErr){
  request.post(configs.server+'logs', {body: { "identifiers":  {"device": data.device, "bench": configs.host.name, "rig": data.serialNumber}
    , "data": isJSON ? JSON.stringify(data) : data.toString()}, json: true});
}

function deviceFinished(serialNumber, passed) {
  io.sockets.emit("updateTest", {serialNumber: serialNumber
    , test: "all", status: passed})
}

function emitMessage(message, lock) {
  lockedTesting = lock;
  console.log("Emitting:", message);
  io.sockets.emit("message", {message: message, lock: lockedTesting});
}

function emitNote(data) {
  io.sockets.emit("addNote", {serialNumber: data.serialNumber, note: data.data});
}

rig_usb.on('attach', function(dev){
  console.log('Device attach');

  dev.on('detach', function() {
    console.log('Device detach');
    io.sockets.emit("removeRig", parseRig(dev));
    postRigs(rig_usb.rigs);
  });

  dev.on('ready', function() {
    console.log('Device with serial number', dev.serialNumber, 'is ready');
    dev.ready_led(true);
    io.sockets.emit("addRig", parseRig(dev));
    postRigs(rig_usb.rigs);
  });

  var running = false;

  dev.on('button-press', function() {
    if (lockedTesting) {
      emitMessage("Cannot test unit. Either there is a build update happening or the system needs a reboot", true);

      dev.ready_led(false);
      return;
    }

    io.sockets.emit("startTest", dev.serialNumber);
    console.log("Button pressed on", dev.serialNumber);

    if (running) {
      console.log("Already running")
      return
    }

    dev.pass_led(false);
    dev.fail_led(false);
    dev.ready_led(false);
    dev.testing_led(true);
    running = true;

    var ps = child_process.spawn('python', ['-u', 'tests/tests.py', dev.serialNumber])
    function parseData(data){
      console.log("parseData", data);
      // check if the data has a status code
      if (data.data && LOG_NUMBERS.indexOf(Number(data.data.status)) >= 0) {
        console.log("updating device status", data);
        updateDeviceStatus(data);
      }
      reportLog(data, true);
    }

    function escapeData(data, eachFunc) {
      if (data == ' ') return;

      fixedData = data.toString().escapeSpecialChars();
      fixedData = fixedData.split(/\}\s*\t*\{/);
      console.log("data", fixedData);
      var fixJSON = fixedData.length > 1 ? true : false;
      fixedData.forEach(function(d, i){
        if (fixJSON) {
          // for the first obj we need to add a '}', middle ones add a '{}', end one add a '{'
          if (i == 0){
            d = d+'}';
          } else if (i == (fixedData.length - 1)) {
            d = '{'+d;
          } else {
            d = '{'+d+'}';
          }
        }
        console.log(i, d);

        if (eachFunc && typeof(eachFunc) == 'function') {
          eachFunc(d, i);
        }
      });
    }

    // pipe data up to testaltor
    ps.stdout.on('data', function (data) {
      escapeData(data, function(d, i){
        parseData(JSON.parse(d));
      });
    });

    ps.stderr.on('data', function (data) {
      var note = '';
      var item = {};
      escapeData(data, function(d, i){
        d = JSON.parse(d);
        note = note + '\n'+d.data;
        item = d;
      });

      item.data = note;
      reportLog(item, true);
      emitNote(item);
    });

    ps.on('close', function(code) {
      console.log("Child exited with code", code)
      dev.testing_led(false);
      if (code == 0) {
        dev.pass_led(true);
        // successfully tested
        console.log("passed");
        deviceFinished(dev.serialNumber, true);
      } else {
        dev.fail_led(true);
        deviceFinished(dev.serialNumber, false);
      }
      dev.ready_led(true);
      running = false;
    });
  })

  dev.on('error', function(e) {
      emitMessage("Error on "+dev.serialNumber+": "+e+e.stack, false);
  });
});
rig_usb.start();

function heartbeat() {
  if (DEBUG) console.log("heartbeat at ", new Date().getTime());

  rigs = rig_usb.rigs.map(function(r){
    return r.serialNumber
  });

  request.post(configs.server+'bench', {body: {id: configs.host.name, 
    time: new Date().getTime(), build: configs.host.build, rigs: rigs}, json: true});
}

function getBuilds(cb){
  var buildsJSON = {};

  emitMessage("Updating builds. Do not test until update is finished.", true);

  async.forEachOf(BUILDS, function(build, i, callback){
    var url = BUILD_PATH+build;
    var binPath = path.join(__dirname, '/bin/'+build+".bin");

    var binFile = fs.createWriteStream(binPath);
    request.get(url+'.bin')
    .on('error', function(err){
      callback(err);
    })
    .on('response', function(res){
      res.pipe(binFile)
    });

    binFile.on('finish', function(){
      var buf = fs.readFileSync(binPath);
      var md5 = crypto.createHash('md5')
        .update(buf, 'utf8')
        .digest('hex')

      // check md5 sum
      request(url+"/info", function(err, res, body){
        body = JSON.parse(body);
        if (md5 != body.md5sum) return callback(new Error("Md5sum of "+url+" did not match. Got: "+md5+", expected: "+body.md5sum));

        buildsJSON[build] = {md5sum: body.md5sum, time: new Date().getTime(), build: body.build};

        callback();
      });
    });
      
  }, function(err){
    if (err) return cb && cb(err);
    // write the builds.json file
    fs.writeFile(path.join(__dirname, './build.json'), JSON.stringify(buildsJSON, null, 2), function(err){
      // reload configs
      configs.builds = require('./build.json');  
      emitMessage("Update finished.", false);

      cb && cb(err);
    });
  });
}

function checkBuild() {
  if (DEBUG) console.log("checking builds");

  // check all md5sums
  async.forEachOf(BUILDS, function(build, i, callback){
    request(BUILD_PATH+build+'/info', function(err, res, body) {
      body = JSON.parse(body);
      if (body.md5sum != configs.builds[build].md5sum) return callback("md5 does not match for "+build);

      callback();
    });
  }, function(err){
    if (err) {
      getBuilds();
    } else {
      console.log("Builds all match");
    }
  });
}

function checkClientBuild() {
  request(configs.server + "/client", function (err, res, version) {
    if (configs.version != version) {

      var newConfigs = JSON.stringify({name: configs.host.name, server: configs.server, version: configs.version, updateVersion: version});
      // write the updateVersion key
      fs.writeFile(path.join(__dirname, "./config.json"), newConfigs, function(err){
        if (err) {
          emitMessage("Could not finish checking client build", true);
          throw err;
        }

        // flash message that the system needs a reboot to update client code
        emitMessage("This test rig is outdated. Reboot to update.", true);
      });
    }
  });
}

setInterval(function(){
  heartbeat();
  checkBuild();
}, 1000*5*60);
// }, 1000*5*60); // every 5 min check

configs.tests = require(path.join(__dirname, '../config.json')).tests;
try {
  configs.builds = require(path.join(__dirname, './build.json'));

  // make sure we have all the build.json files in the /bin dir
  async.forEachOf(BUILDS, function(build, i, callback){
    fs.exists(path.join(__dirname, '/bin/'+build+'.bin'), function(exists){
      if (!exists) return callback("missing "+build);
      callback();
    })
  }, function(err){
    if (err) {
      console.log(err, "updating builds");
      getBuilds();
    }
  });
} catch (e) {
  console.log("No builds.json found, updating builds");
  // we don't have a builds.json, we need to grab it
  getBuilds(function(err){
    if (err) throw err;
  });
}

server.listen(app.get('port'), function() {

  console.log("Listening on " + app.get('port'));
});