#!/bin/bash

PREFIX=$(realpath $(dirname $0))

mkdir -p build

cd build

curl "https://www.python.org/ftp/python/3.12.0/Python-3.12.0.tgz" -o python.tar.gz
tar xzf python.tar.gz --strip-components=1
rm python.tar.gz

./configure --prefix "$PREFIX" --with-ensurepip=install
make -j$(nproc)
make install -j$(nproc)

cd ..

rm -rf build

bin/pip3 install \
  openstoxlify whoosh sympy PyNaCl numpy pandas scipy matplotlib seaborn plotly \
  statsmodels ta bt quantstats empyrical vectorbt pyfolio finta scikit-learn xgboost \
  lightgbm catboost tensorflow torch pytorch-forecasting darts mlflow \
  optuna arch pmdarima prophet hmmlearn pystan pymc3 pymc cvxpy pulp simpy deap \
  pygad riskfolio-lib sqlalchemy sqlite3 psycopg2 pymongo cryptography pycryptodome \
  bcrypt passlib xxhash base58 pyarrow fastparquet polars fastapi flask celery \
  apscheduler docker pydantic loguru dash streamlit gradio tqdm joblib multiprocessing \
  numba rich colorama yfinance ccxt alpaca-trade-api ib-insync requests aiohttp \
  beautifulsoup4 lxml mlxtend quantlib finquant qstrader backtrader zipline pyfolio \
  statsforecast pywavelets ruptures quantconnect quantstats-lite backtesting qtpylib \
  talib pytrendlines quanttools ta-lib tensortrade
