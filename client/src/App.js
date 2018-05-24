import React, { Component } from 'react';
import _ from 'underscore';
import axios from 'axios';
import socket from './sockets/websocket';
import OrderForm from './components/OrderForm/OrderForm';
import CoinSelections from './components/CoinSelections/CoinSelections';
import LogEntry from './components/Logging/LogEntry';
import {
  closeSocketConnections,
  subscribeToOrderUpdates,
  receiveSellCoinOrderUpdates,
  receiveBuyCoinOrderUpdates,
  receiveNewBestRoute,
  updateServerShares,
  getBestRoute,
  subscribeToLastUpdates,
  receiveLastUpdates,
} from './sockets/socketHandlers';
import {
  mapCoinConnections,
  addMinSteps,
  getCoinBalance,
  getLastPrices,
} from './utils/axiosHandlers';
import { findPrecision, mapSellCoinConnections } from './utils/helpers';
import './App.css';

class App extends Component {
  state = {
    // exchange: 'BTRX',
    coinConnections: {},
    sellCoin: {
      name: null,
      market: null,
      minStep: 0,
      bid: 0,
      ask: 0,
      last: 0,
      sharesSellable: 0,
      averageSellPrice: 0,
      available: 0,
    },
    buyCoin: {
      name: null,
      market: null,
      minStep: 0,
      bid: 0,
      ask: 0,
      last: 0,
      sharesBuyable: 0,
      averageBuyPrice: 0,
      amountBuyable: 0,
      leftOver: 0,
      available: 0,
    },
    baseCoin: {
      name: null,
      market: null,
      last: 0,
      updated: null,
    },
    sellCoinConnections: [],
    bridgeCoins: [],
    sharesEntered: 0,
    smartRouting: true,
    tradeLog: [],
  };

  componentDidMount() {
    closeSocketConnections();

    // AJAX - Creates initial coin connections
    mapCoinConnections((coinConnections) => {
      this.setState({
        coinConnections,
      });
    });

    // Socket handler - SellCoin Order book updates
    receiveSellCoinOrderUpdates((sellCoinInfo) => {
      const { sharesSellable } = sellCoinInfo;

      this.setState({
        sellCoin: {
          ...this.state.sellCoin,
          ...sellCoinInfo,
        },
      });

      this.updateSharesEntered(sharesSellable);
    });

    // Socket handler - BuyCoin Order book updates
    receiveBuyCoinOrderUpdates((buyCoinInfo) => {
      this.setState({
        buyCoin: {
          ...this.state.buyCoin,
          ...buyCoinInfo,
        },
      });
    });

    // Socket handler - Last Price updates for coins
    receiveLastUpdates((tradeInfo) => {
      const { market, last } = tradeInfo;
      // Last prices received by market, so need to connect market to coin first
      const tradedCoin = this.getCoinUsingMarket(market);

      if (tradedCoin) {
        this.setState({
          [tradedCoin]: {
            ...this.state[tradedCoin],
            last,
          },
        });
      }
    });

    // Socket handler - New Best Route calculated
    receiveNewBestRoute((route) => {
      const { baseCoin: prevBaseCoin } = this.state;
      const { sellCoin, buyCoin, baseCoin } = route;

      this.setState({
        sellCoin: {
          ...this.state.sellCoin,
          ...sellCoin,
        },
        buyCoin: {
          ...this.state.buyCoin,
          ...buyCoin,
        },
        baseCoin: {
          ...this.state.baseCoin,
          ...baseCoin,
        },
      });

      this.updateSharesEntered(sellCoin.sharesSellable);

      // If the bestRoute is different from the previous one, initialize the new coins
      if (baseCoin.name !== prevBaseCoin.name) {
        this.initializeCoins({ sellCoin, buyCoin, baseCoin });
      }
    });
  }

