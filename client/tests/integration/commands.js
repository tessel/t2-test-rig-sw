module.exports.checkConnection = function(host, pings) {
  return ['ping', host, '-c', pings.toString()];
};
module.exports.readDisk = function(filePath, bytes) {
  return ['dd', 'if='+filePath, 'count='+Number(bytes).toString(), 'bs=1'];
};
