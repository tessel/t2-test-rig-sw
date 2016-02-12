var express = require("express")
  , path = require('path')
  , rig_usb = require('./rig-usb.js')
  , configs = require('./config.json')
  , child_process = require('child_process')
  , request = require('request')
  , async = require('async')
  , fs = require('fs')
  , crypto = require('crypto')
  , path = require('path')
  , tesselCLI = require('t2-cli')
  , integrationTests = require('./tests/integration')
  , discovery = require('./tests/discovery/usb_discovery');
  ;

// Adds LED functionality to the Tessel class
require('./tests/indication/ledFunctions').load(tesselCLI.Tessel, tesselCLI.commands);

var DEBUG = true;

// check if we have the live disk path
var liveHostPath = "/lib/live/mount/medium/host.json";
if (fs.existsSync(liveHostPath)){
  configs.host = require(liveHostPath);
} else {
  // otherwise default host configs
  configs.host = require(path.join(__dirname, configs.devPath));
}
configs.tests = require(path.join(__dirname, '../config.json')).tests;
console.log("HOST IS", configs.host);

var BUILD_PATH = configs.host.server+"builds/";
var BUILDS = require(path.join(__dirname, '../config.json')).builds;
var LOG_STATUS = {"inProgress": 0, "pass": 1, "fail": -1};
var LOG_NUMBERS = [];
Object.keys(LOG_STATUS).forEach(function(status){
  LOG_NUMBERS.push(LOG_STATUS[status]);
});

var lockedTesting = false;
var isSMTTesting = true; // by default does smt testing
var isDownloading = false;

var app = express();
var http = require('http');
var server = http.createServer(app);

var verifyFile = fs.readFileSync('./tests/resources/deadbeef.hex');
var USB_OPTS = {bytes:84, verify: verifyFile}
var ETH_OPTS = {host: configs.host.pingIP}
var WIFI_OPTS = {'ssid': configs.host.ssid,
 'password': configs.host.password, 'host': configs.host.pingIP, 'timeout': 10}

var io = require('socket.io').listen(server, { log: false });
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
app.use("/bin", express.static(path.join(__dirname, 'bin')));
app.use(express.favicon('public/images/favicon.ico'));

app.get('/', function(req, res) {
  var rigs = rig_usb.rigs.map(function(r){
    return parseRig(r);
  });

  // get list of tessel connected devices:
  res.render('index', {host: configs.host, rigs: rigs,
    tests: configs.tests, builds: configs.builds, devices: []})
});

function parseRig(dev){
  return {serialNumber: dev.serialNumber, build: dev.build};
}

String.prototype.escapeSpecialChars = function() {
    return this.replace(/\n/g, "")
               .replace(/\&/g, "\\&")
               .replace(/\r/g, "\\r")
               .replace(/\t/g, "\\t")
               .replace(/\f/g, "\\f")
               .replace(/\u0000/g, "");
};

function postRigs(rigs) {
  rigs = rigs.map(function(r){
    return r.serialNumber
  });

  request.post(configs.host.server+'bench', {body: {id: configs.host.name,
    time: new Date().getTime(), build: configs.host.build, ip: '0.0.0.0',
    gateway:'0.0.0.0', ssh: '0.0.0.0', port:'2222', rigs: rigs}
    , json: true});
}

function updateDeviceStatus(data, isTh){
  console.log("Update device status", data);

  if (isTh) {
    io.sockets.emit("updateThTest", {test: data.test, 'tessel': data.tessel, 'status': data.status, 'info': data.info});
  } else {
    io.sockets.emit("updateTest", {serialNumber: data.serialNumber
    , test: data.test, deviceId: data.device, status: data.data.status});
  }

  request.post(configs.host.server+'d/'+data.device+'/test', {"body": {"id": data.tessel ? data.tessel.serialNumber : data.device,
    "bench": configs.host.name, "time": new Date().getTime(),
    "build": configs.host.build, "rig": data.serialNumber,
    "test": data.test, "status": data.data ? data.data.status: data.status}, json: true});

  // report log
}

