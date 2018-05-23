import React from 'react';
import './CoinSelections.css';

const CoinSelections = (props) => {
  const {
    sellCoin,
    buyCoin,
    baseCoin,
    sellCoinConnections,
    bridgeCoins,
    handleSellCoinSelect,
    handleBuyCoinSelect,
    handleBaseSelect,
    tradeCoins,
    smartRouting,
    toggleSmartRouting,
  } = props;
  const { name: sellCoinName } = sellCoin;
  const { name: buyCoinName } = buyCoin;
  const { name: baseCoinName } = baseCoin;

  return (
    <div className="coin-selections">
      <div className="trade-coin sell-coin">
        SELL:
        <select className="coin-select" value={sellCoinName || ''} onChange={handleSellCoinSelect}>
          <option value="">Select first coin</option>
          {tradeCoins &&
            Object.keys(tradeCoins).map(tradeCoin => (
              <option value={tradeCoin} key={`sellCoin${tradeCoin}`}>
                {tradeCoin}
              </option>
            ))}
        </select>
      </div>

      <div className="trade-coin buy-coin">
        BUY:
        <select className="coin-select" value={buyCoinName || ''} onChange={handleBuyCoinSelect}>
          <option value="">Select second coin</option>
          {sellCoinName &&
            sellCoinConnections.map(coin => (
              <option value={coin} key={`buyCoin${coin}`}>
                {coin}
              </option>
            ))}
        </select>
      </div>

      <div className="smart-routing">
        Use Smart Routing?
        <input
          name="smartRouting"
          type="checkbox"
          checked={smartRouting}
          onChange={toggleSmartRouting}
        />
      </div>

      {!smartRouting && (
        <div className="base-coin">
          Using:{' '}
          <select className="coin-select" value={baseCoinName || ''} onChange={handleBaseSelect}>
            <option value="">Select a base</option>
            {buyCoinName &&
              bridgeCoins.map(bridgeCoin => (
                <option value={bridgeCoin} key={`baseCoin${bridgeCoin}`}>
                  {bridgeCoin}
                </option>
              ))}
          </select>
        </div>
      )}
    </div>
  );
};

export default CoinSelections;
