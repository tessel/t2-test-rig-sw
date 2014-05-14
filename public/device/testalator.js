// uses the https://github.com/rakeshpai/pi-gpio lib
var gpio = require("pi-gpio");
var sys = require('sys'),
  exec = require('child_process').exec,
  async = require("async"),
  fs = require("fs")
  path = require('path'),
  humanize = require('humanize'),
  tessel_usb = require('./deps/cli/src/index.js'),
  usb = require('usb'),
  request = require('request')
  ;

var A0 = 8,
  A6 = 10,
  A8 = 12,
  A7 = 21,
  button = 22,
  reset = 24,
  ledDfu = 7,
  ledFirmware = 11,
  ledJS = 13,
  ledPins = 15,
  ledWifi = 16,
  usbPwr = 18,
  ledDone = 19,
  ledError = 26,
  busy = 3,
  config = 5,
  extPwr = 23
  ;

var  dfu = require("./deps/cli/dfu/tessel-dfu")
  ;
var emc_state = null;

var TESSEL_VID = 0x1d50;
var TESSEL_PID = 0x6097;

var NXP_ROM_VID = 0x1fc9;
var NXP_ROM_PID = 0x000c;

var BOARD_V = 4;
var CC_VER = "1.26";

var tessel = null;

var otpPath = path.resolve(__dirname, "bin/tessel-otp-v4.bin"),
  wifiPatchPath = path.resolve(__dirname, "bin/tessel-cc3k-patch.bin"),
  firmwarePath = path.resolve(__dirname, "bin/tessel-firmware.bin"),
  jsPath = path.resolve(__dirname, "bin/tessel-js.tar"),
  powerPath = path.resolve(__dirname, "bin/tessel-count.tar"),
  firmwareMD5Path = path.resolve(__dirname, "bin/firmware.md5"),
  s3Url = "https://s3.amazonaws.com/testalator-firmware/tessel-firmware.bin",
  s3MD5 = "x-amz-meta-md5",
  s3Git = "x-amz-meta-git",
  s3Wifi = "x-amz-meta-wifi",
  cc3kMD5Path = path.resolve(__dirname, "bin/tessel-cc3k-patch.md5"),
  cc3kUrl = "https://s3.amazonaws.com/testalator-firmware/tessel-cc3k-patch.bin",
  jsMD5Path = path.resolve(__dirname, "bin/tessel-js.md5"),
  jsUrl = "https://s3.amazonaws.com/testalator-firmware/tessel-js.tar",
  countMD5Path = path.resolve(__dirname, "bin/tessel-count.md5"),
  countUrl = "https://s3.amazonaws.com/testalator-firmware/tessel-count.tar",
  otpMD5Path = path.resolve(__dirname, "bin/tessel-otp-v4.md5"),
  otpUrl = "https://s3.amazonaws.com/testalator-firmware/tessel-otp.bin",
  wifiUrl = "https://s3.amazonaws.com/testalator-firmware/wifi",
  wifiSsid = "x-amz-meta-ssid",
  wifiAuth = "x-amz-meta-auth",
  wifiPw = "x-amz-meta-pw"
  ;

var network = "",
  pw = "",
  auth = "";

var firmwareGit = "";

var needOTP = false;

var logger;
var deviceId; 

