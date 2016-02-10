var connectionTests = require('./connection');
var usbTests = require('./usb')

module.exports.wifiTest = connectionTests.wifiTest;
module.exports.ethernetTest = connectionTests.ethernetTest;
module.exports.usbTest = usbTests.usbTest;
