var request = require('request');

var host = "http://localhost:3000";

var tests = require('../config.json').tests;
// var passing = {};
// tests.forEach(function(test){
//   passing[test] = 1;
// });

// bench | /bench
function newBench(){
  request.post(host+'/bench', {body: {name:"host_1", 
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

var device = {id:"device_1", bench: "host_1",
  time: new Date().getTime(), build: "devicebuild123",
  rig: "rig 1"};

function copyDevice(id){
  var body = {};
  Object.keys(device).forEach(function(key){
    body[key] = device[key];
  })

  if (id) {
    body.id = id;
  }
  return body;
}

// device | /device
function newDevice(deviceId, testStatus) {
  var body = copyDevice(deviceId);
  
  for (var i in tests) {
    body[tests[i]] = testStatus ? testStatus : 0;
  }
  console.log("body", body);

  request.post(host+'/device', {body: body, json: true});
}

function newDevices(deviceArr, testStatus) {
  var i = 0;
  var interval = setInterval(function(){
    if (i == deviceArr.length) {
      clearInterval(interval);
      return;
    }

    newDevice(deviceArr[i], testStatus);
    i++;
  }, 1000);
}

// device test | /d/:device/test
function updateDevice(deviceId, testStatus) {
  var body = copyDevice(deviceId);

  var i = 0;
  var interval = setInterval(function(){
    if (i >= tests.length) {
      clearInterval(interval);
      return;
    }

    var tempBody = body;
    tempBody['test'] = tests[i];
    tempBody['status'] = testStatus;
    
    // do a new test update every second
    request.post(host+'/d/'+deviceId+'/test', {"body": tempBody, json: true});
    i++;
  }, 1000);
}

function updateDevices(deviceArr, testStatus) {
  var i = 0;
  var interval = setInterval(function(){
    if (i == deviceArr.length) {
      clearInterval(interval);
      return;
    }

    updateDevice(deviceArr[i], testStatus);
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
// newDevice();
// newDevices(["d1", "d2", "d3"], 0);
updateDevices(["d1", "d2", "d3"], 1);
