import {test} from '../../src/test-helpers/tap.js';
import fs from 'node:fs';
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

test('listener port and address consumers use the single derivation authority',
  async (t) => {
    const consumerContracts = new Map([
      ['src/entrypoint-runtime-options.js', 'resolveListenerPorts'],
      [
        'src/transport/node-address-resolution.js',
        'deriveTransportWebSocketPort',
      ],
      [
        'src/cdc/cdc-integration-service-node-join.js',
        'deriveTransportWebSocketAddress',
      ],
      ['src/cdc/cdc-event-handler.js', 'deriveTransportWebSocketAddress'],
      [
        'src/bootstrap/phases/connect-websocket-phase.js',
        'deriveTransportWebSocketAddress',
      ],
      ['src/constants/transport.js', 'deriveTransportWebSocketAddress'],
      ['src/node/node-constants.js', 'LISTENER_PORT_DEFAULT'],
    ]);

    for (const [path, authoritySymbol] of consumerContracts) {
      const source = fs.readFileSync(path, 'utf8');
      t.match(
        source,
        new RegExp(`\\b${authoritySymbol}\\b`, 'u'),
        `${path} should consume ${authoritySymbol}`,
      );
      t.notMatch(
        source,
        /WS_PORT_OFFSET|restPort\s*\+\s*2|8080|8081/iu,
        `${path} should not hardcode or re-derive listener ports locally`,
      );
    }
  });
