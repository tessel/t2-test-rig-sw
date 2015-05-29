import sys
import usb.core
import time

from common import TestFailure, log_test_start, log_test_end
import pyocd
from flash import Flash

REQ_DIGITAL         = 1
REQ_ANALOG          = 2
REQ_READALLDIGITAL  = 3
REQ_SETANALOGMODE   = 4

ANALOGMODE_SINGLE   = 0
ANALOGMODE_STREAM   = 1

ADC_MAX_VALUE       = 4095
ADC_REFERENCE       = 2.5
CSA_GAIN            = 45
R_CSA               = 0.02

digital_pins = [
    'SHORT_USBO',
    'SHORT_USB1',
    'SHORT_PORTA33',
    'SHORT_PORTB33',
    'LED_READY',
    'LED_TESTING',
    'LED_PASS',
    'LED_FAIL',
    'UUTPOWER_USB',
    'UUTPOWER_VIN',
    'PORTA_MOSI',
    'PORTA_MISO',
    'PORTA_SCK',
    'PORTA_G3',
    'PORTA_SDA',
    'PORTA_SCL',
    'PORTA_G1',
    'PORTA_G2',
    'PORTB_G3',
    'PORTB_MOSI',
    'PORTB_SCK',
    'PORTB_MISO',
    'PORTB_SDA',
    'PORTB_SCL',
    'PORTB_G1',
    'PORTB_G2',
]

analog_pins = [
    'CURRENT_UUT',
    'CURRENT_USB0',
    'CURRENT_USB1',
    'CURRENT_PORTA33',
    'CURRENT_PORTB33',
    'VOLTAGE_VREF',
    'VOLTAGE_5VUSB1',
    'VOLTAGE_5VUUT',
    'VOLTAGE_PORTA33',
    'VOLTAGE_12',
    'VOLTAGE_33CP',
    'VOLTAGE_PORTB33',
    'VOLTAGE_18',
    'VOLTAGE_33MT',
    'VOLTAGE_5VUSB0',
]

def pin_id (pin):
    p = pin.upper()
    if p in digital_pins:
        return digital_pins.index(p)
    elif p in analog_pins:
        return analog_pins.index(p)
    else:
        return -1

DEFAULT_CALIBRATION = {
    "VOLTAGE_VREF": {"0": 4092.608, "2.5": 4092.626, "div" : 1.0},
    "VOLTAGE_12": {"0": 40.712, "2.5": 43.633, "div" : 1.0},
    "VOLTAGE_5VUSB0": {"0": 40.62, "2.5": 2046.812, "div" : 2.0},
    "VOLTAGE_5VUSB1": {"0": 40.495, "2.5": 2045.701, "div" : 2.0},
    "VOLTAGE_33CP": {"0": 40.122, "2.5": 2045.072, "div" : 2.0},
    "VOLTAGE_18": {"0": 40.644, "2.5": 43.738, "div" : 1.0},
    "CURRENT_PORTA33": {"0": 15.081, "2.5": 14.997, "div" : 1.0},
    "VOLTAGE_PORTB33": {"0": 40.537, "2.5": 2046.906, "div" : 2.0},
    "CURRENT_USB0": {"0": 15.485, "2.5": 15.239, "div" : 1.0},
    "CURRENT_USB1": {"0": 15.315, "2.5": 18.036, "div" : 1.0},
    "CURRENT_UUT": {"0": 21.458, "2.5": 21.335, "div" : 1.0},
    "VOLTAGE_PORTA33": {"0": 41.344, "2.5": 2047.37, "div" : 2.0},
    "VOLTAGE_5VUUT": {"0": 40.907, "2.5": 2046.387, "div" : 2.0},
    "VOLTAGE_33MT": {"0": 40.761, "2.5": 2046.685, "div" : 2.0},
    "CURRENT_PORTB33": {"0": 15.507, "2.5": 23.523, "div" : 2.0}
}

def counts_to_volts (counts):
    return counts * 1.0 / ADC_MAX_VALUE * ADC_REFERENCE

def counts_to_amps (counts):
    return counts_to_volts(counts) * 1.0 / CSA_GAIN / R_CSA

def serial_match (serial):
    def inner (dev):
        return usb.util.get_string(dev, index = dev.iSerialNumber) == serial
    return inner

