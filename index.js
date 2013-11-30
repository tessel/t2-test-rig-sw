var express = require("express")
  , path = require('path');

var app = express();
var http = require('http');
var server = http.createServer(app);

var io = require('socket.io').listen(server);

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
var db = mongojs(process.env.NODE_ENV == 'production' ? process.env.MONGOLAB_URI : 'localhost');
var Benches = db.collection('benches');
var Devices = db.collection('devices');

// var mongojs = require('mongojs');
// var db = mongojs(process.env.NODE_ENV == 'production' ? process.env.MONGOLAB_URI : 'localhost');

app.get('/', function(req, res) {
  var benches = [{
    name: 'Pancakes',
    heartbeat: new Date().getTime(),
    build: 'abc123',
    deviceBuild: 'abc123',
    ip: '0.0.0.0',
    gateway: '0.0.0.0',
  }, {
    name: 'Waffles',
    heartbeat: new Date().getTime(),
    build: 'abc123',
    deviceBuild: 'abc123',
    ip: '0.0.0.0',
    gateway: '0.0.0.0',
  }];
  res.render('index', {title: 'Testalator | Technical Machine', benches: benches});
});

app.get('/d/:device', function(req, res){
  var device = req.params.device;
  var deviceInfo = {
    built: new Date().getTime(),
    deviceId: 'abc123',
    tiFirmware: 'v1.2',
    firmware: 'abc213',
    adc: 'pass',
    spi: 'pass',
    i2c: 'pass',
    gpio: 'fail',
    ram: 'fail',
    wifi: 'fail',
    codeUpload: 'fail',
  };
  res.render('device', {title: device+' | Testalator', id: device, device: deviceInfo, logs: ""});
});

app.get('/b/:bench', function(req, res){
  var bench = req.params.bench;
  console.log("got ", bench);
  var devices = [{
    built: new Date().getTime(),
    deviceId: 'abc123',
    tiFirmware: 'v1.2',
    firmware: 'abc213',
    adc: 'pass',
    spi: 'pass',
    i2c: 'pass',
    gpio: 'fail',
    ram: 'fail',
    wifi: 'fail',
    codeUpload: 'fail',
  }, {
    built: new Date().getTime(),
    deviceId: 'abc123',
    tiFirmware: 'v1.2',
    firmware: 'abc213',
    adc: 'pass',
    spi: 'pass',
    i2c: 'pass',
    gpio: 'fail',
    ram: 'fail',
    wifi: 'fail',
    codeUpload: 'fail',
  }];
  res.render('bench', {title: bench+' | Testalator', bench: bench, devices: devices})
});

app.post('/bench', function(req, res) {
  console.log("request header", req.headers);
  io.sockets.emit('device', req.body);
  console.log("request body", req.body);
  res.send('devices');
});

app.listen(app.get('port'), function() {
  console.log("Listening on " + app.get('port'));
});