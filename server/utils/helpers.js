/**
 * Substitute for .toFixed, since that returns a string
 * @param {number} number - Floating point to round
 * @param {number} precision - Precision to round to
 * @param {number} base - (optional)
 *
 * @return {number} number rounded to precision
 */
const numberToFixed = (number, precision, base) => {
  const pow = Math.pow(base || 10, precision);
  return +(Math.round(number * pow) / pow);
};

/**
 * Splits market symbol into two coins
 * @param {string} symbol = Market symbol, ex: 'BTCETH'
 *
 * @return {array} coins = Two coins from symbol, the tradeCoin and its baseCoin
 */
const splitMarketSymbol = (symbol) => {
  const baseCurrencies = /(\w+)((USDT)|(ETH)|(BTC)|(BNB))$/g;
  const [fullSymbol, tradeCoin, baseCoin] = baseCurrencies.exec(symbol);

  return [tradeCoin, baseCoin];
};

/**
 * Adjusts sharesBuyable based on the coin's minStep (minimum trading size)
 *  Tells you leftover amount (isn't possible to purchase) in baseCoin
 *  ex: If 1.58 shares buyable, but minStep is 1, you can only buy 1 share and .58 shares will be 'leftover'
 *    Measures leftover in baseCoin
 * @param {object} buyCoin = Contains previous info for the buyCoin
 *
 * @return {object} adjustedBuyCoin = buyCoin with adjusted sharesBuyable, amountBuyable, and leftOver
 */
const adjustBuyCoin = (buyCoin) => {
  const { averageBuyPrice, minStep, amountBuyable } = buyCoin;

  const sharesBuyable = amountBuyable / averageBuyPrice;
  const unBuyableShares = sharesBuyable % minStep;
  const actualSharesBuyable = sharesBuyable - unBuyableShares;
  const actualAmountBuyable = amountBuyable - unBuyableShares * averageBuyPrice;
  const leftOver = amountBuyable - actualAmountBuyable;

  return {
    ...buyCoin,
    sharesBuyable: actualSharesBuyable,
    amountBuyable: actualAmountBuyable,
    leftOver,
  };
};

/**
 * Calculates sale information based on shares sold and Bid orders available
 * @param {Object} Object with following params:
 * @param {number} shares - Shares desired to sell
 * @param {array} bids - Array of bids, format [[price, qty], []]
 *
 * @return {Object} Object with info: sharesSellable, averageSellPrice, saleTotal
 */
const calculateSellData = ({ shares, bids }) => {
  let sharesSellable = 0;
  let sharesLeftToFill = shares;
  let bidIndex = 0;
  let saleTotal;
  let averageSellPrice = 0;

  // Go through bids, take each order until shares filled or bids run out
  while (sharesLeftToFill > 0) {
    // Break loop if no more bids left to process
    if (!bids[bidIndex]) {
      break;
    }

    const [price, quantity] = bids[bidIndex];
    const sharesUsed = quantity >= sharesLeftToFill ? sharesLeftToFill : quantity;

    sharesSellable += sharesUsed;
    sharesLeftToFill -= sharesUsed;
    averageSellPrice += sharesUsed * price;
    bidIndex++;
  }

  // Sometimes will fill all shares, but sharesSellable will show .0000001 or something
  // Hacky fix:
  if (sharesLeftToFill === 0) {
    sharesSellable = shares;
  }

  averageSellPrice /= sharesSellable;
  // If 0 shares entered, averageSellPrice = first Bid
  if (!averageSellPrice) averageSellPrice = bids[0].price;
  saleTotal = sharesSellable * averageSellPrice;
  // Subtracts .1% commission from total
  saleTotal -= saleTotal * 0.001;

  return { sharesSellable, averageSellPrice, saleTotal };
};

/**
 * Calculates purchase information using purchase amount and Ask orders available
 * @param {Object} Object with following params:
 * @param {number} buyAmount - Desired purchase amount (in baseCoin)
 * @param {array} asks - Array of asks [[price, quantity], []]
 *
 * @return {Object} Object containing amountSpent, sharesBuyable, and averageBuyPrice
 */
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

module.exports = {
  numberToFixed,
  splitMarketSymbol,
  adjustBuyCoin,
  calculateSellData,
  calculateBuyData,
};
