require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const Promise = require('bluebird');
const path = require('path');
const jwt = require('jsonwebtoken');
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

const SERVER_SETTINGS = {
  loggedInUser: null,
};

// // AUTHENTICATION MIDDLEWARE - Disable for local use
// app.use((req, res, next) => {
//   const { token } = req.params;
//   const { loggedInUser } = SERVER_SETTINGS;

//   try {
//     const { id, login } = jwt.verify(token, process.env.JWT_SECRET)

//     // Handle User Logout
//     if (!login && id === loggedInUser) {
//       SERVER_SETTINGS.loggedInUser = null;
//       // Redirect to login
//     }
//     // Handle User Login
//     if (login) {
//         if (loggedInUser && loggedInUser === id) {
//           // Already logged in!
//           // When would this happen?
//         } else if (loggedInUser && loggedInUser !== id) {
//           // Someone else is logged In
//           // Error
//         } else {
//           SERVER_SETTINGS.loggedInUser = id;
//           // Fetch user info from db
//           // Initialize binance with user info
//           // Next
//         }
//     }

//   } catch (err) {
//     console.log('could not authenticate');
//     //redirect to login
//   }
// })

// GET BALANCE FOR COIN
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
 * Get last prices for sellCoin, buyCoin, and baseCoin
 * @param {Object} query - req.query containing sellCoinSymbol, buyCoinSymbol, and baseCoinSymbol
 *
 * @return {object} lastPrices - Object of with sellCoinLast, buyCoinLast, and baseCoinLast and numerical last prices
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

// GET ALL AVAILABLE MARKETS FOR EXCHANGE
app.get('/markets/:exchange', async (req, res) => {
  const { exchange } = req.params;

  if (exchange === 'binance') {
    const pairs = await getPairsBinance();
    res.send(pairs);
  } else {
    res.status(404).send();
  }
});

// GET COIN MINIMUM STEPS
// Takes two symbols, sends back { sellCoin: { minStep }, buyCoin: {...} }
app.get('/coins/minsteps', async (req, res) => {
  const { sellCoinMarket, buyCoinMarket } = req.params;

  const minSteps = await getMinStepsBinance({
    sellCoinMarket,
    buyCoinMarket,
  });

  res.send(minSteps);
});

// GET HOMEPAGE
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'), (err) => {
    console.log('error', err);
  });
});

// TRADE COINS
// TODO: Authentication for trade? Allow trades based on shares or amount
app.post('/trade', async (req, res) => {
  const {
    sellCoin, buyCoin, shares, bridgeCoins, smartRouting,
  } = req.body;
  const flags = { type: 'MARKET', newOrderRespType: 'FULL' };

  try {
    let sellCoinSymbol,
      buyCoinSymbol,
      averageBuyPrice,
      sharesBuyable,
      bestRoute;

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
      ({ market: buyCoinSymbol, averageBuyPrice, sharesBuyable } = bestRoute.buyCoin);
      // If no smartRouting, use provided routes
    } else {
      ({ market: sellCoinSymbol } = sellCoin);
      ({ market: buyCoinSymbol, averageBuyPrice, sharesBuyable } = buyCoin);
    }

    // Get Minimum steps (trading intervals) for coins
    const stepsObj = await getMinStepsBinance({
      sellCoinMarket: sellCoinSymbol,
      buyCoinMarket: buyCoinSymbol,
    });
    const buyCoinMinStep = stepsObj.buyCoin.minStep;

    // Sell sellCoin
    const sellRes = await sellMarketBinance(sellCoinSymbol, shares, flags);

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
    const unBuyableShares = sharesBuyable % buyCoinMinStep;
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

    if (smartRouting) {
      const USDSavings = await calculateUSDSavings({ bestRoute });
      const totalUSDSavings = numberToFixed(USDSavings * buyQuantity, 4);
      savings = {
        USDSavings,
        totalUSDSavings,
        bestBaseCoin: bestRoute.baseCoin.name,
        worstBaseCoin: bestRoute.worstRoute.baseCoin,
      };
    }

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
    console.log('error trading!');
    console.log(err.body);
    res.status(404).end(err);
  }
});

io.on('connection', (socket) => {
  console.log('New client connected');

  // GETS BEST ROUTE
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

  // // Initial Bid / Ask from ticker
  // // Takes array of coin symbols, returns object { symbol: bid: price, ask: price }
  // socket.on('getInitialBidAsk', async (symbols) => {
  //   const bidAsk = await getBidAskBinance(symbols);
  //   io.sockets.emit('getInitialBidAsk', bidAsk);
  // });

  // SHARES - create closure?
  let SHARES_FOR_ORDER_UPDATES = 0;

  // Subscribe to Orders
  socket.on('subscribeToOrders', async ({ sellCoin, buyCoin }) => {
    const { market: sellCoinSymbol } = sellCoin;
    const { market: buyCoinSymbol } = buyCoin;
    let saleProceeds = 0;

    try {
      /**
       * Subscribe to Sell Coin (sellCoin) order updates
       *   When sellCoin order book changes, recalculates the sale information (shares possible, price, total)
       *   Also gets the newest bid / ask info, sends both to client
       *
       * @param {string} sellCoinSymbol - Market of sellCoin (coin being sold). ex: 'ETCBTC'
       *
       * @returns {object}
       */
      getSocketOrdersBinance(sellCoinSymbol, (sellCoinOrders) => {
        const { bids, asks } = sellCoinOrders;
        const { sharesSellable, averageSellPrice, saleTotal } = calculateSellData({
          bids,
          shares: SHARES_FOR_ORDER_UPDATES,
        });

        saleProceeds = saleTotal;

        // Bids / asks format array = [ [price, quantity], [] ]
        const bid = bids[0][0];
        const ask = asks[0][0];

        const sellCoinInfo = {
          market: sellCoinSymbol,
          bid,
          ask,
          averageSellPrice,
          sharesSellable,
        };
        // console.log(moment().format('LTS'));
        // console.log('sellCoin: ', sellCoinInfo);

        io.sockets.emit('updateSellCoinInfo', sellCoinInfo);
      });

      // COIN_2 INFO (coin being bought)
      // Whenever buyCoin updated, uses saleTotal to calculate sharesToBuy
      getSocketOrdersBinance(buyCoinSymbol, (buyCoinOrders) => {
        const { bids, asks } = buyCoinOrders;
        const { amountSpent, sharesBuyable, averageBuyPrice } = calculateBuyData({
          asks,
          buyAmount: saleProceeds,
        });

        // Bids / asks format array = [ [price, quantity], [] ]
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

        const adjustedBuyInfo = adjustBuyCoin(buyCoinInfo);

        // console.log(moment().format('LTS'));
        // console.log('buyCoin: ', adjustedBuyInfo);

        io.sockets.emit('updateBuyCoinInfo', adjustedBuyInfo);
      });
    } catch (e) {
      console.log(e);
      throw e;
    }
  });

  // Update user shares
  socket.on('sharesUpdated', (sharesEntered) => {
    SHARES_FOR_ORDER_UPDATES = sharesEntered;
  });

  // SUBSCRIBE TO TRADE INFO
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
