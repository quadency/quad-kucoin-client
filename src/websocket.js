import WebSocket from 'ws';
import axios from 'axios';
import CryptoJS from 'crypto-js';
import { COMMON_CURRENCIES, uuidv4 } from './utils';
import KucoinRest from './api';

const EXCHANGE = 'KUCOIN';
const BASE_URL = 'https://openapi-v2.kucoin.com';

class KucoinWebsocket {
  constructor(userConfig = {}) {
    Object.keys(userConfig).forEach((key) => {
      this[key] = userConfig[key];
    });

    this.proxy = '';
    this.publicSocket = null;
    this.publicConnectionId = null;
    this.urls = {
      api: BASE_URL,
    };
    this.restClient = new KucoinRest();
  }

  async loadMarketCache() {
    if (!this.restClient.markets) {
      this.restClient.urls.api = this.urls.api;
      await this.restClient.loadMarkets(true);
    }
  }

  async getPublicServer() {
    const bulletPath = '/api/v1/bullet-public';
    const options = {
      method: 'POST',
      url: `${this.proxy}${this.urls.api}${bulletPath}`,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    const response = await axios(options);
    return response.data.data;
  }

  async getPrivateServer() {
    const uri = '/api/v1/bullet-private';
    const method = 'POST';
    const timestamp = Date.now();
    const sign = CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA256(`${timestamp}${method}${uri}`, this.secret));

    const options = {
      method,
      url: `${this.proxy}${this.urls.api}${uri}`,
      headers: {
        'Content-Type': 'application/json',
        'KC-API-KEY': this.apiKey,
        'KC-API-SIGN': sign,
        'KC-API-TIMESTAMP': timestamp,
        'KC-API-PASSPHRASE': this.password,
      },
    };
    const response = await axios(options);
    return response.data.data;
  }

  static createSubscriptionMessage(type, topic, pairs = [], privateChannel = false) {
    if (!pairs.length) {
      return [{
        type,
        topic,
        privateChannel,
        response: true,
      }];
    }

    const subscriptionMessages = [];
    while (pairs.length) {
      const batchPairs = pairs.splice(0, 100);
      subscriptionMessages.push({
        type,
        topic: `${topic}:${batchPairs.toString()}`,
        privateChannel,
        response: true,
      });
    }

    return subscriptionMessages;
  }

