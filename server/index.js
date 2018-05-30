require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const Promise = require('bluebird');
const path = require('path');
const {
  binance,
  getPairsBinance,
  getPriceBinance,
  getSocketOrdersBinance,
  buyMarketBinance,
  sellMarketBinance,
  getMinStepsBinance,
  aggregateFilledTradesBinance,
} = require('./binance/binance');
const { getBestRoute } = require('./binance/bestRoute');
const {
  numberToFixed,
  adjustBuyCoin,
  calculateSellData,
  calculateBuyData,
  calculateUSDSavings,
} = require('./utils/helpers');

// ****** Begin Server ******** //

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { transport: ['websocket'] });

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(`${__dirname}/../client/build`));

/* ========== SERVER ROUTES ===========
 * GET /
 *  - Returns homepage
 * GET /balance/:coin
 *  - Returns balance available in Binance
 * GET /coins/prices
 *  - Returns prices for buyCoin, sellCoin, and baseCoin
 * GET /markets/:exchange
 *  - Returns all pairs, currently :exchange must be binance
 * GET /coins/minsteps
 *  - Returns minSteps (minimum trading quantity) for buyCoin and sellCoin
 * POST /trade
 *  - Makes a trade using given info, returns trade information
 * ====================================
 */

/**
 * GET / - Homepage
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'), (err) => {
    console.log('error', err);
  });
});

/**
 * GET /balance/:coin
 *  Return coin's balance
 * @param {Object} req param object with:
 * @param {string} coin - Name of coin
 *
 * @return {number} Balance - Account balance of coin at binance
 */
app.get('/balance/:coin', (req, res) => {
  const { coin } = req.params;

  binance.balance((err, balances) => {
    if (err) {
      res.status(404).send();
    } else {
      res.send(balances[coin].available);
    }
  });
});

/**
 * GET /coins/prices
 *  Gets last prices for sellCoin, buyCoin, and baseCoin
 * @param {Object} req query containing:
 * @param {string} sellCoinSymbol
 * @param {string} buyCoinSymbole
 * @param {string} baseCoinSymbol
 *
 * @return {object} lastPrices - Object with sellCoinLast, buyCoinLast, and baseCoinLast and numerical last prices
 */
app.get('/coins/prices', (req, res) => {
  const { sellCoinSymbol, buyCoinSymbol, baseCoinSymbol } = req.query;
  const sellCoinPromise = getPriceBinance(sellCoinSymbol);
  const buyCoinPromise = getPriceBinance(buyCoinSymbol);
  const baseCoinPromise = baseCoinSymbol !== 'USDTUSDT' ? getPriceBinance(baseCoinSymbol) : 1;

  Promise.all([sellCoinPromise, buyCoinPromise, baseCoinPromise]).then((prices) => {
    const [sellCoinLast, buyCoinLast, baseCoinLast] = prices;
    res.send({ sellCoinLast, buyCoinLast, baseCoinLast });
  });
});

/**
 * GET /markets/:exchange
 *  Gets all markets in exchange
 * @param {Object} req with params object containing:
 * @param {string} exchange - name of exchange (currently only binance)
 *
 * @return {array} pairs - Array containing arrays of every coin pair [ ['eth', 'btc'], [...] ]
 */
app.get('/markets/:exchange', async (req, res) => {
  const { exchange } = req.params;

  if (exchange === 'binance') {
    const pairs = await getPairsBinance();
    res.send(pairs);
  } else {
    res.status(404).send();
  }
});

/**
 * GET /coins/minsteps
 *  Gets minStep (minimum trading size) for sellCoin and buyCoin
 * @param {object} req params object with:
 * @param {string} sellCoinMarket
 * @param {string} buyCoinMarket
 *
 * @return {object} minSteps - { sellCoin: { minStep }, buyCoin: { minStep} }
 */
app.get('/coins/minsteps', async (req, res) => {
  const { sellCoinMarket, buyCoinMarket } = req.params;

  const minSteps = await getMinStepsBinance({
    sellCoinMarket,
    buyCoinMarket,
  });

  res.send(minSteps);
});

/**
 * POST /trade
 *  Trades Coins
 *  1. Gets coin symbols to trade (sell market, buy market)
 *    a. If smartRouting enabled, recalculates best route before trading
 *    b. If not, gets info from the request
 *  2. Sell sellCoin market
 *  3. Process sale
 *    a. Aggregate the sell data to get sale information
 *    b. Adjust sale amount for binance commission
 *  4. Calculate quantity to buy based on amount sold and buyCoin's minStep
 *  5. Buy buyCoin market
 *  6. Process purchase
 *    a. Aggregate Buy fill information
 *    b. Adjust fill information for commission
 *  7. Calculate savings (if smartRouting used)
 *  8. Put all trade information into object, send response
 *
 */