function reportLog(data, isJSON){
  request.post(configs.host.server+'logs', {body: { "identifiers":  {"device": data.device, "bench": configs.host.name, "rig": data.serialNumber}
    , "data": isJSON ? JSON.stringify(data) : data.toString()}, json: true});
}

function deviceFinished(serialNumber, passed) {
  io.sockets.emit("updateTest", {serialNumber: serialNumber
    , test: "all", status: passed})
}

function emitMessage(message, lock) {
  lockedTesting = lock;
  console.log("Emitting:", message);
  io.sockets.emit("message", {message: message, lock: lockedTesting});
}

function emitNote(data) {
  io.sockets.emit("addNote", {serialNumber: data.serialNumber, note: data.data});
}

function escapeData(data, eachFunc) {
  if (!data || /^\s*$/.test(data)) return;

  fixedData = data.toString().escapeSpecialChars();
  fixedData = fixedData.split(/\}\s*\t*\{/);
  var fixJSON = fixedData.length > 1 ? true : false;
  fixedData.forEach(function(d, i){
    if (fixJSON) {
      // for the first obj we need to add a '}', middle ones add a '{}', end one add a '{'
      if (i == 0){
        d = d+'}';
      } else if (i == (fixedData.length - 1)) {
        d = '{'+d;
      } else {
        d = '{'+d+'}';
      }
    }

    if (eachFunc && typeof(eachFunc) == 'function') {
      eachFunc(d, i);
    }
  });
}

function runWifiTest(wifiOpts, serialNumber, cb){

  function startTest(tessel){
    tessel.connection.open()
    .then(() => integrationTests.wifiTest(wifiOpts, tessel))
    .then(() => tessel.connection.end())
    .then(cb)
    .catch(cb);
  }

  var scanner = new discovery.Scanner();

  // Called when a device is connected (but not necessarily booted)
  scanner.on('connection', (device) => {
    // Update the UI to say it's booting
    console.log('\n\nwe have a booting Tessel!\n\n', device.serialNumber);
  });

  // Called when we can open the device because it has finished booting
  scanner.on('ready', (device) => {
    if (device.serialNumber === serialNumber) {
      // We then fetch a Tessel Object from the Tessel CLI that has been built
      // with this USB Connection
      tesselCLI.list({timeout: 1, verbose: false, usb: true, name:serialNumber})
      .then((tessels) => {
        if (tessels.length > 1) {
          return cb && cb(new Error("Found multiple USB Tessels with the same serial number..."));
        }

        // Our Tessel should be the first and only
        var tessel = tessels[0];

        if (tessel.connection.serialNumber !== serialNumber) {
          return cb && cb(new Error(`Somehow we fetched a Tessel with the incorrect serial number: ${serialNumber}`));
        }

        startTest(tessel, cb);
      })
      .catch((err) => {
        if (err.toString() === 'No Tessels Found') {
          cb && cb(`Not able to find ${serialNumber} because no Tessels are connected.`);
        }
        else {
          cb && cb(`Unable to list connected Tessels: ${err} for serial number ${serialNumber}.`);
        }
      });
    }
  });

  // Called when a device fails to boot (hopefully doesn't happen)
  scanner.on('error', (error) => {

    // If this is a boot up error
    if (error instanceof discovery.BootFailedError) {
      // Tailor the error message a bit
      return cb && cb(new Error(`${serialNumber} failed to boot up.`));
    }
    // Otherwise, just fail the test with what was given
    else {
      return cb && cb(err);
    }
  });

  scanner.start();
}

