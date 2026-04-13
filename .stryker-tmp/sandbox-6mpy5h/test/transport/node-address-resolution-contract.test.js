// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {
  parseAddressPartsResult,
  resolveNodeWebSocketAddressResult,
} from '../../src/transport/node-address-resolution.js';

test('parseAddressPartsResult uses explicit presence states for parsed addresses',
  async (t) => {
    t.same(
      parseAddressPartsResult('example.internal:8080'),
      {
        state: 'parsed',
        host: {
          state: 'present',
          value: 'example.internal',
        },
        port: {
          state: 'present',
          value: 8080,
        },
        protocol: {
          state: 'absent',
        },
      },
      'parsed address parts should not carry null-valued fields',
    );
  });

test('parseAddressPartsResult uses explicit absence states for missing parts',
  async (t) => {
    t.same(
      parseAddressPartsResult('example.internal'),
      {
        state: 'parsed',
        host: {
          state: 'present',
          value: 'example.internal',
        },
        port: {
          state: 'absent',
        },
        protocol: {
          state: 'absent',
        },
      },
      'missing host subfields should be represented explicitly',
    );
  });

test('resolveNodeWebSocketAddressResult exposes explicit unavailable state',
  async (t) => {
    t.same(
      resolveNodeWebSocketAddressResult({
        targetNodeId: 'node-2',
      }),
      {
        state: 'unavailable',
        reason: 'canonical_websocket_metadata_missing',
      },
      'websocket address resolution should return a contract state instead of null',
    );
  });
