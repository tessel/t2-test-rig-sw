##Running the web interface

```
npm install;
node index.js
```

##Running the test rig

```
mkdir bin;
```

Put in files named 
* `boot.bin`
* `boot.elf`
* `firmware.bin`
* `firmware.elf`
* `openwrt-ramips-mt7620-Default-u-boot.bin`
* `openwrt-ramips-mt7620-tessel-squashfs-sysupgrade.bin`

```
node run.js
```

If you only want to run the openwrt sysupgrade, `python tests/sysupgrade.py`.