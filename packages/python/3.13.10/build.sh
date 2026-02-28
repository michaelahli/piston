#!/bin/bash

PREFIX=$(realpath $(dirname $0))

mkdir -p build

cd build

curl "https://www.python.org/ftp/python/3.13.10/Python-3.13.10.tgz" -o python.tar.gz
tar xzf python.tar.gz --strip-components=1
rm python.tar.gz

./configure --prefix "$PREFIX" --with-ensurepip=install \
  --with-openssl=/usr \
  --with-openssl-rpath=auto

make -j$(nproc)
make install -j$(nproc)

cd ..

rm -rf build

pip install numpy pandas scipy scikit-learn statsmodels \
  numba joblib ta arch yfinance ccxt alpaca-trade-api \
  backtesting quantstats pyarrow polars tqdm loguru requests aiohttp
