// run this to update the binaries for the rigs

var prompt = require('prompt')
  , crypto = require('crypto')
  , fs = require('fs')
  , async = require('async')
  , path = require('path')
  ;

var BUILD_PATH = "../public/builds/";
var BUILDS = require(path.join(__dirname, "../../config.json")).builds;

var schema = {
  properties: {
    firmware: {
      message: 'Commit hash of the firmware build',
      required: true
    },
    openwrt: {
      message: 'Commit hash of the openwrt build',
      required: true
    }
  }
};

prompt.start();


prompt.get(schema, function (err, result) {
  if (err) { return onErr(err); }
  var buildsJson = {};
  // write the builds.json file
  async.forEachOf(BUILDS, function(build, i, callback){
    fs.readFile(path.join(__dirname, BUILD_PATH+build+'.bin'), function (err, data){
      if (err) return callback(err);
      // get the md5
      var md5 = crypto.createHash('md5')
        .update(data, 'utf8')
        .digest('hex');

      // timestamp it
      if (build == "firmware" || build == "boot") {
        buildsJson[build] = {"build": result.firmware}
      } else {
        buildsJson[build] = {"build": result.openwrt}
      }

      buildsJson[build].time = (new Date()).getTime();
      buildsJson[build].md5sum = md5;
      callback();
    });
  }, function (err){
    if (err) return onErr(err);
    fs.writeFile(path.join(__dirname, '../build.json'), JSON.stringify(buildsJson, null, 2), function(err){
      if (err) return onErr(err);

      console.log("Finished updating builds");
    })
  });
});

function onErr(err) {
  console.log(err);
  return 1;
}