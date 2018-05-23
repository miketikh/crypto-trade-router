# Crypto Trade Router

## What is the crypto trade router?

Currently on exchanges you have to trade an **alt coin** against a **base coin.** For example, you can trade **TRX** against a base of **BTC,** or **ETH**.

### The Problem:

**What happens if you want to trade two alt coins against each other?**

For example: What if you're holding trade coin A, bad news comes out, and you want to buy coin B instead? This is a scenario that happens frequently for crypto day traders.

Currently you would have to:

1.  Find what `base coins` coin A trades against
2.  Find what `base coins` coin B trades against
3.  Find a match, choose one of them to use
4.  Sell coin A for a base coin manually
5.  Buy coin B for a base Coin

This process is **horribly inefficient** for a number of reasons!

1.  **Time:** Buy the time you find a connection, sell a coin, and buy the next one, the prices may have changed. Especially if news came out.
2.  **Efficiency:** What if there are many possible base coins? For example, **NEO** and **LTC** both trade against **BTC, ETH, BNB, and USDT.** Each one has different prices and amounts you can trade! How do you determine the best route?

### The Solution:

**Crypto Trade Router** attempts to solve these problems!

Crypto trade router:

1.  Allows you to select any alt coin
2.  Maps out any other alt coin it can be connected to
3.  If there are multiple baseCoins they can both trade against, uses **smartRouting** to choose the best route to trade (based on price and liquidity).

It is designed to save time and get the best price on any crypto trade!

Currently the router is integrated with **binance.** Looking to add more exchanges going forward.

## How to Use:

1.  Clone the git repo locally
2.  Follow the instructions below to create the necessary local variables
3.  In terminal:

* `cd` into root, run `npm install`
* run `npm run serve`

4.  Open a browser, navigate to localhost:4001
5.  Use the app

## Local Variable Configuration:

* Create a `.env` file in root
* Inside the file, define the following variables in the format `VAR=12345`:
  * `BINANCE_API_KEY`
  * `BINANCE_API_SECRET`
  * `PORT`
  * `SERVER_URL` - Base url client uses to make server requests
  * `CLIENT_SOCKET_ENDPOINT` - Server socket endpoint
  * Optional: `COINIGY_API_KEY`, `COINIGY_API_SECRET`
