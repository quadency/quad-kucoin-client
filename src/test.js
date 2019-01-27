import KucoinRest from './api';


const client = new KucoinRest({
  apiKey: '5c4d0248ef83c721c02cb8d1',
  secret: '6468465e-e751-44d6-9bf3-6037439027b4',
  password: '1qaz@WSX',
});
client.urls.api = 'https://openapi-sandbox.kucoin.com';



function normalizeTrade(accountId, trade) {
  return {
    accountId,
    pair: trade.symbol,
    side: trade.side,
    price: trade.price,
    fee: trade.fee,
    amount: trade.amount,
    e_timestamp: trade.datetime,
    e_tradeId: trade.id,
    e_orderId: trade.order,
    e_nonunified: {
      user_id: trade.info.user_id,
      profile_id: trade.info.profile_id,
      settled: trade.info.settled,
    },
  };
}


async function main() {
  const price = '0.0002';
  const amount = '13';


  const response = await client.fetchMyTrades('ETH/BTC');
  // const response = await client.fetchMyTrades('KCS/BTC');

  console.log('response', response[0].info);

  const normalizedTrades = response.map(trade => normalizeTrade(1, trade));

  console.log('response', normalizedTrades);
}


main().then(() => {
  console.log('start');
});
