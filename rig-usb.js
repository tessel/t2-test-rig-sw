var usb = require('usb');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

var RIG_VID = 0x59e3;
var RIG_PID = 0xcda6;

exports = module.exports = new EventEmitter();
function Rig(dev) {
    var self = this;
    this.usb = dev;
    this.connected = true;

    try {
        this.usb.open();
    } catch (e) {
        process.nextTick(function() { self.emit('error', e) });
    }

    this.usb.getStringDescriptor(this.usb.deviceDescriptor.iSerialNumber, function (error, data) {
        if (error) return self.emit('error', error)
        self.serialNumber = data;

        self.intf = self.usb.interface(1);
        try {
            self.intf.claim();
        } catch (e) {
            self.emit('error', e);
        }

        self.event_ep = self.intf.endpoints[0];
        self.event_ep.startPoll(1, 8);

        self.event_ep.on('data', function(data) {
            if (data[0]) {
                self.emit('button-press');
            } else {
                self.emit('button-release');
            }
        });

        self.event_ep.on('error', function(err) {
            // Ignore the error if the device is disconnecting
            setTimeout(function(){
                if (self.connected) self.emit('error', err)
            }, 500);
        })

        self.emit('ready');
    })
}
util.inherits(Rig, EventEmitter);

Rig.prototype.detach = function() {
    this.connected = false;
    this.emit('detach');
}

exports.rigs = [];

function newDevice(dev) {
    if (dev.deviceDescriptor.idVendor  != RIG_VID) return;
    if (dev.deviceDescriptor.idProduct != RIG_PID) return;
    for (var i=0; i<exports.rigs.length; i++) {
        if (exports.rigs[i].usb == dev) return;
    }

    var rig = new Rig(dev);
    exports.rigs.push(rig);
    exports.emit('attach', rig);
}

exports.start = function() {
    usb.on('attach', newDevice);
    usb.on('detach', function(dev) {
        for (var i=0; i<exports.rigs.length; i++) {
            if (exports.rigs[i].usb == dev) {
                var rig = exports.rigs[i];
                rig.detach();
                exports.rigs.splice(i, 1);
                return;
            }
        }
    });

    usb.getDeviceList().forEach(newDevice);
}

if (require.main === module) {
    exports.on('attach', function(dev) {
        console.log('Device attach');
        dev.on('detach', function() {
            console.log('Device detach');
        });

        dev.on('ready', function() {
            console.log('Device with serial number', dev.serialNumber, 'is ready');
        })

        dev.on('button-press', function() {
            console.log("Button pressed on", dev.serialNumber);
        })

        dev.on('error', function(e) {
            console.log("Error on ", dev.serialNumber);
            throw e;
        })
    });
    exports.start();
}
