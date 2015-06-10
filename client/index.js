var express = require("express")
  , path = require('path')
  , rig_usb = require('./rig-usb.js')
  , configs = require('./config.json')
  , child_process = require('child_process')
  , request = require('request')
  ;

configs.tests = require('../config.json').tests;
var LOG_STATUS = {"inProgress": 0, "pass": 1, "fail": -1};
var LOG_NUMBERS = [];
Object.keys(LOG_STATUS).forEach(function(status){
  LOG_NUMBERS.push(LOG_STATUS[status]);
});

var app = express();
var http = require('http');
var server = http.createServer(app);

var io = require('socket.io').listen(server);
io.set('transports', ['xhr-polling']);
io.set('polling duration', 10);

app.use(express.logger());

app.set('port', process.env.PORT || 2000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.favicon('public/images/favicon.ico')); 

app.get('/', function(req, res) {
  res.render('index', {name: configs.name, rigs: rig_usb.rigs, tests: configs.tests})
});

function parseRig(dev){
  return {serialNumber: dev.serialNumber, build: dev.build};
}

String.prototype.escapeSpecialChars = function() {
    return this.replace(/\n/g, "\\n")
               .replace(/\'/g, "\\'")
               .replace(/\"/g, '\\"')
               .replace(/\&/g, "\\&")
               .replace(/\r/g, "\\r")
               .replace(/\t/g, "\\t")
               .replace(/\b/g, "\\b")
               .replace(/\f/g, "\\f");
};

function updateDeviceStatus(data){
  io.sockets.emit("updateTest", {serialNumber: data.serialNumber
    , test: data.test, deviceId: data.deviceId, status: data.data.status});
}

function reportLog(data, isJSON){
}

function deviceFinished(serialNumber, passed) {
  io.sockets.emit("updateTest", {serialNumber: serialNumber
    , test: "all", status: passed})
}

rig_usb.on('attach', function(dev){
  console.log('Device attach');

  dev.on('detach', function() {
    console.log('Device detach');
    io.sockets.emit("removeRig", parseRig(dev));
  });

  dev.on('ready', function() {
    console.log('Device with serial number', dev.serialNumber, 'is ready');
    dev.ready_led(true);
    io.sockets.emit("addRig", parseRig(dev));
  });

  var running = false;

  dev.on('button-press', function() {
    io.sockets.emit("testing", dev.serialNumber);
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
    // ps.stdout.pipe(process.stdout)
    // ps.stderr.pipe(process.stderr)

    // pipe data up to testaltor
    ps.stdout.on('data', function (data) {
      try {
        data = data.toString().escapeSpecialChars();
        data = JSON.parse(data);
        console.log("data", data);

        // check if the data has a status code
        if (Number(data.status) in LOG_NUMBERS) {
          updateDeviceStatus(data);
        }

        reportLog(data, true);
      } catch (e) {
        // not json
        console.log("orig data", data.toString());
        reportLog(data, false);
      }
    });

    ps.stderr.on('data', function (data) {
      console.log("stderr", data.toString());
      try {
        data = data.toString().escapeSpecialChars();
        data = JSON.parse(data);
        reportLog(data, true);
      } catch (e) {
        reportLog(data, false);
      }
    });

    ps.on('close', function(code) {
      console.log("Child exited with code", code)
      dev.testing_led(false);
      if (code == 0) {
        dev.pass_led(true);
        // successfully tested
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
      console.log("Error on ", dev.serialNumber);
      throw e;
  });
});
rig_usb.start();


// tell test rigs to retry
io.sockets.on('connection', function (client) {
  client.on('retry', function(data) {
    console.log("retry", data);
  })
});

server.listen(app.get('port'), function() {
  console.log("emitting heartbeat");
  // request.post(host+'/bench', {body: {id: config.name}, json: true});

  console.log("Listening on " + app.get('port'));
});