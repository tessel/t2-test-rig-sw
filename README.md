# t2 test rig software
Combination of the rig orchastration server & the client code that runs on each host.

```
git submodule update --init --recursive
```

## Supported Platforms:
Only Linux fully supports running the tests and OSX partially supports the test bench. The SMT tests use a `pyOCD` dependency which has some inaccessible features on OSX. Running the server and client will work on OSX, but the test bench will fail after SMT tests are commenced (specifically, on the 'boot' test). Through hole tests work fine on OSX. Windows has been untested.

## Updating production code

The server is currently managed using [Dokku](http://dokku.viewdocs.io/dokku/). You'll need to have ssh access to deploy updates to the server, but do not need to ssh into the server.

Add `dokku` as a git remote:

```
git remote add dokku dokku@testalator.tessel.io
```

Once that remote is added, the [official CLI client](http://dokku.viewdocs.io/dokku/) can be used to manage the server.

A complete update of the test bench code consists of four parts: updating the release binaries (also known as golden images), updating the test bench, updating the boot scripts (in the `/boot` folder), and updating the `server` code running at `testalator.tessel.io`.

Most use cases likely involve only updating the binaries flashed on to the new Tessels. Updating the test runner or boot code is a significant endeavor and should only be attempted when absolutely necessary to prevent manufacturing delays. Updating the `server` code is relatively straightforward but shouldn't be necessary in most cases.

### Updating binaries
Occasionally, we may want to update the version of the binaries that our manufacturers are flashing on Tessel 2s as they come off the assembly line. To do that, you will need SSH access to the Testalator server (testalator.tessel.io). If you don't have access, please ask another Tessel Team Member.

```
$ Transfer the binaries to a publicly accessible directory on the test server
scp firmware.bin root@testalator.tessel.io:/var/lib/dokku/data/storage/testalator/
scp openwrt-ramips-mt7620-tessel-squashfs-sysupgrade.bin root@testalator.tessel.io:/var/lib/dokku/data/storage/testalator/
```

### Updating the testbench
The testbench consists of the entire `\client` directory with the exception of any `node_modules` with binary dependencies (they will have to be re-installed on the machine). Updating the testbench consists of tarring up the `client` directory and sending it to the public builds repo of `testalator.tessel.io`. A build script will download this tarball when test running laptops at manufacturer's locations boot up.

```
# Zips up the client to the local `server`'s build directory
tar -cvz --exclude-from=.client-tar-ignore -f server/public/builds/client.tar.gz .
$ Transfers the tarball to a publicly accessible directory on the test server
scp server/public/builds/client.tar.gz root@testalator.tessel.io:/var/lib/dokku/data/storage/testalator/
```

You should also update the `config.json` file to have the correct commit sha for the version of the client you are uploading. Once that is updated and commited, it can be pushed to the dokku server:

```
git push dokku master
```


### Updating bootscript code
Updating the boot script code (in the `/boot` directory) lives on the same flash drives that contain the [debian live image](https://github.com/tessel/t2-test-rig-debian-live) that is powering the test running PC. To update it, you'll either net to get access to the flash drive currently in use at the manufacturer's facility or you'll need to send them new ones. Load the debian image onto the flash drive, boot into it, then place the contents of the `/boot` folder into `/lib/live/mount/medium` folder.

### Updating the testalator.tessel.io server

Updates can be deploy by pushing to the `dokku` remote:

```
git push dokku master
```

Dokku will automatically build, deploy, and restart the server with these changes.
