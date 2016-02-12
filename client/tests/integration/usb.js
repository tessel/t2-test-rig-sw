var commands = require('./commands');

function usbTest(opts, tessel) {
  opts.filePath = '/dev/sda';
  return readFile(opts, tessel)
  .then(function(){
    opts.filePath = '/dev/sdb';
    return readFile(opts, tessel);
  });
}

// opts.filePath = path of file to dd
// opts.bytes = number of bytes to dd
// opts.verify = buffer of data to verify against
function readFile(opts, selectedTessel) {
  console.log("reading file", opts.filePath);
  // We use a low level exec here begins the `readDisk` command uses `dd` which
  // outputs debug info on stderr even when there is no error
  return new Promise((resolve, reject) => {
    selectedTessel.connection.exec(commands.readDisk(opts.filePath, opts.bytes), (err, remoteProcess) => {
      if (err) {
        return Promise.reject(err);
      }

      foundFile = new Buffer(0);
      remoteProcess.stdout.on('data', (d) => {
        foundFile = Buffer.concat([foundFile, d]);
      });

      remoteProcess.once('close', ()=> {
        function rejectErr() {
          reject("file found does not match verification file. Found:"+foundFile+", expected: "+opts.verify);
        }

        if (foundFile.length != opts.verify.length) {
          return rejectErr();
        }

        for (var i = 0; i < foundFile.length; i++) {
          if (foundFile[i] !== opts.verify[i]) return rejectErr();
        }

        return resolve()
      });
    });
  });
}

module.exports.usbTest = usbTest;
