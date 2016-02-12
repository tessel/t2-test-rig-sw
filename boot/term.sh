#!/bin/bash
set -e

SERVER=testalator.tessel.io
# Import device specific settings like the port
source /lib/live/mount/medium/config.sh

killall xscreensaver || true

sudo chmod 4755 /bin/ping
while ! ping -c1 $SERVER &>/dev/null; do
  echo "Not connected to internet"
  sleep 2
done

cp -r /lib/live/mount/medium/ssh ~/.ssh
chmod -R 600 ~/.ssh/id_rsa

/usr/bin/autossh \
  -f \
  -o "StrictHostKeyChecking yes" \
  -R $PORT:localhost:22 \
  -L 8080:localhost:8080 \
  -N autossh@$SERVER

mkdir -p ~/client;
cd ~/client;
wget -t inf --retry-connrefused --waitretry=1 --read-timeout=20 --timeout=15 http://localhost:8080/client -O client.tar.gz;
tar -xvzf client.tar.gz -C .;

if [ -f client/start.sh ]; then
  exec bash client/start.sh
else
  # cd into the directory that we store the Node tarball
  cd ~/client/client/node/;
  # unzip the tarball
  tar -xf node-v4.2.1-linux-x86.tar.xz;
  # prepend the Node and NPM binary to our PATH
  PATH=$(pwd)/node-v4.2.1-linux-x86/bin:$PATH;
  
  cd ~/client/client/node_modules/usb/;
  npm install --build-from-source --verbose;

  cd ~/client/client/node_modules/t2-cli/node_modules/usb;
  npm install --build-from-source --verbose;

  cd ~/client/client;
  node index.js;
fi
