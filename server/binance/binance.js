require('dotenv').config();
const Promise = require('bluebird');
const binance = Promise.promisifyAll(require('node-binance-api'));
const { splitMarketSymbol } = require('../utils/helpers');

// ********** CONFIGURE BINANCE *********** /

binance.options({
  APIKEY: process.env.BINANCE_API_KEY,
  APISECRET: process.env.BINANCE_API_SECRET,
  useServerTime: true, // If you get timestamp errors, synchronize to server time at startup
  // test: true, // If you want to use sandbox mode where orders are simulated
  verbose: true,
  reconnect: false,
});

/**
 * Gets price for a market
 * @param {string} symbol - Coin market like 'BTCETH'
 *
 * @return {number} Price (float)
 */
const getPriceBinance = async (symbol) => {
  if (symbol === 'USDTUSDT') return 1;

  const priceObj = await binance.pricesAsync(symbol);
  return parseFloat(priceObj[symbol]);
};

/**
 * Gets order books for coin
 *  Converts bids/asks from Object to an array, then sorts them
 * @param {string} symbol
 *
 * @return {Object} - Object containing bids and asks arrays for coin
 */
const getOrdersBinance = async (symbol) => {
  const depth = await binance.depthAsync(symbol);
  const bids = binance.array(binance.sortBids(depth.bids));
  const asks = binance.array(binance.sortAsks(depth.asks));

  return { bids, asks };
};

/**
 * Subscribes to order book socket for updates
 *  Whenever receiving orders, converts bids and asks to array and sorts them
 * @param {string} symbol
 * @param {function} cb
 *
 * @return {null} Performs cb on new bids / asks
 */
const getSocketOrdersBinance = async (symbol, cb) => {
  binance.websockets.depthCache(symbol, (symbol, depth) => {
    // Converts each object to array and sorts each time, can be expensive with many streams!
    // Better way?
    const bids = binance.array(binance.sortBids(depth.bids));
    const asks = binance.array(binance.sortAsks(depth.asks));

    cb({ bids, asks });
  });
};

/**
 * Gets every pair existing on Binance
 *  Calls 'ticker' to get every market
 *  Splits every market into two coins
 *
 * @return {Array} pairs - Array containing every pair - [['BTC', 'LTC'], [], ...]
 */
const getPairsBinance = async () => {
  try {
    const ticker = await binance.pricesAsync();
    const pairs = [];

    Object.entries(ticker).forEach(([symbol]) => {
      const [tradeCoin, baseCoin] = splitMarketSymbol(symbol);

      pairs.push([tradeCoin, baseCoin]);
    });

    return pairs;
  } catch (error) {
    console.log(error);
  }
};

// AGGREGATE FILL INFO
// Uses trade fills array to calculate average price and total qty / commission
/**
 * Aggregates all 'fills' information after a trade to get the totals
 *  Example: If you sell 1000 shares, the information might be in several fills (100 @ $1, 200 @ $1.25, etc)
 * @param {Arrray} fills
 *
 * @return {Object} Object containing total price, quantity, and commission
 */
const aggregateFilledTradesBinance = (fills) => {
  let price = 0;
  let qty = 0;
  let commission = 0;

  fills.forEach((fill) => {
    const fillPrice = parseFloat(fill.price);
    const fillQty = parseFloat(fill.qty);
    const fillCommission = parseFloat(fill.commission);

    price += fillPrice * fillQty;
    qty += fillQty;
    commission += fillCommission;
  });

  price /= qty;

  return {
    price,
    qty,
    commission,
  };
};

/**
 * Returns minimum steps for coins using the sellCoinMarket and buyCoinMarket
 *
 * @param {object} markets = Object containing sellCoinMarket (ex: 'BTCETH') and buyCoinMarket
 *
 * @return {object} minSteps = Object with minStep defined for sellCoin and buyCoin
 */
const getMinStepsBinance = async ({ sellCoinMarket, buyCoinMarket }) => {
  try {
    const exchangeInfo = await binance.exchangeInfoAsync();
    const filterInfo = {
      sellCoin: {
        minStep: 0,
      },
      buyCoin: {
        minStep: 0,
      },
    };

    for (const market of exchangeInfo.symbols) {
      if (market.symbol === sellCoinMarket) {
        for (const filter of market.filters) {
          if (filter.filterType === 'LOT_SIZE') {
            filterInfo.sellCoin.minStep = parseFloat(filter.stepSize);
          }
        }
      } else if (market.symbol === buyCoinMarket) {
        for (const filter of market.filters) {
          if (filter.filterType === 'LOT_SIZE') {
            filterInfo.buyCoin.minStep = parseFloat(filter.stepSize);
          }
        }
      }
    }

    return filterInfo;
  } catch (e) {
    console.log(e);
  }
};

module.exports = {
  binance,
  getPairsBinance,
  getPriceBinance,
  getOrdersBinance,
  getSocketOrdersBinance,
  buyMarketBinance: binance.marketBuyAsync,
  sellMarketBinance: binance.marketSellAsync,
  getMinStepsBinance,
  aggregateFilledTradesBinance,
};