  /**
   *  Identifies coin as buyCoin, sellCoin, or baseCoin based on its market symbol
   * @param {string} market = Coin's market symbol, ex: 'ETCBTC'
   *
   * @return {string} coinType = 'buyCoin,' 'sellCoin,' 'baseCoin,' or '' if none
   */
  getCoinUsingMarket = (market) => {
    for (const [key, value] of Object.entries(this.state)) {
      if (value.market === market) {
        return key;
      }
    }
    return '';
  };

  /**
   * Ensures that sharesEntered in input is less than sharesSellable
   * @param {number} sharesSellable = Shares currently possible to sell
   *
   * @return {void} Adjusts state and input based on shares possible to sell
   */
  updateSharesEntered = (sharesSellable) => {
    const { sharesEntered } = this.state;

    if (sharesEntered > sharesSellable) {
      updateServerShares(sharesSellable);
      this.setState({
        sharesEntered: sharesSellable,
      });
    }
  };

  /**
   * Toggles smart routing
   *  1. Clears old connections and data, except for coin names
   *  2. If two coins chosen, gets the bestRoute
   *  3. setsState smartRouting in state
   */
  toggleSmartRouting = () => {
    const {
      sellCoin,
      buyCoin,
      bridgeCoins,
      sharesEntered,
      smartRouting: prevSmartRouting,
    } = this.state;
    const { name: sellCoinName } = sellCoin;
    const { name: buyCoinName } = buyCoin;

    closeSocketConnections();
    this.clearStateOrderInfo({ sellCoinName, buyCoinName });

    // If enabling smart routing and 2 coins chosen, start fetching data
    if (!prevSmartRouting && (sellCoinName && buyCoinName)) {
      getBestRoute({
        sellCoin,
        buyCoin,
        bridgeCoins,
        sharesEntered,
      });
    }

    this.setState({
      smartRouting: !this.state.smartRouting,
    });
  };

  /**
   * Used to reset all coin data in state except for names and balance
   * @param {Object} coinNames - Contains strings for coin names
   */
  clearStateOrderInfo({ sellCoinName, buyCoinName, baseCoinName }) {
    this.setState({
      sellCoin: {
        available: this.state.sellCoin.available,
        name: sellCoinName,
        market: null,
        bid: 0,
        ask: 0,
        last: 0,
        averageSellPrice: 0,
      },
      buyCoin: {
        available: this.state.buyCoin.available,
        name: buyCoinName,
        market: null,
        bid: 0,
        ask: 0,
        last: 0,
        averageBuyPrice: 0,
      },
      baseCoin: {
        name: baseCoinName,
        market: null,
        last: 0,
      },
    });
  }

  /**
   * Updates coin available balances
   * @param {Object} coinNames - Strings with sellCoinName and/or buyCoinName
   *
   * @return {void} - Sets balance in state for sellCoin, buyCoin, or both
   */
  updateCoinBalances = ({ sellCoinName, buyCoinName }) => {
    if (sellCoinName) {
      getCoinBalance(sellCoinName, (balance) => {
        this.setState({
          sellCoin: {
            ...this.state.sellCoin,
            available: balance,
          },
        });
      });
    }
    if (buyCoinName) {
      getCoinBalance(buyCoinName, (balance) => {
        this.setState({
          buyCoin: {
            ...this.state.buyCoin,
            available: balance,
          },
        });
      });
    }
  };

  /**
   * AJAX Handler - Gets last prices and assigns to coins
   * @param {Object} coinSymbols - Market symbols coins sellCoin, buyCoin, and baseCoin
   */
  setLastPrices({ sellCoinSymbol, buyCoinSymbol, baseCoinSymbol }) {
    getLastPrices({ sellCoinSymbol, buyCoinSymbol, baseCoinSymbol }, (prices) => {
      const { sellCoinLast, buyCoinLast, baseCoinLast } = prices;
      this.setState({
        sellCoin: {
          ...this.state.sellCoin,
          last: sellCoinLast,
        },
        buyCoin: {
          ...this.state.buyCoin,
          last: buyCoinLast,
        },
        baseCoin: {
          ...this.state.baseCoin,
          last: baseCoinLast,
        },
      });
    });
  }

