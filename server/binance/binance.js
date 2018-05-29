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
  const priceObj = await binance.pricesAsync(symbol);
  return parseFloat(priceObj[symbol]);
};

// GET ORDERS
const getOrdersBinance = async (symbol) => {
  const depth = await binance.depthAsync(symbol);
  const bids = binance.array(binance.sortBids(depth.bids));
  const asks = binance.array(binance.sortAsks(depth.asks));

  return { bids, asks };
};

// SUBSCRIBE TO ORDERS
const getSocketOrdersBinance = async (symbol, cb) => {
  binance.websockets.depthCache(symbol, (symbol, depth) => {
    // const formattedOrders = formatOrders({ symbol, depth });
    // cb(formattedOrders);

    // Converts each object to array, can be expensive with many streams!
    const bids = binance.array(binance.sortBids(depth.bids));
    const asks = binance.array(binance.sortAsks(depth.asks));

    cb({ bids, asks });
  });
};

// Calls ticker to get every symbol, splits them into pairs, returns pairs list
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
