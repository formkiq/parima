#!/usr/bin/env bash

HUGO_VERSION=0.76.3

docker run --rm -v "$PWD":/tmp/layer lambci/yumda:2 bash -c "
  curl -s -L \"https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_${HUGO_VERSION}_Linux-64bit.tar.gz\" --output /tmp/hugo.tar.gz && \
  mkdir -p /tmp/hugo/bin && \
  ls -Ral /tmp && \
  tar xzf /tmp/hugo.tar.gz -C /tmp/hugo/bin && \
  cd /tmp/hugo && \
  zip -yr /tmp/layer/layer-hugo-$HUGO_VERSION.zip bin/hugo"