  /**
   * Initializes new coins by:
   *  1. Closing all old sockets
   *  2. Fetching last prices
   *  3. Subscribing to last price updates for new coins
   *  4. Subscribing to order book updates for new coins
   * @param {Object} coins = contains sellCoin, buyCoin, and baseCoin
   *
   */
  initializeCoins({ sellCoin, buyCoin, baseCoin }) {
    closeSocketConnections();
    this.setLastPrices({
      sellCoinSymbol: sellCoin.market,
      buyCoinSymbol: buyCoin.market,
      baseCoinSymbol: baseCoin.market,
    });
    subscribeToLastUpdates({ sellCoin, buyCoin, baseCoin });
    subscribeToOrderUpdates({ sellCoin, buyCoin, baseCoin });
  }

  /**
   * SellCoin select handler
   *  1. Closes socket connections
   *  2. Gathers coins connected to sellCoin
   *  3. Sets balance of buyCoin
   *  4. Sets state with new info
   */
  handleSellCoinSelect = (e) => {
    const { coinConnections } = this.state;
    const sellCoinName = e.target.value;

    closeSocketConnections();

    const sellCoinConnections = mapSellCoinConnections({
      sellCoinName,
      coinConnections,
    });

    // Sets coin balance
    this.updateCoinBalances({ sellCoinName });

    // Set sellCoinConnections, resets shares to 0
    this.setState({
      sellCoinConnections,
      sharesEntered: 0,
    });

    // Clears all coin info except name and balance
    this.clearStateOrderInfo({ sellCoinName });
  };

  /**
   * BuyCoin Select Handler
   *  1. Closes socket connections
   *  2. Gather bridgeCoins
   *  3. Set buyCoin balances
   *  4. Clear state, add new info
   *  If (smartRouting selected) - Initializes coins and sockets
   */
  handleBuyCoinSelect = (e) => {
    const {
      sellCoin, coinConnections, smartRouting, sharesEntered,
    } = this.state;
    const { tradeCoins } = coinConnections;
    const sellCoinName = sellCoin.name;
    const buyCoinName = e.target.value;

    closeSocketConnections();

    // bridgeCoins = Basecoins both buyCoin and sellCoin trade against
    const bridgeCoins = tradeCoins[sellCoinName].filter(coin =>
      tradeCoins[buyCoinName].includes(coin));

    this.updateCoinBalances({ buyCoinName });
    this.clearStateOrderInfo({ sellCoinName, buyCoinName });

    this.setState({
      bridgeCoins,
    });

    if (smartRouting) {
      socket.emit('getBestRoute', {
        sellCoinName,
        buyCoinName,
        bridgeCoins,
        sharesEntered,
      });
    }
  };

  /**
   * Handles manual selection of new baseCoin
   *   1. Gets sellCoin, buyCoin from state
   *   2. Adds market to objects based on new baseCoin: 'ETCBTH'
   *   3. Adds minSteps to coins
   */
  handleBaseSelect = async (e) => {
    let { sellCoin, buyCoin } = this.state;
    const baseCoinName = e.target.value;

    const baseCoin = {
      name: baseCoinName,
    };

    sellCoin.market = `${sellCoin.name}${baseCoinName}`;
    buyCoin.market = `${buyCoin.name}${baseCoinName}`;
    baseCoin.market = `${baseCoin.name}USDT`;

    closeSocketConnections();
    ({ sellCoin, buyCoin } = await addMinSteps({ sellCoin, buyCoin }));

    this.initializeCoins({ buyCoin, sellCoin, baseCoin });

    this.setState({
      sellCoin: {
        ...this.state.sellCoin,
        ...sellCoin,
      },
      buyCoin: {
        ...this.state.buyCoin,
        ...buyCoin,
      },
      baseCoin: {
        ...this.state.baseCoin,
        ...baseCoin,
      },
    });
  };

