import os, sys
import usb

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'pyOCD'))

from pyOCD.interface.pyusb_backend import PyUSB
from pyOCD.board.board import Board

def pyocd_interface(interface):
    board = interface.device
    ep_in, ep_out = None, None
    for ep in interface:
        if ep.bEndpointAddress & 0x80:
            ep_in = ep
        else:
            ep_out = ep

    product_name = usb.util.get_string(board, 256, 2)
    vendor_name = usb.util.get_string(board, 256, 1)
    """If there is no EP for OUT then we can use CTRL EP"""
    if not ep_in or not ep_out:
        logging.error('Endpoints not found')
        return None

    new_board = PyUSB()
    new_board.ep_in = ep_in
    new_board.ep_out = ep_out
    new_board.dev = board
    new_board.vid = board.idVendor
    new_board.pid = board.idProduct
    #new_board.intf_number = interface_number
    new_board.product_name = product_name
    new_board.vendor_name = vendor_name
    new_board.start_rx()
    return new_board

def init(dev):
    interface = pyocd_interface(dev.get_active_configuration()[(0,0)])
    board = Board('samd', 'samd', interface)
    board.init()
    return board
