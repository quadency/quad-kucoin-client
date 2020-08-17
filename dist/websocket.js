'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _ws = require('ws');

var _ws2 = _interopRequireDefault(_ws);

var _axios = require('axios');

var _axios2 = _interopRequireDefault(_axios);

var _cryptoJs = require('crypto-js');

var _cryptoJs2 = _interopRequireDefault(_cryptoJs);

var _utils = require('./utils');

var _api = require('./api');

var _api2 = _interopRequireDefault(_api);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const EXCHANGE = 'KUCOIN';
const BASE_URL = 'https://openapi-v2.kucoin.com';

class KucoinWebsocket {
  constructor(userConfig = {}) {
    Object.keys(userConfig).forEach(key => {
      this[key] = userConfig[key];
    });

    this.proxy = '';

    this.urls = {
      api: BASE_URL
    };
    this.restClient = new _api2.default();
  }

  loadMarketCache() {
    var _this = this;

    return _asyncToGenerator(function* () {
      if (!_this.restClient.markets) {
        _this.restClient.urls.api = _this.urls.api;
        yield _this.restClient.loadMarkets(true);
      }
    })();
  }

  getPublicServer() {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      const bulletPath = '/api/v1/bullet-public';
      const options = {
        method: 'POST',
        url: `${_this2.proxy}${_this2.urls.api}${bulletPath}`,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      const response = yield (0, _axios2.default)(options);
      return response.data.data;
    })();
  }

  getPrivateServer() {
    var _this3 = this;

    return _asyncToGenerator(function* () {
      const uri = '/api/v1/bullet-private';
      const method = 'POST';
      const timestamp = Date.now();
      const sign = _cryptoJs2.default.enc.Base64.stringify(_cryptoJs2.default.HmacSHA256(`${timestamp}${method}${uri}`, _this3.secret));

      const options = {
        method,
        url: `${_this3.proxy}${_this3.urls.api}${uri}`,
        headers: {
          'Content-Type': 'application/json',
          'KC-API-KEY': _this3.apiKey,
          'KC-API-SIGN': sign,
          'KC-API-TIMESTAMP': timestamp,
          'KC-API-PASSPHRASE': _this3.password
        }
      };
      const response = yield (0, _axios2.default)(options);
      return response.data.data;
    })();
  }

  static subscribe(socket, connectionId, subscription) {
    const subscribeMessages = Array.isArray(subscription) ? subscription : [subscription];
    subscribeMessages.forEach(msg => {
      const subscribeMsgWithConnectionId = Object.assign({ id: connectionId }, msg);
      socket.send(JSON.stringify(subscribeMsgWithConnectionId));
    });
  }

  subscribePublic(subscription, callback) {
    this.getPublicServer().then(server => {
      const connectionId = (0, _utils.uuidv4)();
      const { token, instanceServers } = server;
      const { endpoint, pingInterval: pingIntervalLength } = instanceServers[0];

      const socket = new _ws2.default(`${endpoint}?token=${token}&[connectId=${connectionId}]`);
      let pingInterval;

      let reconnectOnClose = true;
      const disconnectFn = () => {
        reconnectOnClose = false;
        socket.close();
      };

      socket.onopen = () => {
        console.log(`${EXCHANGE} connection open`);

        callback({ subject: 'socket.open' }, disconnectFn);
        KucoinWebsocket.subscribe(socket, connectionId, subscription);

        pingInterval = setInterval(() => {
          if (socket.readyState === socket.OPEN) {
            const pingMessage = {
              id: connectionId,
              type: 'ping'
            };
            socket.send(JSON.stringify(pingMessage));
          }
        }, pingIntervalLength / 2);
      };

      socket.onmessage = message => {
        const messageObj = JSON.parse(message.data);

        const { type } = messageObj;
        if (type === 'message') {
          callback(messageObj, disconnectFn);
        }
      };

      socket.onclose = () => {
        console.log(`${EXCHANGE} connection closed`);
        clearInterval(pingInterval);
        if (reconnectOnClose) {
          this.subscribePublic(subscription, callback);
        }
      };

      socket.onerror = error => {
        console.log(`error with ${EXCHANGE} connection because`, error);
      };
    });
  }

  subscribePrivate(subscription, callback) {
    this.getPrivateServer().then(server => {
      const connectionId = (0, _utils.uuidv4)();
      const { token, instanceServers } = server;
      const { endpoint, pingInterval: pingIntervalLength } = instanceServers[0];

      const socket = new _ws2.default(`${endpoint}?token=${token}&[connectId=${connectionId}]`);
      let pingInterval;

      let reconnectOnClose = true;
      const disconnectFn = () => {
        reconnectOnClose = false;
        socket.close();
      };

      socket.onopen = () => {
        console.log(`${EXCHANGE} connection open`);

        callback({ subject: 'socket.open' }, disconnectFn);
        KucoinWebsocket.subscribe(socket, connectionId, subscription);

        pingInterval = setInterval(() => {
          if (socket.readyState === socket.OPEN) {
            const pingMessage = {
              id: connectionId,
              type: 'ping'
            };
            socket.send(JSON.stringify(pingMessage));
          }
        }, pingIntervalLength / 2);
      };

      socket.onmessage = message => {
        const messageObj = JSON.parse(message.data);

        const { type } = messageObj;
        if (type === 'message') {
          callback(messageObj, disconnectFn);
        }
      };

      socket.onclose = () => {
        console.log(`${EXCHANGE} connection closed`);
        clearInterval(pingInterval);
        if (reconnectOnClose) {
          this.subscribePrivate(subscription, callback);
        }
      };

      socket.onerror = error => {
        console.log(`error with ${EXCHANGE} connection because`, error);
      };
    });
  }

  subscribeMarket(market, callback) {
    const subscription = {
      type: 'subscribe',
      topic: `/market/snapshot:${market}`,
      response: true
    };
    this.subscribePublic(subscription, (message, disconnect) => {
      const { subject, data } = message;
      if (subject === 'socket.open') {
        callback({ messageType: 'open', market }, disconnect);
      }

      if (subject === 'trade.snapshot') {
        const normalizedPair = _api2.default.normalizePair(data.data.symbol);
        callback(Object.assign({ messageType: 'message', pair: normalizedPair }, data.data), disconnect);
      }
    });
  }

  subscribeAllMarketTickers(callback) {
    const disconnectArray = [];
    const disconnectAll = function () {
      disconnectArray.forEach(fn => {
        fn();
      });
    };
    this.restClient.getMarketList().then(markets => {
      markets.forEach(market => {
        this.subscribeMarket(market, (message, disconnect) => {
          if (disconnect) {
            disconnectArray.push(disconnect);
          }
          callback(message, disconnectAll);
        });
      });
    });
  }

  subscribeTickers(pairs, callback) {
    this.loadMarketCache().then(() => {
      const subscriptionPairsArray = !pairs || !pairs.length ? Object.keys(this.restClient.markets).map(pair => this.restClient.markets[pair].symbol) : pairs.map(pair => this.restClient.markets[pair].symbol);

      const subscription = {
        type: 'subscribe',
        topic: `/market/ticker:${subscriptionPairsArray.toString()}`,
        response: true
      };
      this.subscribePublic(subscription, (message, disconnect) => {
        const { subject, data, topic } = message;
        if (subject === 'socket.open') {
          callback({ messageType: 'open' }, disconnect);
        }

        if (subject === 'trade.ticker') {
          const subscriptionPair = topic.replace('/market/ticker:', '');
          const normalizedPair = _api2.default.normalizePair(subscriptionPair);

          callback(Object.assign({ messageType: 'message', pair: normalizedPair }, data), disconnect);
        }
      });
    });
  }

  subscribeTrades(pairs, callback) {
    this.loadMarketCache().then(() => {
      const subscriptionPairsArray = !pairs || !pairs.length ? Object.keys(this.restClient.markets).map(pair => this.restClient.markets[pair].symbol) : pairs.map(pair => this.restClient.markets[pair].symbol);

      const subscription = {
        type: 'subscribe',
        topic: `/market/match:${subscriptionPairsArray.toString()}`,
        response: true
      };
      this.subscribePublic(subscription, (message, disconnect) => {
        const { subject, data } = message;
        if (subject === 'socket.open') {
          callback({ messageType: 'open' }, disconnect);
          return;
        }

        if (subject === 'trade.l3match') {
          const normalizedPair = _api2.default.normalizePair(data.symbol);
          const payload = Object.assign({ messageType: 'message', pair: normalizedPair }, data);
          delete payload.symbol;
          callback(payload, disconnect);
        }
      });
    });
  }

  subscribeOrderbook(pairs, callback) {
    this.loadMarketCache().then(() => {
      const subscriptionPairsArray = !pairs || !pairs.length ? Object.keys(this.restClient.markets).map(pair => this.restClient.markets[pair].symbol) : pairs.map(pair => this.restClient.markets[pair].symbol);

      const subscription = {
        type: 'subscribe',
        topic: `/market/level2:${subscriptionPairsArray.toString()}`,
        response: true
      };
      this.subscribePublic(subscription, (message, disconnect) => {
        const { subject, data } = message;
        if (subject === 'socket.open') {
          callback({ messageType: 'open' }, disconnect);
          return;
        }

        if (subject === 'trade.l2update') {
          const normalizedPair = _api2.default.normalizePair(data.symbol);
          const payload = Object.assign({ messageType: 'message', pair: normalizedPair }, data);
          delete payload.symbol;
          callback(payload, disconnect);
        }
      });
    });
  }

  subscribeUserBalance(callback) {
    const subscription = {
      type: 'subscribe',
      topic: '/account/balance',
      privateChannel: true,
      response: true
    };
    this.subscribePrivate(subscription, (message, disconnect) => {
      const { subject, data } = message;
      if (subject === 'socket.open') {
        callback({ messageType: 'open' }, disconnect);
        return;
      }

      if (subject === 'account.balance') {
        const payload = Object.assign({ messageType: 'message' }, data);
        payload.currency = _utils.COMMON_CURRENCIES[payload.currency] ? _utils.COMMON_CURRENCIES[payload.currency] : payload.currency;
        callback(payload, disconnect);
      }
    });
  }

  subscribeUserOrders(pairs, callback) {
    this.loadMarketCache().then(() => {
      const subscriptionPairsArray = !pairs || !pairs.length ? Object.keys(this.restClient.markets).map(pair => this.restClient.markets[pair].symbol) : pairs.map(pair => this.restClient.markets[pair].symbol);

      // create nultiple subscribe messages because subscribing all pairs at once doesn't work
      // subscribe 100 pairs at a time
      const subscriptions = [];
      while (subscriptionPairsArray.length) {
        const batchPairs = subscriptionPairsArray.splice(0, 100);
        subscriptions.push({
          type: 'subscribe',
          topic: `/market/level3:${batchPairs.toString()}`,
          privateChannel: true,
          response: true
        });
      }

      this.subscribePrivate(subscriptions, (message, disconnect) => {
        const { subject, data } = message;
        if (subject === 'socket.open') {
          callback({ messageType: 'open' }, disconnect);
          return;
        }
        const payload = Object.assign({ messageType: 'message' }, data);
        callback(payload, disconnect);
      });
    });
  }
}

exports.default = KucoinWebsocket;