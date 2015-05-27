var rig_usb = require('./rig-usb');
var child_process = require('child_process');

rig_usb.on('attach', function(dev) {
    console.log('Device attach');
    dev.on('detach', function() {
        console.log('Device detach');
    });

    dev.on('ready', function() {
        console.log('Device with serial number', dev.serialNumber, 'is ready');
        dev.ready_led(true);
    })

    var running = false;

    dev.on('button-press', function() {
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

        var ps = child_process.spawn('python', ['-u', 'tests/tests.py', dev.serialNumber])
        ps.stdout.pipe(process.stdout)
        ps.stderr.pipe(process.stderr)

        ps.on('close', function(code) {
            console.log("Child exited with code", code)
            dev.testing_led(false);
            if (code == 0) {
                dev.pass_led(true);
            } else {
                dev.fail_led(true);
            }
            dev.ready_led(true);
            running = false;
        });
    })

    dev.on('error', function(e) {
        console.log("Error on ", dev.serialNumber);
        throw e;
    })
});
rig_usb.start();
