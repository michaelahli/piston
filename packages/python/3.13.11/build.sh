#!/bin/bash

PREFIX=$(realpath $(dirname $0))

mkdir -p build

cd build

curl "https://www.python.org/ftp/python/3.13.11/Python-3.13.11.tgz" -o python.tar.gz
tar xzf python.tar.gz --strip-components=1
rm python.tar.gz

./configure --prefix "$PREFIX" --with-ensurepip=install \
  --with-openssl=/usr \
  --with-openssl-rpath=auto

make -j$(nproc)
make install -j$(nproc)

cd ..

rm -rf build

bin/pip3 install openstoxlify numpy pandas scipy scikit-learn xgboost lightgbm catboost \
  torch --index-url https://download.pytorch.org/whl/cpu \
  tensorflow-cpu optuna mlflow pyarrow
