import React, { Component } from 'react';
import _ from 'underscore';
import './App.css';
import OrderForm from './components/OrderForm/OrderForm';
import CoinSelections from './components/CoinSelections';
import socket from './utils/websocket';
import axios from 'axios';

class App extends Component {
  state = {
    exchange: 'BTRX',
    coinConnections: {},
    coin1: {
      name: null,
      market: null,
      minStep: 0,
      bids: [],
      asks: [],
      last: null,
      averageSellPrice: 0,
      available: 0,
      // Shares possible to sell?
    },
    coin2: {
      name: null,
      market: null,
      minStep: 0,
      bids: [],
      asks: [],
      last: null,
      averageBuyPrice: 0,
      sharesBuyable: 0,
      amountBuyable: 0,
      leftOver: 0,
      available: 0,
    },
    baseCoin: {
      name: null,
      market: null,
      last: null,
      updated: null,
    },
    sellCoinConnections: [],
    bridgeCoins: [],
    sharesEntered: 0,
    resetOrderForm: false,
    // // Used to test trade latency
    // receivedTrades: [],
  };

  componentDidMount() {
    this.mapCoinConnections();

    // Subscribe for Coin1 Order updates
    socket.on('updateCoin1Info', (newInfo) => {
      const { sharesPossibleToSell, saleTotal } = newInfo;
      const {
        market, bid, ask, averageSellPrice,
      } = newInfo.coin;
      const { sharesEntered } = this.state;

      this.setState({
        coin1: {
          ...this.state.coin1,
          bid,
          ask,
          averageSellPrice,
        },
      });

      if (sharesPossibleToSell < sharesEntered) {
        this.setState({
          sharesEntered: sharesPossibleToSell,
        });
      }
    });

    // Subscribe to Coin2 order updates
    socket.on('updateCoin2Info', (newInfo) => {
      const {
        market, bid, ask, averageBuyPrice, amountBuyable,
      } = newInfo.coin;
      const { coin2 } = this.state;
      const minStep = coin2 ? coin2.minStep : 1;

      // If sharesBuyable = .015 but minStep is .01, then .005 is unBuyable (extra)
      const sharesBuyable = amountBuyable / averageBuyPrice;
      const unBuyableShares = sharesBuyable % minStep;
      const actualSharesBuyable = sharesBuyable - unBuyableShares;
      const actualAmountBuyable = amountBuyable - unBuyableShares * averageBuyPrice;
      const leftOver = amountBuyable - actualAmountBuyable;

      this.setState({
        coin2: {
          ...this.state.coin2,
          market,
          bid,
          ask,
          averageBuyPrice,
          // amountBuyable
          sharesBuyable: actualSharesBuyable,
          amountBuyable: actualAmountBuyable,
          leftOver,
        },
      });
    });
  }

  getCoinUsingMarket = (market) => {
    for (const [key, value] of Object.entries(this.state)) {
      if (value.market === market) {
        return key;
      }
    }
  };

  // Returns object with bid / ask / last from an axios all response
  getInfoFromResponse(res) {
    const {
      bids,
      asks,
      history,
      exch_code: exchange,
      primary_curr_code,
      secondary_curr_code,
    } = res.data.data;
    const market = `${primary_curr_code}/${secondary_curr_code}`;

    const formattedBids = bids.map((bid) => {
      const { price, quantity, total } = bid;
      return {
        price: parseFloat(price),
        quantity: parseFloat(quantity),
        total: parseFloat(total),
        ordertype: 'Buy',
        exchange,
        market,
      };
    });

    const formattedAsks = asks.map((ask) => {
      const { price, quantity, total } = ask;
      return {
        price: parseFloat(price),
        quantity: parseFloat(quantity),
        total: parseFloat(total),
        ordertype: 'Sell',
        exchange,
        market,
      };
    });

    const last = parseFloat(history[0].price);

    return {
      bids: formattedBids,
      asks: formattedAsks,
      last,
    };
  }

