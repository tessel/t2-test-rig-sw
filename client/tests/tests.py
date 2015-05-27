import os, time
import rig
import flash
rig = rig.by_cmdline()
bin_dir = os.path.join(os.path.dirname(__file__), '../bin')

time.sleep(1)

# Power on via 5V in pin

# Verify bus voltages

# Program SAM via SWD
print "Target serial:", rig.uut_serial()
sam_flash = rig.pyocd().flash
sam_flash.init()
print "Writing SAM flash...",
sam_flash.flashBinary(os.path.join(bin_dir, 'boot.bin'),     0)
sam_flash.flashBinary(os.path.join(bin_dir, 'firmware.bin'), 0x1000)
print "done"
# TODO: set bootloader protection
rig.pyocd().target.reset()
time.sleep(1.0) # Wait for device to show up on USB

# Load flash via USB
rig.uut_digital('rst', False)
rig.uut_digital('soc', True)

mac1, mac2 = flash.random_macs() #TODO: get_mac_from_server(rig.uut_serial())
print "MAC addr ", ':'.join("{:02x}".format(x) for x in mac1)
spi_flash = rig.uut_flash()
spi_flash.write_tessel_flash(bin_dir, mac1, mac2)
spi_flash.release()

rig.uut_digital('soc', False)
time.sleep(0.1)
rig.uut_digital('soc', True)
time.sleep(0.1)
rig.uut_digital('rst', True)
print "MTK is hopefully booting"

# SAM tests

# Port A test

# Port B test

# Test power LED

# Boot mediatek

# Verify comms using UART breakout

# Verify comms using bridge

# Test USB hub

# WiFi

# Ethernet

# LEDs
