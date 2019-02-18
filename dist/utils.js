'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
/* eslint-disable no-bitwise */

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : r & 0x3 | 0x8;
    return v.toString(16);
  });
}

const COMMON_CURRENCIES = {
  CAN: 'CanYaCoin',
  XRB: 'NANO',
  XBT: 'BTC',
  BCC: 'BCH',
  DRK: 'DASH',
  BCHABC: 'BCH',
  BCHSV: 'BSV'
};

exports.COMMON_CURRENCIES = COMMON_CURRENCIES;
exports.uuidv4 = uuidv4;