app.post('/trade', async (req, res) => {
  const {
    sellCoin, buyCoin, shares, bridgeCoins, smartRouting,
  } = req.body;
  const flags = { type: 'MARKET', newOrderRespType: 'FULL' };

  try {
    let sellCoinSymbol;
    let buyCoinSymbol;
    let sharesBuyable;
    let bestRoute;

    // If smartRouting is enabled, recalculate the best routes before making the trade
    if (smartRouting) {
      bestRoute = await getBestRoute({
        sellCoinName: sellCoin.name,
        buyCoinName: buyCoin.name,
        bridgeCoins,
        sharesEntered: shares,
      });

      // Get coin info from best route
      ({ market: sellCoinSymbol } = bestRoute.sellCoin);
      ({ market: buyCoinSymbol, sharesBuyable } = bestRoute.buyCoin);
    } else {
      // If no smartRouting, use provided routes
      ({ market: sellCoinSymbol } = sellCoin);
      ({ market: buyCoinSymbol, sharesBuyable } = buyCoin);
    }

    // Sell sellCoin
    const sellRes = await sellMarketBinance(sellCoinSymbol, shares, flags);

    console.log(sellRes);

    // Sum up sale info to find purchase amount

    // a. Aggregates sell fills to get average price, total qty, and total commission
    const {
      price: sellPrice,
      qty: sellQuantity,
      commission: sellCommission,
    } = aggregateFilledTradesBinance(sellRes.fills);

    // b. Uses commission asset to determine trade fee and total amount
    const { commissionAsset: sellCommissionAsset, tradeId: sellTradeId } = sellRes.fills[0];

    const sellCommissionDecimal = sellCommissionAsset === 'BNB' ? 0.00005 : 0.0001;
    const sellAmount = sellQuantity * sellPrice;
    const sellTotal = sellAmount - sellAmount * sellCommissionDecimal;

    // c. Adjusts sharesBuyable based on minStep
    const unBuyableShares = sharesBuyable % buyCoin.minStep;
    const actualSharesBuyable = sharesBuyable - unBuyableShares;
    const quantityToBuy = actualSharesBuyable;

    // Buy BuyCoin
    const buyRes = await buyMarketBinance(buyCoinSymbol, quantityToBuy, flags);

    const {
      price: buyPrice,
      qty: buyQuantity,
      commission: buyCommission,
    } = aggregateFilledTradesBinance(buyRes.fills);

    const { commissionAsset: buyCommissionAsset, tradeId: buyTradeId } = buyRes.fills[0];

    const buyCommissionDecimal = buyCommissionAsset === 'BNB' ? 0.00005 : 0.0001;
    const buyAmount = buyQuantity * buyPrice;
    const buyTotal = buyAmount + buyAmount * buyCommissionDecimal;

    // Calculate trade savings, if smartRouting used
    let savings;
    console.log('calculating savings');

    // if (smartRouting) {
    //   console.log('calculat USD Sacings');
    //   const USDSavings = await calculateUSDSavings({ bestRoute });
    //   console.log('calculated: ', USDSavings);
    //   const totalUSDSavings = numberToFixed(USDSavings * buyQuantity, 4);
    //   console.log('total: ', totalUSDSavings);
    //   savings = {
    //     USDSavings,
    //     totalUSDSavings,
    //     bestBaseCoin: bestRoute.baseCoin.name,
    //     worstBaseCoin: bestRoute.worstRoute.baseCoin,
    //   };
    // }

    console.log('savings calculated');

    // Creates Sale and Purchase objects with trade information
    const sale = {
      market: sellRes.symbol,
      price: sellPrice,
      quantity: sellQuantity,
      commission: sellCommission,
      commissionAsset: sellCommissionAsset,
      total: sellTotal,
      tradeId: sellTradeId,
    };

    const purchase = {
      market: buyRes.symbol,
      price: buyPrice,
      quantity: buyQuantity,
      commission: buyCommission,
      commissionAsset: buyCommissionAsset,
      total: buyTotal,
      tradeId: buyTradeId,
    };

    const trade = {
      sale,
      purchase,
      savings,
    };

    res.send(trade);
    res.end();
  } catch (err) {
    console.log('error trading: ', err.body);
    res.status(404).end(err);
  }
});

/* =============== SOCKETS ==============
 * ON getBestRoute
 *  - getBestRoute for given coins
 *  - EMIT getBestRoute
 * ON subscribeToOrders
 *  -  Subscribe buyCoin and sellCoin to order book updates
 *  - EMIT 'updateBuyCoinInfo' and 'updateSellCoinInfo' on respective updates
 * ON sharesUpdate
 *  - Update SOCKET_VARIABLES.shares variable used for server calculations
 * ON subscribeToTrades
 *  - Subscribe coins to trade updates
 *  - On any update, EMIT updateLast
 * ON terminatePriorSockets
 *  - Close all current socket connections
 * =======================================
 */

