import _ from 'underscore';
import socket from './websocket';

const closeSocketConnections = () => {
  socket.emit('terminatePriorSockets');
};

/**
 * Subscribes to order book updates for sellCoin and buyCoin
 *
 * @param {Object} coins - Contains sellCoin and buyCoin Objects
 */
const subscribeToOrderUpdates = ({ sellCoin, buyCoin }) => {
  socket.emit('subscribeToOrders', { sellCoin, buyCoin });
};

/**
 * Handles order book updates for SellCoin
 * Updates state with new sellCoin info
 *   If sharesEntered in input > sharesSellable, also updates sharesEntered
 * @param {function} takes callback that updates state
 *
 */
const receiveSellCoinOrderUpdates = (cb) => {
  socket.on('updateSellCoinInfo', (sellCoinInfo) => {
    cb(sellCoinInfo);
  });
};

/**
 * Handles order book updates for buyCoin and sets state with new info
 *
 * @param {function} takes callback that updates state
 *
 */
const receiveBuyCoinOrderUpdates = (cb) => {
  socket.on('updateBuyCoinInfo', (buyCoinInfo) => {
    cb(buyCoinInfo);
  });
};

/**
 * Handles socket when new Best Route returned
 *   Updates buyCoin, sellCoin, and baseCoin info with new calculations
 *   If route is different than before, initializes the new coins
 *
 * @param {function} cb = sets state with new bestRoute info
 */
const receiveNewBestRoute = (cb) => {
  socket.on('getBestRoute', (route) => {
    cb(route);
  });
};

/**
 * Subscribes to last price updates for coins
 * @param {Object} Coins - Object containing sellCoin, buyCoin, and baseCoin objects
 */
const subscribeToLastUpdates = ({ sellCoin, buyCoin, baseCoin }) => {
  socket.emit('subscribeToTrades', { sellCoin, buyCoin, baseCoin });
};

/**
 * Handles socket when last price updates returned
 *  Receives object containing { market: , last: }, updates the correct coin
 * @param {function} cb - sets state with new last price info
 */
const receiveLastUpdates = (cb) => {
  socket.on('updateLast', (tradeInfo) => {
    cb(tradeInfo);
  });
};

/**
 * Updates share input for server to use for calculations
 * @param {number} shares
 */
const updateServerShares = (shares) => {
  socket.emit('sharesUpdated', shares);
};

/**
 * Gets best route from server
 *   Throttled to not make instant calls each time input changes
 * Takes object containing:
 *
 * @param {object} sellCoin, buyCoin - coin objects
 * @param {number} sharesNumber - number value of shares entered in input
 * @param {array} bridgeCoins - coins that can act as bridge between buyCoin and sellCoin
 *
 * @return {void} emits socket update
 */
const getBestRoute = _.debounce(({
  sellCoin, buyCoin, bridgeCoins, sharesEntered,
}) => {
  socket.emit('getBestRoute', {
    sellCoinName: sellCoin.name,
    buyCoinName: buyCoin.name,
    bridgeCoins,
    sharesEntered,
  });
}, 400);

export {
  closeSocketConnections,
  subscribeToOrderUpdates,
  receiveSellCoinOrderUpdates,
  receiveBuyCoinOrderUpdates,
  receiveNewBestRoute,
  updateServerShares,
  subscribeToLastUpdates,
  receiveLastUpdates,
  getBestRoute,
};
