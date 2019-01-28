# quad-kucoin-client
node client for kucoin V2 api


Client to allow easier access to Kucoin's V2 rest and websocket api.

\* There are a handlful of assets that have been normalized to ccxt's library. 

## Rest Example

```
import kucoin from 'quad-kucoin-client';

// For authenticated endpoints, provide object of credentials.  
// This is not required for public rest endpoints
const exchangeClient = new kucoin.RestClient({
  apiKey: 'your api key',
  secret: 'your secret',
  password: 'your passphrase',
});

// if using a proxy, set proxy value
if (PROXY_HOST) {
  exchangeClient.proxy = 'http://yourproxyhost';
}
const allMyOrderForBTCUSDT = await exchangeClient.fetchOrders('BTC-USDT')

```

## Websocket Example

```
import kucoin from 'quad-kucoin-client';

// For authenticated endpoints, provide object of credentials.  
// This is not required for public rest endpoints
const exchangeClient = new kucoin.WebsocketClient({
  apiKey: 'your api key',
  secret: 'your secret',
  password: 'your passphras',
});

exchangeClient.subscribeBalance((balanceUpdate, disconnectFn)=>{
  console.log('My balance update:', balanceUpdate);
  
  setTimeout(() => { disconnectFn(); }, 5000);
});

```
