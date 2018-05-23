/**
 * Finds precisions of number
 *
 * @param {number} num - Some number, usually floating point
 *
 * @return {number} p - Precision of number, ex: .01 = 2
 */
const findPrecision = (num) => {
  if (!isFinite(num)) return 0;
  let e = 1;
  let p = 0;

  while (Math.round(num * e) / e !== num) {
    e *= 10;
    p++;
  }
  return p;
};

/**
 * Maps out all the coins that can be traded with a sellCoin
 * @param {Object} sellCoinName (string), coinConnections (object)
 *
 * @return {array} array of coinName strings connected to the sellCoin
 */
const mapSellCoinConnections = ({ sellCoinName, coinConnections }) => {
  const { baseCoins, tradeCoins } = coinConnections;

  // Create an array of all coins that have a connection to sellCoin
  const allConnections = tradeCoins[sellCoinName].reduce((connections, baseCoin) => {
    const baseCoinConnections = baseCoins[baseCoin].filter(coin => coin !== sellCoinName);
    return connections.concat(baseCoinConnections);
  }, []);

  const sellCoinConnections = Array.from([...new Set(allConnections)]);

  return sellCoinConnections;
};

export { findPrecision, mapSellCoinConnections };
