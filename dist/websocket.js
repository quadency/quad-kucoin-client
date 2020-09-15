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
    this.publicSocket = null;
    this.publicConnectionId = null;
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

  static createSubscriptionMessage(type, topic, pairs = [], privateChannel = false) {
    if (!pairs.length) {
      return [{
        type,
        topic,
        privateChannel,
        response: true
      }];
    }

    const subscriptionMessages = [];
    while (pairs.length) {
      const batchPairs = pairs.splice(0, 100);
      subscriptionMessages.push({
        type,
        topic: `${topic}:${batchPairs.toString()}`,
        privateChannel,
        response: true
      });
    }

    return subscriptionMessages;
  }

  static sendSubscriptionMessage(socket, connectionId, message) {
    const messages = Array.isArray(message) ? message : [message];
    messages.forEach(msg => {
      const msgWithConnectionId = Object.assign({ id: connectionId }, msg);
      if (socket && socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(msgWithConnectionId));
      }
    });
  }

  subscribePublic(subscription, callback, reConnect = false) {
    var _this4 = this;

    return _asyncToGenerator(function* () {
      let pingIntervalLength;
      if (_this4.publicConnectionId === null) {
        _this4.publicConnectionId = (0, _utils.uuidv4)();
      }
      if (_this4.publicSocket === null || reConnect) {
        yield _this4.getPublicServer().then(function (server) {
          const { token, instanceServers } = server;
          const { endpoint } = instanceServers[0];
          pingIntervalLength = instanceServers[0].pingInterval;
          _this4.publicSocket = new _ws2.default(`${endpoint}?token=${token}&[connectId=${_this4.publicConnectionId}]`);
        });
      }

      if (_this4.publicSocket !== null) {
        let pingInterval;

        let reconnectOnClose = true;
        const disconnectFn = function () {
          reconnectOnClose = false;
          _this4.publicSocket.close();
        };

        if (_this4.publicSocket && _this4.publicSocket.readyState === _this4.publicSocket.OPEN) {
          KucoinWebsocket.sendSubscriptionMessage(_this4.publicSocket, _this4.publicConnectionId, subscription);
        }

        _this4.publicSocket.onopen = function () {
          console.log(`${EXCHANGE} connection open`);

          callback({ subject: 'socket.open' }, disconnectFn);
          KucoinWebsocket.sendSubscriptionMessage(_this4.publicSocket, _this4.publicConnectionId, subscription);
          pingInterval = setInterval(function () {
            if (_this4.publicSocket.readyState === _this4.publicSocket.OPEN) {
              const pingMessage = {
                id: _this4.publicConnectionId,
                type: 'ping'
              };
              _this4.publicSocket.send(JSON.stringify(pingMessage));
            }
          }, pingIntervalLength / 2);
        };

        _this4.publicSocket.onmessage = function (message) {
          const messageObj = JSON.parse(message.data);

          const { type } = messageObj;
          if (type === 'message') {
            callback(messageObj, disconnectFn);
          }
        };

        _this4.publicSocket.onclose = function () {
          console.log(`${EXCHANGE} connection closed`);
          clearInterval(pingInterval);
          if (reconnectOnClose) {
            _this4.subscribePublic(subscription, callback, true);
          }
        };

        _this4.publicSocket.onerror = function (error) {
          console.log(`error with ${EXCHANGE} connection because`, error);
        };
      }
    })();
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
        KucoinWebsocket.sendSubscriptionMessage(socket, connectionId, subscription);

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
    const subscription = KucoinWebsocket.createSubscriptionMessage('subscribe', '/market/snapshot', [market]);
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

      const subscription = KucoinWebsocket.createSubscriptionMessage('subscribe', '/market/ticker', subscriptionPairsArray);
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

      const subscription = KucoinWebsocket.createSubscriptionMessage('subscribe', '/market/match', subscriptionPairsArray);
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

      const subscription = KucoinWebsocket.createSubscriptionMessage('subscribe', '/market/level2', subscriptionPairsArray);
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

  unsubscribeOrderbook(pairs) {
    this.loadMarketCache().then(() => {
      const unsubscribePairsArray = pairs && pairs.length ? pairs.map(pair => this.restClient.markets[pair].symbol) : Object.keys(this.restClient.markets).map(pair => this.restClient.markets[pair].symbol);

      const unsubscription = KucoinWebsocket.createSubscriptionMessage('unsubscribe', '/market/level2', unsubscribePairsArray);
      KucoinWebsocket.sendSubscriptionMessage(this.publicSocket, this.publicConnectionId, unsubscription);
    });
  }

  subscribeUserBalance(callback) {
    const subscription = KucoinWebsocket.createSubscriptionMessage('subscribe', '/account/balance', [], true);
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

      const subscription = KucoinWebsocket.createSubscriptionMessage('subscribe', '/market/level3', subscriptionPairsArray, true);
      this.subscribePrivate(subscription, (message, disconnect) => {
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