  // Fetches all coins on exchange, maps their connections
  mapCoinConnections() {
    const connectionHolder = {
      tradeCoins: {},
      baseCoins: {},
    };

    // Should be regular AJAX call, getting pairs isn't a stream
    socket.emit('getBinancePairs');
    socket.on('getBinancePairs', (pairs) => {
      const coinConnections = pairs.reduce((coins, [tradeCoin, baseCoin]) => {
        if (coins.tradeCoins[tradeCoin]) {
          coins.tradeCoins[tradeCoin].push(baseCoin);
        } else {
          coins.tradeCoins[tradeCoin] = [baseCoin];
        }

        if (coins.baseCoins[baseCoin]) {
          coins.baseCoins[baseCoin].push(tradeCoin);
        } else {
          coins.baseCoins[baseCoin] = [tradeCoin];
        }

        return coins;
      }, connectionHolder);

      this.setState({ coinConnections });
    });
  }

  assignMinSteps({ coin1Symbol, coin2Symbol }) {
    axios
      .get('http://localhost:4001/step', {
        params: {
          market1: coin1Symbol,
          market2: coin2Symbol,
        },
      })
      .then((res) => {
        const { coin1, coin2 } = res.data;
        this.setState({
          coin1: {
            ...this.state.coin1,
            minStep: coin1.minStep,
          },
          coin2: {
            ...this.state.coin2,
            minStep: coin2.minStep,
          },
        });
      })
      .catch(err => console.log(err));
  }

  // Takes names if new coin selected, resets all order info and data
  clearStateOrderInfo({ coin1Name, coin2Name, baseCoinName }) {
    this.setState({
      coin1: {
        available: this.state.coin1.available,
        name: coin1Name,
        market: null,
        bids: [],
        asks: [],
        last: null,
        averageSellPrice: 0,
      },
      coin2: {
        available: this.state.coin2.available,
        name: coin2Name,
        market: null,
        bids: [],
        asks: [],
        last: null,
        averageBuyPrice: 0,
      },
      baseCoin: {
        name: baseCoinName,
        market: null,
        last: null,
        updated: null,
      },
    });
  }

  // Off stackoverflow. Not very readable, but it works
  findPrecision(num) {
    if (!isFinite(num)) return 0;
    let e = 1,
      p = 0;
    while (Math.round(num * e) / e !== num) {
      e *= 10;
      p++;
    }
    return p;
  }

  handleCoin1Select = (e) => {
    const { coinConnections } = this.state;
    const { baseCoins, tradeCoins } = coinConnections;
    const coin1Name = e.target.value;

    // Unsubscribe from previous data streams
    socket.emit('terminate');
    this.setState({ sharesEntered: 0 });

    // Create an array of all coins that have a connection to coin1
    const allConnections = tradeCoins[coin1Name].reduce((connections, baseCoin) => {
      const baseCoinConnections = baseCoins[baseCoin].filter(coin => coin !== coin1Name);
      return connections.concat(baseCoinConnections);
    }, []);
    const sellCoinConnections = Array.from([...new Set(allConnections)]);

    // Fetch coin1 balance
      this.updateCoinBalances({ coin1: coin1Name })

    // Set coin1 name and sellCoinConnections, clear everything else
    this.setState({
      sellCoinConnections,
      resetOrderForm: true,
    });

    this.clearStateOrderInfo({ coin1Name });
  };

  handleCoin2Select = (e) => {
    const { coin1, coinConnections } = this.state;
    const { tradeCoins } = coinConnections;
    const coin1Name = coin1.name;
    const coin2Name = e.target.value;

    // Unsubscribe from previous data streams
    socket.emit('terminate');
    this.setState({ sharesEntered: 0 });

    // List of base coins both coin1 and coin2 trade against
    const bridgeCoins = tradeCoins[coin1Name].filter(coin => tradeCoins[coin2Name].includes(coin));

    // Get coin2 balance
    this.updateCoinBalances({ coin2: coin2Name })

    this.setState({
      bridgeCoins,
      resetOrderForm: true,
    });

    this.clearStateOrderInfo({ coin1Name, coin2Name });
  };

