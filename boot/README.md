# Boot Scripts

This directory should be placed in the root directory of a flash drive which has a Debian image dd'ed onto it. The files will be mounted automatically at `/lib/live/mount/medium/`. These scripts are responsible for downloading the test bench and latest binaries and beginning the testing sequence.

## Contents
* `host.js` contains structured data about where the test server lives and the identifier for this particular test runner. Ask another Tessel Team Member if you have questions about what these properties should be set to.
* `tessel-session.sh` and `term.sh` are the meat and potatoes of downloading testing resources and initializing the tests.
* `.ssh` is a folder with SSH keys and a valid `known_hosts` file to access the `testalator server`. They have been `.gitignore`d for security reasons so if you need them, please contact a Tessel Team Member.
