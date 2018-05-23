import socketCluster from 'socketcluster-client';

const API_CREDENTIALS = {
  apiKey: process.env.REACT_APP_COIN_KEY,
  apiSecret: process.env.REACT_APP_COIN_SECRET,
};

const options = {
  hostname: 'sc-02.coinigy.com',
  port: '443',
  secure: 'true',
};

// ********* SOCKET INITIAL CONNECTION ***************

const SCsocket = socketCluster.connect(options);

let connected = false;

SCsocket.on('connect', (status) => {
  SCsocket.on('error', (err) => {
    console.log('cannot connect', err);
  });

  SCsocket.emit('auth', API_CREDENTIALS, (err, token) => {
    if (!err && token) {
      console.log('Socket successfully connected');
      connected = true;
    } else {
      console.log(err);
    }
  });
});

export default SCsocket;

// ********** SOCKET FUNCTIONS ***************

const updateData = (cb) => {
  const scChannel = SCsocket.subscribe('ORDER-BTRX--ADA--BTC');
  scChannel.watch((data) => {
    cb(data);
    // console.log(data);
  });

  // const channel2 = SCsocket.subscribe('ORDER-BTRX--ANT--BTC');
  // channel2.watch(function(data) {
  //   console.log(data);
  // });
};
