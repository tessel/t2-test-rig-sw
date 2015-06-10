import sys
import time
import datetime

LOG_STATUS = {"inProgress": 0, "pass": 1, "fail": -1}

class PrintHook:
  def __init__(self, hookFunc, stdOut = 1):
    self.outFunc = hookFunc
    if stdOut:
      sys.stdout = self #override stdout with write() func
      self.origOut = sys.__stdout__
    else:
      sys.stderr = self
      self.origOut = sys.__stderr__

  def write(self, text, isJson=0):
    if text.split() == []:
      self.origOut.write(text) # for newlines
    else:
      self.outFunc(self.origOut, text, isJson)

  def stop(self):
    self.flush() # flush all before resetting sysoutputs
    if stdOut:
      sys.stdout = sys.__stdout__
    else: 
      sys.stderr = sys.__stderr__


def getTimestamp():
  ts = time.time()
  st = datetime.datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M:%S')
  return st  


class Logger:
  def __init__(self, serial):
    self.serial = serial
    self.test = ''

  def formatStdid(self, text, isJson=0, isErr=0):
    logType = "log"
    if isErr:
      logType = "err"

    outStr = '{"type": "'+logType+'", "time":"'+getTimestamp()+'", "serialNumber": "'+self.serial+'", "device": "'+self.deviceId+'", "test": "'+self.test+'", "data":'

    if isJson:
      outStr += text+"}"
    else:
      outStr += '"'+text+'"}'

    return outStr

  def stdOutFunc(self, outPipe, text, isJson=0):
    outPipe.write(self.formatStdid(text, isJson))

  def stdErrFunc(self, outPipe, text, isJson=0):
    outPipe.write(self.formatStdid(text, isJson, True))
    # outPipe.write(text)

  def start(self, **kwargs):
    for item, value in kwargs.items():
      setattr(self, item, value)

    self.out = PrintHook(self.stdOutFunc)
    self.err = PrintHook(self.stdErrFunc, stdOut=0)

  def startTest(self, testName):
    self.test = testName
    self.out.write('{"status":"0"}', True) # 0 = in progress

  def endTest(self, testStatus):
    self.out.write('{"status":"'+str(testStatus)+'"}', True) # 1 = success, -1 = err
    self.test = ''

  def stop(self):
    self.test = None
    self.out.stop()
    self.err.stop()


if __name__ == '__main__':
  log = Logger()
  log.start(hostId = "host", rigId = "rigId", rigBuild = "rigBuild", deviceId = "deviceId", deviceBuild = "deviceBuild")
  log.startTest('TEST')
  print "testing"
  compile(',','<string>','exec')