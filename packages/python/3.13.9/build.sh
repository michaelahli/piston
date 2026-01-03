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

bin/pip3 install \
  numpy scipy pandas pycryptodome whoosh bcrypt passlib sympy xxhash base58 cryptography PyNaCl \
  openstoxlify pandas matplotlib seaborn plotly statsmodels ta bt quantstats vectorbt finta scikit-learn \
  xgboost lightgbm catboost tensorflow torch pytorch-forecasting darts mlflow optuna arch \
  prophet hmmlearn cvxpy pulp simpy deap pygad riskfolio-lib sqlalchemy pymongo pyarrow \
  fastparquet polars celery apscheduler docker loguru tqdm joblib numba yfinance ccxt alpaca-trade-api \
  ib-insync requests aiohttp beautifulsoup4 lxml mlxtend quantlib finquant qstrader backtrader \
  statsforecast pywavelets ruptures quantconnect backtesting quanttools ta-lib minio
