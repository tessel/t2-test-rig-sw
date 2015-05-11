var express = require("express")
  , path = require('path');

var app = express();
var http = require('http');
var server = http.createServer(app);

var io = require('socket.io').listen(server, {log:false});
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
app.use(express.favicon('public/favicon.ico')); 

var mongojs = require('mongojs');
console.log("environment", process.env.NODE_ENV);
var db = mongojs(process.env.NODE_ENV == 'production' ? process.env.MONGOLAB_URI : 'localhost');
var Benches = db.collection('benches');
var Rigs = db.collection('rigs');
var Devices = db.collection('devices');
var Logs = db.collection('logs');

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
      query['bench'] = bench.id;
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
  Devices.find({'bench': bench})
    .sort({'built': -1}, function (err, docs){
      var succesNum = docs.reduce(function(pre, current){
        for (var i = 0; i < config.tests.length; i++) {
          if (current[config.tests[i]] != 1) return pre;
        }
        return ++pre;
      }, 0);
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
  var id = req.body.id;
  var test = req.body.test;
  var status = req.body.status;
  var updateTest = {};
  updateTest[test] = status;
  // insert into database
  console.log("device", req.body.id);
  Devices.findAndModify({
    query: {id: id, bench:req.body.bench, rig: req.body.rig},
    update: {
      $set: updateTest
    },
    upsert:true
  }, function(err, doc) {
    if (!err) {
      console.log('saved', doc);      
      // emit heartbeat
      io.sockets.emit('device_update_'+id, {"test": test, "status": status});
      io.sockets.emit('device_update', {"id":id, "test": test, "status": status});
      res.send(true);
    } else { 
      console.log("not saved", err, doc);
      res.send(false);
    }
  });
  
});

function newLog(logQuery, data, cb) {
  var key = Object.keys(logQuery)[0];
  Logs.findAndModify({
    query: logQuery,
    update: {
      $push: {log: data}
    },
    upsert:true
  }, function(err, doc, lastErrorObject) {
    // emit an event about this log update

    if (!err) {
      console.log('saved log', logQuery, data);
      io.sockets.emit('log_update_'+logQuery[key], data);
      cb(true);
    } else { 
      console.log("not saved", identifiers, err);      
      cb(false);
    }
  });
}

app.post('/logs', function(req, res){
  var identifiers = Object.keys(req.body.identifiers);
  var i = 0;
  var success = true;

  (function pushLog(){
    var key = identifiers[i];
    var obj = {};
    obj[key] = req.body.identifiers[key];
    
    newLog(obj, 
      req.body.data, function(logged){
      success = success & logged;

      i++;
      if (i >= identifiers.length){
        return res.send(success);
      } else {
        pushLog();
      }
    });
  })();
})

app.get('/b/:bench/logs', auth, function (req, res){
  var bench = req.params.bench;
  Logs.findOne({'bench': bench}, function (err, logs) {
    console.log("logs", logs)
    // console.log("logs", err, logs);
    res.render('logs', {title: bench+' | logs', logs: logs, id: bench, type:"Bench", tests: config.tests});
  });
});

app.get('/d/:device/logs', auth, function (req, res){
  var device = req.params.device;
  Devices.find({"id": device}, function(err, docs){
    Logs.findOne({'device': device}, function (err, logs) {
      console.log("device logs", logs, device);
      res.render('logs', {title: device+' | logs', logs: logs, id: device, type:"Device", devices: docs, tests: config.tests});
    });
  });
});

server.listen(app.get('port'), function() {
  console.log("Listening on " + app.get('port'));
});