function checkS3(url, resPath, resMD5Path, next){
  logger.write("Checking s3");
  var count = 0;
  var max = 3;

  function download(downloadUrl, checkMd5, n){
    var file = fs.createWriteStream(resPath);
    request.get(url).pipe(file).on('close', function(){
      // check md5 sum
      exec("md5sum "+resPath+" | awk '{ print $1 }'", function(err, md5, stderr){
        if (err || !md5) {
          logger.write("Cannot get md5 sum of the firmware, got: "+err+" "+stderr);
          return n(stderr);
        }
        md5 = md5.trim();

        if (md5 != checkMd5){
          logger.write("Got different Md5s on "+resMD5Path+" "+md5+", "+checkMd5+". Count: "+count);
          count++;
          if (count >= max){
            return n("Md5 never matched: "+md5+" "+checkMd5); 
          } else {
            // if it's wrong retry
            return download(downloadUrl, checkMd5, n);
          }
        }
        
        // its correct, update the md5 file
        try {
          logger.write("updating md5 file");
          fs.writeFileSync(resMD5Path, checkMd5);
        } catch (e){
          return n && n(e);
        }
        
        return n && n();
      });
    });
    
  }

  // checks s3 for a firmware binary
 request.head(url, function(err, data){
    var currMd5 = fs.existsSync(resMD5Path) ? fs.readFileSync(resMD5Path, "utf-8").trim() : "";
    if (!err && data.headers && data.headers[s3MD5]) {
      if (data.headers[s3Git] && url == s3Url){
        // update our firmware git only if it's the firmware url
        firmwareGit = data.headers[s3Git];
      } else {
        logger.write(logger.levels.error, "s3", "cannot get s3 git version from "+url);
      }
      if (data.headers[s3Wifi]){
        CC_VER = data.headers[s3Wifi];
      }
      if (data.headers[s3MD5]) {
        // check md5 between this firmware and the firmware we have
        if (data.headers[s3MD5] != currMd5){
        // if it's different download the new firmware
          download(url, data.headers[s3MD5], function(err){
            if (err) {
              // if it's still wrong kill yourself
              return next(err);
            }

            // if it's right go on
            logger.write("got new md5 sum for "+resPath);
            return next && next(null);
          });
        } else {
          // if md5s are the same, go on
          logger.write("same md5 at"+resMD5Path+" "+data.headers[s3MD5]+" "+currMd5);
          return next && next(null);
        }
      }
    } else {
      // if there's something weird with s3 just keep on going with this firmware
      logger.write(logger.levels.error, "s3", "cannot get s3 binary "+err);
      return next && next(null);
    }
 });


}

function setupLogger(next){
  var deviceSettings = require('./parser.js').create(path.resolve(__dirname,'device')).process(['device', 'ssid', 'pw', 'auth'], function(res){
    network = res.ssid;
    pw = res.pw;
    auth = res.auth;

    // check wifi url 
    request.head(wifiUrl, function(err, data){
      if (!err && data.headers && data.headers[wifiSsid] && data.headers[wifiPw] && data.headers[wifiAuth]){
        network = data.headers[wifiSsid];
        pw = data.headers[wifiPw];
        auth = data.headers[wifiAuth];
        console.log("got new wifi auth credentials: ", network+"/"+pw, auth);
      }

      exec('git rev-parse HEAD', function(err, git, stderr){
        fs.readdir(path.resolve(__dirname, 'bin'), function(err, files){
          logger = require('./logger.js').create(res.device, git, files);
          logger.clearDevice();
          next && next();
        });
      });
    });
  });
}

function run(){
  console.log("running");
  needOTP = false;
  setupLogger(function (){
    async.waterfall([
      function (cb) { checkS3(cc3kUrl, wifiPatchPath, cc3kMD5Path, cb)}, // cc3k patch
      function (cb) { checkS3(jsUrl, jsPath, jsMD5Path, cb)}, // js test
      function (cb) { checkS3(otpUrl, otpPath, otpMD5Path, cb)}, // otp
      function (cb) { checkS3(countUrl, powerPath, countMD5Path, cb)}, // count test
      function (cb) { checkS3(s3Url, firmwarePath, firmwareMD5Path, cb)}, // firmware
      function (cb) { closeAll(cb) },
      function (cb) { setup(cb, true) },
      function (cb) { checkOTP(cb, 0, 0)},
      function (cb) { firmware(firmwarePath, cb) },
      function (cb) { ram(wifiPatchPath, 15000, cb)},
      function (cb) { getBoardInfo(cb, 0) },
      function (cb) { wifiPatchCheck(cb) },
      function (cb) { jsCheck(jsPath, cb) },
      function (cb) { powerSwitch(powerPath, cb) },
      function (cb) { wifiTest(network, pw, auth, cb)}
    ], function (err, result){
      logger.writeAll("Finished.");
      // make sure Error and Done are off
      toggle(ledError, 0, function(){
        toggle(ledDone, 0, function(){
          setTimeout(function(){
            if (err){
              toggle(ledError, 1);
              logger.writeAll(logger.levels.error, "testalator", err);
            } else {
              toggle(ledDone, 1);
              logger.writeAll("Success!");
            }

            setTimeout(function(){
              // closeAll(function(){
                process.exit();
              // });
            }, 500);
          }, 5000);
        });
      });

    });
  }); 
}

