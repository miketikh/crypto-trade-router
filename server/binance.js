require('dotenv').config();
const Promise = require('bluebird');
const binance = Promise.promisifyAll(require('node-binance-api'));

binance.options({
  APIKEY: process.env.BINANCE_API_KEY,
  APISECRET: process.env.BINANCE_API_SECRET,
  useServerTime: true, // If you get timestamp errors, synchronize to server time at startup
  // test: true, // If you want to use sandbox mode where orders are simulated
  verbose: true,
  reconnect: false,
});

/**
 * Takes Binance market symbol, splits into two coins being traded
 *
 * @param {string} symbol = Binance market symbol, ex: 'BTCETH'
 * @return {array} coins = Two coins from symbol, the tradeCoin and its baseCoin
 */
const splitBinanceSymbol = (symbol) => {
  const baseCurrencies = /(\w+)((USDT)|(ETH)|(BTC)|(BNB))$/g;
  const [fullSymbol, tradeCoin, baseCoin] = baseCurrencies.exec(symbol);

  return [tradeCoin, baseCoin];
};

// GET PRICE FOR COIN
const getBinancePrice = async (symbol) => {
  const priceObj = await binance.pricesAsync(symbol);
  return parseFloat(priceObj[symbol]);
};

// GET INITIAL PRICES
// Returns object with prices for sellCoin, buyCoin, and baseCoin if not USDT
const getBinancePrices = async ([sellCoinSymbol, buyCoinSymbol, baseCoinSymbol]) => {
  const sellCoinPrice = await binance.pricesAsync(sellCoinSymbol);
  const buyCoinPrice = await binance.pricesAsync(buyCoinSymbol);
  // No symbol given if USDT used
  const baseCoinPrice = baseCoinSymbol ? await binance.pricesAsync(baseCoinSymbol) : {};

  return { ...sellCoinPrice, ...buyCoinPrice, ...baseCoinPrice };
};

// Formats bids / asks from book ticker (1 time fetch)
const formatBookTicker = (bidAsk) => {
  const {
    symbol, bidPrice, bidQty, askPrice, askQty,
  } = bidAsk;

  return {
    [symbol]: {
      bid: parseFloat(bidPrice),
      ask: parseFloat(askPrice),
    },
  };
};

// Formats bid/ask Object received from binance into ordered array of objects
// TODO: expensive operation? Maybe cut?
const formatBinanceOrder = (orders) => {
  const formattedOrders = [];

  orders.forEach(([price, quantity]) => {
    const order = {
      price,
      quantity,
      total: price * quantity,
    };
    formattedOrders.push(order);
  });

  return formattedOrders;
};

// GET INITIAL BIDS / ASKS
const getBinanceBidAsk = async ([sellCoinSymbol, buyCoinSymbol]) => {
  const sellCoinBidAsk = await binance.bookTickersAsync(sellCoinSymbol);
  const buyCoinBidAsk = await binance.bookTickersAsync(buyCoinSymbol);

  const sellCoinBidAskFormatted = formatBookTicker(sellCoinBidAsk);
  const buyCoinBidAskFormatted = formatBookTicker(buyCoinBidAsk);

  return { ...sellCoinBidAskFormatted, ...buyCoinBidAskFormatted };
};

// GET ORDERS
const getBinanceOrders = async (symbol) => {
  const depth = await binance.depthAsync(symbol);
  const bids = binance.array(binance.sortBids(depth.bids));
  const asks = binance.array(binance.sortAsks(depth.asks));

  return { bids, asks };
};

// SUBSCRIBE TO ORDERS
const getBinanceSocketOrders = async (symbol, cb) => {
  binance.websockets.depthCache(symbol, (symbol, depth) => {
    // const formattedOrders = formatOrders({ symbol, depth });
    // cb(formattedOrders);

    // Converts each object to array, can be expensive with many streams!
    const bids = binance.array(binance.sortBids(depth.bids));
    const asks = binance.array(binance.sortAsks(depth.asks));

    cb({ bids, asks });
  });
};

// CALCULATE SELL DATA
// Calculates how many bids are in the book and what price you'd get
const calculateSellData = ({ bids, shares }) => {
  let sharesSellable = 0;
  let sharesLeftToFill = shares;
  let bidIndex = 0;
  let saleTotal;
  let averageSellPrice = 0;

  bids = formatBinanceOrder(bids);

  // Go through bids, take each order until shares filled or bids run out
  while (sharesLeftToFill > 0) {
    // Break loop if no more bids left to process
    if (!bids[bidIndex]) {
      break;
    }

    const { price, quantity: sharesAtPrice } = bids[bidIndex];
    const sharesUsed = sharesAtPrice >= sharesLeftToFill ? sharesLeftToFill : sharesAtPrice;

    sharesSellable += sharesUsed;
    sharesLeftToFill -= sharesUsed;
    averageSellPrice += sharesUsed * price;
    bidIndex++;
  }

  // For some reason, rounding error on sharesSellable after equation
  // Will fill all the shares, but sharesSellable still be off by .0000001 or something
  if (sharesLeftToFill === 0) {
    sharesSellable = shares;
  }

  // If max shares hit, returns shares toFixed decimal place so it doesn't keep adding .0001
  // if (sharesSellable < sharesEntered) {
  // }
  averageSellPrice /= sharesSellable;
  // If 0 shares entered, averageSellPrice = first Bid
  if (!averageSellPrice) averageSellPrice = bids[0].price;
  saleTotal = sharesSellable * averageSellPrice;
  // Subtracts .1% commission from total
  saleTotal -= saleTotal * 0.001;

  // console.log(
  //   `shares: ${shares}, sharesSellable: ${sharesSellable}, averageSellPrice: ${averageSellPrice}, saleTotal: ${saleTotal}`
  // );

  return { sharesSellable, averageSellPrice, saleTotal };
};