  handleBaseSelect = (e) => {
    const { coin1: coin1Obj, coin2: coin2Obj, exchange } = this.state;
    const coin1 = coin1Obj.name;
    const coin2 = coin2Obj.name;
    const baseCoin = e.target.value;
    // Symbol format used for binance
    const coin1Symbol = `${coin1}${baseCoin}`;
    const coin2Symbol = `${coin2}${baseCoin}`;
    const baseCoinSymbol = `${baseCoin}USDT`;

    // Unsubscribe from previous data streams
    socket.emit('terminate');
    this.setState({ sharesEntered: 0 });

    // Assign minimum steps
    this.assignMinSteps({ coin1Symbol, coin2Symbol });

    const coinSymbols = [coin1Symbol, coin2Symbol];
    if (baseCoin !== 'USDT') coinSymbols.push(baseCoinSymbol);

    // GET INITIAL PRICES
    socket.emit('getInitialPrices', coinSymbols);
    socket.on('getInitialPrices', (prices) => {
      const {
        [coin1Symbol]: coin1Price,
        [coin2Symbol]: coin2Price,
        [baseCoinSymbol]: baseCoinPrice,
      } = prices;

      this.setState({
        coin1: {
          ...this.state.coin1,
          last: coin1Price,
        },
        coin2: {
          ...this.state.coin2,
          last: coin2Price,
        },
        baseCoin: {
          ...this.state.baseCoin,
          last: baseCoinPrice || 1,
        },
      });
    });

    // console.log('coin1Symbol outside: ', coin1Symbol);

    // GET INITIAL BID/ASK
    socket.emit('getInitialBidsAsks', coinSymbols);
    socket.on('getInitialBidsAsks', (bidsAsks) => {
      // FIX SYMBOL SCOPE!!!!!
      // console.log('coin1Symbol inside: ', coin1Symbol);
      if (bidsAsks[coin1Symbol] && bidsAsks[coin2Symbol]) {
        const { bid: coin1Bid, ask: coin1Ask } = bidsAsks[coin1Symbol];
        const { bid: coin2Bid, ask: coin2Ask } = bidsAsks[coin2Symbol];

        this.setState({
          coin1: {
            ...this.state.coin1,
            bid: coin1Bid,
            ask: coin1Ask,
          },
          coin2: {
            ...this.state.coin2,
            bid: coin2Bid,
            ask: coin2Ask,
          },
        });
      }
    });

    const throttledOrderUpdates1 = _.throttle((bids, asks) => {
      this.setState({
        coin1: {
          ...this.state.coin1,
          bids,
          asks,
        },
      });
    }, 200);

    const throttledOrderUpdates2 = _.throttle((bids, asks) => {
      this.setState({
        coin2: {
          ...this.state.coin2,
          bids,
          asks,
        },
      });
    }, 200);

    // SUBSCRIBE TO ORDER UPDATES
    socket.emit('subscribeToOrders', coinSymbols);
    socket.on('updateOrders', (formattedOrders) => {
      if (formattedOrders[coin1Symbol]) {
        const { bids, asks } = formattedOrders[coin1Symbol];

        throttledOrderUpdates1(bids, asks);

        // this.setState({
        //   coin1: {
        //     ...this.state.coin1,
        //     bids,
        //     asks,
        //   },
        // });
      }

      if (formattedOrders[coin2Symbol]) {
        const { bids, asks } = formattedOrders[coin2Symbol];
        throttledOrderUpdates2(bids, asks);

        // this.setState({
        //   coin2: {
        //     ...this.state.coin2,
        //     bids,
        //     asks,
        //   },
        // });
      }
    });

    // SUBSCRIBE TO LAST UPDATES

    const throttledTradeUpdate = _.throttle(({ tradedCoin, last }) => {
      this.setState({
        [tradedCoin]: {
          ...this.state[tradedCoin],
          last,
        },
      });
    }, 200);

    socket.emit('subscribeToTrades', coinSymbols);
    socket.on('updateLast', (tradeInfo) => {
      const { market, last } = tradeInfo;
      const tradedCoin = this.getCoinUsingMarket(market);
      if (tradedCoin) {
        throttledTradeUpdate({ tradedCoin, last });
      }
    });

    this.setState({
      coin1: {
        ...this.state.coin1,
        market: coin1Symbol,
      },
      coin2: {
        ...this.state.coin2,
        market: coin2Symbol,
      },
      baseCoin: {
        ...this.state.baseCoin,
        name: baseCoin,
        market: baseCoinSymbol,
      },
      resetOrderForm: false,
    });
  };

