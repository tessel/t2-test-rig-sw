var greenLEDPath = '/sys/devices/leds/leds/tessel:green:user1/brightness',
    blueLEDPath = '/sys/devices/leds/leds/tessel:blue:user2/brightness',
    redLEDPath = '/sys/devices/leds/leds/tessel:red:error/brightness'
    ;

module.exports.load = function(Tessel, commands) {
  Tessel.prototype.setRedLED = function(value) {
    return this.setLEDValue(redLEDPath, value)
  };

  Tessel.prototype.setBlueLED = function(value) {
    return this.setLEDValue(blueLEDPath, value);
  };

  Tessel.prototype.setGreenLED = function(value) {
    return this.setLEDValue(greenLEDPath, value);
  };

  Tessel.prototype.setLEDValue = function(ledPath, value) {
    return new Promise((resolve, reject) => {
      if (typeof value !== 'number') {
        return reject(new Error("Cannot set LED Value with non-numeric argument"));
      }
      else if (value != 1 && value != 0) {
        return reject(new Error("Cannot set LED value with non-zero and non-one"));
      }
      else {
        this.connection.exec(commands.openStdinToFile(ledPath), function(err, remoteProc) {
            if (err) {
              return reject(err);
            }

            remoteProc.stdin.end(value.toString());

            remoteProc.once('close', resolve);
        });
      }
    });
  };
};
