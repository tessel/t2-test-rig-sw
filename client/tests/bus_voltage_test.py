import rig as riglib

# expected values and tolerances/acceptable deviations
no_firmware_no_linux = {
    'VOLTAGE_VREF'    : {'val' : 2.5    , 'tol' : 0.05  , 'dev' : 'X'} ,
    'VOLTAGE_5VUSB1'  : {'val' : 0.0    , 'tol' : 'X'   , 'dev' : 2.0} ,
    'VOLTAGE_5VUUT'   : {'val' : 5.0    , 'tol' : 0.05  , 'dev' : 'X'} ,
    'VOLTAGE_PORTA33' : {'val' : 0.0    , 'tol' : 'X'   , 'dev' : 0.2} ,
    'VOLTAGE_12'      : {'val' : 1.27   , 'tol' : 0.05  , 'dev' : 'X'} ,
    'VOLTAGE_33CP'    : {'val' : 3.3    , 'tol' : 0.05  , 'dev' : 'X'} ,
    'VOLTAGE_PORTB33' : {'val' : 0.0    , 'tol' : 'X'   , 'dev' : 0.2} ,
    'VOLTAGE_18'      : {'val' : 1.8    , 'tol' : 0.05  , 'dev' : 'X'} ,
    'VOLTAGE_33MT'    : {'val' : 3.3    , 'tol' : 0.05  , 'dev' : 'X'} ,
    'VOLTAGE_5VUSB0'  : {'val' : 0.0    , 'tol' : 'X'   , 'dev' : 2.0} ,
}

yes_firmware_yes_linux = {
    'VOLTAGE_VREF'    : {'val' : 2.5    , 'tol' : 0.15  , 'dev' : 'X'} ,
    'VOLTAGE_5VUSB1'  : {'val' : 5.0    , 'tol' : 0.15  , 'dev' : 'X'} ,
    'VOLTAGE_5VUUT'   : {'val' : 5.0    , 'tol' : 0.15  , 'dev' : 'X'} ,
    'VOLTAGE_PORTA33' : {'val' : 0.0    , 'tol' : 'X'   , 'dev' : 0.6} ,
    'VOLTAGE_12'      : {'val' : 1.27   , 'tol' : 0.15  , 'dev' : 'X'} ,
    'VOLTAGE_33CP'    : {'val' : 3.3    , 'tol' : 0.15  , 'dev' : 'X'} ,
    'VOLTAGE_PORTB33' : {'val' : 0.0    , 'tol' : 'X'   , 'dev' : 0.6} ,
    'VOLTAGE_18'      : {'val' : 1.8    , 'tol' : 0.15  , 'dev' : 'X'} ,
    'VOLTAGE_33MT'    : {'val' : 3.3    , 'tol' : 0.15  , 'dev' : 'X'} ,
    'VOLTAGE_5VUSB0'  : {'val' : 5.0    , 'tol' : 0.15  , 'dev' : 'X'} ,
}

ports_on = {
    'VOLTAGE_VREF'    : {'val' : 2.5    , 'tol' : 0.05  , 'dev' : 'X'} ,
    'VOLTAGE_5VUSB1'  : {'val' : 5.0    , 'tol' : 0.05  , 'dev' : 'X'} ,
    'VOLTAGE_5VUUT'   : {'val' : 5.0    , 'tol' : 0.05  , 'dev' : 'X'} ,
    'VOLTAGE_PORTA33' : {'val' : 3.3    , 'tol' : 0.05  , 'dev' : 'X'} ,
    'VOLTAGE_12'      : {'val' : 1.27   , 'tol' : 0.05  , 'dev' : 'X'} ,
    'VOLTAGE_33CP'    : {'val' : 3.3    , 'tol' : 0.05  , 'dev' : 'X'} ,
    'VOLTAGE_PORTB33' : {'val' : 3.3    , 'tol' : 0.05  , 'dev' : 'X'} ,
    'VOLTAGE_18'      : {'val' : 1.8    , 'tol' : 0.05  , 'dev' : 'X'} ,
    'VOLTAGE_33MT'    : {'val' : 3.3    , 'tol' : 0.05  , 'dev' : 'X'} ,
    'VOLTAGE_5VUSB0'  : {'val' : 5.0    , 'tol' : 0.05  , 'dev' : 'X'} ,
}

def helper(rig, expected):
    verdict = ''
    for pin in riglib.analog_pins[5:]:
        div = riglib.DEFAULT_CALIBRATION[pin]['div']
        v = riglib.counts_to_volts(rig.analog(pin) * div)

        res = ''
        e = expected[pin]
        if (e['tol'] == 'X'):
            res = ' (deviation)'
            res = ('PASS' + res) if (abs(v - e['val']) < e['dev']) else ('FAIL' + res)
        elif (e['dev'] == 'X'):
            res = ' (tolerance)'
            res = ('PASS' + res) if (abs(v - e['val']) / e['val'] < e['tol']) else ('FAIL' + res)

        verdict = verdict + '\n' + pin + '\t\t' + str(round(v, 5)) + '\t\t' + res

    print verdict
    if 'FAIL' in verdict:
        raise ValueError(verdict)

def no_fw_no_os(rig):
    helper(rig, no_firmware_no_linux)

def yes_fw_yes_os(rig):
    helper(rig, yes_firmware_yes_linux)

def module_ports_on(rig):
    helper(rig, ports_on)
