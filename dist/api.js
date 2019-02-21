'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _axios = require('axios');

var _axios2 = _interopRequireDefault(_axios);

var _cryptoJs = require('crypto-js');

var _cryptoJs2 = _interopRequireDefault(_cryptoJs);

var _utils = require('./utils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const EXCHANGE = 'KUCOIN';
const BASE_URL = 'https://openapi-v2.kucoin.com';
const TIME_FRAMES = {
  '1m': '1min',
  '3m': '3min',
  '5m': '5min',
  '15m': '15min',
  '30m': '30min',
  '1h': '1hour',
  '2h': '2hour',
  '4h': '4hour',
  '6h': '6hour',
  '8h': '8hour',
  '12h': '12hour',
  '1d': '1day',
  '1w': '1week'
};
const RATE_LIMIT = 2000;

class KucoinRest {
  constructor(userConfig = {}) {
    Object.keys(userConfig).forEach(key => {
      this[key] = userConfig[key];
    });
    this.proxy = '';

    this.rateLimit = RATE_LIMIT;
    this.urls = {
      api: BASE_URL
    };

    this.markets = null;
  }

  static getEndTime(start, interval, limit) {
    const timeUnit = interval.substring(interval.length - 1);

    let intervalInSeconds = 0;
    switch (timeUnit) {
      case 'm':
        intervalInSeconds = 60;
        break;
      case 'h':
        intervalInSeconds = 3600;
        break;
      case 'd':
        intervalInSeconds = 86400;
        break;
      case 'w':
        intervalInSeconds = 604800;
        break;
      default:
        throw new Error('Unknown interval given');
    }

    return start + intervalInSeconds * limit;
  }

  getSymbols() {
    var _this = this;

    return _asyncToGenerator(function* () {
      const options = {
        method: 'GET',
        url: `${_this.proxy}${_this.urls.api}/api/v1/symbols`,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      try {
        const response = yield (0, _axios2.default)(options);
        if (response.status === 200) {
          return response.data;
        }
        console.error(`Status=${response.status} get symbols from ${EXCHANGE} because:`, response.data);
      } catch (err) {
        console.error(`Error fetching get symbols from ${EXCHANGE} because:`, err);
      }
      return { data: [] };
    })();
  }

  loadMarkets(reload = false) {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      if (!reload && _this2.markets) {
        return _this2.markets;
      }
      const symbols = yield _this2.getSymbols();
      const markets = {};
      symbols.data.forEach(function (symbol) {
        const base = _utils.COMMON_CURRENCIES[symbol.baseCurrency] ? _utils.COMMON_CURRENCIES[symbol.baseCurrency] : symbol.baseCurrency;
        const quote = _utils.COMMON_CURRENCIES[symbol.quoteCurrency] ? _utils.COMMON_CURRENCIES[symbol.quoteCurrency] : symbol.quoteCurrency;
        const pair = `${base}/${quote}`;

        markets[pair] = symbol;
      });
      _this2.markets = markets;
      return markets;
    })();
  }

  getMarketList() {
    var _this3 = this;

    return _asyncToGenerator(function* () {
      const options = {
        method: 'GET',
        url: `${_this3.proxy}${_this3.urls.api}/api/v1/markets`,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      try {
        const response = yield (0, _axios2.default)(options);
        if (response.status === 200) {
          return response.data.data;
        }
      } catch (err) {
        console.error(`Error fetching market list from ${EXCHANGE} because:`, err);
      }
      return [];
    })();
  }

  static normalizePair(symbol) {
    const [exchangeBase, exchangeQuote] = symbol.split('-');
    const base = _utils.COMMON_CURRENCIES[exchangeBase] ? _utils.COMMON_CURRENCIES[exchangeBase] : exchangeBase;
    const quote = _utils.COMMON_CURRENCIES[exchangeQuote] ? _utils.COMMON_CURRENCIES[exchangeQuote] : exchangeQuote;

    return `${base}/${quote}`;
  }

  fetchOHLCV(pair, interval, since, limit) {
    var _this4 = this;

    return _asyncToGenerator(function* () {
      if (!_this4.markets) {
        yield _this4.loadMarkets();
      }
      const { symbol } = _this4.markets[pair];
      if (!symbol) {
        throw new Error('Unknown pair');
      }

      const startAt = since / 1000;
      const endAt = limit ? KucoinRest.getEndTime(startAt, interval, limit) : Date.now();

      const options = {
        method: 'GET',
        url: `${_this4.proxy}${_this4.urls.api}/api/v1/market/candles`,
        headers: {
          'Content-Type': 'application/json'
        },
        params: {
          symbol,
          startAt,
          endAt,
          type: TIME_FRAMES[interval]
        }
      };

      try {
        const response = yield (0, _axios2.default)(options);
        if (response.status === 200) {
          return response.data.data.map(function (price) {
            return [(parseInt(price[0], 10) * 1000).toString(), // open time
            price[1], // open
            price[3], // high
            price[4], // low
            price[2], // close
            price[5]];
          } // volume
          );
        }
        console.error(`Status=${response.status} fetching historical prices from ${EXCHANGE} because:`, response.data);
      } catch (err) {
        console.error(`Error fetching historical prices from ${EXCHANGE} because:`, err);
      }
      return [];
    })();
  }

  fetchTrades(pair) {
    var _this5 = this;

    return _asyncToGenerator(function* () {
      if (!_this5.markets) {
        yield _this5.loadMarkets();
      }
      const { symbol } = _this5.markets[pair];
      if (!symbol) {
        throw new Error('Unknown pair');
      }

      const options = {
        method: 'GET',
        url: `${_this5.proxy}${_this5.urls.api}/api/v1/market/histories`,
        headers: {
          'Content-Type': 'application/json'
        },
        params: {
          symbol
        }
      };

      try {
        const response = yield (0, _axios2.default)(options);
        if (response.status === 200) {
          return response.data.data.map(function (trade) {
            return {
              id: trade.sequence,
              timestamp: trade.time / 1000000,
              datetime: new Date(trade.time / 1000000).toISOString(),
              symbol: pair,
              type: 'limit',
              side: trade.side,
              price: parseFloat(trade.price),
              amount: parseFloat(trade.size)
            };
          });
        }
        console.error(`Status=${response.status} fetching trades from ${EXCHANGE} because:`, response.data);
      } catch (err) {
        console.error(`Error fetching trades from ${EXCHANGE} because:`, err);
      }
      return [];
    })();
  }

  fetchOrderBook(pair) {
    var _this6 = this;

    return _asyncToGenerator(function* () {
      if (!_this6.markets) {
        yield _this6.loadMarkets();
      }
      const { symbol } = _this6.markets[pair];
      if (!symbol) {
        throw new Error('Unknown pair');
      }

      const options = {
        method: 'GET',
        url: `${_this6.proxy}${_this6.urls.api}/api/v1/market/orderbook/level2_100`,
        headers: {
          'Content-Type': 'application/json'
        },
        params: {
          symbol
        }
      };

      try {
        const response = yield (0, _axios2.default)(options);
        if (response.status === 200) {
          const asks = response.data.data.asks.map(function (ask) {
            return [parseFloat(ask[0]), parseFloat(ask[1])];
          });
          const bids = response.data.data.bids.map(function (bid) {
            return [parseFloat(bid[0]), parseFloat(bid[1])];
          });
          const timestamp = Date.now();
          return {
            bids,
            asks,
            timestamp,
            datetime: new Date(timestamp).toISOString()
          };
        }
        console.error(`Status=${response.status} fetching orderbook from ${EXCHANGE} because:`, response.data);
      } catch (err) {
        console.error(`Error fetching orderbook from ${EXCHANGE} because:`, err);
      }
      return {
        bids: [], asks: [], timestamp: undefined, datetime: undefined, nonce: undefined
      };
    })();
  }

  getAllAccounts() {
    var _this7 = this;

    return _asyncToGenerator(function* () {
      const balancePath = '/api/v1/accounts?type=trade';
      const method = 'GET';
      const timestamp = Date.now();
      const sign = _cryptoJs2.default.enc.Base64.stringify(_cryptoJs2.default.HmacSHA256(`${timestamp}${method}${balancePath}`, _this7.secret));

      const options = {
        method,
        url: `${_this7.proxy}${_this7.urls.api}${balancePath}`,
        headers: {
          'Content-Type': 'application/json',
          'KC-API-KEY': _this7.apiKey,
          'KC-API-SIGN': sign,
          'KC-API-TIMESTAMP': timestamp,
          'KC-API-PASSPHRASE': _this7.password
        }
      };

      return (0, _axios2.default)(options);
    })();
  }

  fetchBalance() {
    var _this8 = this;

    return _asyncToGenerator(function* () {
      try {
        const response = yield _this8.getAllAccounts();
        if (response.status === 200) {
          const result = {
            free: {},
            used: {},
            total: {},
            info: response.data.data
          };

          response.data.data.forEach(function (assetBalance) {
            const symbol = _utils.COMMON_CURRENCIES[assetBalance.currency] ? _utils.COMMON_CURRENCIES[assetBalance.currency] : assetBalance.currency;
            const free = parseFloat(assetBalance.available);
            const used = parseFloat(assetBalance.holds);
            const total = parseFloat(assetBalance.balance);

            result[symbol] = {
              free, used, total
            };

            result.free[symbol] = free;
            result.used[symbol] = used;
            result.total[symbol] = total;
          });

          return result;
        }
        console.error(`Status=${response.status} fetching user balances from ${EXCHANGE} because:`, response.data);
      } catch (err) {
        console.error(`Error fetching user balances from ${EXCHANGE} because:`, err);
      }
      return { data: [] };
    })();
  }

  fetchOpenOrders() {
    var _this9 = this;

    return _asyncToGenerator(function* () {
      const ordersPath = '/api/v1/orders?status=active';
      const method = 'GET';
      const timestamp = Date.now();
      const sign = _cryptoJs2.default.enc.Base64.stringify(_cryptoJs2.default.HmacSHA256(`${timestamp}${method}${ordersPath}`, _this9.secret));

      const options = {
        method,
        url: `${_this9.proxy}${_this9.urls.api}${ordersPath}`,
        headers: {
          'Content-Type': 'application/json',
          'KC-API-KEY': _this9.apiKey,
          'KC-API-SIGN': sign,
          'KC-API-TIMESTAMP': timestamp,
          'KC-API-PASSPHRASE': _this9.password
        }
      };

      try {
        const response = yield (0, _axios2.default)(options);
        if (response.status === 200) {
          const result = response.data.data.items.map(function (orderObj) {
            return {
              info: orderObj,
              id: orderObj.id,
              timestamp: orderObj.createdAt,
              datetime: new Date(orderObj.createdAt).toISOString(),
              symbol: KucoinRest.normalizePair(orderObj.symbol),
              type: orderObj.type,
              side: orderObj.side,
              price: parseFloat(orderObj.price),
              amount: parseFloat(orderObj.size),
              cost: parseFloat(orderObj.price) * parseFloat(orderObj.size),
              filled: 0,
              remaining: parseFloat(orderObj.size),
              status: 'open',
              fee: {
                cost: parseFloat(orderObj.price) * parseFloat(orderObj.size),
                rate: parseFloat(orderObj.fee),
                currency: _utils.COMMON_CURRENCIES[orderObj.feeCurrency] ? _utils.COMMON_CURRENCIES[orderObj.feeCurrency] : orderObj.feeCurrency
              }
            };
          });

          return result;
        }
        console.error(`Status=${response.status} fetching user balances from ${EXCHANGE} because:`, response.data);
      } catch (err) {
        console.error(`Error fetching user balances from ${EXCHANGE} because:`, err);
      }
      return [];
    })();
  }

  fetchClosedOrders() {
    var _this10 = this;

    return _asyncToGenerator(function* () {
      const ordersPath = '/api/v1/orders?status=done';
      const method = 'GET';
      const timestamp = Date.now();
      const sign = _cryptoJs2.default.enc.Base64.stringify(_cryptoJs2.default.HmacSHA256(`${timestamp}${method}${ordersPath}`, _this10.secret));

      const options = {
        method,
        url: `${_this10.proxy}${_this10.urls.api}${ordersPath}`,
        headers: {
          'Content-Type': 'application/json',
          'KC-API-KEY': _this10.apiKey,
          'KC-API-SIGN': sign,
          'KC-API-TIMESTAMP': timestamp,
          'KC-API-PASSPHRASE': _this10.password
        }
      };

      try {
        const response = yield (0, _axios2.default)(options);
        if (response.status === 200) {
          const result = response.data.data.items.map(function (orderObj) {
            return {
              info: orderObj,
              id: orderObj.id,
              timestamp: orderObj.createdAt,
              datetime: new Date(orderObj.createdAt).toISOString(),
              symbol: KucoinRest.normalizePair(orderObj.symbol),
              type: orderObj.type,
              side: orderObj.side,
              price: parseFloat(orderObj.price),
              amount: parseFloat(orderObj.size),
              cost: orderObj.dealSize ? orderObj.dealSize : parseFloat(orderObj.price) * parseFloat(orderObj.size),
              filled: parseFloat(orderObj.dealSize),
              remaining: parseFloat(orderObj.size),
              status: 'closed',
              fee: {
                cost: parseFloat(orderObj.price) * parseFloat(orderObj.size),
                rate: parseFloat(orderObj.fee),
                currency: _utils.COMMON_CURRENCIES[orderObj.feeCurrency] ? _utils.COMMON_CURRENCIES[orderObj.feeCurrency] : orderObj.feeCurrency
              }
            };
          });
          return result;
        }
        console.error(`Status=${response.status} fetching user balances from ${EXCHANGE} because:`, response.data);
      } catch (err) {
        console.error(`Error fetching user balances from ${EXCHANGE} because:`, err);
      }
      return [];
    })();
  }

  // todo: use params to implement stops
  createOrder(pair, type, side, amount, price, params = {}) {
    var _this11 = this;

    return _asyncToGenerator(function* () {
      if (!_this11.markets) {
        yield _this11.loadMarkets();
      }
      const { symbol } = _this11.markets[pair];
      if (!symbol) {
        throw new Error('Unknown pair');
      }

      const data = {
        clientOid: (0, _utils.uuidv4)(),
        side: side.toLowerCase(),
        symbol,
        type: type.toLowerCase(),
        size: amount.toString()
      };

      if (type.toUpperCase() === 'LIMIT') {
        data.price = price.toString();
      }

      const method = 'POST';
      const ordersPath = '/api/v1/orders';
      const timestamp = Date.now();
      const sign = _cryptoJs2.default.enc.Base64.stringify(_cryptoJs2.default.HmacSHA256(`${timestamp}${method}${ordersPath}${JSON.stringify(data)}`, _this11.secret));

      const options = {
        method,
        url: `${_this11.proxy}${_this11.urls.api}${ordersPath}`,
        headers: {
          'Content-Type': 'application/json',
          'KC-API-KEY': _this11.apiKey,
          'KC-API-SIGN': sign,
          'KC-API-TIMESTAMP': timestamp,
          'KC-API-PASSPHRASE': _this11.password
        },
        data
      };

      const response = yield (0, _axios2.default)(options);
      if (response.data.msg) {
        throw new Error(JSON.stringify({ msg: response.data.msg }));
      }

      return {
        info: response.data.data,
        id: response.data.data.orderId,
        timestamp,
        datetime: new Date(timestamp).toISOString(),
        lastTradeTimestamp: undefined,
        symbol: pair,
        type,
        side,
        amount,
        price,
        cost: (parseFloat(price) * parseFloat(amount)).toString(),
        status: 'open'
      };
    })();
  }

  cancelOrder(orderId) {
    var _this12 = this;

    return _asyncToGenerator(function* () {
      const ordersPath = `/api/v1/orders/${orderId}`;
      const method = 'DELETE';
      const timestamp = Date.now();
      const sign = _cryptoJs2.default.enc.Base64.stringify(_cryptoJs2.default.HmacSHA256(`${timestamp}${method}${ordersPath}`, _this12.secret));

      const options = {
        method,
        url: `${_this12.proxy}${_this12.urls.api}${ordersPath}`,
        headers: {
          'Content-Type': 'application/json',
          'KC-API-KEY': _this12.apiKey,
          'KC-API-SIGN': sign,
          'KC-API-TIMESTAMP': timestamp,
          'KC-API-PASSPHRASE': _this12.password
        }
      };

      const response = yield (0, _axios2.default)(options);
      if (response.status === 200 && response.data.data) {
        return {
          success: true,
          orderId: response.data.data.cancelledOrderIds[0]
        };
      }
      throw new Error(response.data.msg);
    })();
  }

  getOrder(orderId) {
    var _this13 = this;

    return _asyncToGenerator(function* () {
      const orderPath = `/api/v1/orders/${orderId}`;
      const method = 'GET';
      const timestamp = Date.now();
      const sign = _cryptoJs2.default.enc.Base64.stringify(_cryptoJs2.default.HmacSHA256(`${timestamp}${method}${orderPath}`, _this13.secret));

      const options = {
        method,
        url: `${_this13.proxy}${_this13.urls.api}${orderPath}`,
        headers: {
          'Content-Type': 'application/json',
          'KC-API-KEY': _this13.apiKey,
          'KC-API-SIGN': sign,
          'KC-API-TIMESTAMP': timestamp,
          'KC-API-PASSPHRASE': _this13.password
        }
      };

      const response = yield (0, _axios2.default)(options);
      return response.data.data;
    })();
  }

  fetchMyTrades(pair) {
    var _this14 = this;

    return _asyncToGenerator(function* () {
      if (!_this14.markets) {
        yield _this14.loadMarkets();
      }
      const { symbol } = _this14.markets[pair];
      if (!symbol) {
        throw new Error('Unknown pair');
      }
      const accountsResponse = yield _this14.getAllAccounts();

      const quote = pair.split('/')[1];
      const accountIds = accountsResponse.data.data.filter(function (account) {
        const currency = _utils.COMMON_CURRENCIES[account.currency] ? _utils.COMMON_CURRENCIES[account.currency] : account.currency;
        return currency === quote;
      }).map(function (account) {
        return account.id;
      });

      if (!accountIds.length) {
        return [];
      }

      const accountPath = `/api/v1/accounts/${accountIds[0]}/ledgers`;
      const method = 'GET';
      const timestamp = Date.now();
      const sign = _cryptoJs2.default.enc.Base64.stringify(_cryptoJs2.default.HmacSHA256(`${timestamp}${method}${accountPath}`, _this14.secret));

      const options = {
        method,
        url: `${_this14.proxy}${_this14.urls.api}${accountPath}`,
        headers: {
          'Content-Type': 'application/json',
          'KC-API-KEY': _this14.apiKey,
          'KC-API-SIGN': sign,
          'KC-API-TIMESTAMP': timestamp,
          'KC-API-PASSPHRASE': _this14.password
        }
      };

      const response = yield (0, _axios2.default)(options);
      const tradesForSymbol = response.data.data.items.filter(function (transaction) {
        return transaction.bizType === 'Exchange';
      }).filter(function (tradeObj) {
        return JSON.parse(tradeObj.context).symbol === symbol;
      });

      const orderIds = new Set(tradesForSymbol.map(function (tradeObject) {
        return JSON.parse(tradeObject.context).order_id;
      }));
      const uniqueOrderIds = Array.from(orderIds);

      const allOrders = yield Promise.all(uniqueOrderIds.map(function (orderId) {
        return _this14.getOrder(orderId);
      }));
      return allOrders.map(function (order) {
        return {
          id: order.id,
          order: order.id,
          info: order,
          timestamp: order.createdAt,
          datetime: new Date(order.createdAt).toISOString(),
          symbol: KucoinRest.normalizePair(order.symbol),
          side: order.side,
          price: order.price === '0' ? order.dealFunds : order.price,
          amount: order.size,
          fee: order.fee
        };
      });
    })();
  }
}

exports.default = KucoinRest;