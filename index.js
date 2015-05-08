var express = require("express")
  , path = require('path');

var app = express();
var http = require('http');
var server = http.createServer(app);

var io = require('socket.io').listen(server);
io.set('transports', ['xhr-polling']);
io.set('polling duration', 10);
var config = require('./config.json');

app.use(express.logger());

app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.favicon('public/images/favicon.ico')); 

var mongojs = require('mongojs');
console.log("environment", process.env.NODE_ENV);
var db = mongojs(process.env.NODE_ENV == 'production' ? process.env.MONGOLAB_URI : 'localhost');
var Benches = db.collection('benches');
var BenchLogs = db.collection('benchLogs');
var Rigs = db.collection('rigs');
var RigLogs = db.collection('rigLogs');
var Devices = db.collection('devices');
var DeviceLogs = db.collection('deviceLogs');

var auth = express.basicAuth(config.auth_id, config.auth_pw);

app.get('/', auth, function(req, res) {
  var benches = [];
  Benches.find(function (err, benches){
    console.log('names', benches);
    var count = 0;
    var tests = {};
    config.tests.forEach(function(test){
      tests[test] = 1;
    });
    // get number made by each bench
    benches.forEach(function(bench, i){
      query = tests;
      query['bench'] = bench.name;
      Devices.find(query, function(err, devices){
        benches[i].count = devices.length;
        count++;

        if (count >= benches.length){
          console.log("benches", benches);
          res.render('index', {title: 'Testalator | Technical Machine', 
              benches: benches});
        }
      });
    });
    
  });
  
});

app.get('/d/:device', auth, function(req, res){
  var device = req.params.device;
  Devices.findOne({'id': device}, function (err, deviceInfo){
    res.render('device', {title: device+' | Testalator', id: device, tests: config.tests, device: deviceInfo, logs: ""});
  });
});

app.get('/b/:bench', auth, function(req, res){
  var bench = req.params.bench;

  // find all devices by test bench and sort by date
  // filter by unique id
  var tests = Object.keys(config.tests);
  Devices.find({'bench': bench})
    .sort({'built': -1}, function (err, docs){
      var succesNum = docs.reduce(function(pre, current){
        for (var i = 0; i < tests.length; i++) {
          if (pre[tests[i]] != 1) {
            return pre;
          }
        }

        return pre++;
      }, 0);
      // var passed = docs.filter(function(doc){
      //   // return only devices that have passed all tests
      //   // tests.forEach(function(test))
      //   return (doc.tiFirmware == 'pass' && doc.adc == 'passed' && doc.dac == 'passed'
      //     && doc.sck == 'passed' && doc.i2c == 'passed' && doc.pin == 'passed'
      //     && doc.extPower == 'passed' && doc.wifi == 'pass');
      // })

      res.render('bench', {title: bench+' | Testalator', bench: bench, devices: docs, tests: config.tests, success: succesNum})
    });
});

app.post('/device', function(req, res){
  var device = req.body;
  console.log("adding new device", device);
  device.logs = [];

  Devices.findAndModify({
    query: {id: device.id, bench: device.bench, rig: device.rig}
    , update: {
      $set: device
    }
    , upsert: true
  }, function(err, doc){
    if (err){
      console.log("could not save new device", err);
      return res.send(false);
    }
    io.sockets.emit('new_device', device);
    console.log('new device added');
    res.send(true);
  });
});

app.post('/bench', function(req, res) {
  // console.log("request header", req.headers);
  var benchHeartbeat = req.body;
  // insert into database
  console.log("heartbeat", benchHeartbeat);
  benchHeartbeat.time = new Date().getTime();
  Benches.findAndModify({
    query: {name: benchHeartbeat.name}
    , update: {
      $set: benchHeartbeat
    }
    , upsert: true
  }, function(err, doc){
    if (!err) {
      console.log('saved', benchHeartbeat);      
      // emit heartbeat
      io.sockets.emit('bench_heartbeat', benchHeartbeat);
      res.send(true);
    } else { 
      console.log("not saved", err, benchHeartbeat);
      res.send(false);
    }
  });
});

// curl -H 'Content-Type: application/json' -d '{"built":"1234", "id":"abc123", "tiFirmware": "v1.2", "firmware": "df93wd", "adc": "pass", "spi": "pass", "i2c": "pass", "gpio": "fail", "ram": "fail", "wifi": "pass", "codeUpload": "pass", "bench": "Pancakes"}' localhost:5000/device
app.post('/d/:device/test', function(req, res) {
  // console.log("request header", req.headers);
  var device = req.body.device;
  var updateTest = {};
  updateTest[req.body.test] = req.body.status;
  // insert into database
  console.log("device", req.body.device);
  Devices.findAndModify({
    query: {id: device.id, bench:device.bench, rig: device.rig},
    update: {
      $set: updateTest
    },
    upsert:true
  }, function(err, doc) {
    if (!err) {
      console.log('saved', doc);      
      // emit heartbeat
      io.sockets.emit('device_update_'+req.body.device, {"test": req.body.test, "status": req.body.status});
      io.sockets.emit('device_update', {"device":req.body.device, "test": req.body.test, "status": req.body.status});
      res.send(true);
    } else { 
      console.log("not saved", err, doc);
      res.send(false);
    }
  });
  
});

function newLog(logDB, deviceId, bodyData, cb) {
  if (deviceId != bodyData.device.toLowerCase()){
    console.error("params does not match request", deviceId, bodyData);
    return cb(false);
  }

  var logDB;
  logDB.findAndModify({
    query: {device: deviceId},
    update: {
      $push: {log: data}
    },
    upsert:true
  }, function(err, doc, lastErrorObject) {
    // emit an event about this log update

    if (!err) {
      console.log('saved', deviceId);
      io.sockets.emit('log_update_'+deviceId, data);
      cb(true);
    } else { 
      console.log("not saved", deviceId, err);      
      cb(false);
    }
  });
}

app.post('/b/:bench/logs', function(req, res) {
  newLog(BenchLogs, req.params.bench.toLowerCase(), req.body, function(logged){
    return res.send(logged);
  });
});

app.post('/d/:device/logs', function(req, res) {
  newLog(BenchLogs, req.params.bench.toLowerCase(), req.body, function(logged){
    return res.send(logged);
  });
});


app.get('/b/:bench/logs', auth, function (req, res){
  var bench = req.params.bench;
  BenchLogs.findOne({'device': bench}, function (err, logs) {
    // console.log("logs", err, logs);
    res.render('logs', {title: bench+' | logs', logs: logs, id: bench, type:"Bench", tests: config.tests});
  });
});

app.get('/d/:device/logs', auth, function (req, res){
  var device = req.params.device;
  Devices.find({"id": device}, function(err, docs){
    DeviceLogs.findOne({'device': device}, function (err, logs) {
      res.render('logs', {title: device+' | logs', logs: logs, id: device, type:"Device", devices: docs, tests: config.tests});
    });
  });
});

server.listen(app.get('port'), function() {
  console.log("Listening on " + app.get('port'));
});