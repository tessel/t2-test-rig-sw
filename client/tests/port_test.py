import rig as riglib
import time

port_a = {
    'name'  : 'PORTA',
    'pins'  : riglib.digital_pins[10:18],
    'short' : 'SHORT_PORTB33',
    }
port_b = {
    'name'  : 'PORTB',
    'pins'  : riglib.digital_pins[18:26],
    'short' : 'SHORT_PORTB33',
    }


def test_ports(rig):
    for port in [port_a, port_b]:
        helper(rig, port)


def helper(rig, port):
    rig.digital('UUTPOWER_USB', 1)
    rig.digital('UUTPOWER_VIN', 0)
    time.sleep(1)

    print 'Testing ' + port['name']
    dio_test(rig, port)
    i2c_pull_test(rig, port)
    power_test(rig, port)
    print 'Done testing ' + port['name']


def dio_test(rig, port):
    low = []
    high = []
    for p in port['pins']:
        #### write the pin low on the UUT
        # rig.however_you_do_that()
        time.sleep(0.001)
        l = (rig.digital(p, 2)[0])

        #### write the pin high on the UUT
        # rig.however_you_do_that()
        time.sleep(0.001)
        h = (rig.digital(p, 2)[0])

        print p + '\t' + str(l) + ' ' + str(h)
        low.append(l)
        high.append(h)
    print 'Done with digital side'

    # evaluate the results
    if 0 in high or 1 in low:
        print 'FAILED DIGITAL PIN TEST'
        pass
        # raise ValueError('invalid pin voltage on ' + port['name'])


def i2c_pull_test(rig, port):
    rig.uut_digital(port['name'][4].lower(), 0)
    sda = 
    rig.uut_digital(port['name'][4].lower(), 1)



def power_test(rig, port):
    # power busses and current limiting
    # sugar
    pin_v = 'VOLTAGE_' + port['name'] + '33'
    pin_i = 'CURRENT_' + port['name'] + '33'
    div =  riglib.CAL[pin_v]['div']
    offset = riglib.CAL[pin_i]['0']

    # initial measurements
    v_off = riglib.counts_to_volts(rig.analog(pin_v) * div)
    i_port_open = riglib.counts_to_amps(rig.analog(pin_i) - offset)
    i_uut_open =  riglib.counts_to_amps(rig.analog('CURRENT_UUT') - offset)
    
    # turn on port power
    rig.uut_digital(port['name'][4].lower(), 1)
    
    # on voltage measurement
    v_on = riglib.counts_to_volts(rig.analog(pin_v) * div)
    time.sleep(1)

    # short the power
    rig.digital('SHORT_' + port['name'] + '33', 1)
    time.sleep(0.1)

    # current meaurement
    v_short = riglib.counts_to_volts(rig.analog(pin_v) * div)
    i_port_short = riglib.counts_to_amps(rig.analog(pin_i) - offset)
    i_uut_short =  riglib.counts_to_amps(rig.analog('CURRENT_UUT') - offset)

    time.sleep(0.01)

    # open circuit, disable power
    rig.digital('SHORT_' + port['name'] + '33', 0)
    rig.uut_digital(port['name'][4].lower(), 0)

    # output = str(round(v_off, 4)) + '\t' + str(round(v_on, 4)) + '\n' + str(round(i_port_open, 4)) + '\t' + str(round(i_port_short, 4))
    # print output
    print 'V_off\t\t'      + str(round(v_off, 4))
    print 'V_on\t\t'       + str(round(v_on, 4))
    print 'V_short\t\t'    + str(round(v_short, 4))
    print 'I_port_open\t'  + str(round(i_port_open, 4))
    print 'I_port_short\t' + str(round(i_port_short, 4))    
    print 'I_uut_open\t'   + str(round(i_uut_open, 4))
    print 'I_uut_short\t'  + str(round(i_uut_short, 4))  
