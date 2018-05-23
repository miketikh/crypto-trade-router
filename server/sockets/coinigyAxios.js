import Socket from '../sockets/sockets';
import axios from 'axios';

const coinigyAxios = axios.create({
  baseURL: 'https://api.coinigy.com/api/v1/',
  headers: {
    'Content-Type': 'application/json',
    'X-API-KEY': process.env.COINIGY_API_KEY,
    'X-API-SECRET': process.env.COINIGY_API_SECRET,
  },
});

const coinigySortExchangeData = () => {
  const { exchange } = this.state;
  // Gets list of markets for exchange, sorts them into object with baseCoins and tradeCoins, mapping connections
  coinigyAxios
    .post('/markets', {
      exchange_code: exchange,
    })
    .then((res) => {
      const coinHolder = {
        tradeCoins: {},
        baseCoins: {},
      };

      const coinConnections = res.data.data.reduce((coins, market) => {
        const [tradeCoin, baseCoin] = market.mkt_name.split('/');

        if (coins.tradeCoins[tradeCoin]) {
          coins.tradeCoins[tradeCoin].push(baseCoin);
        } else {
          coins.tradeCoins[tradeCoin] = [baseCoin];
        }

        if (coins.baseCoins[baseCoin]) {
          coins.baseCoins[baseCoin].push(tradeCoin);
        } else {
          coins.baseCoins[baseCoin] = [tradeCoin];
        }

        return coins;
      }, coinHolder);

      this.setState({ coinConnections });
    });
};

// Subscribes to coinigy ORDER channel, sets state when bids / asks change
// Called from App with coinigyUpdateOrders({}, (newState) => this.setState(newState))
const coinigyUpdateOrders = ({
  exchange, coinType, coinName, baseCoin,
}, cb) => {
  const coinOrderChannel = Socket.subscribe(`ORDER-${exchange}--${coinName}--${baseCoin}`);

  coinOrderChannel.watch((coinLiveOrders) => {
    const bids = [];
    const asks = [];

    coinLiveOrders.forEach((order) => {
      if (order.ordertype === 'Buy') {
        bids.push(order);
      } else {
        asks.unshift(order);
      }
    });

    const newState = {
      [coinType]: {
        ...this.state[coinType],
        bids,
        asks,
      },
    };

    cb(newState);
  });
};

export default coinigyAxios;

const coinigyBaseSelect = (e) => {
  const { coin1: coin1Obj, coin2: coin2Obj, exchange } = this.state;
  const coin1 = coin1Obj.name;
  const coin2 = coin2Obj.name;
  const baseCoin = e.target.value;
  const coin1Market = `${coin1}/${baseCoin}`;
  const coin2Market = `${coin2}/${baseCoin}`;
  const baseMarket = `${baseCoin}/USDT`;

  // Unsubscribe from previous data streams
  this.deactivateChannels();

  const getCoin1Data = coinigyAxios.post('/data', {
    exchange_code: exchange,
    exchange_market: coin1Market,
    type: 'all',
  });

  const getCoin2Data = coinigyAxios.post('/data', {
    exchange_code: exchange,
    exchange_market: coin2Market,
    type: 'all',
  });

  const getBaseInfo = coinigyAxios.post('/ticker', {
    exchange_code: exchange,
    exchange_market: baseMarket,
    type: 'all',
  });

  // Do API calls to get initial data
  Promise.all([getCoin1Data, getCoin2Data, getBaseInfo])
    .then((results) => {
      const [coin1Data, coin2Data, baseData] = results;

      const coin1Info = this.getInfoFromResponse(coin1Data);
      const coin2Info = this.getInfoFromResponse(coin2Data);
      const baseLastPrice = baseData.data.data.length
        ? parseFloat(baseData.data.data[0].last_trade)
        : null;

      // Create Channels to update data
      const coin1OrderChannel = Socket.subscribe(`ORDER-${exchange}--${coin1}--${baseCoin}`);
      const coin1TradeChannel = Socket.subscribe(`TRADE-${exchange}--${coin1}--${baseCoin}`);
      const coin2OrderChannel = Socket.subscribe(`ORDER-${exchange}--${coin2}--${baseCoin}`);
      const coin2TradeChannel = Socket.subscribe(`TRADE-${exchange}--${coin2}--${baseCoin}`);
      const baseCoinTradeChannel = Socket.subscribe(`TRADE-${exchange}--${baseCoin}--USDT`);

      coin1OrderChannel.watch((coin1LiveOrders) => {
        // console.log(coin1LiveOrders);
        const coin1Bids = [];
        const coin1Asks = [];
        // // How to get last price from orders?
        // let coin1Last;
        coin1LiveOrders.forEach((order) => {
          if (order.ordertype === 'Buy') {
            coin1Bids.push(order);
          } else {
            coin1Asks.unshift(order);
          }
        });
        this.setState({
          coin1: {
            ...this.state.coin1,
            bids: coin1Bids,
            asks: coin1Asks,
          },
        });
      });

      coin1TradeChannel.watch(trade =>
        this.setState({
          coin1: {
            ...this.state.coin1,
            last: trade.price,
          },
        }));

      coin2OrderChannel.watch((coin2LiveOrders) => {
        const coin2Bids = [];
        const coin2Asks = [];
        // // How to get last price from orders?
        // let coin1Last;

        coin2LiveOrders.forEach((order) => {
          if (order.ordertype === 'Buy') {
            coin2Bids.push(order);
          } else {
            coin2Asks.unshift(order);
          }
        });

        this.setState({
          coin2: {
            ...this.state.coin2,
            bids: coin2Bids,
            asks: coin2Asks,
          },
        });
      });

      coin2TradeChannel.watch((trade) => {
        // const { receivedTrades } = this.state;
        // receivedTrades.push(trade);

        this.setState({
          coin2: {
            ...this.state.coin2,
            last: trade.price,
          },
          // receivedTrades,
        });
      });

      // Only watch basecoin if not USD
      if (baseCoin !== 'USDT') {
        baseCoinTradeChannel.watch((baseCoinTrade) => {
          this.setState({
            baseCoin: {
              ...this.state.baseCoin,
              last: baseCoinTrade.price,
              updated: baseCoinTrade.time_local,
            },
          });
        });
      }

      this.setState({
        coin1: {
          ...this.state.coin1,
          orderChannel: coin1OrderChannel,
          bids: coin1Info.bids,
          asks: coin1Info.asks,
          last: coin1Info.last,
        },
        coin2: {
          ...this.state.coin2,
          orderChannel: coin2OrderChannel,
          bids: coin2Info.bids,
          asks: coin2Info.asks,
          last: coin2Info.last,
        },
        baseCoin: {
          ...this.state.baseCoin,
          name: baseCoin,
          tradeChannel: baseCoinTradeChannel,
          last: baseCoin === 'USDT' ? 1 : baseLastPrice,
        },
        resetOrderForm: false,
      });
    })
    .catch(err =>
      console.log(`Error using coin1: ${coin1}, coin2: ${coin2}, and baseCoin: ${baseCoin}; ${err}`));
};