function powerSwitch(powerPath, callback){
  tessel.listen(true);
  logger.writeAll("checking power switching");
  var tarbundle = fs.readFileSync(powerPath);
  // push some js code
  tessel.deployBundle(tarbundle, {});
  var count = 0;

  var jsonCount = 0;
  var jsonMaxCount = 3;

  // turn on external power
  toggle(extPwr, 1, function(){
    // wait 2 seconds for code to finish pushing
    toggle(ledPins, 0, function(){
      // close usb comms
      tessel.close();
      tessel.once('close', function(){
        // turn off usb power
        toggle(usbPwr, 0, function(){
            // turn on usbPower
          toggle(usbPwr, 1, function(){
            tessel_usb.findTessel(null, function (err, client) {
              if (err) {
                logger.writeAll(logger.levels.error, "powerSwitch", err);
                return callback(err);
              }
              tessel.listen(true);

              tessel = client;
              tessel.on('log', function onLog (level, data) {
                if (data[0] == '{' && data[data.length-1] == '}'){
                  data = JSON.parse(data);
                  if (data.count && data.count > count){
                    count = data.count;
                    jsonCount++;

                    // if we get more than 3 counts
                    if (jsonCount >= jsonMaxCount) {
                      tessel.removeListener('log', onLog);
                      logger.writeAll("got more than 3 counts, extPwr passed");
                      toggle(ledPins, 1);
                      logger.deviceUpdate("extPower", "passed");
                      tessel.stop();
                      return callback(null);
                    }
                  }
                }

                // if we don't get the counts within a specified amount of time it failed
                setTimeout(function(){
                  console.log("removing event listener");
                  if (count == 0 || jsonCount < jsonMaxCount) {
                    var err = "Could not get a count after power switch";
                    tessel.removeListener('log', onLog);
                    logger.writeAll(err);
                    logger.deviceUpdate("extPower", "failed");
                    return callback(err);
                  }
                }, 3000);
              });
            });
          }, 1000);
        }, 1000);
      });
    }, 2000);
      
  });
}

function wifiTest(ssid, pw, security, callback){
  logger.writeAll("wifi test connecting to "+ssid+"/"+pw+" with "+security);
  var count = 0;
  var maxCount = 5;
  tessel.listen(true);

  var retry = function() {
    tessel.configureWifi(ssid, pw, security, {
      timeout: 8
    }, function (data) {
      console.log("got data", data);
      if (!data.connected) {
        logger.writeAll(logger.levels.error, "wifiTest", "Retrying... #"+count);

        count++;
        if (count > maxCount) {
          logger.writeAll(logger.levels.error, "wifiTest", "wifi did not connect");
          logger.deviceUpdate("wifi", false);

          callback("wifi did not connect")
        } else {
          setImmediate(retry);
        }
      } else {
        logger.writeAll("connected on try #"+count+" with ip "+data.ip);

        exec("fping -c5 -t500 "+data.ip, function(error, stdout, stderr){
          if (!error){
            logger.deviceUpdate("wifi", true);
            logger.writeAll("wifi connected");

            toggle(ledWifi, 1);

            callback(null);
          } else {
            logger.deviceUpdate("wifi", false);
            logger.writeAll(logger.levels.error,"wifi","wifi connected but could not ping: " +error);
            callback(error);
          }
        });
      }
    });
  }

  retry();
}

function ram(path, delayLength, callback){
  toggle(config, 1, function(){
    rst(function(err){
      setTimeout(function(){
        logger.write("running ram patch on "+path);
        dfu.runRam(fs.readFileSync(path), function(err){
          gpio.write(config, 0, function(){
            if (err) return callback(err);
            console.log("done with running ram");
            setTimeout(function(){
              callback(null);
            }, delayLength);
          });
        });
      }, 500);
    });
  }, 200);
}

