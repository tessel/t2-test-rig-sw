var express = require("express")
  , path = require('path');

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
app.use(express.favicon('public/images/favicon.ico')); 

var mongojs = require('mongojs');
console.log("environment", process.env.NODE_ENV);
var db = mongojs(process.env.NODE_ENV == 'production' ? process.env.MONGOLAB_URI : 'localhost');
var Benches = db.collection('benches');
var Devices = db.collection('devices');
var DeviceLogs = db.collection('deviceLogs');


// var mongojs = require('mongojs');
// var db = mongojs(process.env.NODE_ENV == 'production' ? process.env.MONGOLAB_URI : 'localhost');

app.get('/', function(req, res) {
  // var benches = [{
  //   name: 'Pancakes',
  //   heartbeat: new Date().getTime(),
  //   build: 'abc123',
  //   deviceBuild: 'abc123',
  //   ip: '0.0.0.0',
  //   gateway: '0.0.0.0',
  //   ssh: '0.0.0.0',
  //   port: '2222'
  // }, {
  //   name: 'Waffles',
  //   heartbeat: new Date().getTime(),
  //   build: 'abc123',
  //   deviceBuild: 'abc123',
  //   ip: '0.0.0.0',
  //   gateway: '0.0.0.0',
  //   ssh: '0.0.0.0',
  //   port: '2222'
  // }];
  var benches = [];
  Benches.distinct('name', function (err, names){
    console.log('names', names);
    names.forEach(function (name){
      console.log('name ', name);
      Benches.find({'name': name})
        .limit(1)
        .sort({'heartbeat': -1}, function (err, record){
          benches.push(record[0]);
          // console.log("record ", record[0]);
          // if (benches.length == names.length){
            console.log("benches ", benches);
            res.render('index', {title: 'Testalator | Technical Machine', benches: benches, formatDate: function formatDate(time) {
              var date = new Date(time);
              //zero-pad a single zero if needed
              var zp = function (val){
                  return (val <= 9 ? '0' + val : '' + val);
              }
              //zero-pad up to two zeroes if needed
              var zp2 = function(val){
                  return val <= 99? (val <=9? '00' + val : '0' + val) : ('' + val ) ;
              }
              var d = date.getDate();
              var m = date.getMonth() + 1;
              var y = date.getYear() - 100;
              var h = date.getHours();
              var min = date.getMinutes();
              var s = date.getSeconds();
              var ms = date.getMilliseconds();
              return '' + m+ '/' + d + '/' + y + ' ' + zp(h) + ':' + zp(min) + ':' + zp(s) + '.' + zp2(ms);
            }, formatBuild: function (build){
              if (build) return build.substring(0, 10);
            }});
          // }
        });
    })
  });
  
});

app.get('/d/:device', function(req, res){
  var device = req.params.device;

  Devices.findOne({'id': device}, function (err, deviceInfo){
    // var deviceInfo = {
    //   built: new Date().getTime(),
    //   deviceId: 'abc123',
    //   tiFirmware: 'v1.2',
    //   firmware: 'abc213',
    //   adc: 'pass',
    //   spi: 'pass',
    //   i2c: 'pass',
    //   gpio: 'fail',
    //   otp: 'fail',
    //   wifi: 'fail',
    //   codeUpload: 'fail',
    // };
    res.render('device', {title: device+' | Testalator', id: device, device: deviceInfo, logs: ""});
  });

  
});

// curl -H 'Content-Type: application/json' -d '{"heartbeat":"1234", "name":"Pancakes", "build": "dfghig", "deviceBuild": "df93wd", "ip": "1.1.1.1", "gateway": "1.1.1.1"}' localhost:5000/bench

app.get('/b/:bench', function(req, res){
  var bench = req.params.bench;
  console.log("got ", bench);
  // var devices = [{
  //   built: new Date().getTime(),
  //   id: 'abc123',
  //   tiFirmware: 'v1.2',
  //   firmware: 'abc213',
  //   adc: 'pass',
  //   spi: 'pass',
  //   i2c: 'pass',
  //   gpio: 'fail',
  //   otp: 'fail',
  //   wifi: 'fail',
  //   codeUpload: 'fail',
  // }, {
  //   built: new Date().getTime(),
  //   id: 'abc123',
  //   tiFirmware: 'v1.2',
  //   firmware: 'abc213',
  //   adc: 'pass',
  //   spi: 'pass',
  //   i2c: 'pass',
  //   gpio: 'fail',
  //   otp: 'fail',
  //   wifi: 'fail',
  //   codeUpload: 'fail',
  // }];

  // find all devices by test bench and sort by date
  Devices.find({'bench': bench})
    .sort({'built': -1}, function (err, docs){
      res.render('bench', {title: bench+' | Testalator', bench: bench, devices: devices})
    });
});

app.post('/bench', function(req, res) {
  console.log("request header", req.headers);
  var benchHeartbeat = req.body;
  // insert into database
  console.log("heartbeat", benchHeartbeat);
  benchHeartbeat.heartbeat = new Date().getTime();
  Benches.save(benchHeartbeat, function(err) {
    if (err) {
      console.log("not saved", err, benchHeartbeat);
      // emit heartbeat
      io.sockets.emit('bench_heartbeat', benchHeartbeat);
      res.send(true);
    } else { 
      console.log('saved', benchHeartbeat);
      res.send(false);
    }
  });

});

// curl -H 'Content-Type: application/json' -d '{"built":"1234", "id":"abc123", "tiFirmware": "v1.2", "firmware": "df93wd", "adc": "pass", "spi": "pass", "i2c": "pass", "gpio": "fail", "ram": "fail", "wifi": "pass", "codeUpload": "pass", "bench": "Pancakes"}' localhost:5000/device

app.post('/device', function(req, res) {
  console.log("request header", req.headers);
  var device = req.body;
  // insert into database
  console.log("device", device);
  Devices.save(device, function(err) {
    if (err) {
      console.log("not saved", err, device);
      // emit heartbeat
      io.sockets.emit('device_update', device);
      res.send(true);
    } else { 
      console.log('saved', device);
      res.send(false);
    }
  });
  
});

app.post('/deviceLogs', function(req, res) {
  var log = req.body;
  DeviceLogs.save(log, function(err) {
    if (err) {
      console.log("not saved", err, log);
      res.send(true);
    } else { 
      console.log('saved', device);
      res.send(false);
    }
  });
});

server.listen(app.get('port'), function() {
  console.log("Listening on " + app.get('port'));
});