rig_usb.on('attach', function(dev){
  console.log('Device attach');
  isSMTTesting = true;

  dev.on('detach', function() {
    console.log('Device detach');
    io.sockets.emit("removeRig", parseRig(dev));
    postRigs(rig_usb.rigs);
  });

  dev.on('ready', function() {
    console.log('Device with serial number', dev.serialNumber, 'is ready');
    dev.ready_led(true);
    dev.testing_led(false);
    io.sockets.emit("addRig", parseRig(dev));
    postRigs(rig_usb.rigs);
  });

  var running = false;

  dev.on('button-press', function() {
    if (lockedTesting) {
      emitMessage("Cannot test unit. Either there is a build update happening or the system needs a reboot", true);

      dev.ready_led(false);
      return;
    }

    io.sockets.emit("startTest", dev.serialNumber);
    console.log("Button pressed on", dev.serialNumber);

    if (running) {
      console.log("Already running")
      return
    }

    dev.pass_led(false);
    dev.fail_led(false);
    dev.ready_led(false);
    dev.testing_led(true);
    running = true;
    dev.unitUnderTest = null;
    dev.data = [];

    var ps = child_process.spawn('python', ['-u', 'tests/tests.py', dev.serialNumber])

    function parseData(data){
      // console.log("parseData", data);
      // check if the data has a status code
      if (data.data && LOG_NUMBERS.indexOf(Number(data.data.status)) >= 0) {
        // concat all data
        reportLog(dev.data, true);
        updateDeviceStatus(data);
        dev.data = [];
      }

      dev.data.push(data);
      // reportLog(data, true);
    }


    // pipe data up to testaltor
    ps.stdout.on('data', function (data) {
      escapeData(data, function(d, i){
        try {
          d = JSON.parse(d);
        } catch(e) {
          console.log("could not parse stderr", d);
          //throw e;
        }
        parseData(d);

        if (d.serialNumber) dev.unitUnderTest = d.device;
      });

    });

    ps.stderr.on('data', function (data) {
      var note = '';
      var item = {};
      escapeData(data, function(d, i){
        try{
          d = JSON.parse(d);
        } catch(e) {
          console.log("could not parse stderr", d);
          //throw e;
        }
        note = note + '\n'+d.data;
        item = d;
      });

      item.data = note;
      reportLog(item, true);
      emitNote(item);
    });

    function doneWithTest(passed){
      if (DEBUG) console.log("done with test", passed);
      if (passed) {
        dev.pass_led(true);
      } else {
        dev.fail_led(true);
      }
      deviceFinished(dev.serialNumber, passed);
      dev.uut_power(0);
      dev.testing_led(false);
      dev.ready_led(true);
      running = false;
    }

    ps.on('close', function(code) {
      if (DEBUG) console.log("Child exited with code", code)

      if (code == 0) {
        var deviceStatus = {device: dev.unitUnderTest, serialNumber: dev.serialNumber, test: 'Wifi'}
        deviceStatus.data = {status: 0};
        updateDeviceStatus(deviceStatus);

        // successfully tested
        if (DEBUG) console.log("passed python tests");

        if (dev.unitUnderTest) {
          runWifiTest(WIFI_OPTS, dev.unitUnderTest, function(err){
            // emit up
            reportLog(deviceStatus, true);
            deviceStatus.data = {status: err ? -1 : 1};
            updateDeviceStatus(deviceStatus);

            if (err) {
              err = err.toString() + err.stack;
              emitNote({serialNumber: dev.serialNumber, data: err});
            }

            deviceStatus.data = err ? err : "wifi passed";

            if (DEBUG) console.log("wifi tests done", deviceStatus);

            doneWithTest(err ? false : true);
          });
          // do the wifi test now
        } else {
          // emit wifi test fail
          deviceStatus.data = {status : -1}
          updateDeviceStatus(deviceStatus);
          emitNote({serialNumber: dev.serialNumber, data: "dev.unitUnderTest is null"});
          doneWithTest(false);
        }
      } else {
        doneWithTest(false);
      }
    });
  })

  dev.on('error', function(e) {
      emitMessage("Error on "+dev.serialNumber+": "+e+e.stack, false);
  });
});
rig_usb.start();

function heartbeat() {
  if (DEBUG) console.log("heartbeat at ", new Date().getTime());

  rigs = rig_usb.rigs.map(function(r){
    return r.serialNumber
  });

  request.post(configs.host.server+'bench', {body: {id: configs.host.name,
    time: new Date().getTime(), build: configs.host.build, rigs: rigs}, json: true});
}

