import KucoinRest from './api';
import KucoinWebsocket from './websocket';

module.exports = {
  RestClient: KucoinRest,
  WebsocketClient: KucoinWebsocket,
};
