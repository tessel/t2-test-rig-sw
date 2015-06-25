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
  , t2 = require('t2-cli')
  , Promise = require('bluebird')
  ;

var DEBUG = true; 

// check if we have the live disk path
var liveHostPath = "/lib/live/mount/medium/host.json";
if (fs.existsSync(liveHostPath)){
  configs.host = require(liveHostPath);
} else {
  // otherwise default host configs
  configs.host = require(path.join(__dirname, configs.hostPath));
}
console.log("HOST IS", configs.host);

var BUILD_PATH = configs.host.server+"builds/";
var BUILDS = require(path.join(__dirname, '../config.json')).builds;
var LOG_STATUS = {"inProgress": 0, "pass": 1, "fail": -1};
var LOG_NUMBERS = [];
Object.keys(LOG_STATUS).forEach(function(status){
  LOG_NUMBERS.push(LOG_STATUS[status]);
});

var lockedTesting = false;
var isSMTTesting = true; // by default does smt testing
var seeker = null;
var seekerStarted = false;

var app = express();
var http = require('http');
var server = http.createServer(app);

var verifyFile = fs.readFileSync('./deadbeef.hex');
var USB_OPTS = {bytes:84, verify: verifyFile}
var ETH_OPTS = {host: 'www.baidu.com'}
var WIFI_OPTS = {'ssid': configs.host.ssid,
 'password': configs.host.password, 'host': 'www.baidu.com', 'timeout': 10}

var io = require('socket.io').listen(server, { log: false });
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

  // get list of tessel connected devices:
  res.render('index', {host: configs.host, rigs: rigs, 
    tests: configs.tests, builds: configs.builds, devices: []})
});

function parseRig(dev){
  return {serialNumber: dev.serialNumber, build: dev.build};
}

String.prototype.escapeSpecialChars = function() {
    return this.replace(/\n/g, "")
               .replace(/\&/g, "\\&")
               .replace(/\r/g, "\\r")
               .replace(/\t/g, "\\t")
               .replace(/\f/g, "\\f")
               .replace(/\u0000/g, "");
};

function postRigs(rigs) {
  rigs = rigs.map(function(r){
    return r.serialNumber
  });

  request.post(configs.host.server+'bench', {body: {id: configs.host.name, 
    time: new Date().getTime(), build: configs.host.build, ip: '0.0.0.0', 
    gateway:'0.0.0.0', ssh: '0.0.0.0', port:'2222', rigs: rigs}
    , json: true});
}

function updateDeviceStatus(data, isTh){
  console.log("Update device status", data);

  if (isTh) {
    io.sockets.emit("updateThTest", {test: data.test, 'tessel': data.tessel, 'status': data.status, 'info': data.info});
  } else {
    io.sockets.emit("updateTest", {serialNumber: data.serialNumber
    , test: data.test, deviceId: data.device, status: data.data.status});
  }

  request.post(configs.host.server+'d/'+data.device+'/test', {"body": {"id": data.tessel ? data.tessel.serialNumber : data.device, 
    "bench": configs.host.name, "time": new Date().getTime(), 
    "build": configs.host.build, "rig": data.serialNumber, 
    "test": data.test, "status": data.data ? data.data.status: data.status}, json: true});
}