io.sockets.on('connection', function (client) {
  if (isDownloading) {
    emitMessage("Updating builds. Do not test until update is finished.", isDownloading);
  }
  // Create a new scanner for USB Tessels
  var scanner = new discovery.Scanner();

  // Called when a device is connected (but not necessarily booted)
  scanner.on('connection', (device) => {
    // Update the UI to say it's booting
    console.log(`We have a booting Tessel: ${device.serialNumber}`);
    var reportingData = {serialNumber: device.serialNumber}
    // got a usb connection to a tessel
    io.sockets.emit("addTesselUSB", reportingData);

    reportLog({device: reportingData.serialNumber, data: "Connected over USB"}, true);
    // We still need to go through the process of fetching our name (happens in ready event)
    updateDeviceStatus({test: 'boot', tessel: reportingData, status: 0}, true);
  });

  // Called when we can open the device because it has finished booting
  scanner.on('ready', (device) => {
    // Boot was successful
    updateDeviceStatus({test: 'boot', tessel: {serialNumber: device.serialNumber}, status: 1}, true);
    // Create a USB Connection Wrapper
    var usbConnection = new tesselCLI.USBConnection(device);
    // Create a Tessel object
    var tessel = new tesselCLI.Tessel(usbConnection);
    return tessel.connection.open()
    .then(Promise.all([tessel.setRedLED(0), tessel.setGreenLED(0), tessel.setBlueLED(0)]))
    .then(() => nameTest(tessel))
    .then(() => throughHoleTest(USB_OPTS, ETH_OPTS, tessel))
    .then(() => {
      var sanitizedTessel = sanitizeTessel(tessel);
      // All of our tests passed
      var tesselData = {test: 'all', tessel: sanitizedTessel, status: 1, info: sanitizedTessel.name};
      // Update our servers
      reportLog({device: sanitizedTessel.serialNumber, data: "All through hole tests passed"}, true);
      // Update the testing dashboard
      updateDeviceStatus(tesselData, true);
      // Close the Tessel Connection
      tessel.connection.end();
    })
    .catch(function(err){
      // throw err;
      console.log("th err", err, err.stack);
      var sanitizedTessel = sanitizeTessel(tessel);
      var tesselData = {test: 'all', tessel: sanitizedTessel, status: -1, info: sanitizedTessel.name};

      updateDeviceStatus(tesselData, true);
      reportLog({device: sanitizedTessel.serialNumber, data: "Through hole tests failed on error "+err}, true);
      emitNote({serialNumber: sanitizedTessel.serialNumber, data: err.toString()});

      tessel.setRedLED(1)
      .then(tessel.connection.end);
    });
  });

  // Called when a device fails to boot (hopefully doesn't happen)
  scanner.on('error', (error) => {
    // If this is a boot up error
    if (error instanceof discovery.BootFailedError) {
      // Tailor the error message a bit
      // Note that this Tessel is still booting
      var tessel = {serialNumber: error.serialNumber, name: 'unknown'};
      emitNote({serialNumber: tessel.serialNumber, data: `${tessel.serialNumber} failed to boot up.`});
      var tesselData = {test: 'all', tessel: tessel, status: -1, info: tessel.name};

      updateDeviceStatus(tesselData, true);
      reportLog({device: sanitizedTessel.serialNumber, data: "Through hole tests failed on error "+err}, true);
    }
    // Otherwise, just print out what was given
    else {
      console.error(error.toString());
    }
  });

  scanner.on('disconnect', (device) => {
    if (isSMTTesting) return;
    io.sockets.emit("removeTesselUSB", {name: "Unknown", serialNumber: device.serialNumber});
  });


  // When the user selects the Through Hole tab of the web page
  client.on('smt', function(data) {
    // We switch to through hole testing..
    isSMTTesting = data;
    console.log("smt testing", isSMTTesting);

    // If we are doing through hole testing
    if (!isSMTTesting) {
      // Start our scanner
      console.log('beginning through hole scanning');
      scanner.start();
    }
    // Otherwise stop our scanner
    else {
      console.log('stopping through hole scanning');
      scanner.stop();
    }
  })
});

function sanitizeTessel(tessel){
  return {name: tessel.name, serialNumber: tessel.connection.serialNumber};
}

