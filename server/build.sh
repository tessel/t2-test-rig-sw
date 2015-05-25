#!/bin/bash

# tar up client code
tar czf public/client/build.tar.gz ../client

# md5 to client.json
MD5_SUM=$(md5sum public/client/build.tar.gz | awk '{ print $1 }')
TIME=$(date +%s)
BUILD=$(git rev-parse HEAD)
echo '{"md5sum": "'$MD5_SUM'", \n"time": '$TIME', \n"build": "'$BUILD'"}' > build.json