io.on('connection', (socket) => {
  console.log('New client connected');

  const SOCKET_VARIABLES = {
    // Stores sharesEntered from client to use for price calculations
    shares: 0,
    // Amount received from selling. Recalculated each time sale order book changes
    saleProceeds: 0,
  };

  /**
   * SOCKET - Gets Best Route, sends back to client
   * @param {Object} Object containing:
   * @param {string} sellCoinName
   * @param {string} buyCoinName
   * @param {array} bridgeCoins - baseCoins that connect sellCoin and buyCoin
   * @param {number} sharesEntered
   *
   * @return {Object} object with best route information
   */
  socket.on('getBestRoute', async ({
    sellCoinName, buyCoinName, bridgeCoins, sharesEntered,
  }) => {
    const bestRoute = await getBestRoute({
      sellCoinName,
      buyCoinName,
      bridgeCoins,
      sharesEntered,
    });
    socket.emit('getBestRoute', bestRoute);
  });

  /**
   * SOCKET - Subscribe to order book changes for sellCoin and buyCoin
   * @param {Object} - sellCoin containing market
   * @param {Object} - buyCoin containing market
   */
  socket.on('subscribeToOrders', async ({ sellCoin, buyCoin }) => {
    const { market: sellCoinSymbol } = sellCoin;
    const { market: buyCoinSymbol } = buyCoin;

    try {
      /**
       * SOCKET - Subscribe to Sell Coin (sellCoin) updates
       *   When sellCoin order book changes, recalculates the sale information (shares possible, price, total)
       *   Also gets the newest bid / ask info, sends both to client
       * @param {string} sellCoinSymbol - Market of sellCoin (coin being sold). ex: 'ETCBTC'
       *
       * @returns {object} updated sellCoinInfo
       */
      getSocketOrdersBinance(sellCoinSymbol, (sellCoinOrders) => {
        const { bids, asks } = sellCoinOrders;
        const { sharesSellable, averageSellPrice, saleTotal } = calculateSellData({
          bids,
          shares: SOCKET_VARIABLES.shares,
        });

        SOCKET_VARIABLES.saleProceeds = saleTotal;

        // Gets price from highest bid and lowest ask
        const bid = bids[0][0];
        const ask = asks[0][0];

        const sellCoinInfo = {
          market: sellCoinSymbol,
          bid,
          ask,
          averageSellPrice,
          sharesSellable,
        };

        io.sockets.emit('updateSellCoinInfo', sellCoinInfo);
      });

      /**
       * SOCKET - Subscribe to buyCoin order book updates
       *  When buyCoin order book changes, uses last 'saleProceeds' to calculate amount buyable
       *  Sends new buyCoin information to client
       * @param {string} buyCoinSymbol
       *
       * @return {Object} updated buyCoinInfo
       */
      getSocketOrdersBinance(buyCoinSymbol, (buyCoinOrders) => {
        const { bids, asks } = buyCoinOrders;
        const { amountSpent, sharesBuyable, averageBuyPrice } = calculateBuyData({
          asks,
          buyAmount: SOCKET_VARIABLES.saleProceeds,
        });

        // Gets price from highest bid and lowest ask
        const bid = bids[0][0];
        const ask = asks[0][0];

        const buyCoinInfo = {
          ...buyCoin,
          bid,
          ask,
          averageBuyPrice,
          sharesBuyable,
          amountBuyable: amountSpent,
        };

        // Adjusts amount buyable based on coin's minStep
        const adjustedBuyInfo = adjustBuyCoin(buyCoinInfo);

        io.sockets.emit('updateBuyCoinInfo', adjustedBuyInfo);
      });
    } catch (e) {
      console.log(e);
      throw e;
    }
  });

  /**
   * SOCKET - Update shares entered
   *  Updates SOCKET_VARIABLES.shares on server to match shareEntered on the client side
   *  That way whenever an order book updates, it knows how many shares to use for the calculation
   * @param {number} sharesEntered
   */
  socket.on('sharesUpdated', (sharesEntered) => {
    SOCKET_VARIABLES.shares = sharesEntered;
  });

  /**
   * SOCKET - Updates coins last prices based on trades
   *  For baseCoin last prices, updates prices vs dollar - ex 'BTCUSDT'
   * @param {Object} coins - Object containing {sellCoin: {market}, buyCoin, baseCoin}
   *
   * @return {Object} tradeInfo - Emits object containing { market: , last: }
   */
  socket.on('subscribeToTrades', (coins) => {
    // For each symbol, create new subscription to updates
    Object.entries(coins).forEach(([coin, coinInfo]) => {
      const { market } = coinInfo;

      if (market !== 'USDTUSDT') {
        binance.websockets.trades(market, (trades) => {
          const { p: last } = trades;
          const tradeInfo = {
            market,
            last,
          };
          socket.emit('updateLast', tradeInfo);
        });
      }
    });
  });

  /**
   * SOCKET - Closes all existing sockets
   */
  socket.on('terminatePriorSockets', () => {
    const endpoints = binance.websockets.subscriptions();
    for (const endpoint in endpoints) {
      console.log(endpoint);
      binance.websockets.terminate(endpoint);
    }
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

const port = process.env.PORT || 4001;
server.listen(port, () => console.log(`Listening on port ${port}`));