function nameTest(tessel) {
  // Note on the web dashboard that we are beginning the name test
  updateDeviceStatus({test: 'name', tessel: {serialNumber: tessel.connection.serialNumber}, status: 0}, true);
  return tessel.getName()
  .then(() => {
    var sanitizedTessel = sanitizeTessel(tessel);
    // Grab data the logs are looking for
    var tesselData = {test: 'name', tessel: sanitizedTessel, status: 1, info: sanitizedTessel.name};
    // Update our own log on the testlator server
    reportLog({device: sanitizedTessel.serialNumber, data: "Connected over USB"}, true);
    // Update out through hole tests interface
    updateDeviceStatus(tesselData, true);
    return Promise.resolve();
  })
}

function throughHoleTest(usbOpts, ethOpts, selectedTessel){
  return new Promise(function(resolve, reject) {
    var sanitizedTessel = sanitizeTessel(selectedTessel);
    var tesselData = {test: 'usb', 'tessel': sanitizedTessel, 'status': 0};
    updateDeviceStatus(tesselData, true);


    integrationTests.usbTest(usbOpts, selectedTessel)
    .then(function(){
      console.log("usb test passed");
      selectedTessel.setGreenLED(1);
      tesselData.status = 1;

      reportLog({device: sanitizedTessel.serialNumber, data: "USB tests passed"}, true);
      updateDeviceStatus(tesselData, true);

      console.log("running ethernet test");

      tesselData.test = 'eth';
      tesselData.status = 0;
      updateDeviceStatus(tesselData, true);

      // first wipe the old wifi credentials
      return integrationTests.ethernetTest(ethOpts, selectedTessel)
      .then(function(){

        selectedTessel.setBlueLED(1);

        console.log("\n\nethernet test passed!!!");
        tesselData.status = 1;
        reportLog({device: sanitizedTessel.serialNumber, data: "ETH tests passed"}, true);
        updateDeviceStatus(tesselData, true);

        return resolve();
      })
      .catch(function(err){
        console.log("\n\nethernet test failed", err);

        tesselData.status = -1;
        reportLog({device: sanitizedTessel.serialNumber, data: "ETH tests failed "+err}, true);
        updateDeviceStatus(tesselData, true);
        return reject(err);
      });
    })
    .catch(function(err){
      console.log("usb test failed", err);
      tesselData.status = -1;
      reportLog({device: sanitizedTessel.serialNumber, data: "USB tests failed "+err}, true);
      updateDeviceStatus(tesselData, true);

      // usb test failed
      reject(err);
    })
  });
}

/*
 Resolves with a bool of whether new binaries need to be downloaded
 Downloads new builds.json if missing
 This is true if:
 1. the builds.json file is missing
 2. any of the binaries needed are missing
 3. the md5 sum in our builds.json does not match the md5 sum on the server for any build
*/
function checkForNewBuilds() {
  return new Promise((resolve, reject) => {
    var localBuildJSONPath = path.join(__dirname, './build.json');
    // Check if the /bin folder already exists
    fs.stat(localBuildJSONPath, (err, stats) => {
      // If we had an error
      if (err) {
        // Check 1: does the builds.json file exist
        if (err.code === 'ENOENT') {
          console.log('CHECK 1: BUILDS.JSON DOESNT EXISTS!');
          // Resolve with true so we update our binaries
          fetchFreshBuildsJSON()
          .then(() => resolve(true));
        }
        // Otherwise, it's an unexpected error
        else {
          return reject(err);
        }
      }
      // The file exists
      else {
        // Save the JSON to a global var
        configs.builds = require(path.join(__dirname, './build.json'));
        // Check if our local binaries are the latest available
        // (the other two checks)
        return checkLocalBinaries()
        // If they are, don't indicate we need to download them again
        .then(() => resolve(false))
        // If not, we will indicate that we need to download new ones
        .catch(() => resolve(true));
      }
    });
  });
}

