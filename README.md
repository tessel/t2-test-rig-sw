# t2 test rig software
Combination of the rig orchastration server & the client code that runs on each host.

```
git submodule update --init --recursive
```

## Updating production code

A complete update of the test bench code consists of four parts: updating the release binaries (also known as golden images), updating the test bench, updating the boot scripts (in the `/boot` folder), and updating the `server` code running at `testalator.tessel.io`.

Most use cases likely involve only updating the binaries flashed on to the new Tessels. Updating the test runner or boot code is a significant endeavor and should only be attempted when absolutely necessary to prevent manufacturing delays. Updating the `server` code is relatively straightforward but shouldn't be necessary in most cases.

### Updating binaries
Occasionally, we may want to update the version of the binaries that our manufacturers are flashing on Tessel 2s as they come off the assembly line. To do that, you will need SSH access to the Testalator server (testalator.tessel.io). If you don't have access, please ask another Tessel Team Member.

First, `scp` any new binaries to the public directory of the server:
```
# Uploads a new samd21 firmware and OpenWRT firmware
scp firmware.bin root@testalator.tessel.io:/home/testalator/t2-test-rig-sw/server/public/builds;
scp openwrt-ramips-mt7620-tessel-squashfs-sysupgrade.bin root@testalator.tessel.io:/home/testalator/t2-test-rig-sw/server/public/builds;
```

Second, run the script to generate a new builds.json file. This file is used to ensure the integrity
of the builds downloaded at the manufacturer's testing site. Follow the prompts to enter in the commit hashes of the t2-firmware and tessel-openwrt release commits:
```
ssh root@testalator.tessel.io node /home/testalator/t2-test-rig-sw/server/scripts/updateBuild.js
```

Finally, you'll need to restart the server:
```
ssh root@testalator.tessel.io killall npm
ssh root@testalator.tessel.io cd /home/testalator/t2-test-rig-sw/server; npm start;
```

### Updating the testbench
The testbench consists of the entire `\client` directory with the exception of any `node_modules` with binary dependencies (they will have to be re-installed on the machine). Updating the testbench consists of tarring up the `client` directory and sending it to the public builds repo of `testalator.tessel.io`. A build script will download this tarball when test running laptops at manufacturer's locations boot up.

```
# Zips up the client to the local `server`'s build directory
tar -cvz --exclude=*.pyc --exclude=client/node_modules/usb/build/* --exclude=client/node_modules/t2-cli/node_modules/usb/build/*  --exclude=server --exclude=.git --exclude=boot -f server/public/builds/client.tar.gz .
$ Transfers the tarball to a publicly accessible directory on the test server
scp server/public/builds/client.tar.gz root@testalator.tessel.io:/home/testalator/t2-test-rig-sw/server/public/builds
```

You should also update the `config.json` file on the server to have the correct commit sha for the version of the client you are uploading:
```
ssh root@testalator.tessel.io
cd /home/testalator/t2-test-rig-sw/
nano config.json
# Edit the `client` property with this client commit SHA
```


### Updating bootscript code
Updating the boot script code (in the `/boot` directory) lives on the same flash drives that contain the [debian live image](https://github.com/tessel/t2-test-rig-debian-live) that is powering the test running PC. To update it, you'll either net to get access to the flash drive currently in use at the manufacturer's facility or you'll need to send them new ones. Load the debian image onto the flash drive, boot into it, then place the contents of the `/boot` folder into `/lib/live/mount/medium` folder.

### Updating the testalator.tessel.io server
You'll need to ssh into the testalator server, pull down your changes (probably via git), and then relaunch supervisor
```
ssh root@testalator.tessel.io
cd /home/testalator/t2-test-rig-sw/
# Or however you need to this it to get to your code
git pull origin master
# There is probably a better way to run the server forever
node server/index.js &
```
