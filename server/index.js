var express = require("express"),
  path = require("path"),
  dotenv = require("dotenv"),
  fs = require("fs");
dotenv.load();

var app = express();
var http = require("http");
var server = http.createServer(app);

var io = require("socket.io").listen(server, { log: false });
io.set("transports", ["xhr-polling"]);
io.set("polling duration", 10);
TESTS = require("../config.json").tests;
BUILDS = require("../config.json").builds;
DEBUG = true;

app.use(express.logger());

app.set("port", process.env.PORT || 3000);
app.set("views", __dirname + "/views");
app.set("view engine", "jade");
app.use(express.logger("dev"));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, "public")));
app.use(express.favicon("public/favicon.ico"));

var mongojs = require("mongojs");
var db = mongojs(process.env.DB || "localhost");
var Benches = db.collection("benches");
var Devices = db.collection("devices");
var Logs = db.collection("logs");

// make sure we have builds, otherwise error out
BUILDS.forEach(function (build) {
  fs.exists(path.join(__dirname, "/public/builds/" + build + ".bin"), function (
    exists
  ) {
    if (!exists)
      throw new Error("Missing binary /public/builds/" + build + ".bin");
  });
});

app.get("/", function (req, res) {
  var benches = [];
  Benches.find(function (err, benches) {
    if (DEBUG) console.log("names", benches);
    var count = 0;
    var tests = {};
    TESTS.forEach(function (test) {
      tests[test] = 1;
    });
    // get number made by each bench
    benches.forEach(function (bench, i) {
      query = tests;
      query["bench"] = bench.id;
      Devices.find(query, function (err, devices) {
        benches[i].count = devices.length;
        count++;

        if (count >= benches.length) {
          if (DEBUG) console.log("benches", benches);
          res.render("index", {
            title: "Testalator | Technical Machine",
            benches: benches
          });
        }
      });
    });
  });
});

function getDevices(query, cb) {
  Devices.find(query).sort({ built: -1 }, function (err, docs) {
    var succesNum = docs.reduce(function (pre, current) {
      for (var i = 0; i < TESTS.length; i++) {
        if (current[TESTS[i]] != 1) return pre;
      }
      return ++pre;
    }, 0);
    cb(docs, succesNum);
  });
}

app.get("/b/:bench", function (req, res) {
  var bench = req.params.bench;
  getDevices({ bench: bench }, function (devices, numSuccess) {
    res.render("bench", {
      title: bench + " | Testalator",
      type: "bench",
      id: bench,
      devices: devices,
      tests: TESTS,
      success: numSuccess
    });
  });
});

app.get("/r/:rig", function (req, res) {
  var rig = req.params.rig;
  getDevices({ rig: rig }, function (devices, numSuccess) {
    res.render("bench", {
      title: rig + " | Testalator",
      type: "rig",
      id: rig,
      devices: devices,
      tests: TESTS,
      success: numSuccess
    });
  });
});

app.post("/device", function (req, res) {
  var device = req.body;
  if (DEBUG) console.log("adding new device", device);
  device.logs = [];

  Devices.findAndModify(
    {
      query: { id: device.id, bench: device.bench, rig: device.rig },
      update: {
        $set: device
      },
      upsert: true
    },
    function (err, doc) {
      if (err) {
        if (DEBUG) console.log("could not save new device", err);
        return res.send(false);
      }
      io.sockets.emit("new_device", device);
      if (DEBUG) console.log("new device added");
      res.send(true);
    }
  );
});

app.post("/bench", function (req, res) {
  var benchHeartbeat = req.body;
  // insert into database
  if (DEBUG) console.log("heartbeat", benchHeartbeat);
  benchHeartbeat.time = new Date().getTime();
  Benches.findAndModify(
    {
      query: { name: benchHeartbeat.name },
      update: {
        $set: benchHeartbeat
      },
      upsert: true
    },
    function (err, doc) {
      if (!err) {
        if (DEBUG) console.log("saved", benchHeartbeat);
        // emit heartbeat
        io.sockets.emit("bench_heartbeat", benchHeartbeat);
        res.send(true);
      } else {
        if (DEBUG) console.log("not saved", err, benchHeartbeat);
        res.send(false);
      }
    }
  );
});

