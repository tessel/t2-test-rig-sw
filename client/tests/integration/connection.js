var commands = require('./commands');

// Assumes Tessel connection was already opened and will be closed afterwards
function wifiTest(opts, tessel) {
  // Empirically derived time it takes for connection to be ready for pings
  const settleTime = 10000;
  return tessel.connectToNetwork(opts)
  .then(() => {
    return new Promise((resolve, reject) => {
      setTimeout(()=> {
        return runPingTest(opts, tessel)
        .then(resolve)
        .catch(reject);
      }, settleTime);
    });
  });
}

// Assumes Tessel connection was already opened and will be closed afterwards
function ethernetTest(opts, tessel) {
  // Turn wifi off first to ensure we're testing a hard connection
  return tessel.setWiFiState(false)
  // Attempt to ping
  .then(() => {
    return runPingTest(opts, tessel)
  });
}

function runPingTest(opts, tessel) {
  const numPings = 3;
  return tessel.simpleExec(commands.checkConnection(opts.host, numPings))
  .then((pingData) => {
    // Check if it passes our tests
    if (pingWasSuccessful(pingData)) {
      return Promise.resolve();
    }
    // test failed
    else {
      return Promise.reject(`Unable to receive data over ethernet from host at ${opts.host}`);
    }
  })
  .catch((err) => {
    return Promise.reject(`Could not complete ping test: ${err}`);
  });
}

// The hackiest test ever written my god
// test passes if it got all the data from the ping
function pingWasSuccessful(data) {
  // The hackiest test ever written my god
  // test passes if it got all the data from the ping
  if (data.indexOf('64 bytes from') != -1) {
    return true;
  }
  // test failed
  else {
    return false;
  }
}

module.exports.wifiTest = wifiTest;
module.exports.ethernetTest = ethernetTest;