function checkOTP(callback, otpTries, overallTries){
  // , tries
  var MAX_TRIES = 3;
  var MAX_OVERALL_TRIES = 2;
  logger.write("starting check OTP");
  otpTries++;
  emc(0, function(err){
    usbCheck(TESSEL_VID, TESSEL_PID, function(err){
      if (err) {
        // check for NXP board
        emc(1, function(err) {
          setTimeout(function(){
            rst(function(err){
              // if (err) return callback(err);
              usbCheck(NXP_ROM_VID, NXP_ROM_PID, function(err){
                // if it is found otp
                if (!err) {
                  needOTP = true;
                  logger.write("this board should be otped");

                  dfu.runNXP(otpPath, function(err){
                    if (err) return callback(err);
                    emc(0, function(err){
                      setTimeout(function(){
                        usbCheck(TESSEL_VID, TESSEL_PID, function(err){
                          if (err) {
                            logger.write(logger.levels.error, "checkOTP", "OTP'ed but cannot find tessel pid/vid");
                            
                            return callback(err);
                          } else {
                            logger.write("done with check OTP");
                            callback(null);
                          }
                        });
                      }, 500);
                    });
                  });
                } else {

                  // if it's below max tries, try again
                  if (otpTries < MAX_TRIES){
                    logger.write("failed on try "+otpTries+" trying again");
                    return checkOTP(callback, otpTries, overallTries);
                  } 

                  // otherwise it's an error
                  logger.write(logger.levels.error, "checkOTP", "cannot find either nxp pid/vid or tessel pid/vid");
                  if (overallTries < MAX_OVERALL_TRIES){
                    closeAll(function(){
                      setup(function(){
                        logger.write("failed overall try "+overallTries+" trying again");
                        overallTries++;
                        checkOTP(callback, 0, overallTries);
                      }, false);
                    });
                  } else {
                    return callback(err);
                  }
                }
              });
            });
          }, 500);
        });
        
      } else {
        logger.write("already OTP'ed");
        callback(null);
      }
    });
  });

  // emc(1, function(err) {
  //   setTimeout(function(){
  //     rst(function(err){
  //       // if (err) return callback(err);
  //       usbCheck(NXP_ROM_VID, NXP_ROM_PID, function(err){
  //         // if it is found otp
  //         if (!err) {
  //           needOTP = true;
  //           logger.write("this board should be otped");

  //           dfu.runNXP(otpPath, function(err){
  //             if (err) return callback(err);
  //             emc(0, function(err){
  //               setTimeout(function(){
  //                 usbCheck(TESSEL_VID, TESSEL_PID, function(err){
  //                   if (err) {
  //                     logger.write(logger.levels.error, "checkOTP", "OTP'ed but cannot find tessel pid/vid");
                      
  //                     return callback(err);
  //                   } else {
  //                     logger.write("done with check OTP");
  //                     callback(null);
  //                   }
  //                 });
  //               }, 500);
  //             });
  //           });


  //         } else {
            

  //           // if it's not found check for other otp.
  //           // emc(0, function(err){
              
  //           // });

  //         }
  //       });
  //     });
  //   }, 500);
  // });
}

var hardwareResolve = require('hardware-resolve');

function jsCheck(jsPath, callback){
  var tarbundle = fs.readFileSync(jsPath);
  tessel.deployBundle(tarbundle, {});
  console.log("done with bundling");
  // check for the script to finish
  tessel.listen(true);
  var turnOnLED = false;
  var returned = false;
  tessel.on('log', function onLog (level, data) {
    if (!turnOnLED) {
      turnOnLED = true;
      toggle(ledJS, 1);
    }

    if (data[0] == '{' && data[data.length-1] == '}'){
      data = JSON.parse(data);
      // check test status
      if (data.jsTest && data.jsTest == 'passed'){
        console.log("PASSED");
        logger.writeAll("jsTest passed");
        toggle(ledPins, 1);
        tessel.removeListener('log', onLog);
        returned = true;

        return callback();
      } else if (data.jsTest && data.jsTest == 'failed'){

        logger.writeAll(logger.levels.error, data.jsTest, "failed");
        returned = true;
        callback("Could not pass js test");
      } else {
        console.log("updating", Object.keys(data)[0], data[Object.keys(data)[0]]);
        logger.deviceUpdate(Object.keys(data)[0], data[Object.keys(data)[0]]);
      }
    } else {
      // push data into logging
      if (data.indexOf("Error parsing") != -1)
      {
        returned = true;
        callback(data);
      }
      logger.writeAll( data);
    }
  });
  
  // no response within 10s, its a fail
  setTimeout(function(){
    if (!returned){
      callback("did not finish js test within 10 seconds");
    }
  }, 10000);
}

