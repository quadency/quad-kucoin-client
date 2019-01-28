'use strict';

var _api = require('./api');

var _api2 = _interopRequireDefault(_api);

var _websocket = require('./websocket');

var _websocket2 = _interopRequireDefault(_websocket);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

module.exports = {
  RestClient: _api2.default,
  WebsocketClient: _websocket2.default
};