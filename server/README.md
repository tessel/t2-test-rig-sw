#Testalator Web 2

The second incarnation of the testing server UI

## Setup

Copy the following files into `/public/builds`

* firmware.bin - samd21 firmware
* boot.bin - samd21 bootloader
* openwrt-ramips-mt7620-Default-u-boot.bin - openwrt bootlader
* openwrt-ramips-mt7620-tessel-squashfs-sysupgrade.bin - openwrt build

Then run `node scripts/updateBuild.js`. This will populate a `build.json` file.

`config.json` contains the tests and basic auth tokens.

Run `tests/test.js` to populate data

If running on OSX, make sure to have this in your bashrc:
```
alias md5sum="md5 -r"
```

To run:
```
npm install;
npm start;
```
