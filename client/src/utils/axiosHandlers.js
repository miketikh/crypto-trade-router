import axios from 'axios';

const server = axios.create({
  baseURL: process.env.SERVER_URL || 'http://localhost:4001',
});

/**
 * Maps all connections between coins from binance, called on load
 *  Creates connectionHolder Object which holds:
 *    tradeCoins: Object with all coins connected to a tradeCoin. Ex: 'REQ': ['BAT', 'NEO', 'LTC]
 *    baseCoins: Object with all coins connected to a baseCoin. Ex: 'BTC': ['REQ', 'NEO', 'LTC']
 */
const mapCoinConnections = (cb) => {
  server.get('/markets/binance').then((res) => {
    const markets = res.data;

    const coinConnections = markets.reduce(
      (coins, [tradeCoin, baseCoin]) => {
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
      },
      {
        tradeCoins: {},
        baseCoins: {},
      },
    );

    cb(coinConnections);
  });
};

/**
 * Gets minimum steps for coins via AJAX, adds to coin object
 *
 * @param {Object} coins - cointains sellCoin and buyCoin objects
 *
 * @return {Object} coins - coins with minStep attached
 */
const addMinSteps = ({ sellCoin, buyCoin }) =>
  server
    .get('/coins/minsteps', {
      params: {
        sellCoinMarket: sellCoin.market,
        buyCoinMarket: buyCoin.market,
      },
    })
    .then((res) => {
      const { sellCoin: sellCoinMin, buyCoin: buyCoinMin } = res.data;
      const coinsWithMin = {
        sellCoin: {
          ...sellCoin,
          ...sellCoinMin,
        },
        buyCoin: {
          ...buyCoin,
          ...buyCoinMin,
        },
      };
      return coinsWithMin;
    })
    .catch(err => console.log(err));

/**
 * Gets balance for coin
 * @param {string} coinName - Name of coin
 * @param {function} cb - callback on results
 */
const getCoinBalance = (coinName, cb) => {
  server
    .get(`/balance/${coinName}`)
    .then((res) => {
      const balance = res.data;
      cb(balance);
    })
    .catch(err => console.log(err));
};

/**
 * Get last prices
 * @param {Object} coinSymbols - Market symbols coins sellCoin, buyCoin, and baseCoin
 * @param {function} cb - callback on results
 */
const getLastPrices = ({ sellCoinSymbol, buyCoinSymbol, baseCoinSymbol }, cb) => {
  server
    .get('/coins/prices', {
      params: {
        sellCoinSymbol,
        buyCoinSymbol,
        baseCoinSymbol,
      },
    })
    .then((res) => {
      const prices = res.data;
      cb(prices);
    });
};

export { mapCoinConnections, addMinSteps, getCoinBalance, getLastPrices };
