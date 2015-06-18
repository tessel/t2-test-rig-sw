import rig as riglib
import time

port_a = {
    'name'  : 'PORTA',
    'pins'  : riglib.digital_pins[10:18],
    'short' : 'SHORT_PORTA33',
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
    power_test(rig, port)
    print 'Done testing ' + port['name']


def dio_test(rig, port):
    low = []
    high = []
    pins = [
        '_SCL'  ,
        '_SDA'  ,
        '_SCK'  ,
        '_MISO' ,
        '_MOSI' ,
        '_G1'   ,
        '_G2'   ,
        '_G3'   ,
    ]
    order = zip(range(8), pins)
    for (uut_pin, p) in order:
        uut_pin = port['name'][4].lower() + str(uut_pin)
        p = port['name'] + p

        # measure low
        rig.uut_digital(uut_pin, 0)
        l = rig.digital(p, 2)[0]
        
        # measure high
        rig.uut_digital(uut_pin, 1)
        h = rig.digital(p, 2)[0]
        
        # set low, input
        rig.uut_digital(uut_pin, 0)
        rig.uut_digital(uut_pin, 2)

        print p + '\t' + str(l) + ' ' + str(h)
        low.append(l)
        high.append(h)
    print 'Done with dio test on ' + port['name']

    # evaluate the results
    if 0 in high or 1 in low:
        pass
        raise ValueError('FAILED DIGITAL PIN TEST ON ' + port['name'])
        

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
    time.sleep(1)
    
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

    # open circuit, disable power
    rig.digital('SHORT_' + port['name'] + '33', 0)
    rig.uut_digital(port['name'][4].lower(), 0)

    print 'V_off\t\t'      + str(round(v_off, 4))
    print 'V_on\t\t'       + str(round(v_on, 4))
    print 'V_short\t\t'    + str(round(v_short, 4))
    print 'I_port_open\t'  + str(round(i_port_open, 4))
    print 'I_port_short\t' + str(round(i_port_short, 4))    
    print 'I_uut_open\t'   + str(round(i_uut_open, 4))
    print 'I_uut_short\t'  + str(round(i_uut_short, 4))

    if False in (   v_off        < 0.2  , 
                    v_on         > 3.0  ,
                    i_port_open  < 0.02 ,
                    i_port_short < 0.3  ,
                    i_uut_short  < 0.5  ,
                ):
        pass
        raise ValueError('FAILED PORT CURRENT LIMIT TEST ON ' + port['name'])
