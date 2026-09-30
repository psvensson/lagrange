/**
 * Boot incarnation projection/propagate: the rejoin-hints file projects the
 * boot incarnation the owner reserved (boot-incarnation-owner.js; its own
 * tests prove the monotonic reservation), held stable across the 1s
 * persistence cadence, and the publisher stamps it onto every node state
 * update message so receivers can fence stale-incarnation writers.
 */

import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from '../../src/test-helpers/tap.js';
import {BOOT_INCARNATION_REQUIRED} from
  '../../src/bootstrap/boot-incarnation-contract.js';
import {
  buildBootstrapRejoinHintsSnapshot,
  buildRejoinHintsSnapshot,
  readRejoinHints,
  RejoinHintsPersistenceService,
} from '../../src/bootstrap/rejoin-hints.js';
import {
  NodeStatePublicationOwner,
} from '../../src/bootstrap/shared/node-state-publication-owner.js';
import {ControlPlaneField} from
  '../../src/control-plane/control-plane-constants.js';

const LOCAL_NODE_ID = 'node-local';
const LOCAL_NODE_ADDRESS = 'node-local:8080';
const PEER_NODE_ADDRESS = 'peer-a:8080';

function createSystemTableCache(nodeRows = []) {
  return {
    getAll(tableName) {
      return tableName === 'nodes' ? nodeRows : [];
    },
    get() {
      return null;
    },
  };
}

test('both hints builders carry the boot incarnation when known', async (t) => {
  const steadyState = buildRejoinHintsSnapshot({
    systemTableCache: createSystemTableCache(),
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    nodeRole: 'seed',
    bootIncarnation: 7,
    now: () => 1234,
  });
  t.equal(
    steadyState.bootIncarnation,
    7,
    'the steady-state snapshot carries the boot incarnation',
  );

  const bootstrap = buildBootstrapRejoinHintsSnapshot({
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    nodeRole: 'joiner',
    peerAddresses: [PEER_NODE_ADDRESS],
    bootIncarnation: 3,
    now: () => 1234,
  });
  t.equal(
    bootstrap.bootIncarnation,
    3,
    'the bootstrap snapshot carries the boot incarnation',
  );
});

test('an absent incarnation leaves the field off (pre-incarnation ' +
  'compatibility)', async (t) => {
  const snapshot = buildRejoinHintsSnapshot({
    systemTableCache: createSystemTableCache(),
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    nodeRole: 'seed',
    now: () => 1234,
  });
  t.equal(
    Object.prototype.hasOwnProperty.call(snapshot, 'bootIncarnation'),
    false,
    'a pre-incarnation write has no bootIncarnation field',
  );
  const zero = buildRejoinHintsSnapshot({
    systemTableCache: createSystemTableCache(),
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    nodeRole: 'seed',
    bootIncarnation: 0,
    now: () => 1234,
  });
  t.equal(
    Object.prototype.hasOwnProperty.call(zero, 'bootIncarnation'),
    false,
    'incarnation 0 (pre-incarnation) is never written',
  );
});

test('the persistence cadence rewrites the hints with the SAME ' +
  'incarnation', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'boot-incarnation-'));
  try {
    const service = new RejoinHintsPersistenceService({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      nodeRole: 'seed',
      bootIncarnation: 5,
      getSystemTableCache: () => createSystemTableCache(),
      writeIntervalMs: 10,
    });
    await service.persistNow();
    await service.persistNow();
    await service.persistNow();
    t.equal(
      (await readRejoinHints(dataDir))?.bootIncarnation,
      5,
      'repeated cadence writes project the same reservation',
    );
    await service.stop();
  } finally {
    await rm(dataDir, {recursive: true, force: true});
  }
});

test('the publication owner stamps the boot incarnation onto every node ' +
  'state update', async (t) => {
  // Capture the built message at the kernel-ingress seam: the incarnation
  // field is attached synchronously during message construction, before
  // any dispatch/target decision, so a reachable kernel proves the field.
  let captured = null;
  const owner = new NodeStatePublicationOwner({
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    bootIncarnation: 9,
    delegates: {
      getNodeCapabilities: () => [],
      getMessageRouter: () => ({
        async deliver(_target, msg) {
          captured = msg;
          return {acknowledged: true};
        },
      }),
      getControlPlaneKernelIngress: () => ({
        resolveNodeStateUpdateTargetCandidates: () =>
          ['control-plane:9000'],
      }),
    },
  });
  await owner.sendControlPlaneNodeStateUpdate({
    state: 'ready',
    heartbeatOnly: true,
  });
  t.ok(captured, 'the kernel ingress received the built message');
  t.equal(
    captured[ControlPlaneField.BOOT_INCARNATION],
    9,
    'the emitted state update carries the boot incarnation',
  );
});

test('a publication owner without an issued incarnation is refused',
  async (t) => {
    for (const bootIncarnation of [undefined, 0, -1, 1.5]) {
      t.throws(() => new NodeStatePublicationOwner({
        nodeId: LOCAL_NODE_ID,
        nodeAddress: LOCAL_NODE_ADDRESS,
        bootIncarnation,
        delegates: {getNodeCapabilities: () => []},
      }), {code: BOOT_INCARNATION_REQUIRED},
      `incarnation ${String(bootIncarnation)} is never defaulted`);
    }
  });