  updateCoinBalances = ({ coin1, coin2 }) => {
    if (coin1) {
      axios
        .get(`http://localhost:4001/balance/${coin1}`)
        .then(coin1Res =>
          this.setState({
            coin1: {
              ...this.state.coin1,
              available: coin1Res.data,
            },
          }))
        .catch(err => console.log(err));
    }
    if (coin2) {
      axios
        .get(`http://localhost:4001/balance/${coin2}`)
        .then(coin2Res =>
          this.setState({
            coin2: {
              ...this.state.coin2,
              available: coin2Res.data,
            },
          }))
        .catch(err => console.log(err));
    }
  }

  handleInputChange = (e) => {
    const { coin1, coin2, baseCoin } = this.state;
    const { minStep } = coin1;
    const sharesEntered = e.target.value;

    // No change if not all coins chosen or input a letter
    if (!(coin1.name && coin2.name && baseCoin.name) || isNaN(sharesEntered)) {
      return;
    }

    let sharesNumber = parseFloat(sharesEntered);
    const enteredPrecision = this.findPrecision(sharesNumber);
    const maxPrecision = this.findPrecision(minStep);

    if (enteredPrecision > maxPrecision) {
      sharesNumber = sharesNumber.toFixed(maxPrecision);
    }

    // For some idiotic reason, ' ' passes first isNaN test, but turns into NaN after parseFloat
    if (isNaN(sharesNumber)) {
      socket.emit('sharesUpdated', 0);
      this.setState({ sharesEntered: 0 });
      return;
    }

    socket.emit('sharesUpdated', sharesNumber);

    this.setState({
      sharesEntered: sharesNumber,
    });
  };

  render() {
    // console.log('rerendered');

    const {
      exchange,
      coinConnections,
      coin1,
      coin2,
      baseCoin,
      sellCoinConnections,
      bridgeCoins,
      sharesEntered,
      resetOrderForm,
    } = this.state;
    const { tradeCoins, baseCoins } = coinConnections;

    return (
      <div className="App">
        <CoinSelections
          coin1={coin1}
          coin2={coin2}
          baseCoin={baseCoin}
          tradeCoins={tradeCoins}
          sellCoinConnections={sellCoinConnections}
          bridgeCoins={bridgeCoins}
          handleCoin1Select={this.handleCoin1Select}
          handleCoin2Select={this.handleCoin2Select}
          handleBaseSelect={this.handleBaseSelect}
        />

        <OrderForm
          coin1={coin1}
          coin2={coin2}
          baseCoin={baseCoin}
          sharesEntered={sharesEntered}
          handleInputChange={this.handleInputChange}
          resetOrderForm={resetOrderForm}
          updateCoinBalances={this.updateCoinBalances}
        />
      </div>
    );
  }
}

export default App;

// Test trade log

// <h2>
// Trade log for: {coin2.name} / {baseCoin.name}
// </h2>
// <ul>
// {receivedTrades.length &&
//   receivedTrades.map(trade => (
//     <li>
//       {trade.time_local} : {trade.price}
//     </li>
//   ))}
// </ul>
