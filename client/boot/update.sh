#!/bin/bash
HOST_PATH="hostConfigs/usbConfig.json" #replace this with path to usb stick file
APP_PATH="/Users/jialiya/app"
BUILD=$(node -pe 'JSON.parse(process.argv[1]).build' "$(cat "$HOST_PATH")")
SERVER=$(node -pe 'JSON.parse(process.argv[1]).server' "$(cat "$HOST_PATH")")
echo "Build: "$BUILD

SERVER_VERSION=$(curl -sb -H $SERVER"client/info")

# if our build doesn't match the server build
if [ "$BUILD" != "$SERVER_VERSION" ]; then
	echo "Build does not match server, updating..."
	# download the tarball
	mkdir -p $APP_PATH
	wget $SERVER"client" -O $APP_PATH/client.tar.gz
	# apply it 
	tar zxvf $APP_PATH/client.tar.gz -C $APP_PATH
	# cd in and install
	cd $APP_PATH/client
	npm install

	# update version json
	echo "Updating host build json"
	$(node -pe 'var orig=JSON.parse(process.argv[1]); orig.build="'$SERVER_VERSION'"; JSON.stringify(orig, null, 2)' "$(cat "$HOST_PATH")" > $HOST_PATH)
	echo "New build json"
	echo $(cat $HOST_PATH)
	
	# run
	npm start

else
	# otherwise cd in and run
	cd $APP_PATH/client
	npm start
fi
	
