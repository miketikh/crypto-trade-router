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

module.exports = {
  adjustBuyCoin,
  numberToFixed,
};
