var usb = require('usb');
var util = require('util');
var Emitter = require('events').EventEmitter;

const TESSEL_VID = 0x1209;
const TESSEL_PID = 0x7551;
const NUM_COMM_ATTEMPT = 15; // open attempts per device
const CONN_FREQUENCY = 3 * 1000; // seconds between open attempts
const PIPE_INTERFACE = 2;

// Read request
const USB_TRANSFER_REQUEST_TYPE = 0xC0;
// This is defined to be the request that fetches boot state
const USB_TRANSFER_REQUEST = 0xBC;

function Scanner(opts) {
  // We use this array primarily so we can provide consumers
  // with a serial number of a removed device
  this.devices = [];

  // initialize options if necessary
  opts = opts || {};

  // Set comm attempt parameters
  this.numConnectionAttempts = opts.connectionAttempts || NUM_COMM_ATTEMPT;
  this.frequency = opts.frequency || CONN_FREQUENCY;

  this.scanning = false;
};

util.inherits(Scanner, Emitter);

Scanner.prototype.start = function() {
  // If we're in the midst of scanning
  if (this.scanning) {
    // stop first
    this.stop();
  }
  // Start reading in connected devices
  usb.getDeviceList().forEach((device) => this.connectHandler(device));
  // Prepare for those that are hotplugged
  usb.on('attach', (device) => this.connectHandler(device));
  // Prepare for those that are removed
  usb.on('detach', (device) => this.disconnectHandler(device));
};

Scanner.prototype.connectHandler = function(device) {
  if ((device.deviceDescriptor.idVendor === TESSEL_VID) && (device.deviceDescriptor.idProduct === TESSEL_PID)) {
    // Fetch the serial number for this device which all consumers will probably
    // want to use as an easy identifier
    this.fetchSerialNumber(device)
    .then((serial) => {
      // Tag the serial number onto the device
      device.serialNumber = serial;
      // Store it in our internal array
      this.devices.push(device);
      // Emit that we have a connection
      this.emit('connection', device, device.serialNumber);
      // Check if it's booted
      this.attemptConnect(device, this.numConnectionAttempts);
    })
    .catch((err) => this.emit('error', err));
  }
}

Scanner.prototype.disconnectHandler = function(removedDevice) {
  // Get the index in the array of the removed device
  var index = this.devices.indexOf(removedDevice);

  // It should be in the array
  if (index >= 0) {
    // Remove it
    var removed = this.devices.splice(index, 1)[0];
    // emit the remove event after we modify the device list
    this.emit('disconnect', removed, removed.serialNumber);
  }
  else {
    this.emit('error', new Error('Unknown device dropped off the bus...'));
  }
}

Scanner.prototype.fetchSerialNumber = function(device) {
  return new Promise((resolve, reject) => {
    // Open the device
    device.open();
    // Get the string descriptor
    device.getStringDescriptor(device.deviceDescriptor.iSerialNumber, function(error, data) {
      if (error) {
        return reject(error);
      }
      else {
        resolve(data);
      }
    })
  });
}

Scanner.prototype.attemptConnect = function(device, numAttempts) {
  // Decrement the number of remaining attempts
  numAttempts--;
  // Try to connect to the spi daemon
  this.attemptSingleConnect(device)
  // If it works, then this device is booted and ready to go
  .then(() => this.emit('ready', device, device.serialNumber))
  .catch((err) => {
    // Not booted yet (or some other error)
    if (numAttempts > 0) {
      // Try again if we still have attempts left
      setTimeout(this.attemptConnect.bind(this, device, numAttempts), this.frequency);
    }
    // We ran out of attempts, just give up
    else {
      this.emit('error', new BootFailedError(device.serialNumber));
    }
  });
}

Scanner.prototype.attemptSingleConnect = function(device) {
  return new Promise((resolve, reject) => {
    // Try to open connection
    try {
      device.open();
      // Perform a control transfer to fetch the boot state
      device.controlTransfer(USB_TRANSFER_REQUEST_TYPE, USB_TRANSFER_REQUEST, 0, 0, 1, (err, data) => {
        if (err) {
          console.log('there was an error', err);
          reject(err);
        }
        else {
          if (data[0] === 1) {
            return resolve();
          }
          else {
            return reject(new Error("Device is not yet booted."));
          }
        }
      });
    }
    catch(err) {
      return reject(err);
    }
  });
}

Scanner.prototype.stop = function() {
  // Clear our device list
  this.devices = [];
  // Stop listening for connects and disconnects
  usb.removeAllListeners('attach');
  usb.removeAllListeners('detatch');
  this.scanning = false;
};

function BootFailedError(serialNumber) {
  this.name = 'BootFailedError';
  this.message = `Tessel with serial number ${serialNumber} was unable to boot up in the expected amount of time.`;
  this.serialNumber = serialNumber;
  this.stack = (new Error()).stack;
}
BootFailedError.prototype = Object.create(Error.prototype);
BootFailedError.prototype.constructor = BootFailedError;

// Export a singleton because multiple would probably cause segfaults
// from trying to open/claim/release at the same time
module.exports.Scanner = Scanner;
module.exports.BootFailedError = BootFailedError;
