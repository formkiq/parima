#!/usr/bin/env bash

GIT_VERSION=`docker run --rm lambci/yumda:2 bash -c "yum info git | grep '^Version' | cut -d':' -f2 | tr -d '[:space:]'"`
docker run --rm -v "$PWD":/tmp/layer lambci/yumda:2 bash -c "
  yum install -y git && \
  cd /lambda/opt && \
  zip -yr /tmp/layer/layer-git-$GIT_VERSION.zip ."