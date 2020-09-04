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
    this.urls = {
      api: BASE_URL,
    };
    this.publicConnectionId = null;
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

  static subscribe(socket, connectionId, subscription) {
    const subscribeMessages = Array.isArray(subscription) ? subscription : [subscription];
    subscribeMessages.forEach((msg) => {
      const subscribeMsgWithConnectionId = Object.assign({ id: connectionId }, msg);
      if(socket && socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(subscribeMsgWithConnectionId));
      }
    });
  }

  unSubscribePublic(socket, connectionId, message) {
      const unSubscribeMessages = Array.isArray(message) ? message : [message];
      unSubscribeMessages.forEach((msg) => {
        const unSubscribeMsgWithConnectionId = Object.assign({ id: connectionId }, msg);
        if(socket && socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(unSubscribeMsgWithConnectionId));
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
        const endpoint = instanceServers[0].endpoint;
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
        KucoinWebsocket.subscribe(this.publicSocket, this.publicConnectionId, subscription);
      }

      this.publicSocket.onopen = () => {
        console.log(`${EXCHANGE} connection open`);

        callback({ subject: 'socket.open' }, disconnectFn);
        KucoinWebsocket.subscribe(this.publicSocket, this.publicConnectionId, subscription);
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
          this.subscribePublic(subscription, callback);
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
        KucoinWebsocket.subscribe(socket, connectionId, subscription);

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
    const subscription = {
      type: 'subscribe',
      topic: `/market/snapshot:${market}`,
      response: true,
    };
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

      const subscription = {
        type: 'subscribe',
        topic: `/market/ticker:${subscriptionPairsArray.toString()}`,
        response: true,
      };
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

      const subscription = {
        type: 'subscribe',
        topic: `/market/match:${subscriptionPairsArray.toString()}`,
        response: true,
      };
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

      const subscription = {
        type: 'subscribe',
        topic: `/market/level2:${subscriptionPairsArray.toString()}`,
        response: true,
      };
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
      const unSubscribePairsArray = pairs && pairs.length
        ? pairs.map(pair => this.restClient.markets[pair].symbol)
        : (Object.keys(this.restClient.markets)).map(pair => this.restClient.markets[pair].symbol);

      const unSubscription = {
        type: 'unsubscribe',
        topic: `/market/level2:${unSubscribePairsArray.toString()}`,
        response: true,
      };
      this.unSubscribePublic(this.publicSocket,this.publicConnectionId,unSubscription);
    });
  }

  subscribeUserBalance(callback) {
    const subscription = {
      type: 'subscribe',
      topic: '/account/balance',
      privateChannel: true,
      response: true,
    };
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

      // create nultiple subscribe messages because subscribing all pairs at once doesn't work
      // subscribe 100 pairs at a time
      const subscriptions = [];
      while (subscriptionPairsArray.length) {
        const batchPairs = subscriptionPairsArray.splice(0, 100);
        subscriptions.push({
          type: 'subscribe',
          topic: `/market/level3:${batchPairs.toString()}`,
          privateChannel: true,
          response: true,
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


export default KucoinWebsocket;