function wifiPatchCheck(callback){
  logger.write("wifiPatchCheck beginning.");
  // read wifi version
  var called = false;
  tessel.wifiVer(function(err, data){
    logger.writeAll("wifiPatchCheck", data);
    if (data == CC_VER) {
      logger.deviceUpdate("tiFirmware", true);
      called = true;
      callback(null);
    } else {
      logger.deviceUpdate("tiFirmware", false);
      logger.writeAll(logger.levels.error, "wifiVersion", data);
      called = true;
      callback("error, wifi patch did not update");
    }
  });
}

function firmware(path, callback){
  logger.write("starting firmware write on "+path);
  // config and reset

  function dfuFirmware(){
    logger.write("writing binary on "+path);
    // console.log(fs.readdirSync(path.resolve(__dirname, "bin")));
    require('./deps/cli/dfu/tessel-dfu').write(fs.readFileSync(path), function(err){

      // make config low
      gpio.write(config, 0, function(){

        if (err){
          logger.write(logger.levels.error, "firmware", err);
          
          callback(err);
        } else {
          toggle(ledFirmware, 1);
          callback(null);
        }
      });
    });
  }

  if (!needOTP) {
    toggle(config, 1, function(){
      rst(function(err){
        dfuFirmware();
      });
    }, 100);
  } else {
    // if we OTP'ed we're already in dfu mode
    dfuFirmware();
  }
}

function usbCheck(vid, pid, callback){
  setTimeout(function(){
    // console.log("checking usb for ", vid, pid);
    logger.write("checking usb for "+vid+"/"+pid);

    if (usb.findByIds(vid, pid)){
      logger.write("found vid/pid "+vid+"/"+pid);
      callback(null);
    } else {
      logger.write(logger.levels.error, "usb_check", "cannot find vid/pid: " + vid + " " + pid);
      callback("Error cannot find vid/pid: " + vid + " " + pid, "usb check");
    }
  }, 1000);
}

function rst(callback){
  logger.write("resetting Tessel");
  gpio.write(reset, 0, function(err) {
    // wait a bit
    setTimeout(function() {
      gpio.write(reset, 1, function(err) {
        setTimeout(function() {
          logger.write("starting tessel back up");
          callback(null);
        }, 500);
      });
    }, 100);
  });
}

function toggle(led, state, next, timeout){
  gpio.write(led, state, function(err) {
    if (timeout){
      setTimeout(function(){
        next && next();
      }, timeout);
    } else {
      next && next();
    }
  });
}

function getBoardInfo(callback, tries) {
  logger.write("getting board info.");
  var MAX_TRIES = 3;
  // find the serial and otp
  tessel_usb.findTessel(null, function(err, client){
    tessel = client;
    if (!err) {
      console.log(client.serialNumber);
      // parse serial number, TM-00-04-f000da30-00514f3b-38642586 
      var splitSerial = client.serialNumber.split("-");
      if (splitSerial.length != 6){
        // error we got something that's not a serial number
        logger.write(logger.levels.error, "boardInfo", "got bad serial number: "+client.serialNumber);
        return callback("got bad serial number "+client.serialNumber );
      }

      var otp = splitSerial[2];
      console.log("otp", splitSerial[2]);
      var serial = splitSerial[3]+'-'+splitSerial[4]+'-'+splitSerial[5];

      logger.newDevice({"serial":serial, "firmware": client.version.firmware_git, "runtime": client.version.runtime_git, "board":otp});
      
      // if this firmware isn't the same version as what we have from s3 then we have a big probleeeeem
      if (firmwareGit != "" && firmwareGit.search(client.version.firmware_git) == -1){
        return callback("The firmware version on this board did not match the firmware on s3: "+client.version.firmware_git+" "+firmwareGit);
      }

      if (Number(otp) == BOARD_V){
        logger.deviceUpdate("otp", otp);
        toggle(ledDfu, 1);

      } else {
        logger.deviceUpdate("otp", false);
        logger.writeAll(logger.levels.error, "otpVersion", otp );

        return callback("OTP is set as "+otp);
      }

      return callback(null);
    } else {
      logger.write("could not get board info, resetting and trying again. On Try: "+tries);
      if (tries < MAX_TRIES){
        tries = tries +1;
        rst(function(){
          getBoardInfo(callback, tries);
        });
      } else {
        return callback(err);
      }
    }
  });
}

