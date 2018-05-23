import socketIOClient from 'socket.io-client';

const endpoint = process.env.CLIENT_SOCKET_ENDPOINT;
const socket = socketIOClient(endpoint);

export default socket;
