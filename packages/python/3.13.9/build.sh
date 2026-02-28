#!/bin/bash

PREFIX=$(realpath $(dirname $0))

mkdir -p build

cd build

curl "https://www.python.org/ftp/python/3.13.9/Python-3.13.9.tgz" -o python.tar.gz
tar xzf python.tar.gz --strip-components=1
rm python.tar.gz

./configure --prefix "$PREFIX" --with-ensurepip=install \
  --with-openssl=/usr \
  --with-openssl-rpath=auto

make -j$(nproc)
make install -j$(nproc)

cd ..

rm -rf build

bin/pip3 install torch --index-url https://download.pytorch.org/whl/cpu

bin/pip3 install openstoxlify pandas numpy requests aiohttp tqdm loguru \
  beautifulsoup4 lxml sqlalchemy pymongo \
  pyarrow fastparquet polars scipy scikit-learn statsmodels \
  numba joblib ta arch yfinance ccxt \
  backtesting quantstats pyarrow polars tqdm loguru requests aiohttp \
  xgboost lightgbm catboost tensorflow-cpu optuna mlflow pyarrow