const Promise = require('bluebird');
const { getOrdersBinance, getMinStepsBinance } = require('./binance');
const { adjustBuyCoin, calculateSellData, calculateBuyData } = require('../utils/helpers');

/**
 * Creates an array of all possible routes between a sellCoin and buyCoin
 *  For each 'bridgeCoin' (baseCoin connecting buyCoin and sellCoin):
 *    1. Creates valid markets for buyCoin and sellCoin. Ex: REQ + BTC, LTC + BTC
 *    2. Gets bids for sellCoin, asks for buyCoin using markets
 *    3. Calculates the sell information and buy information for the number of shares
 *    4. Creates a ratio (sellPrice / buyPrice) used to evaluate routes
 *    5. Stores object with all relevant info in array
 * @param {Object} Object containing the following params:
 * @param {string} sellCoinName
 * @param {string} buyCoinName
 * @param {Object} bridgeCoins - array of coins connected to buyCoin and sellCoin
 * @param {number} sharesEntered - Shares to use for the calculation
 *
 * @return {array} routes - array of route objects with info on each route
 */
const createPossibleRoutes = async ({
  sellCoinName, buyCoinName, bridgeCoins, sharesEntered,
}) => {
  const routes = await Promise.map(bridgeCoins, async (baseCoin) => {
    // Create sellCoin and buyCoin symbols for each baseCoin
    const sellCoinSymbol = `${sellCoinName}${baseCoin}`;
    const buyCoinSymbol = `${buyCoinName}${baseCoin}`;

    // Get orders for each coin symbol
    const getSellCoinOrders = getOrdersBinance(sellCoinSymbol);
    const getBuyCoinOrders = getOrdersBinance(buyCoinSymbol);
    const orders = await Promise.all([getSellCoinOrders, getBuyCoinOrders]);

    const sellCoinBids = orders[0].bids;
    const buyCoinAsks = orders[1].asks;

    // Calculate buy / sell data based on sellCoin bids and buyCoin asks
    const { sharesSellable, averageSellPrice, saleTotal } = calculateSellData({
      bids: sellCoinBids,
      shares: sharesEntered,
    });

    const { amountSpent, sharesPossibleToBuy, averageBuyPrice } = calculateBuyData({
      asks: buyCoinAsks,
      buyAmount: saleTotal,
    });

    const ratio = averageSellPrice / averageBuyPrice;

    return {
      sellCoin: {
        market: sellCoinSymbol,
        averageSellPrice,
        sharesSellable,
      },
      buyCoin: {
        market: buyCoinSymbol,
        amountBuyable: amountSpent,
        sharesBuyable: sharesPossibleToBuy,
        averageBuyPrice,
      },
      baseCoin: {
        name: baseCoin,
        market: `${baseCoin}USDT`,
      },
      ratio,
    };
  });

  return routes;
};

/**
 * Sorts routes based on:
 *  1. Liquidity: Number of shares possible to sell in the order book
 *  2. Price: If books equally liquid, sorts by price / share
 * @param {Object} routes - Contains possible routes for 2 coins
 * 
 * @return {Object} sortedRoutes - Routes sorted from best to worst
 */
const sortRoutes = routes => routes.sort((route1, route2) => {
  if (route1.sellCoin.sharesSellable !== route2.sellCoin.sharesSellable) {
    return route2.sellCoin.sharesSellable - route1.sellCoin.sharesSellable;
  }
  return route2.ratio - route1.ratio;
});

/**
 * Calculates the best route between coins, return relevant bestRoute information
 *  1. Maps over bridgeCoins, creates array of every possible route
 *  2. Sorts routes based on liquidity and price
 *  3. Adds minStep to coins
 *  4. Adjusts buyCoin based on minSteps
 *  5. Calculates and adds info for WorstRoute for comparison
 *  6. Returns object with sellCoin, buyCoin, and worstRoute
 *
 * @param {Object} Object containing the following params:
 * @param {string} sellCoinName
 * @param {string} buyCoinName
 * @param {Object} bridgeCoins - array of coins connected to buyCoin and sellCoin
 * @param {number} sharesEntered - Shares to use for the calculation
 *
 * @return {Object} bestRoute object containing sellCoin, buyCoin, and worstRoute objects
 */
const getBestRoute = async ({
  sellCoinName, buyCoinName, bridgeCoins, sharesEntered,
}) => {
  // Loops over bridgeCoins
  // For each baseCoin, gets orders for sellCoin / baseCoin and buyCoin / baseCoin
  // Lists highest ask and lowest bid, then chooses baseCoin with the best ratio
  const routes = await createPossibleRoutes({
    sellCoinName,
    buyCoinName,
    bridgeCoins,
    sharesEntered,
  });

  const sortedRoutes = sortRoutes(routes);

  const bestRoute = sortedRoutes[0];

  // Adds min steps to bestRoute coins
  const minSteps = await getMinStepsBinance({
    sellCoinMarket: bestRoute.sellCoin.market,
    buyCoinMarket: bestRoute.buyCoin.market,
  });

  bestRoute.sellCoin.minStep = minSteps.sellCoin.minStep;
  bestRoute.buyCoin.minStep = minSteps.buyCoin.minStep;

  // Adjust buyCoin information on minStep, update in bestRoute
  const adjustedBuyCoin = adjustBuyCoin(bestRoute.buyCoin);

  bestRoute.buyCoin = {
    ...bestRoute.buyCoin,
    ...adjustedBuyCoin,
  };

  // Adds info for Worst Route, for comparison purposes
  const worstRoute = sortedRoutes[sortedRoutes.length - 1];

  bestRoute.worstRoute = {
    sharesBuyable: worstRoute.buyCoin.sharesBuyable,
    baseCoin: worstRoute.baseCoin.name,
    averageSellPrice: worstRoute.sellCoin.averageSellPrice,
    averageBuyPrice: worstRoute.buyCoin.averageBuyPrice,
  };

  return bestRoute;
};

module.exports = {
  getBestRoute,
};