  // INPUT CHANGE (SHARES)
  handleInputChange = (e) => {
    const {
      sellCoin, buyCoin, baseCoin, bridgeCoins, smartRouting,
    } = this.state;
    const { minStep } = sellCoin;
    const sharesEntered = e.target.value;

    // No change if not enough coins defined, or input is not a number
    if (
      !(sellCoin.name && buyCoin.name && (baseCoin.name || smartRouting)) ||
      isNaN(sharesEntered)
    ) {
      return;
    }

    // Parse input for number, if blank set to 0
    let sharesNumber = parseFloat(sharesEntered);
    if (isNaN(sharesNumber)) sharesNumber = 0;

    // Sets sharesNumber to maximum precision allowed
    const maxPrecision = findPrecision(minStep);
    sharesNumber = sharesNumber.toFixed(maxPrecision);

    socket.emit('sharesUpdated', sharesNumber);
    this.setState({
      sharesEntered: sharesNumber,
    });

    // Recalculates best route when shares changed, if enabled
    if (smartRouting) {
      getBestRoute({
        sellCoin,
        buyCoin,
        bridgeCoins,
        sharesEntered: sharesNumber,
      });
    }
  };

  // SUBMIT TRADE HANDLER
  handleTradeSubmit = (e) => {
    const {
      sellCoin, buyCoin, sharesEntered, bridgeCoins, smartRouting, baseCoin,
    } = this.state;

    axios
      .post('http://localhost:4001/trade', {
        sellCoin,
        buyCoin,
        shares: sharesEntered,
        bridgeCoins,
        smartRouting,
      })
      .then((res) => {
        const { data: tradeRes } = res;
        let tradeLogEntry;
        // Log the trade savings, if smartRouting used
        if (smartRouting) {
          tradeLogEntry = (
            <LogEntry
              sellCoin={sellCoin}
              buyCoin={buyCoin}
              sharesEntered={sharesEntered}
              tradeRes={tradeRes}
              key={tradeRes.sale.tradeId}
            />
          );
        } else {
          const { purchase, sale } = tradeRes;
          tradeLogEntry = (
            <li>
              You sold {sale.quantity} {sellCoin.name} at {sale.price} {baseCoin.name} and bought{' '}
              {purchase.quantity} {buyCoin.name} at {purchase.price} {baseCoin.name}
            </li>
          );
        }

        this.setState({
          tradeLog: [...this.state.tradeLog, tradeLogEntry],
        });
        this.updateCoinBalances({
          sellCoinName: sellCoin.name,
          buyCoinName: buyCoin.name,
        });
      })
      .catch((err) => {
        console.log('Error occurred submitting trade: ', err);
        // Even if error occurs, may need to update one balance
        this.updateCoinBalances({
          sellCoinName: sellCoin.name,
          buyCoinName: buyCoin.name,
        });
      });
  };

  render() {
    const {
      coinConnections,
      sellCoin,
      buyCoin,
      baseCoin,
      sellCoinConnections,
      bridgeCoins,
      sharesEntered,
      smartRouting,
    } = this.state;
    const { tradeCoins, baseCoins } = coinConnections;

    return (
      <div className="App">
        <h1 className="app-title">CRYPTO TRADE ROUTER</h1>
        <CoinSelections
          sellCoin={sellCoin}
          buyCoin={buyCoin}
          baseCoin={baseCoin}
          tradeCoins={tradeCoins}
          sellCoinConnections={sellCoinConnections}
          bridgeCoins={bridgeCoins}
          handleSellCoinSelect={this.handleSellCoinSelect}
          handleBuyCoinSelect={this.handleBuyCoinSelect}
          handleBaseSelect={this.handleBaseSelect}
          smartRouting={smartRouting}
          toggleSmartRouting={this.toggleSmartRouting}
        />

        <OrderForm
          sellCoin={sellCoin}
          buyCoin={buyCoin}
          baseCoin={baseCoin}
          bridgeCoins={bridgeCoins}
          sharesEntered={sharesEntered}
          handleInputChange={this.handleInputChange}
          updateCoinBalances={this.updateCoinBalances}
          handleTradeSubmit={this.handleTradeSubmit}
        />

        <ul className="tradeLog">{this.state.tradeLog}</ul>
      </div>
    );
  }
}

export default App;
