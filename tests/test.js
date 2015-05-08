var request = require('request');

var host = "http://localhost:3000";

var tests = require('../config.json').tests;
var passing = {};
tests.forEach(function(test){
  passing[test] = 1;
});

// bench | /bench
function newBench(){
  request.post(host+'/bench', {body: {name:"host 1", 
    time: new Date().getTime(), build: 'abc123', 
    deviceBuild: 'dabc123', md5:'md5sum', ip: '0.0.0.0', 
    gateway:'0.0.0.0', ssh: '0.0.0.0', port:'2222',
    rigs: ['rig1', 'rig2']}, json: true
  });
}

// bench log | /b/:bench/logs
function newBenchLog(bench, data){
  var bench = encodeURIComponent(bench);
  request.post(host+'/b/'+bench+'/logs', {body: {
    "device": bench, "data": data
  }});
}

var device = {id:"device 1", bench: "host 1",
  time: new Date().getTime(), build: "devicebuild123",
  rig: "rig 1"};

// device | /device
function newDevice() {
  var body = device;
  for (var key in passing) {
    body[key] = passing[key];
  }
  console.log("body", body);

  request.post(host+'/device', {body: body, json: true});
}

// device test | /d/:device/test
function updateDevice() {
  var body = device;

  var i = 0;
  var interval = setInterval(function(){
    if (i > tests.length) {
      clearInterval(interval);
      return;
    }

    var tempBody = body;
    tempBody['test'] = test[i];
    tempBody['status'] = 1;
    
    // do a new test update every second
    request.post(host+'/device', {"body": tempBody});
    i++;
  }, 1000);
}

// device log | /d/:device/logs
function newBenchLog(device, data){
  var device = encodeURIComponent(device);
  request.post(host+'/d/'+device+'/logs', {body: {
    "device": device, "data": data
  }});
}

// rig log?

// newBench();
newDevice();