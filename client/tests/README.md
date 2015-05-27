```
git submodule update --init;
pip install pyusb;
```

Put the following in client/bin:

* boot.bin and firmware.bin from a t2-firmware build (from master)
* openwrt-ramips-mt7620-Default-u-boot.bin and openwrt-ramips-mt7620-tessel-squashfs-sysupgrade.bin from an openwrt-tessel build.

```
cd client; node run.js
```
and press the button on the test rig
