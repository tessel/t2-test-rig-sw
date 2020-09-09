var request = require('request');
var host = process.env.HOST || "http://localhost:3000";
var tests = require('../../config.json').tests;

function formatLog(date, test, level, data){
  return "["+date+"]["+test+"]["+level+"]:"+JSON.stringify(data);
}

// bench | /bench
function newBench(){
  var date = new Date().getTime();
  var bench = {id:"host_1", 
    time: date, build: 'abc123', 
    build: 'dabc123', md5:'md5sum', ip: '0.0.0.0', 
    gateway:'0.0.0.0', ssh: '0.0.0.0', port:'2222',
    rigs: ['rig1', 'rig2']};

  request.post(host+'/bench', {body: bench, json: true});
  newLog({bench: "host_1"}, formatLog(date, "New", "Info", bench));
}

var device = {id:"device_1", bench: "host_1",
  time: new Date().getTime(), build: "devicebuild123",
  rig: "rig_1"};

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
  newLog({"device": body.id, "bench": body.bench, "rig": body.rig}, formatLog(new Date().getTime(), "New", "Info", body));
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
    request.post(host+'/d/'+body.id+'/test', {"body": tempBody, json: true});
    newLog({"device": body.id, "bench": body.bench, "rig": body.rig}, 
      formatLog(new Date().getTime(), tempBody.test, 
        tempBody['status'] ? "Info" : "Err", "here is some data about test "+tempBody.test));
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

function newLog(identifiers, data) {
  request.post(host+'/logs', {body: { "identifiers":  identifiers, "data": data }, json: true});
}


newBench();
newDevice();
newDevices(["d1", "d2", "d3"], 0);
updateDevices(["d1", "d2", "d3"], 1);