  static sendSubscriptionMessage(socket, connectionId, message) {
    const messages = Array.isArray(message) ? message : [message];
    messages.forEach((msg) => {
      const msgWithConnectionId = Object.assign({ id: connectionId }, msg);
      if (socket && socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(msgWithConnectionId));
      }
    });
  }

  async subscribePublic(subscription, callback, reConnect = false) {
    let pingIntervalLength;
    if (this.publicConnectionId === null) {
      this.publicConnectionId = uuidv4();
    }
    if (this.publicSocket === null || reConnect) {
      await this.getPublicServer().then((server) => {
        const { token, instanceServers } = server;
        const { endpoint } = instanceServers[0];
        pingIntervalLength = instanceServers[0].pingInterval;
        this.publicSocket = new WebSocket(`${endpoint}?token=${token}&[connectId=${this.publicConnectionId}]`);
      });
    }

    if (this.publicSocket !== null) {
      let pingInterval;

      let reconnectOnClose = true;
      const disconnectFn = () => {
        reconnectOnClose = false;
        this.publicSocket.close();
      };

      if (this.publicSocket && this.publicSocket.readyState === this.publicSocket.OPEN) {
        KucoinWebsocket.sendSubscriptionMessage(this.publicSocket, this.publicConnectionId, subscription);
      }

      this.publicSocket.onopen = () => {
        console.log(`${EXCHANGE} connection open`);

        callback({ subject: 'socket.open' }, disconnectFn);
        KucoinWebsocket.sendSubscriptionMessage(this.publicSocket, this.publicConnectionId, subscription);
        pingInterval = setInterval(() => {
          if (this.publicSocket.readyState === this.publicSocket.OPEN) {
            const pingMessage = {
              id: this.publicConnectionId,
              type: 'ping',
            };
            this.publicSocket.send(JSON.stringify(pingMessage));
          }
        }, pingIntervalLength / 2);
      };

      this.publicSocket.onmessage = (message) => {
        const messageObj = JSON.parse(message.data);

        const { type } = messageObj;
        if (type === 'message') {
          callback(messageObj, disconnectFn);
        }
      };

      this.publicSocket.onclose = () => {
        console.log(`${EXCHANGE} connection closed`);
        clearInterval(pingInterval);
        if (reconnectOnClose) {
          this.subscribePublic(subscription, callback, true);
        }
      };

      this.publicSocket.onerror = (error) => {
        console.log(`error with ${EXCHANGE} connection because`, error);
      };
    }
  }

  subscribePrivate(subscription, callback) {
    this.getPrivateServer().then((server) => {
      const connectionId = uuidv4();
      const { token, instanceServers } = server;
      const { endpoint, pingInterval: pingIntervalLength } = instanceServers[0];

      const socket = new WebSocket(`${endpoint}?token=${token}&[connectId=${connectionId}]`);
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
              type: 'ping',
            };
            socket.send(JSON.stringify(pingMessage));
          }
        }, pingIntervalLength / 2);
      };

      socket.onmessage = (message) => {
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

      socket.onerror = (error) => {
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
        const normalizedPair = KucoinRest.normalizePair(data.data.symbol);
        callback(Object.assign({ messageType: 'message', pair: normalizedPair }, data.data), disconnect);
      }
    });
  }

  subscribeAllMarketTickers(callback) {
    const disconnectArray = [];
    const disconnectAll = function () {
      disconnectArray.forEach((fn) => {
        fn();
      });
    };
    this.restClient.getMarketList().then((markets) => {
      markets.forEach((market) => {
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
      const subscriptionPairsArray = !pairs || !pairs.length
        ? (Object.keys(this.restClient.markets)).map(pair => this.restClient.markets[pair].symbol)
        : pairs.map(pair => this.restClient.markets[pair].symbol);

      const subscription = KucoinWebsocket.createSubscriptionMessage('subscribe', '/market/ticker', subscriptionPairsArray);
      this.subscribePublic(subscription, (message, disconnect) => {
        const { subject, data, topic } = message;
        if (subject === 'socket.open') {
          callback({ messageType: 'open' }, disconnect);
        }

        if (subject === 'trade.ticker') {
          const subscriptionPair = topic.replace('/market/ticker:', '');
          const normalizedPair = KucoinRest.normalizePair(subscriptionPair);

          callback(Object.assign({ messageType: 'message', pair: normalizedPair }, data), disconnect);
        }
      });
    });
  }

  subscribeTrades(pairs, callback) {
    this.loadMarketCache().then(() => {
      const subscriptionPairsArray = !pairs || !pairs.length
        ? (Object.keys(this.restClient.markets)).map(pair => this.restClient.markets[pair].symbol)
        : pairs.map(pair => this.restClient.markets[pair].symbol);

      const subscription = KucoinWebsocket.createSubscriptionMessage('subscribe', '/market/match', subscriptionPairsArray);
      this.subscribePublic(subscription, (message, disconnect) => {
        const { subject, data } = message;
        if (subject === 'socket.open') {
          callback({ messageType: 'open' }, disconnect);
          return;
        }

        if (subject === 'trade.l3match') {
          const normalizedPair = KucoinRest.normalizePair(data.symbol);
          const payload = Object.assign({ messageType: 'message', pair: normalizedPair }, data);
          delete payload.symbol;
          callback(payload, disconnect);
        }
      });
    });
  }

  subscribeOrderbook(pairs, callback) {
    this.loadMarketCache().then(() => {
      const subscriptionPairsArray = !pairs || !pairs.length
        ? (Object.keys(this.restClient.markets)).map(pair => this.restClient.markets[pair].symbol)
        : pairs.map(pair => this.restClient.markets[pair].symbol);

      const subscription = KucoinWebsocket.createSubscriptionMessage('subscribe', '/market/level2', subscriptionPairsArray);
      this.subscribePublic(subscription, (message, disconnect) => {
        const { subject, data } = message;
        if (subject === 'socket.open') {
          callback({ messageType: 'open' }, disconnect);
          return;
        }

        if (subject === 'trade.l2update') {
          const normalizedPair = KucoinRest.normalizePair(data.symbol);
          const payload = Object.assign({ messageType: 'message', pair: normalizedPair }, data);
          delete payload.symbol;
          callback(payload, disconnect);
        }
      });
    });
  }

  unsubscribeOrderbook(pairs) {
    this.loadMarketCache().then(() => {
      const unsubscribePairsArray = pairs && pairs.length
        ? pairs.map(pair => this.restClient.markets[pair].symbol)
        : (Object.keys(this.restClient.markets)).map(pair => this.restClient.markets[pair].symbol);

      const unsubscription = KucoinWebsocket.createSubscriptionMessage('unsubscribe', '/market/level2', unsubscribePairsArray)
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
        payload.currency = COMMON_CURRENCIES[payload.currency] ? COMMON_CURRENCIES[payload.currency] : payload.currency;
        callback(payload, disconnect);
      }
    });
  }

  subscribeUserOrders(pairs, callback) {
    this.loadMarketCache().then(() => {
      const subscriptionPairsArray = !pairs || !pairs.length
        ? (Object.keys(this.restClient.markets)).map(pair => this.restClient.markets[pair].symbol)
        : pairs.map(pair => this.restClient.markets[pair].symbol);

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


export default KucoinWebsocket;
