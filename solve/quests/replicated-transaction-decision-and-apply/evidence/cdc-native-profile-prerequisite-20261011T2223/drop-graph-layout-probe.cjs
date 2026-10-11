'use strict';
const v8 = require('node:v8');
const localAddress = 'LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL1';
const remoteAddress = 'RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR2';
const family = 'IPv6';
const localInfo = {__proto__: null, address: localAddress, port: 65535, family};
const remoteInfo = {__proto__: null, address: remoteAddress, port: 65535, family};
const data = {__proto__: null,
  localAddress: localInfo.address, localPort: localInfo.port, localFamily: localInfo.family,
  remoteAddress: remoteInfo.address, remotePort: remoteInfo.port, remoteFamily: remoteInfo.family};
globalThis.__cdcDropGraphProbe = [data, localInfo, remoteInfo];
v8.writeHeapSnapshot('/probe/drop-graph-layout-literal.heapsnapshot');
process.stdout.write(JSON.stringify({node: process.version, v8: process.versions.v8,
  localAddressLength: localAddress.length, remoteAddressLength: remoteAddress.length,
  familyLength: family.length}) + '\n');
