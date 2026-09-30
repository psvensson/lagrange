/**
 * D5: the snapshot (bulk) channel IDENTIFY carries the exact generation that
 * dialled it, like the primary channel's IDENTIFY. The bulk socket is the
 * second connection a node opens to a peer; leaving its identity unstamped
 * let a snapshot transfer be adopted under an incarnation-less identity while
 * every other endpoint-bearing write of the same node carried one.
 *
 * The value is the dialler's issued boot incarnation (boot-incarnation-
 * contract.js): absence is refused before the socket is opened, and 0 is
 * never sent.
 */

import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

import {test} from '../../src/test-helpers/tap.js';
import {
  createBulkTransferChannelRegistry,
} from '../../src/transport/bulk-transfer-channel.js';
import {ROUTER_IDENTIFY_CHANNEL, ROUTER_MESSAGE_TYPE} from
  '../../src/constants/transport.js';
import {BOOT_INCARNATION_REQUIRED} from
  '../../src/bootstrap/boot-incarnation-contract.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';

const SELF_NODE_ID = 'self-node';
const SELF_ADDRESS = 'ws://self:9999';
const PEER_ADDRESS = 'ws://peer-1:9999';

class FakeBulkSocket extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
    queueMicrotask(() => this.emit('open'));
  }
  send(data) {
    this.sent.push(data);
  }
  close() {}
  terminate() {}
}

function createRegistry() {
  const sockets = [];
  const registry = createBulkTransferChannelRegistry({
    createWebSocket: () => {
      const socket = new FakeBulkSocket();
      sockets.push(socket);
      return socket;
    },
  });
  return {registry, sockets};
}

test('the bulk IDENTIFY frame stamps the dialling node\'s boot incarnation',
  async (t) => {
    const {registry, sockets} = createRegistry();
    try {
      await registry.dial({
        nodeId: 'peer-1',
        address: PEER_ADDRESS,
        identify: {
          nodeId: SELF_NODE_ID,
          nodeAddress: SELF_ADDRESS,
          bootIncarnation: TEST_BOOT_INCARNATION,
        },
      });
      const identify = JSON.parse(sockets[0].sent[0]);
      t.equal(identify.type, ROUTER_MESSAGE_TYPE.IDENTIFY);
      t.equal(identify.channel, ROUTER_IDENTIFY_CHANNEL.BULK,
        'the first frame is the bulk IDENTIFY');
      t.equal(identify.bootIncarnation, TEST_BOOT_INCARNATION,
        'the snapshot channel identifies the exact generation');
    } finally {
      registry.closeAll();
    }
  });

test('a bulk dial without an issued incarnation is refused before any ' +
  'socket is opened (never stamped 0)', async (t) => {
  for (const bootIncarnation of [undefined, null, 0, -1, 1.5]) {
    const {registry, sockets} = createRegistry();
    try {
      await t.rejects(registry.dial({
        nodeId: 'peer-1',
        address: PEER_ADDRESS,
        identify: {
          nodeId: SELF_NODE_ID,
          nodeAddress: SELF_ADDRESS,
          bootIncarnation,
        },
      }), {code: BOOT_INCARNATION_REQUIRED},
      `incarnation ${String(bootIncarnation)} is refused`);
      t.equal(sockets.length, 0, 'no bulk socket was opened');
    } finally {
      registry.closeAll();
    }
  }
});

test('the production snapshot-channel wiring supplies the node router\'s ' +
  'own issued incarnation (no second source)', (t) => {
  const source = readFileSync(fileURLToPath(new URL(
    '../../src/bootstrap/shared/snapshot-catchup-wiring.js',
    import.meta.url)), 'utf8');
  t.match(source, /bootIncarnation:\s*messageRouter\.bootIncarnation/u,
    'the dial identity takes the incarnation from the message router, ' +
    'which requires an issued one at construction');
  t.end();
});