function closeAll(callback){
  var funcArray = [];
  console.log("closing all");
  [A0, A6, A8, A7, button, reset, ledDfu, ledFirmware, 
  ledJS, ledPins, ledWifi, ledDone, ledError, busy, 
  config, usbPwr, extPwr].forEach(function(element){
    funcArray.push(function(cb){
      gpio.close(element, function(err){
        cb(null);
      })
    });
  })

  async.series(funcArray, function (err, res){
    callback(null);
  });
}

function setup(callback, wait){
  logger.write("setting up...");
  var funcArray = [];
  [reset, ledDfu, ledFirmware, ledJS, ledPins, 
  ledWifi, ledDone, ledError, config, extPwr, usbPwr].forEach(function(element){
    funcArray.push(function(cb){
      gpio.open(element, "output", function(err){
        if (element == usbPwr || element == reset) {
          gpio.write(element, 1, function(err) {
            cb(null);
          });
        } else {
          gpio.write(element, 0, function(err) {
            cb(null);
          });
        }
      });
    });
  });

  var calledBack = false;
  
  // have all emcs be inputs
  // wait until a button is pressed.
  gpio.open(button, "input pullup", function (err){
    gpio.open(busy, "output", function(err){
      logger.write("waiting for button press");
      var state = 1;
      var count = 20;
      var intervalId = setInterval(function(){
        // toggle the ready button
        count++;
        if (count >= 20) {
          state = state ? 0 : 1;
          toggle(busy, state);
          count = 0;
        }

        gpio.read(button, function(err, value){
          if ( (value == 0 && calledBack == false) || 
            (wait == false && calledBack == false)) {
            calledBack = true;
            clearInterval(intervalId);
            emc(0, function(){
              // not ready anymore
              async.series(funcArray, function (err, results){
                logger.write("done with setting up");
                toggle(busy, 0, function(){
                  callback();

                }, 1500);
              });
            });
          }
        });
      }, 20);
    });
  });
    
}

function emc(enable, callback){
  var maxNum = 4, 
    count = 0,
    pinArray = {};

  pinArray[A0] = 0;
  pinArray[A6] = 1;
  pinArray[A7] = 0;
  pinArray[A8] = 1;

  logger.write("setting up external memory controller pins");

  var funcArray = [];
  [A0, A6, A7, A8].forEach(function(element){
    funcArray.push(function(cb){
      if (emc_state != enable){
        // close and then do stuff
        gpio.close(element, function(){
          setTimeout(function(){
            if (enable){
                gpio.open(element, "output", function(err){
                  setTimeout(function(){
                    gpio.write(element, pinArray[element], function(err) {
                      cb(null);
                    });
                  }, 100);
                });
            } else {
              gpio.open(element, "input", function(err){
                cb(null);
              });
            }
          }, 100);
        });
      } else {
        if (enable){
          gpio.write(element, pinArray[element], function(err) {
            cb(null);
          });
        } else {
          gpio.open(element, "input", function(err){
            cb(null);
          });
        }
      }
      
    });
  });

  async.series(funcArray, function(err, res){
    if (emc_state != enable){
      console.log("Changed emc state from", emc_state, "to", enable);
    } else {
      console.log("emc state is the same");
    }
    emc_state = enable;
    setTimeout(function(){
      callback(null);
    }, 300);
  });
}

run();

function exit() {
  closeAll(function(err){
    // exit for real
    process.exit();
  });
}

process.on('SIGINT', exit);
