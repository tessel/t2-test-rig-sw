#!/bin/bash
set -e

# The port that the client will run at
PORT=3000
# The address of the client
CLIENT_URL="localhost:"$PORT

# Download and initialize the client in the background
xfce4-terminal --hold -e "bash -x /lib/live/mount/medium/term.sh" &

# Wait for the client to finish initializing before continuing
while [ `curl --write-out %{http_code} --silent --output /dev/null $CLIENT_URL` -ne 200 ]
do
  # The client is not returning a 200 status code
  echo "Client is not initialized yet. Waiting..."
  # Continue sleeping
  sleep 2
done

# The client is finally up, open the browser
xdg-open http://localhost:3000

# Wait infinitely so that we don't close the client 
wait;
