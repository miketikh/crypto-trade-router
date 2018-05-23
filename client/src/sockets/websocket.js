import socketIOClient from 'socket.io-client';

const endpoint = process.env.CLIENT_SOCKET_ENDPOINT || 'http://127.0.0.1:4001';
const socket = socketIOClient(endpoint);

export default socket;
