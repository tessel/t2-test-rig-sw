var express = require("express")
  , path = require('path')
  , rig = require('./rig.js')
  , configs = require('./config.json')
  ;

var rigs = {}; // keep track of what is getting tested
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

app.get('/', function(req, res) {
  // get the rigs associated with this host
  rig.getDevices(function(err, devices){
    devices.forEach(function(device){
      rigs[device.id] = {};
    });
    res.render('index', {name: configs.name, rigs: devices, tests: configs.tests})
  });
});

// listen for messages from the rigs
rig.on('test', function(data){
  console.log("got test rig", data, rigs);
  if (!rigs[data.rig]) {
    // a rig got added after this app started up
    rigs[data.rig] = {};
  }

  if (rigs[data.rig].device == data.device) {
    // the rig is currently testing the device
    rigs[data.rig].test = data.status;
    // a test passed or failed
  } else {
    // a new tessel is being tested
    var test =  data['test'];
    rigs[data.rig] = {'device': data.device, test: data.status};
    // clear out all the old tests
    data.clear = true;
  }
  console.log('emitting', data);
  io.sockets.emit('test', data);
});

rig.on('data', function(data){
  // pipe this data up to the server 
  // includes heartbeats
});

// tell test rigs to retry
io.sockets.on('connection', function (client) {
  client.on('retry', function(data) {
    console.log("retry", data);
  })
});

server.listen(app.get('port'), function() {
  console.log("Listening on " + app.get('port'));
});