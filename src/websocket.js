import WebSocket from 'ws';
import axios from 'axios';
import CryptoJS from 'crypto-js';
import { uuidv4 } from './utils';
import KucoinRest from './api';

const EXCHANGE = 'KUCOIN';
const BASE_URL = 'https://openapi-v2.kucoin.com';

class KucoinWebsocket {
  constructor(userConfig = {}) {
    Object.keys(userConfig).forEach((key) => {
      this[key] = userConfig[key];
    });

    this.proxy = '';

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


  subscribePublic(subscription, callback) {
    this.getPublicServer().then((server) => {
      const connectionId = uuidv4();
      const { token, instanceServers } = server;
      const { endpoint, pingInterval: pingIntervalLength } = instanceServers[0];

      const socket = new WebSocket(`${endpoint}?token=${token}&[connectId=${connectionId}]`);
      let pingInterval;

      socket.onopen = () => {
        console.log(`${EXCHANGE} connection open`);

        callback({ subject: 'socket.open' }, () => { socket.close(); });
        const subscriptionWithId = Object.assign({ id: connectionId }, subscription);
        socket.send(JSON.stringify(subscriptionWithId));

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
          callback(messageObj, () => { socket.close(); });
        }
      };

      socket.onclose = () => {
        console.log(`${EXCHANGE} connection closed`);
        clearInterval(pingInterval);
      };

      socket.onerror = (error) => {
        console.log(`error with ${EXCHANGE} connection because`, error);
        this.subscribe(subscription, callback);
      };
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
      this.subscribePublic(subscription, (message, socket) => {
        const { subject, data, topic } = message;
        if (subject === 'socket.open') {
          callback({ messageType: 'open' }, socket);
        }

        if (subject === 'trade.ticker') {
          const subscriptionPair = topic.replace('/market/ticker:', '');
          const normalizedPair = KucoinRest.normalizePair(subscriptionPair);

          callback(Object.assign({ messageType: 'message', pair: normalizedPair }, data), socket);
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
      this.subscribePublic(subscription, (message, socket) => {
        const { subject, data } = message;
        if (subject === 'socket.open') {
          callback({ messageType: 'open' }, socket);
          return;
        }

        if (subject === 'trade.l3match') {
          const normalizedPair = KucoinRest.normalizePair(data.symbol);
          const payload = Object.assign({ messageType: 'message', pair: normalizedPair }, data);
          delete payload.symbol;
          callback(payload, socket);
        }
      });
    });
  }
}


export default KucoinWebsocket;