// curl -H 'Content-Type: application/json' -d '{"built":"1234", "id":"abc123", "tiFirmware": "v1.2", "firmware": "df93wd", "adc": "pass", "spi": "pass", "i2c": "pass", "gpio": "fail", "ram": "fail", "wifi": "pass", "codeUpload": "pass", "bench": "Pancakes"}' localhost:5000/device
app.post("/d/:device/test", function (req, res) {
  var id = req.body.id;
  var test = req.body.test;
  var status = req.body.status;
  var updateTest = {};
  updateTest[test] = status;
  // insert into database
  if (DEBUG) console.log("device", req.body.id);
  Devices.findAndModify(
    {
      query: { id: id, bench: req.body.bench, rig: req.body.rig },
      update: {
        $set: updateTest
      },
      upsert: true
    },
    function (err, doc) {
      if (!err) {
        if (DEBUG) console.log("saved", doc);
        // emit heartbeat
        io.sockets.emit("device_update_" + id, { test: test, status: status });
        io.sockets.emit("device_update", {
          id: id,
          test: test,
          status: status
        });
        res.send(true);
      } else {
        if (DEBUG) console.log("not saved", err, doc);
        res.send(false);
      }
    }
  );
});

function newLog(logQuery, data, cb) {
  var key = Object.keys(logQuery)[0];
  Logs.findAndModify(
    {
      query: logQuery,
      update: {
        $push: { log: data }
      },
      upsert: true
    },
    function (err, doc, lastErrorObject) {
      // emit an event about this log update

      if (!err) {
        if (DEBUG) console.log("saved log", logQuery, data);
        io.sockets.emit("log_update_" + logQuery[key], data);
        cb(true);
      } else {
        if (DEBUG) console.log("not saved", identifiers, err);
        cb(false);
      }
    }
  );
}

app.post("/logs", function (req, res) {
  var identifiers = Object.keys(req.body.identifiers);
  var i = 0;
  var success = true;

  (function pushLog() {
    var key = identifiers[i];
    var obj = {};
    obj[key] = req.body.identifiers[key];

    newLog(obj, req.body.data, function (logged) {
      success = success & logged;

      i++;
      if (i >= identifiers.length) {
        return res.send(success);
      } else {
        pushLog();
      }
    });
  })();
});

app.get("/b/:bench/logs", function (req, res) {
  var bench = req.params.bench;
  Logs.findOne({ bench: bench }, function (err, logs) {
    res.render("logs", {
      title: bench + " | logs",
      logs: logs,
      id: bench,
      type: "Bench",
      tests: TESTS
    });
  });
});

app.get("/d/:device/logs", function (req, res) {
  var device = req.params.device;
  Devices.find({ id: device }, function (err, docs) {
    Logs.findOne({ device: device }, function (err, logs) {
      res.render("logs", {
        title: device + " | logs",
        logs: logs,
        id: device,
        type: "Device",
        devices: docs,
        tests: TESTS
      });
    });
  });
});

app.get("/r/:rig/logs", function (req, res) {
  var rig = req.params.rig;
  Devices.find({ rig: rig }, function (err, docs) {
    Logs.findOne({ rig: rig }, function (err, logs) {
      res.render("logs", {
        title: rig + " | logs",
        logs: logs,
        id: rig,
        type: "Rig",
        devices: docs,
        tests: TESTS
      });
    });
  });
});

app.get("/logs", function (req, res) {
  var device = req.query.device;
  var test = req.query.test;
  // get the logs of a particular test for a device
  Logs.findOne({ device: device }, function (err, doc) {
    doc = doc || { log: [] };
    doc.log = doc.log.filter(function (item) {
      return item.indexOf("[" + test + "]") >= 0;
    });

    res.render("logs", {
      title: "query | logs",
      logs: doc,
      id: device,
      type: "Query"
    });
  });
});

BUILDS.forEach(function (build) {
  app.get("/builds/" + build, function (req, res) {
    res.sendfile("/builds/" + build + ".bin", {
      root: path.join(__dirname, "public")
    });
  });

  app.get("/builds/" + build + "/info", function (req, res) {
    var buildInfo = require("./build.json")[build];
    res.json({ md5sum: buildInfo.md5sum, build: buildInfo.build });
  });
});

app.get("/builds", function (req, res) {
  res.json(require("./build.json"));
});

app.get("/client", function (req, res) {
  res.sendfile("/builds/client.tar.gz", {
    root: path.join(__dirname, "public")
  });
});

app.get("/client/info", function (req, res) {
  console.log("client", require("../config.json").client);
  res.send(require("../config.json").client);
});

server.listen(app.get("port"), function () {
  console.log("Listening on " + app.get("port"));
});
