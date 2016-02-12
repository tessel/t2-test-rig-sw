#!/bin/bash
set -e

# Save the path to our host json data
HOST_PATH="/lib/live/mount/medium/host.json";
# Parse the server url
SERVER=$(node -pe 'JSON.parse(process.argv[1]).server' "$(cat "$HOST_PATH")")
# Parse the port number
PORT=$(node -pe 'JSON.parse(process.argv[1]).port' "$(cat "$HOST_PATH")")

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
  cd client/node_modules/usb/;
  npm install --build-from-source --verbose;

  cd ../t2-cli/node_modules/usb;
  npm install --build-from-source --verbose;

  # cd into the directory that we store the Node tarball
  cd ~/client/node/;
  # unzip the tarball
  tar -xf node-v4.2.1-linux-x86.tar.xz;
  # prepend the Node and NPM binary to our PATH
  PATH=$(pwd)/node-v4.2.1-linux-x86/bin:$PATH;

  cd ~/client/client;
  #npm install --verbose;
  node index.js;
fi