function reportLog(data, isJSON){
  request.post(configs.host.server+'logs', {body: { "identifiers":  {"device": data.device, "bench": configs.host.name, "rig": data.serialNumber}
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

function parseData(data){
  // console.log("parseData", data);
  // check if the data has a status code
  if (data.data && LOG_NUMBERS.indexOf(Number(data.data.status)) >= 0) {
    updateDeviceStatus(data);
  }
  reportLog(data, true);
}

function escapeData(data, eachFunc) {
  if (!data || /^\s*$/.test(data)) return;

  fixedData = data.toString().escapeSpecialChars();
  fixedData = fixedData.split(/\}\s*\t*\{/);
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

    if (eachFunc && typeof(eachFunc) == 'function') {
      eachFunc(d, i);
    }
  });
}

function runWifiTest(wifiOpts, serialNumber, cb){
  if (!seeker) cb && cb("No Tessel Seeker");

  function startTest(tessel){
    t2.Tessel.runWifiTest(wifiOpts, tessel)
    .then(function(){
      console.log("passed wifi testing");
      cb && cb(null);
    })
    .catch(function(err){
      console.log("failed wifi testing", err);
      cb && cb(err);
    })
  }
  var deviceList = seeker.usbDeviceList;

  var notFoundDevice = deviceList.every(function(device){
    // figure out which tessel to run the wifi test on
    if (device.connection.serialNumber == serialNumber) {
      startTest(device);
      return false; // break
    } else {
      // keep going
      return true;
    }
  });

  if (notFoundDevice || deviceList.length == 0) {
    // if device isn't on the list, it may need more time to boot up
    // but error out for now
    console.log("did not find tessel for wifi test", serialNumber);
    cb && cb("Did not found tessel with serial number", serialNumber);
  }
}

rig_usb.on('attach', function(dev){
  console.log('Device attach');
  isSMTTesting = true;
  
  // seekerStarted = true;
  if (!seeker) {
    console.log("starting seeker");
    seeker = new t2.discover.TesselSeeker().start(true); // do not claim device
  // } else {
    // seeker.start(true); // do not claim device
  }

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
    dev.unitUnderTest = null;

    var ps = child_process.spawn('python', ['-u', 'tests/tests.py', dev.serialNumber])

    // pipe data up to testaltor
    ps.stdout.on('data', function (data) {
      escapeData(data, function(d, i){
        try {
          d = JSON.parse(d);
        } catch(e) {
          console.log("could not parse stderr", d);
          //throw e;
        }
        parseData(d);

        if (d.serialNumber) dev.unitUnderTest = d.device;
      });

    });

    ps.stderr.on('data', function (data) {
      var note = '';
      var item = {};
      escapeData(data, function(d, i){
        try{
          d = JSON.parse(d);
        } catch(e) {
          console.log("could not parse stderr", d);
          //throw e;
        }
        note = note + '\n'+d.data;
        item = d;
      });

      item.data = note;
      reportLog(item, true);
      emitNote(item);
    });

    function doneWithTest(passed){
      if (DEBUG) console.log("done with test", passed);
      if (passed) {
        dev.pass_led(true);
      } else {
        dev.fail_led(true);
      }
      deviceFinished(dev.serialNumber, passed);
      dev.uut_power(0);
      dev.testing_led(false);
      dev.ready_led(true);
      running = false;

      // seeker.stop();
      // seekerStarted = false;
    }

    ps.on('close', function(code) {
      if (DEBUG) console.log("Child exited with code", code)
      
      if (code == 0) {
        var deviceStatus = {device: dev.unitUnderTest, serialNumber: dev.serialNumber, test: 'Wifi'}
        deviceStatus.data = {status: 0};
        updateDeviceStatus(deviceStatus);
        
        // successfully tested
        if (DEBUG) console.log("passed python tests");
        
        if (dev.unitUnderTest) {
          setTimeout(function(){
            runWifiTest(WIFI_OPTS, dev.unitUnderTest, function(err){
              // emit up
              reportLog(deviceStatus, true);
              deviceStatus.data = {status: err ? -1 : 1};
              updateDeviceStatus(deviceStatus);

              if (err) {
                err = err.toString() + err.stack;
                emitNote({serialNumber: dev.serialNumber, data: err});
              }

              deviceStatus.data = err ? err : "wifi passed";
              
              if (DEBUG) console.log("wifi tests done", deviceStatus);

              doneWithTest(err ? false : true);
            });
          }, 5*1000); // give 5 seconds to find any tessels
          // do the wifi test now
        } else {
          // emit wifi test fail
          deviceStatus.data = {status : -1}
          updateDeviceStatus(deviceStatus);
          emitNote({serialNumber: dev.serialNumber, data: "dev.unitUnderTest is null"});
          doneWithTest(false);
        }
      } else {
        doneWithTest(false);
      }
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

  request.post(configs.host.server+'bench', {body: {id: configs.host.name, 
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

setInterval(function(){
  heartbeat();
}, 1000*5*60);

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

io.sockets.on('connection', function (client) {
  if (!seeker) {
    console.log("starting seeker for through hole testing");
    seeker = new t2.discover.TesselSeeker().start();

    seeker.on('usbConnection', function(tessel){
      if (isSMTTesting) return;
      var sanitizedTessel = sanitizeTessel(tessel);
      // got a usb connection to a tessel
      // console.log("usb connected", tessel.connection.serialNumber, tessel.name);
      io.sockets.emit("addTesselUSB", sanitizedTessel);
      // io.sockets.emit("addTesselUSB", sanitizeTessel(tessel));

      reportLog({device: sanitizedTessel.serialNumber, data: "Connected over USB"}, true);
      updateDeviceStatus({test: 'name', tessel: sanitizedTessel, status: 0}, true);
    });

    seeker.on('tessel', function(tessel) {
      if (isSMTTesting) return;
      var sanitizedTessel = sanitizeTessel(tessel);
      var tesselData = {test: 'name', tessel: sanitizedTessel, status: 1, info: sanitizedTessel.name};
      if (tessel.connection.connectionType == 'USB') {
        updateDeviceStatus(tesselData, true);

        tessel.setRedLED(0);
        tessel.setGreenLED(0);
        tessel.setBlueLED(0);

        console.log("starting usb & ethernet tests on", sanitizedTessel);
        // now we can start ethernet and usb tests
        throughHoleTest(USB_OPTS, ETH_OPTS, tessel)
        .then(function(){
          // all passed
          tesselData.test = 'all';
          
          reportLog({device: sanitizedTessel.serialNumber, data: "All through hole tests passed"}, true);
          updateDeviceStatus(tesselData, true);

        })
        .catch(function(err){
          // throw err;
          console.log("th err", err, err.stack);
          tessel.setRedLED(1);
          tesselData.test = 'all';
          tesselData.status = -1;
          updateDeviceStatus(tesselData, true);
          reportLog({device: sanitizedTessel.serialNumber, data: "Through hole tests failed on error "+err}, true);
          emitNote({serialNumber: sanitizedTessel.serialNumber, data: err.toString()});

        })
      }
    });

    seeker.on('detach', function (tessel){
      if (isSMTTesting) return;
      io.sockets.emit("removeTesselUSB", sanitizeTessel(tessel));
    });
  }
  client.on('smt', function(data) {
    isSMTTesting = data;
    console.log("smt testing", isSMTTesting);
  })
});

function sanitizeTessel(tessel){
  return {name: tessel.name, serialNumber: tessel.connection.serialNumber};
}

function throughHoleTest(usbOpts, ethOpts, selectedTessel){
  return new Promise(function(resolve, reject) {
    var sanitizedTessel = sanitizeTessel(selectedTessel);
    var tesselData = {test: 'usb', 'tessel': sanitizedTessel, 'status': 0};
    updateDeviceStatus(tesselData, true);

    return t2.Tessel.runUSBTest(usbOpts, selectedTessel)
    .then(function(){
      console.log("usb test passed");
      selectedTessel.setGreenLED(1);
      tesselData.status = 1;

      reportLog({device: sanitizedTessel.serialNumber, data: "USB tests passed"}, true);
      updateDeviceStatus(tesselData, true);

      console.log("running ethernet test");

      tesselData.test = 'eth';
      tesselData.status = 0;
      updateDeviceStatus(tesselData, true);

      // first wipe the old wifi credentials
      return t2.Tessel.runEthernetTest(ethOpts, selectedTessel)
      .then(function(){

        selectedTessel.setBlueLED(1);

        console.log("ethernet test passed");
        tesselData.status = 1;
        reportLog({device: sanitizedTessel.serialNumber, data: "ETH tests passed"}, true);
        updateDeviceStatus(tesselData, true);

        resolve();
      })
      .catch(function(err){
        console.log("ethernet test failed", err);

        tesselData.status = -1;
        reportLog({device: sanitizedTessel.serialNumber, data: "ETH tests failed "+err}, true);
        updateDeviceStatus(tesselData, true);
        reject(err);
      });
    })
    .catch(function(err){
      console.log("usb test failed", err);
      tesselData.status = -1;
      reportLog({device: sanitizedTessel.serialNumber, data: "USB tests failed "+err}, true);
      updateDeviceStatus(tesselData, true);

      // usb test failed
      reject(err);
    })
  });
}

server.listen(app.get('port'), function() {
  console.log("Listening on " + app.get('port'));
});