/*
  Ensures latest binaries exist and are installed. Rejects otherwise
*/
function checkLocalBinaries() {
  return new Promise((resolve, reject) => {
    // For each build we should have
    async.forEachOf(BUILDS, function(build, i, callback){
      // Check 2: does the binary file actually exist
      fs.exists(path.join(__dirname, '/bin/'+build+'.bin'), function(exists){
        // If not
        if (!exists) {
          // Return an error so we update
          return callback(new Error("Binary is missing."));
        }
        // If we do have the binary
        else {
          // Fetch the latest build info from the server
          request(BUILD_PATH+build+'/info', function(err, res, body) {
            // Parse the info into JSON
            body = JSON.parse(body);
            // Check 3: Compare the MD5 sums to ensure they are the same file
            if (body.md5sum != configs.builds[build].md5sum) {
              // If not, return an error so we update
              return callback(new Error("md5 does not match for "+build));
            }
            // The file locally is the same as the one on the server
            else {
              callback();
            }
          });
        }
      })
    }, function(err){
      if (err) {
        return reject(err);
      }
      else {
        return resolve();
      }
    });
  });
}

/*
  Downloads and write builds.json data to file
*/
function fetchFreshBuildsJSON() {
  return new Promise((resolve, reject) => {
    request.get(BUILD_PATH, (err, res, body) => {
      try {
        var res = JSON.parse(body);

        fs.writeFile(path.join(__dirname, './build.json'), body, (err) => {
          if (err) {
            return reject(err);
          }
          else {
            // save configs
            configs.builds = res;
            return resolve();
          }
        })
      }
      catch(err) {
        return reject(err);
      }
    });
  });
}

/*
  Installs latest binaries AND builds.json
*/
function fetchFreshBuilds(buildsJSON){
  isDownloading = true;

  return new Promise((resolve, reject) => {
    var buildsJSON = {};
    var downloadPath = path.join(__dirname, '/bin');

    // Check if the /bin folder already exists
    fs.stat(downloadPath, (err, stats) => {
      // If we had an error (like it doesn't exist)
      if (err) {
        // Check if it doesn't exist
        if (err.code === 'ENOENT') {
          // Create it
          fs.mkdirSync(downloadPath);
        }
        // Otherwise, it's an unexpected error
        else {
          return reject(err);
        }
      }

      async.forEachOf(BUILDS, function(build, i, callback){
        var url = BUILD_PATH + build;
        var binPath = path.join(__dirname, '/bin/'+build+".bin");

        var binFile = fs.createWriteStream(binPath);
        request.get(url+'.bin')
        .on('error', reject)
        .pipe(binFile);

        binFile.on('finish', function(){
          var buf = fs.readFileSync(binPath);
          var md5 = crypto.createHash('md5')
          .update(buf, 'utf8')
          .digest('hex')

          // check md5 sum
          request(url+"/info", function(err, res, body){
            body = JSON.parse(body);
            var expectedMD5 = body.md5sum;
            if (md5 != expectedMD5) {
              return callback(new Error("Md5sum of "+url+" did not match. Got: "+md5+", expected: "+expectedMD5));
            }
            else {
              buildsJSON[build] = {md5sum: expectedMD5, time: new Date().getTime(), build: body.build};

              callback();
            }
          });
        });
      }, function(err){
          if (err) return reject(err);
          isDownloading = false;

          // Overwrite our potentially out of date builds.JSON
          fs.writeFile(path.join(__dirname, './build.json'), JSON.stringify(buildsJSON, null, 2), function(err){
            // Update UI
            emitMessage("Update finished! You may begin tests now.", isDownloading);
            // Finish function
            return resolve();
          });
        });
      });
    });
}

function initializeTestbenchServer() {
  // First check if we need new binaries
  // also ensure we have a builds.json
  // so we can populate index.js (needs it for listing builds)
  checkForNewBuilds()
  .then((needNewBinaries) => {
    // Start serving the page
    server.listen(app.get('port'), function() {
      console.log("Listening on " + app.get('port'));
    });

    // If we need to download binaries
    if (needNewBinaries) {
      // Do that now
      return fetchFreshBuilds();
    }
  })
  // Start reporting a heartbeat to testalator
  .then(() => setInterval(heartbeat, 1000*5*60))
  // Something went awry with initialization
  .catch((err) => {
    console.error("Unable to initialize test bench!!!!", err);
    console.error("Please contact the Tessel Team Immediately: support@tessel.io");
    process.exit(1);
  });
}

initializeTestbenchServer();
