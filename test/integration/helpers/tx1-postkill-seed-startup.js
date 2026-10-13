/**
 * Real seed startup owner's decision after TX1 M1 process loss, with no live
 * external peer. Three colocated raft replicas are not three fault domains.
 * This cannot grant serving authority; it does not restart the node.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readDurableNodesTableSnapshot, readDurableServicesIdentitySnapshot} from
  '../../../src/bootstrap/rejoin-hints-durable-evidence.js';
import {
  readPersistedLocalClusterId,
  readRejoinHints,
  resolveAutoRejoinStartupDecision,
} from '../../../src/bootstrap/rejoin-hints.js';
import {MEMBERSHIP_OWNER_OUTCOME_TYPE} from
  '../../../src/bootstrap/rejoin-hints-constants.js';

const {dataDir} = JSON.parse(fs.readFileSync(process.stdin.fd, 'utf8'));
assert.equal(typeof dataDir, 'string');
const hints = await readRejoinHints(dataDir);
const clusterId = await readPersistedLocalClusterId(dataDir);
const nodeId = hints?.localNodeId ?? 'tx1-m1-seed';
const nodeAddress = hints?.localNodeAddress ?? null;
const decision = await resolveAutoRejoinStartupDecision({
  dataDir, nodeId, nodeAddress, expectedClusterId: clusterId || undefined,
  probePeerAddress: async () => false,
});
const partitionRoot = path.join(dataDir, 'partitions');
const topLevel = fs.readdirSync(dataDir).sort();
const partitions = fs.existsSync(partitionRoot) ?
  fs.readdirSync(partitionRoot).sort() : [];
const nodes = await readDurableNodesTableSnapshot({dataDir, nodeId, nodeAddress});
const services = await readDurableServicesIdentitySnapshot(dataDir);
console.error('TX1_M1_SEED_STARTUP_DIAGNOSTIC ' + JSON.stringify({
  durableStateDetected: decision.durableStateDetected,
  state: decision.state,
  outcome: decision.membershipOwnerOutcome?.outcomeType,
  hintsPresent: hints !== null,
  topLevel, partitions,
  nodes: {hasDurableNodesTable: nodes.hasDurableNodesTable,
    clusterNodeCount: nodes.clusterNodeCount,
    matchedLocalIdentity: nodes.matchedLocalIdentity,
    durableEvidenceUnreadable: nodes.durableEvidenceUnreadable},
  services: {state: services.state, rowCount: services.rows?.length,
    conflicting: services.conflicting, empty: services.empty},
}));
assert.equal(decision.durableStateDetected, true,
  'twelve existing SQLite files cannot become a fresh seed');
assert.notEqual(decision.mode, 'seed',
  'one physical host without external recovery authority may not serve');
assert.notEqual(decision.state, 'fresh_seed',
  'surviving replica history must not be interpreted as empty');
assert.equal(decision.membershipOwnerOutcome?.outcomeType,
  MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP,
  'the startup owner must explicitly retain its blocked membership result');
process.stdout.write(JSON.stringify({
  kind: 'TX1_M1_POSTKILL_SEED_ADMISSION', state: decision.state,
  mode: decision.mode, durableStateDetected: decision.durableStateDetected,
  outcome: decision.membershipOwnerOutcome?.outcomeType,
  reason: decision.membershipOwnerOutcome?.reasonCode,
  peerContact: false, clusterIdExpected: clusterId !== null,
  onePhysicalHost: true, servingAuthorized: false,
}) + '\n');
