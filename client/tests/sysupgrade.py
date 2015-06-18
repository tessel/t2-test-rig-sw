# does a sys upgrade over usb
import os
import usb.core
import flash
from flash import Flash

uut_usb = usb.core.find(idVendor = 0x9999, idProduct = 0xFFFF)
bin_dir = os.path.join(os.path.dirname(__file__), '../bin')

mac1, mac2 = flash.random_macs() #TODO: get_mac_from_server(rig.uut_serial
print "MAC addr ", ':'.join("{:02x}".format(x) for x in mac1)
spi_flash = Flash(uut_usb)
spi_flash.write_tessel_flash(bin_dir, mac1, mac2)

print "Done"
