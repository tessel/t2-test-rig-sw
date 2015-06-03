import rig as riglib
import time

def test_usb_overcurrent_protection(rig):
    rig.digital('UUTPOWER_USB', 1)
    rig.digital('UUTPOWER_VIN', 0)

    for usb_port in ['0', '1']:
        helper(rig, usb_port)

def helper(rig, port):
    print 'Testing USB' + port + ' overcurrent/short protection'    
    
    # sugar
    pin_v = 'VOLTAGE_5VUSB' + port
    pin_i = 'CURRENT_USB' + port
    pin_s = 'SHORT_USB' + port
    div =  riglib.CAL[pin_v]['div']
    offset = riglib.CAL[pin_i]['0']

    # initial measurements
    v_on = riglib.counts_to_volts(rig.analog(pin_v) * div)
    i_port_open = riglib.counts_to_amps(rig.analog(pin_i) - offset)
    i_uut_open =  riglib.counts_to_amps(rig.analog('CURRENT_UUT') - offset)

    # short the power
    rig.digital(pin_s, 1)
    time.sleep(1)

    # current meaurement
    v_short = riglib.counts_to_volts(rig.analog(pin_v) * div)
    i_port_short = riglib.counts_to_amps(rig.analog(pin_i) - offset)
    i_uut_short =  riglib.counts_to_amps(rig.analog('CURRENT_UUT') - offset)

    # open circuit, measure recovered voltage
    rig.digital(pin_s, 0)
    time.sleep(0.5)
    v_recover = riglib.counts_to_volts(rig.analog(pin_v) * div)

    print 'V_on\t\t'       + str(round(v_on, 4))
    print 'V_short\t\t'    + str(round(v_short, 4))
    print 'V_recover\t'    + str(round(v_recover, 4))
    print 'I_port_open\t'  + str(round(i_port_open, 4))
    print 'I_port_short\t' + str(round(i_port_short, 4))    
    print 'I_uut_open\t'   + str(round(i_uut_open, 4))
    print 'I_uut_short\t'  + str(round(i_uut_short, 4))

    if False in (   v_short      < 0.2  , 
                    v_on         > 4.5  ,
                    v_recover    > 4.5  ,
                    i_port_open  < 0.05 ,
                    i_port_short < 0.1  ,
                    i_uut_short  < 0.5  ,
                ):
        pass
        raise ValueError('FAILED USB CURRENT LIMIT TEST ON USB' + port)

    print 'Done testing USB' + port + ' overcurrent/short protection'