import React from 'react';

const DebugLogEntry = ({
  coin1, coin2, sharesEntered, tradeRes,
}) => {
  const { sale, purchase } = tradeRes;

  return (
    <li className="trade-log-entry">
      <div className="log-sell-prediction">
        <span className="bold">{coin1.market}:</span>
        <span className="bold">Predicted sale price:</span> {coin1.averageSellPrice},
        <span className="bold">predicted Quantity:</span> {sharesEntered},
        <span className="bold">predicted Total:</span> {coin1.averageSellPrice * sharesEntered}
      </div>

      <div className="log-sell-actual">
        <span className="bold">{coin1.market}:</span>
        <span className="bold">Actual sale price:</span> {sale.price},
        <span className="bold">actual Quantity:</span> {sale.quantity},
        <span className="bold">actual Total:</span> {sale.total})
      </div>

      <div className="log-sell-commission">
        <span className="bold">sale Commission:</span> {sale.commission} ({sale.commissionAsset})
      </div>

      <div className="log-buy-prediction">
        <span className="bold">{coin2.market}:</span>
        <span className="bold">Predicted buy price:</span> {coin2.averageBuyPrice},
        <span className="bold">predicted Quantity:</span> {coin2.sharesBuyable},
        <span className="bold">predicted Total:</span> {coin2.amountBuyable}
      </div>

      <div className="log-buy-actual">
        <span className="bold">{coin2.market}:</span>
        <span className="bold">Actual buy price:</span> {purchase.price},
        <span className="bold">actual Quantity:</span> {purchase.quantity},
        <span className="bold">actual Total:</span> {purchase.total}
      </div>

      <div className="log-buy-commission">
        <span className="bold">purchase Commission:</span> {purchase.commission} ({
          purchase.commissionAsset
        })
      </div>

      <div className="log-leftover-predicted">
        <span className="bold">predicted Leftover {coin1.name}:</span>{' '}
        {sharesEntered - coin2.amountBuyable / coin1.averageSellPrice}
      </div>

      <div className="log-leftover-actual">
        <span className="bold">actual Leftover {coin1.name}:</span>{' '}
        {(sale.total - purchase.total) / sale.price}
      </div>
    </li>
  );
};

export default DebugLogEntry;
