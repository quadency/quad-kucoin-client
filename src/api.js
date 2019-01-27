import axios from 'axios';
import CryptoJS from 'crypto-js';
import { COMMON_CURRENCIES } from './utils';


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
  '1w': '1week',
};

class KucoinRest {
  constructor(userConfig = {}) {
    Object.keys(userConfig).forEach((key) => {
      this[key] = userConfig[key];
    });
    this.proxy = '';
    this.RATE_LIMIT = 2000;

    this.urls = {
      api: BASE_URL,
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

    return (start + (intervalInSeconds * limit));
  }


  async getSymbols() {
    const options = {
      method: 'GET',
      url: `${this.proxy}${this.urls.api}/api/v1/symbols`,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    try {
      const response = await axios(options);
      if (response.status === 200) {
        return response.data;
      }
      console.error(`Status=${response.status} get symbols from ${EXCHANGE} because:`, response.data);
    } catch (err) {
      console.error(`Error fetching get symbols from ${EXCHANGE} because:`, err);
    }
    return { data: [] };
  }

  async loadMarkets(reload = false) {
    if (!reload && this.markets) {
      return this.markets;
    }
    const symbols = await this.getSymbols();
    const markets = {};
    (symbols.data).forEach((symbol) => {
      const base = COMMON_CURRENCIES[symbol.baseCurrency] ? COMMON_CURRENCIES[symbol.baseCurrency] : symbol.baseCurrency;
      const quote = COMMON_CURRENCIES[symbol.quoteCurrency] ? COMMON_CURRENCIES[symbol.quoteCurrency] : symbol.quoteCurrency;
      const pair = `${base}/${quote}`;

      markets[pair] = symbol;
    });
    this.markets = markets;
    return markets;
  }

  async fetchOHLCV(pair, interval, since, limit) {
    if (!this.markets) {
      await this.loadMarkets();
    }
    const { symbol } = this.markets[pair];
    if (!symbol) {
      throw new Error('Unknown pair');
    }

    const startAt = since / 1000;
    const endAt = limit ? KucoinRest.getEndTime(startAt, interval, limit) : Date.now();

    const options = {
      method: 'GET',
      url: `${this.proxy}${this.urls.api}/api/v1/market/candles`,
      headers: {
        'Content-Type': 'application/json',
      },
      params: {
        symbol,
        startAt,
        endAt,
        type: TIME_FRAMES[interval],
      },
    };

    try {
      const response = await axios(options);
      if (response.status === 200) {
        return (response.data.data).map(price => [
          (parseInt(price[0], 10) * 1000).toString(), // open time
          price[1], // open
          price[3], // high
          price[4], // low
          price[2], // close
          price[5], // volume
        ]);
      }
      console.error(`Status=${response.status} fetching historical prices from ${EXCHANGE} because:`, response.data);
    } catch (err) {
      console.error(`Error fetching historical prices from ${EXCHANGE} because:`, err);
    }
    return [];
  }

  async fetchTrades(pair) {
    if (!this.markets) {
      await this.loadMarkets();
    }
    const { symbol } = this.markets[pair];
    if (!symbol) {
      throw new Error('Unknown pair');
    }

    const options = {
      method: 'GET',
      url: `${this.proxy}${this.urls.api}/api/v1/market/histories`,
      headers: {
        'Content-Type': 'application/json',
      },
      params: {
        symbol,
      },
    };

    try {
      const response = await axios(options);
      if (response.status === 200) {
        return (response.data.data).map(trade => ({
          id: trade.sequence,
          timestamp: (trade.time / 1000000),
          datetime: new Date(trade.time / 1000000).toISOString(),
          symbol: pair,
          type: 'limit',
          side: trade.side,
          price: parseFloat(trade.price),
          amount: parseFloat(trade.size),
        }));
      }
      console.error(`Status=${response.status} fetching trades from ${EXCHANGE} because:`, response.data);
    } catch (err) {
      console.error(`Error fetching trades from ${EXCHANGE} because:`, err);
    }
    return [];
  }

  async fetchOrderBook(pair) {
    if (!this.markets) {
      await this.loadMarkets();
    }
    const { symbol } = this.markets[pair];
    if (!symbol) {
      throw new Error('Unknown pair');
    }

    const options = {
      method: 'GET',
      url: `${this.proxy}${this.urls.api}/api/v1/market/orderbook/level2_100`,
      headers: {
        'Content-Type': 'application/json',
      },
      params: {
        symbol,
      },
    };

    try {
      const response = await axios(options);
      if (response.status === 200) {
        const asks = (response.data.data.asks).map(ask => [
          parseFloat(ask[0]),
          parseFloat(ask[1]),
        ]);
        const bids = (response.data.data.bids).map(bid => [
          parseFloat(bid[0]),
          parseFloat(bid[1]),
        ]);
        const timestamp = Date.now();
        return {
          bids,
          asks,
          timestamp,
          datetime: (new Date(timestamp)).toISOString(),
        };
      }
      console.error(`Status=${response.status} fetching orderbook from ${EXCHANGE} because:`, response.data);
    } catch (err) {
      console.error(`Error fetching orderbook from ${EXCHANGE} because:`, err);
    }
    return {
      bids: [], asks: [], timestamp: undefined, datetime: undefined, nonce: undefined,
    };
  }

  async fetchBalance() {
    const balancePath = '/api/v1/accounts?type=trade';
    const method = 'GET';
    const timestamp = Date.now();
    const sign = CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA256(`${timestamp}${method}${balancePath}`, this.secret));

    const options = {
      method,
      url: `${this.proxy}${this.urls.api}${balancePath}`,
      headers: {
        'Content-Type': 'application/json',
        'KC-API-KEY': this.apiKey,
        'KC-API-SIGN': sign,
        'KC-API-TIMESTAMP': timestamp,
        'KC-API-PASSPHRASE': this.password,
      },
    };

    try {
      const response = await axios(options);
      if (response.status === 200) {
        const result = {
          free: {},
          used: {},
          total: {},
          info: response.data.data,
        };

        (response.data.data).forEach((assetBalance) => {
          const symbol = COMMON_CURRENCIES[assetBalance.currency] ? COMMON_CURRENCIES[assetBalance.currency] : assetBalance.currency;
          const free = parseFloat(assetBalance.available);
          const used = parseFloat(assetBalance.holds);
          const total = parseFloat(assetBalance.balance);

          result[symbol] = {
            free, used, total,
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
  }
}


export default KucoinRest;
