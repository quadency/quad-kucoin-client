import axios from 'axios';


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

  async fetchOHLCV(symbol, interval, since, limit) {
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
      console.error(`Status=${response.status} fetching instruments from ${EXCHANGE} because:`, response.data);
    } catch (err) {
      console.error(`Error fetching instruments from ${EXCHANGE} because:`, err);
    }
    return [];
  }
}


export default KucoinRest;
