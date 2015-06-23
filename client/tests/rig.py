import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'pyusb'))
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
    'SHORT_USB0',
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
    "CURRENT_PORTB33": {"0": 15.507, "2.5": 23.523, "div" : 1.0}
}

i_offset = 30
v_offset = 40
CAL = {
    "VOLTAGE_VREF":     { "0" : v_offset,   "div" : 1.0 },
    "VOLTAGE_12":       { "0" : v_offset,   "div" : 1.0 },
    "VOLTAGE_5VUSB0":   { "0" : v_offset,   "div" : 2.0 },
    "VOLTAGE_5VUSB1":   { "0" : v_offset,   "div" : 2.0 },
    "VOLTAGE_33CP":     { "0" : v_offset,   "div" : 2.0 },
    "VOLTAGE_18":       { "0" : v_offset,   "div" : 1.0 },
    "CURRENT_PORTA33":  { "0" : i_offset,   "div" : 1.0 },
    "VOLTAGE_PORTB33":  { "0" : v_offset,   "div" : 2.0 },
    "CURRENT_USB0":     { "0" : i_offset,   "div" : 1.0 },
    "CURRENT_USB1":     { "0" : i_offset,   "div" : 1.0 },
    "CURRENT_UUT":      { "0" : i_offset,   "div" : 1.0 },
    "VOLTAGE_PORTA33":  { "0" : v_offset,   "div" : 2.0 },
    "VOLTAGE_5VUUT":    { "0" : v_offset,   "div" : 2.0 },
    "VOLTAGE_33MT":     { "0" : v_offset,   "div" : 2.0 },
    "CURRENT_PORTB33":  { "0" : i_offset,   "div" : 1.0 }
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
    'a0': 0x40,
    'a1': 0x41,
    'a2': 0x42,
    'a3': 0x43,
    'a4': 0x44,
    'a5': 0x45,
    'a6': 0x46,
    'a7': 0x47,
    'b0': 0x50,
    'b1': 0x51,
    'b2': 0x52,
    'b3': 0x53,
    'b4': 0x54,
    'b5': 0x55,
    'b6': 0x56,
    'b7': 0x57
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

    def enable_pyocd(self):
        """Initialize PyOCD for the UUT SAMD21"""
        self.pyocd = pyocd.init(self.dev)
        self.pyocd.target.halt()
        self.read_uut_serial()

    def disable_pyocd(self):
        self.pyocd.transport.uninit()
        pyocd.uninit(self.dev)
        self.pyocd = None

    def read_uut_serial(self):
        id = self.pyocd.target.readBlockMemoryUnaligned8(0x0080A00C, 17)
        s = ""

        for i in range(26):
            idx, pos = (i*5)/8, (i*5)%8
            val = ((id[idx] >> pos) | (id[idx+1] << (8-pos))) & ((1<<5)-1)
            s += "0123456789ABCDFGHJKLMNPQRSTVWXYZ"[val]

        self.uut_serial = s

    def uut_usb(self, refresh = False):
        """Find the target SAMD21 on the USB bus and return the pyusb device"""
        if refresh or not self._uut_usb:
            for i in range(0, 50):
                self._uut_usb = usb.core.find(idVendor = 0x1209, idProduct = 0x7551,
                    custom_match = serial_match(self.uut_serial))
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

    rig.enable_pyocd()
    print "Target serial:", rig.uut_serial

    flash = rig.uut_flash()
    flash.check_id()

    rig.test_pass()