UUT_PINS = {
    'rst': 0x0,
    'soc': 0x1,
    'a': 0x10,
    'b': 0x11,
    'led': 0x20,
}

class TestRig(object):
    def __init__(self, serial):
        self.serial = serial
        self.dev = usb.core.find(idVendor = 0x59E3, idProduct = 0xCDA6,
                                 custom_match = serial_match(serial))
        if self.dev is None:
            raise ValueError('device is not connected')
        self.calibration = DEFAULT_CALIBRATION

        self._pyocd = None
        self._uut_serial = None
        self._uut_usb = None

    def pyocd(self, reinit = False):
        """Initialize PyOCD for the UUT SAMD21"""
        if reinit or not self._pyocd:
            self._pyocd = pyocd.init(self.dev)
        return self._pyocd

    def uut_serial(self, refresh = False):
        if refresh or not self._uut_serial:
            target = self.pyocd().target

            target.halt()
            id = target.readBlockMemoryUnaligned8(0x0080A00C, 17)
            target.resume()

            s = ""

            for i in range(26):
                idx, pos = (i*5)/8, (i*5)%8
                val = ((id[idx] >> pos) | (id[idx+1] << (8-pos))) & ((1<<5)-1)
                s += "0123456789ABCDFGHJKLMNPQRSTVWXYZ"[val]

            self._uut_serial = s

        return self._uut_serial

    def uut_usb(self, refresh = False):
        """Find the target SAMD21 on the USB bus and return the pyusb device"""
        if refresh or not self._uut_usb:
            for i in range(0, 50):
                self._uut_usb = usb.core.find(idVendor = 0x9999, idProduct = 0xFFFF,
                    custom_match = serial_match(self.uut_serial()))
                if self._uut_usb:
                    break
                print "retry"
                time.sleep(0.1)
            else:
                raise IOError("Couldn't find target device on USB")
        return self._uut_usb

    def uut_flash(self):
        """Get an object with methods to manipulate the SPI flash"""
        return Flash(self.uut_usb())

    def uut_digital(self, pin, state):
        self.uut_usb().ctrl_transfer(0x40, 0x10, int(state), UUT_PINS[pin], '')

    def digital (self, pin, state):
        """Read or write a digital pin"""
        if state == None:
            state = 3
        return self.dev.ctrl_transfer(0xC0, REQ_DIGITAL, state, pin_id(pin), 64)

    def read_all_digital(self):
        """Read all digital pins"""
        states = self.dev.ctrl_transfer(0xC0, REQ_READALLDIGITAL, 0, 0, 64)
        return zip(digital_pins, states)

    def analog(self, pin):
        """Read the specified analog pin, returning raw counts"""
        data = self.dev.ctrl_transfer(0xC0, REQ_ANALOG, 0, pin_id(pin), 64)
        return data[0] + (data[1] << 8)

    def set_analog_mode(self, pin, mode):
        return self.dev.ctrl_transfer(0xC0, REQ_SETANALOGMODE, mode, pin_id(pin), 64)

    def _power_helper(self, usb, vin):
        return (digital('UUTPOWER_USB', usb)[0], digital('UUTPOWER_VIN', vin)[0])

    def power(self, source = 'USB'):
        """Enable the specified UUT power source"""
        if str(source).upper() == 'VIN':
            return _power_helper(False, True)
        elif (str(source).upper() in ('USB', 'ON', '1', 'TRUE')):
            return _power_helper(True, False)
        else:
            return _power_helper(False, False)

    def test_pass (self):
        self.digital('LED_TESTING', 0)
        self.digital('LED_FAIL', 0)
        self.digital('LED_PASS', 1)

    def test_fail (self):
        self.digital('LED_TESTING', 0)
        self.digital('LED_PASS', 0)
        self.digital('LED_FAIL', 1)

    def measure_current (self, pin):
        # configure the pin's ADC

        # return the converted value
        return counts_to_amps(self.analog(pin))

    def measure_voltage (self, pin):
        # configure the pin's ADC

        # return the converted value
        return counts_to_volts(self.analog(pin))


def by_cmdline():
    return TestRig(sys.argv[1])

if __name__ == '__main__':
    rig = by_cmdline()

    rig.pyocd()
    print "Target serial:", rig.uut_serial()

    flash = rig.uut_flash()
    flash.check_id()

    rig.test_pass()
