var util = require('util')
  , events = require('events')
  ;

var devices = [{id:'abc'}, {id:'123'}];

function Rig(){
  var self = this;
  // have the rig start emitting some stuff
  var tests = require('../config.json').tests;
  setTimeout(function(){
    var interval = setInterval(function(){
      var test = tests.shift();
      if (test) {
      // emit stuff about each test
        self.emit("test", {"rig": devices[0].id, "device": "abc-abc", "test": test, "status": 0});
        self.emit("test", {"rig": devices[1].id, "device": "123-123", "test": test, "status": 1});
      } else {
        clearInterval(interval);
      }
    }, 500);
  }, 2000);

}

util.inherits(Rig, events.EventEmitter);

Rig.prototype.getDevices = function(cb){
  cb(null, devices);
}

// run some command on the rig
Rig.prototype.run = function(cmd){

}

module.exports = new Rig();