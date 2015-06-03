import os, time
import rig as riglib
import flash

# pull in the tests
import bus_voltage_test
import port_test

rig = riglib.by_cmdline()
bin_dir = os.path.join(os.path.dirname(__file__), '../bin')

rig.digital('UUTPOWER_USB', 0)
rig.digital('UUTPOWER_VIN', 0)
time.sleep(1)

# Power on via 5V in pin
rig.digital('UUTPOWER_USB', 1)
time.sleep(1)

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

# Port IO to inputs
for i in xrange(8):
    rig.uut_digital('a' + str(i), 2)
    rig.uut_digital('b' + str(i), 2)

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

# give the USB controller time to turn on, then check the node voltages again
time.sleep(15)
bus_voltage_test.yes_fw_yes_os(rig)


# SAM tests

# Port A test
port_test.test_ports(rig)

# Port B test

# Test power LED

# Boot mediatek

# Verify comms using UART breakout

# Verify comms using bridge

# Test USB hub

# WiFi

# Ethernet

# LEDs

rig.digital('UUTPOWER_USB', 0)
rig.digital('UUTPOWER_VIN', 0)
