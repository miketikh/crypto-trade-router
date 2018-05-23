import React from 'react';
import './OrderForm.css';

const OrderForm = ({
  sellCoin,
  buyCoin,
  baseCoin,
  sharesEntered,
  handleInputChange,
  handleTradeSubmit,
}) => {
  const USDPrice = (priceInBase, baseCoinPrice) => (priceInBase * baseCoinPrice).toFixed(4);

  const sellCoinName = sellCoin.name;
  const sellCoinLast = sellCoin.last ? sellCoin.last : null;
  const buyCoinName = buyCoin.name;
  const buyCoinLast = buyCoin.last ? buyCoin.last : null;
  const baseCoinName = baseCoin.name;
  const baseCoinLast = baseCoin.last || null;
  const { averageSellPrice } = sellCoin;
  const { averageBuyPrice, amountBuyable, sharesBuyable } = buyCoin;
  // const sharesBuyable = amountBuyable / averageBuyPrice;

  // console.log(`orderform: sharesBuyable ${sharesBuyable}`);

  return (
    <div className="order-form">
      <div className="order-form-content">
        <div className="order-form-header">
          <div className="order-form-base-name">
            BASE: <span className="bold">{baseCoinName}</span>
          </div>
          <div className="order-form-base-price">TICKER: ${baseCoinLast}</div>
        </div>
        <div className="order-form-coin order-form-sell">
          <h2 className="order-form-coin-header sell">
            Selling <span className="bold">{sellCoinName}</span>
          </h2>

          <div className="order-form-ticker">
            <div className="order-form-data">
              <span className="bold">Last ({baseCoin.name}):</span> {sellCoinLast}
            </div>
            <div className="order-form-data">
              <span className="bold">Last (USD):</span> ${USDPrice(sellCoinLast, baseCoinLast)}
            </div>
          </div>

          <div className="order-form-available">
            Available: {sellCoin.available}{' '}
            <span className="usd-price">
              (${(sellCoin.available * sellCoin.last * baseCoin.last).toFixed(2)})
            </span>
          </div>

          <div className="coin-shares-container">
            Shares Sold: <input type="text" value={sharesEntered} onChange={handleInputChange} />
          </div>

          <div className="order-form-ticker">
            <div className="order-form-data">
              <span className="bold">Sell Price: </span>{' '}
              <span className="sell">
                {averageSellPrice && averageSellPrice.toFixed(6)} {baseCoinName}
              </span>{' '}
              <span className="usd-price">(${(averageSellPrice * baseCoinLast).toFixed(4)})</span>
            </div>
          </div>

          <div className="order-form-ticker">
            <div className="order-form-data">
              <span className="bold">Sell Total: </span>{' '}
              <span className="sell">
                {sharesEntered && (sharesEntered * averageSellPrice).toFixed(2)} {baseCoinName}
              </span>{' '}
              <span className="usd-price">
                (${sharesEntered && (sharesEntered * averageSellPrice * baseCoinLast).toFixed(2)})
              </span>
            </div>
          </div>
        </div>
        <div className="order-form-coin order-form-buy">
          <h2 className="order-form-coin-header buy">
            Buying <span className="bold">{buyCoinName}</span>
          </h2>

          <div className="order-form-ticker">
            <div className="order-form-data">
              <span className="bold">Last ({baseCoin.name}):</span> {buyCoinLast}
            </div>
            <div className="order-form-data">
              <span className="bold">Last (USD):</span> ${USDPrice(buyCoinLast, baseCoinLast)}
            </div>
          </div>

          <div className="order-form-available">
            Available: {buyCoin.available}{' '}
            <span className="usd-price">
              (${(buyCoin.available * buyCoin.last * baseCoin.last).toFixed(2)})
            </span>
          </div>

          <div className="coin-shares-container">
            Shares Purchased: {sharesBuyable && sharesBuyable.toFixed(6)}
          </div>

          <div className="order-form-ticker">
            <div className="order-form-data">
              <span className="bold">Buy Price:</span>{' '}
              <span className="buy">
                {averageBuyPrice.toFixed(6)} {baseCoinName}
              </span>{' '}
              <span className="usd-price">
                (${averageBuyPrice && (averageBuyPrice * baseCoinLast).toFixed(4)})
              </span>
            </div>
          </div>

          <div className="order-form-ticker">
            <div className="order-form-data">
              <span className="bold">Buy Total:</span>{' '}
              <span className="buy">
                {amountBuyable && amountBuyable.toFixed(2)} {baseCoinName}
              </span>{' '}
              <span className="usd-price">
                (${sharesBuyable && (sharesBuyable * averageBuyPrice * baseCoinLast).toFixed(2)})
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="order-form-submit">
        {sellCoin.available >= sharesEntered && sharesEntered > 0 ? (
          <button className="submit-trade-button" onClick={handleTradeSubmit}>
            Submit
          </button>
        ) : (
          <div>Submit</div>
        )}
      </div>
    </div>
  );
};

export default OrderForm;
