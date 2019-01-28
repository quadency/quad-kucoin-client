'use strict';

let main = (() => {
  var _ref = _asyncToGenerator(function* () {
    client.subscribeOrderActivate(function (msg, disconnect) {
      console.log('msg', JSON.stringify(msg));
    });
  });

  return function main() {
    return _ref.apply(this, arguments);
  };
})();

var _websocket = require('./websocket');

var _websocket2 = _interopRequireDefault(_websocket);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const client = new _websocket2.default({
  apiKey: '5c4d6fa2ef83c721c02cb8d9',
  secret: '0d526797-3651-4f04-ae4a-9fb647dab122',
  password: '1qaz@WSX'
});
client.urls.api = 'https://openapi-sandbox.kucoin.com';

main().then(() => {
  console.log('done');
});