const calculateBuyData = ({ buyAmount, asks }) => {
  let amountSpent = 0;
  let amountLeftToSpend = buyAmount;
  let sharesBuyable = 0;
  let askIndex = 0;
  let averageBuyPrice = 0.0;

  while (amountLeftToSpend > 0) {
    if (!asks[askIndex]) {
      break;
    }

    const [price, quantity] = asks[askIndex];
    const amountOfferedAtPrice = price * quantity;

    // Purchases either the amount offered or whatever is left at current ask
    const purchaseAtPrice =
      amountLeftToSpend >= amountOfferedAtPrice ? amountOfferedAtPrice : amountLeftToSpend;

    sharesBuyable += purchaseAtPrice / price;
    amountSpent += purchaseAtPrice;
    amountLeftToSpend -= purchaseAtPrice;
    averageBuyPrice += purchaseAtPrice;
    askIndex++;
  }

  averageBuyPrice /= sharesBuyable;
  // Handles case with 0 shares
  if (isNaN(averageBuyPrice)) {
    averageBuyPrice = asks[0][0];
  }

  // Adds 1% commission to amount spent
  amountSpent += amountSpent * 0.001;

  return { amountSpent, sharesBuyable, averageBuyPrice };
};

// Calls ticker to get every symbol, splits them into pairs, returns pairs list
const getBinancePairs = async () => {
  try {
    const ticker = await binance.pricesAsync();
    const pairs = [];

    Object.entries(ticker).forEach(([symbol]) => {
      const [tradeCoin, baseCoin] = splitBinanceSymbol(symbol);

      pairs.push([tradeCoin, baseCoin]);
    });

    return pairs;
  } catch (error) {
    console.log(error);
  }
};

// AGGREGATE FILL INFO
// Uses trade fills array to calculate average price and total qty / commission
const aggregateBinanceFills = (fills) => {
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

// // USER DATA TRADE UPDATE - Check why not working!
// // The only time the user data (account balances) and order execution websockets will fire, is if you create or cancel an order, or an order gets filled or partially filled
// function balance_update(data) {
//   console.log('Balance Update');
//   for (let obj of data.B) {
//     let { a: asset, f: available, l: onOrder } = obj;
//     if (available == '0.00000000') continue;
//     console.log(
//       asset + '\tavailable: ' + available + ' (' + onOrder + ' on order)'
//     );
//   }
// }

// function execution_update(data) {
//   console.log('execution update');
//   let {
//     x: executionType,
//     s: symbol,
//     p: price,
//     q: quantity,
//     S: side,
//     o: orderType,
//     i: orderId,
//     X: orderStatus
//   } = data;
//   if (executionType == 'NEW') {
//     if (orderStatus == 'REJECTED') {
//       console.log('Order Failed! Reason: ' + data.r);
//     }
//     console.log(
//       symbol +
//         ' ' +
//         side +
//         ' ' +
//         orderType +
//         ' ORDER #' +
//         orderId +
//         ' (' +
//         orderStatus +
//         ')'
//     );
//     console.log('..price: ' + price + ', quantity: ' + quantity);
//     return;
//   }
//   //NEW, CANCELED, REPLACED, REJECTED, TRADE, EXPIRED
//   console.log(
//     symbol +
//       '\t' +
//       side +
//       ' ' +
//       executionType +
//       ' ' +
//       orderType +
//       ' ORDER #' +
//       orderId
//   );
// }

// binance.websockets.userData(balance_update, execution_update);

// binance.balance((err, balances) => {
//   Object.entries(balances).forEach(([symbol, balance]) => {
//     if (balance.available !== '0.00000000') {
//       console.log(`${symbol}: ${balance.available}`);
//     }
//   });
// });

/**
 * Returns minimum steps for coins using the sellCoinMarket and buyCoinMarket
 *
 * @param {object} markets = Object containing sellCoinMarket (ex: 'BTCETH') and buyCoinMarket
 *
 * @return {object} minSteps = Object with minStep defined for sellCoin and buyCoin
 */
const getBinanceSteps = async ({ sellCoinMarket, buyCoinMarket }) => {
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
  getBinancePairs,
  getBinancePrice,
  getBinancePrices,
  getBinanceBidAsk,
  getBinanceOrders,
  getBinanceSocketOrders,
  calculateSellData,
  calculateBuyData,
  binanceBuyMarket: binance.marketBuyAsync,
  binanceSellMarket: binance.marketSellAsync,
  getBinanceSteps,
  aggregateBinanceFills,
};
