#!/bin/bash

#run this script to inform clients that there is new host software
# get the build number
echo "Build commit hash of client:"
read CLIENT_BUILD

SCRIPT=$(readlink -f "$0")
SCRIPTPATH=$(dirname "$SCRIPT")

echo "Tarring up folder"
# tar up everything except node modules & boot
tar -cvz --exclude=client/node_modules --exclude=server --exclude=.git -f $SCRIPTPATH/../public/builds/client.tar.gz --directory=$SCRIPTPATH/../../ .

# update build number
echo "Updating client build"
$(node -pe 'var orig=JSON.parse(process.argv[1]); orig.client="'$CLIENT_BUILD'"; JSON.stringify(orig, null, 2)' "$(cat "$SCRIPTPATH/../config.json")" > $SCRIPTPATH/../config.json)
echo $(cat $SCRIPTPATH/../config.json)