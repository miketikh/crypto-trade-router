import React, { Component } from 'react';
import axios from 'axios';
import _ from 'underscore';
import coinigyAxios from '../../utils/coinigy';
import './OrderForm.css';
import LogEntry from '../Logging/LogEntry';

class OrderForm extends Component {
  state = {
    coin1Shares: 0,
    averageSellPrice: 0,
    averageBuyPrice: 0,
    buyAmount: 0,
    tradeLog: [],
  };

  handleSubmit = (e) => {
    const { coin1, coin2, sharesEntered, updateCoinBalances } = this.props;

    axios
      .post('http://localhost:4001/trade', {
        coin1,
        coin2,
        shares: sharesEntered,
      })
      .then((res) => {
        console.log('res received! ', res);
        const { data: tradeRes } = res;
        const tradeLogEntry = (
          <LogEntry coin1={coin1} coin2={coin2} sharesEntered={sharesEntered} tradeRes={tradeRes} key={tradeRes.sale.tradeId}/>
        );

        updateCoinBalances({ coin1: coin1.name, coin2: coin2.name })

        this.setState({
          tradeLog: [...this.state.tradeLog, tradeLogEntry],
        });
      })
      .catch((err) => {
        console.log('no res received');
        console.log(err);
        updateCoinBalances({ coin1: coin1.name, coin2: coin2.name })
      });
  };

  calculateSharesPurchase(coin1Shares, coin1Bid, coin2Ask) {
    const totalValueSold = coin1Shares * coin1Bid;
    return totalValueSold / coin2Ask;
  }

  calculateSellData = ({ sharesEntered, bids }) => {
    let sharesPossibleToSell = 0;
    let sharesLeftToFill = sharesEntered;
    let bidIndex = 0;
    let averageSellPrice = 0;
    let saleTotal;

    // Go through bids, take each order until shares filled or bids run out
    while (sharesLeftToFill > 0) {
      // Break loop if no more bids left to process
      if (!bids[bidIndex]) {
        break;
      }

      const { price, quantity: sharesAtPrice } = bids[bidIndex];
      const sharesUsed = sharesAtPrice >= sharesLeftToFill ? sharesLeftToFill : sharesAtPrice;

      sharesPossibleToSell += sharesUsed;
      sharesLeftToFill -= sharesUsed;
      averageSellPrice += sharesUsed * price;
      bidIndex++;
    }

    // If max shares hit, returns shares toFixed decimal place so it doesn't keep adding .0001
    // if (sharesPossibleToSell < sharesEntered) {
    // }
    sharesPossibleToSell = sharesPossibleToSell.toFixed(0);
    averageSellPrice /= sharesPossibleToSell;
    saleTotal = sharesPossibleToSell * averageSellPrice;

    return { sharesPossibleToSell, averageSellPrice, saleTotal };
  };

  calculateBuyData = ({ buyAmount, asks }) => {
    let amountSpent = 0;
    let amountLeftToSpend = buyAmount;
    let sharesPossibleToBuy = 0;
    let askIndex = 0;
    let averageBuyPrice = 0.0;

    while (amountLeftToSpend > 0) {
      if (!asks[askIndex]) {
        break;
      }

      const { price, total: amountOfferedAtPrice } = asks[askIndex];
      // Purchases either the amount offered or whatever is left at current ask
      const purchaseAtPrice =
        amountLeftToSpend >= amountOfferedAtPrice ? amountOfferedAtPrice : amountLeftToSpend;

      sharesPossibleToBuy += purchaseAtPrice / price;
      amountSpent += purchaseAtPrice;
      amountLeftToSpend -= purchaseAtPrice;
      averageBuyPrice += purchaseAtPrice;
      askIndex++;
    }

    averageBuyPrice /= sharesPossibleToBuy;

    return { amountSpent, sharesPossibleToBuy, averageBuyPrice };
  };

  resetOrderForm = () => {
    this.setState({
      coin1Shares: 0,
      averageSellPrice: 0,
      averageBuyPrice: 0,
      buyAmount: 0,
    });
  };

  calculateAveragePrices = (e) => {
    const { coin1, coin2, baseCoin } = this.props;
    const coin1Bids = coin1.bids;
    const coin2Asks = coin2.asks;
    const coin1Shares = parseFloat(e.target.value);

    const { sharesPossibleToSell, averageSellPrice, saleTotal } = this.calculateSellData({
      sharesEntered: coin1Shares,
      bids: coin1Bids,
    });

    const { amountSpent, sharesPossibleToBuy, averageBuyPrice } = this.calculateBuyData({
      buyAmount: saleTotal,
      asks: coin2Asks,
    });

    this.setState({
      coin1Shares: sharesPossibleToSell,
      averageSellPrice,
      averageBuyPrice,
      buyAmount: amountSpent,
    });
  };

  USDPrice(priceInBase, baseCoinPrice) {
    return (priceInBase * baseCoinPrice).toFixed(4);
  }

