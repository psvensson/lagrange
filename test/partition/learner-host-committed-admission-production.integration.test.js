// Production-bound witness (quest learner-host-from-committed-admission,
// verifier F1): a real PartitionService on the real raft-rs operation port,
// composed exactly as production composes it, admits a peer through its own
// admission path (admitPartitionRaftPeer -> the port's normalizedConfChange,
// which commits the admission context), is shut down and reopened from its
// durable record, and then addresses that peer from the committed node alone:
// its services cache is empty, there is no hint list, no fake port and no
// test address table. The status projection's address and the raft packets
// the reopened replica sends both name the admitted node.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  admitPartitionRaftPeer,
  reservePartitionRaftPeerIdentity,
} from '../../src/partition/partition-service-raft-membership-administration.js';
import {durableRecordBootstrap} from
  '../../src/raft/raft-committed-membership-stamp.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_MEMBERSHIP_ADMISSION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {handlerIdentityApi} from
  '../test-helpers/replica-handler-identity-fixture.js';
import {waitForCondition} from './partition-service-test-support.js';
import {withFoundingStamp} from './partition-founding-stamp.js';

const PARTITION_ID = 'learner-host-witness-p1';
const LEADER = `${PARTITION_ID}-r1`;
const LEARNER = 'replace-replica-learner-host-witness';
const LEADER_NODE = 'node-a';
const LEARNER_NODE = 'node-c';
const LEARNER_ADDRESS = `${LEARNER_NODE}/partition/${LEARNER}`;
const TABLE_NAME = 'learner_host_witness';
const BUDGET_MS = 10_000;
const TEST_TIMEOUT_MS = 60_000;

function environment(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: LEADER_NODE}});
  LoggingService.getInstance().initialize({level: 'error'});
  t.after(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
}

// A transport that registers handlers like the router and records every
// address a raft packet is delivered to (nothing answers for the learner).
function recordingTransport() {
  const handlers = new Map();
  const sentTo = [];
  return {
    sentTo,
    register(address, handler) {
      handlers.set(address, handler);
    },
    ...handlerIdentityApi(handlers),
    async deliver(address) {
      sentTo.push(address);
      return buildDeliveryEnvelope({acknowledged: true}, {});
    },
  };
}

function options(directory, transport) {
  return {
    partitionId: PARTITION_ID,
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
    replicaId: LEADER,
    replicaIds: [LEADER],
    nodeId: LEADER_NODE,
    deferElection: true,
    transport,
    // An empty services cache: no row ever names the learner's node.
    systemTableCache: new SystemTableCache(),
    dbPath: path.join(directory, 'partition.sqlite'),
  };
}

function learnerPeer(service) {
  return service.raft.readStatus().peers.find((peer) =>
    peer.replicaIdentity === LEARNER) ?? null;
}

test('a reopened leader addresses the peer it admitted from the committed ' +
  'node alone (real port, production composition)',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'learner-host-'));
  const services = [];
  t.after(async () => {
    await Promise.allSettled(services.map((service) => service.shutdown()));
    fs.rmSync(directory, {recursive: true, force: true});
  });

  const transport = recordingTransport();
  const first = new PartitionService(withFoundingStamp(
    options(directory, transport)));
  services.push(first);
  await first.initialize();
  await first.raft.campaign();
  assert.equal(first.raft.readStatus().role, RAFT_ROLE.LEADER,
    'setup: the lone founder leads');
  // The production admission pair the request owner makes (its node is
  // the committed operation's target node).
  reservePartitionRaftPeerIdentity(first, LEARNER);
  const admission = admitPartitionRaftPeer(first, {
    replicaIdentity: LEARNER, nodeId: LEARNER_NODE});
  // The port queues the proposal behind its turn; its settled answer is
  // the admission's outcome.
  const settled = admission.settled ? await admission.settled : admission;
  assert.equal(settled.outcome, RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED,
    `setup: the leader proposed the admission (${JSON.stringify(settled)})`);
  assert.equal(await waitForCondition(() => learnerPeer(first) !== null,
    BUDGET_MS), true, 'setup: the admission is applied');
  await first.shutdown();

  const reopenedTransport = recordingTransport();
  const reopened = new PartitionService({
    ...options(directory, reopenedTransport),
    bootstrapMembership: durableRecordBootstrap(), identityExisted: true});
  services.push(reopened);
  await reopened.initialize();
  const peer = learnerPeer(reopened);
  assert.ok(peer, 'the reopened configuration names the admitted peer');
  assert.equal(peer.address, LEARNER_ADDRESS,
    'the status projection addresses it on the committed node');
  reopened.raft.startScheduling();
  await reopened.raft.campaign();
  assert.equal(await waitForCondition(() =>
    reopenedTransport.sentTo.includes(LEARNER_ADDRESS), BUDGET_MS), true,
  'the reopened replica sends its raft packets to the committed node ' +
    `(sent to ${JSON.stringify([...new Set(reopenedTransport.sentTo)])})`);
});
