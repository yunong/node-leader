#!/bin/bash
set -o errexit
set -o pipefail

git submodule update --init

cd ./deps/javascriptlint
make install
cd ../..

./deps/javascriptlint/build/install/jsl --conf ./tools/jsl.node.conf \
    ./*.js ./test/*.js

./deps/jsstyle/jsstyle -f ./tools/jsstyle.conf ./*.js ./test/*.js

./deps/json/lib/json.js -f ./package.json 1>/dev/null