  render() {
    const {
      coin1, coin2, baseCoin, sharesEntered, handleInputChange,
    } = this.props;

    const coin1Name = coin1.name;
    const coin1Bid = coin1.bid ? coin1.bid : null;
    const coin1Ask = coin1.ask ? coin1.ask : null;
    const coin1Last = coin1.last ? coin1.last : null;
    const coin2Name = coin2.name;
    const coin2Bid = coin2.bid ? coin2.bid : null;
    const coin2Ask = coin2.ask ? coin2.ask : null;
    const coin2Last = coin2.last ? coin2.last : null;
    const baseCoinName = baseCoin.name;
    const baseCoinLast = baseCoin.last || null;
    const { averageSellPrice } = coin1;
    const { averageBuyPrice, amountBuyable, sharesBuyable } = coin2;
    // const sharesBuyable = amountBuyable / averageBuyPrice;

    return (
      <div className="order-form">
        <div className="order-form-header">
          <h1 className="order-form-title">ORDER FORM</h1>
          <div className="order-form-base-info">
            <div className="order-form-base-name">
              Base: <span className="bold">{baseCoinName}</span>
            </div>
            <div className="order-form-base-price">Base price (USDT): ${baseCoinLast}</div>
            <div className="order-form-base-time">Last Updated: {baseCoin.updated}</div>
          </div>
        </div>
        <div className="order-form-content">
          <div className="order-form-coin">
            <h2>Selling {coin1Name}</h2>

            <div className="order-form-ticker">
              <div className="ticker-currency">{baseCoinName}:</div>
              <div className="order-form-data">
                <span className="bold">Bid:</span> {coin1Bid}
              </div>
              <div className="order-form-data">
                <span className="bold">Ask:</span> {coin1Ask}
              </div>
              <div className="order-form-data">
                <span className="bold">Last:</span> {coin1Last}
              </div>
            </div>

            <div className="order-form-ticker">
              <div className="ticker-currency">USD:</div>
              <div className="order-form-data">
                <span className="bold">Bid:</span> ${this.USDPrice(coin1Bid, baseCoinLast)}
              </div>
              <div className="order-form-data">
                <span className="bold">Ask:</span> ${this.USDPrice(coin1Ask, baseCoinLast)}
              </div>
              <div className="order-form-data">
                <span className="bold">Last:</span> ${this.USDPrice(coin1Last, baseCoinLast)}
              </div>
            </div>

            <div className="order-form-available">
              <span className="bold">Available:</span> {coin1.available}
            </div>

            <div className="coin-shares-container">
              Shares: <input type="text" value={sharesEntered} onChange={handleInputChange} />
            </div>
            <div className="coin-price-container">
              Avg Sell Price ({baseCoinName}): {averageSellPrice && averageSellPrice.toFixed(8)}
            </div>
            <div className="coin-total-container">
              Total Sold ({baseCoinName}):{' '}
              {sharesEntered && (sharesEntered * averageSellPrice).toFixed(2)}
            </div>
            <div className="coin-price-container">
              Avg Sell Price (USD): ${(averageSellPrice * baseCoinLast).toFixed(4)}
            </div>
            <div className="coin-total-container">
              Total Sold (USD): ${sharesEntered &&
                (sharesEntered * averageSellPrice * baseCoinLast).toFixed(2)}
            </div>
          </div>
          <div className="order-form-coin">
            <h2>Buying {coin2Name}</h2>

            <div className="order-form-ticker">
              <div className="ticker-currency">{baseCoinName}:</div>
              <div className="order-form-data">
                <span className="bold">Bid:</span> {coin2Bid}
              </div>
              <div className="order-form-data">
                <span className="bold">Ask:</span> {coin2Ask}
              </div>
              <div className="order-form-data">
                <span className="bold">Last:</span> {coin2Last}
              </div>
            </div>

            <div className="order-form-ticker">
              <div className="ticker-currency">USD:</div>
              <div className="order-form-data">
                <span className="bold">Bid:</span> ${this.USDPrice(coin2Bid, baseCoinLast)}
              </div>
              <div className="order-form-data">
                <span className="bold">Ask:</span> ${this.USDPrice(coin2Ask, baseCoinLast)}
              </div>
              <div className="order-form-data">
                <span className="bold">Last:</span> ${this.USDPrice(coin2Last, baseCoinLast)}
              </div>
            </div>

            <div className="order-form-available">
              <span className="bold">Available:</span> {coin2.available}
            </div>

            <div className="coin-shares-container">Shares Possible to Buy: {sharesBuyable}</div>
            <div className="coin-shares-container">
              {coin1Name} Used: {amountBuyable / averageSellPrice}
            </div>
            <div className="coin-price-container">
              Avg Buy Price ({baseCoinName}): {averageBuyPrice.toFixed(7)}
            </div>
            <div className="coin-total-container">
              Total ({baseCoinName}): {sharesBuyable}
            </div>
            <div className="coin-price-container">
              Avg Buy Price (USD): ${averageBuyPrice && (averageBuyPrice * baseCoinLast).toFixed(4)}
            </div>
            <div className="coin-total-container">
              Total (USD): ${sharesBuyable &&
                (sharesBuyable * averageBuyPrice * baseCoinLast).toFixed(2)}
            </div>
          </div>
        </div>

        <div className="order-form-submit">
          {coin1.available >= sharesEntered && sharesEntered > 0 ? (
            <button className="submit-trade-button" onClick={this.handleSubmit}>
              Submit
            </button>
          ) : (
            <div>Submit</div>
          )}
        </div>

        <ul className="tradeLog">{this.state.tradeLog}</ul>
      </div>
    );
  }
}

export default OrderForm;
