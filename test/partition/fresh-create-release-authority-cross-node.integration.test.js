// Production-bound witness, quest fresh-create-release-authority-from-committed-operation,
// receipt cross-node-founding-release-cut-over (red test 1; run
// fresh-create-b-5d7469476-20261102T113540Z, 11:41:55.388).
//
// A fresh founding group of the control partition (no write origin) has two
// GENESIS founders on two nodes, real PartitionServices on the real raft-rs
// operation port, and one real ReplicaHandler per node. The release route
// between nodes is JSON-encoded, as the production remote delivery is
// (message-router-delivery-encoding.js); a node's delivery to itself passes
// the payload by reference, as production local delivery does. The founder on
// the non-leader node runs releaseFreshCreate for its committed create
// operation (MATERIALIZED, GENESIS founding stamp in its first step).
// Today the leader cannot validate the founder's node-local token and answers
// OPERATOR_REQUIRED{fresh_storage_or_operator_authority}; the repair makes the
// answering leader read the committed founding create-operation row, and the
// release reaches CUT_OVER.
//
// Fixture seams (stated): the control-plane gateway of both handlers answers
// the replica_operations rows of one shared durable map; the founding group
// is formed directly (GENESIS stamp of both founders) rather than through the
// provisioning job; the first founder campaigns to lead.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SQL_TRANSACTIONS_SCHEMA} from
  '../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../src/constants/tables.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {genesisStamp} from '../../src/raft/raft-committed-membership-stamp.js';
import {OPERATION_METADATA_KEY, OperationType} from '../../src/rebalancer/replica-status.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {createLoopbackTransport, waitForCondition} from './partition-service-test-support.js';

const PARTITION_ID = INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS];
const NODE_A = 'founder-node-a';
const NODE_B = 'founder-node-b';
const REPLICA_A = `${PARTITION_ID}-founder-a`;
const REPLICA_B = `${PARTITION_ID}-founder-b`;
const FOUNDERS = Object.freeze([REPLICA_A, REPLICA_B]);
const FOUNDER_NODES = Object.freeze({[REPLICA_A]: NODE_A, [REPLICA_B]: NODE_B});
const ADDRESS_OF = (replicaId) => `${FOUNDER_NODES[replicaId]}/partition/${replicaId}`;
const BUDGET_MS = 15000;
const TEST_TIMEOUT_MS = 90000;
const CREATED_AT = 1_793_600_000_000;

function environment(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_A}});
  LoggingService.getInstance().initialize({level: 'error'});
  t.after(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
}

// One release-route registry; each node's router passes its own deliveries
// by reference and encodes every other node's as JSON (remote delivery).
function nodeRouters() {
  const handlers = new Map();
  const make = (nodeId) => ({
    register(address, handler) {
      handlers.set(address, handler);
    },
    getRegisteredHandler: (address) => handlers.get(address) ?? null,
    unregisterExact(address, handler) {
      if (handlers.get(address) !== handler) return false;
      handlers.delete(address);
      return true;
    },
    async deliver(address, payload, options = {}) {
      const handler = handlers.get(address);
      if (!handler) throw new Error(`No handler registered for ${address}`);
      const local = (options.targetNodeId ?? address.split('/')[0]) === nodeId;
      const carried = local ? payload : JSON.parse(JSON.stringify(payload));
      const answer = await handler({payload: carried});
      return buildDeliveryEnvelope({acknowledged: true},
        local ? answer : JSON.parse(JSON.stringify(answer)));
    },
  });
  return {[NODE_A]: make(NODE_A), [NODE_B]: make(NODE_B)};
}

function operationRow(replicaId, nodeId) {
  return {
    operation_id: `schema-job-release-authority:operation:${nodeId}`,
    type: OperationType.ADD, entity_type: 'partition', entity_id: PARTITION_ID,
    partition_id: PARTITION_ID, replica_id: replicaId, source_node_id: NODE_A,
    target_node_id: nodeId, status: 'syncing', workflow_step: 'SYNCING',
    created_at: CREATED_AT, updated_at: CREATED_AT + 10, completed_at: null,
    create_admission_state: 'MATERIALIZED',
    create_admission_token: `admission:${replicaId}`,
    create_admission_replica_created_at: CREATED_AT + 1,
    create_admission_attempt_token: `attempt:${replicaId}:1`,
    create_admission_previous_attempt_token: null,
    create_admission_attempt_seq: 1,
    create_admission_workflow_updated_at: CREATED_AT + 10,
    create_admission_owner_incarnation: 1,
    steps_history: JSON.stringify([{
      [OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP]:
        genesisStamp([...FOUNDERS], {...FOUNDER_NODES})}]),
  };
}

function gatewayOver(rows) {
  return {
    async readAuthoritativeRows(tableName, sql, params) {
      if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
          sql.includes('WHERE operation_id = ?')) {
        return {success: true, rows: rows.filter((row) =>
          row.operation_id === params[0]).map((row) => ({...row}))};
      }
      return {success: true, rows: []};
    },
  };
}

test('a non-leader founder of a fresh no-origin group releases through the ' +
  'leader on another node (JSON remote delivery, real ports)',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  environment(t);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-authority-'));
  const transport = createLoopbackTransport();
  const routers = nodeRouters();
  const rows = [operationRow(REPLICA_A, NODE_A), operationRow(REPLICA_B, NODE_B)];
  const services = [];
  const handlers = [];
  t.after(async () => {
    for (const handler of handlers) {
      await handler.participantReleaseRecovery.shutdown().catch(() => {});
    }
    await Promise.allSettled(services.map((service) => service.shutdown()));
    fs.rmSync(directory, {recursive: true, force: true});
  });
  const build = (replicaId, deferElection) => {
    const service = new PartitionService({
      partitionId: PARTITION_ID, replicaId, replicaIds: [...FOUNDERS],
      peerAddresses: FOUNDERS.map(ADDRESS_OF), nodeId: FOUNDER_NODES[replicaId],
      tableId: TABLES.SQL_TRANSACTIONS, tableName: TABLES.SQL_TRANSACTIONS,
      schema: SQL_TRANSACTIONS_SCHEMA, systemTableCache: new SystemTableCache(),
      transport, dbPath: path.join(directory, `${replicaId}.sqlite`), deferElection,
      bootstrapMembership: genesisStamp([...FOUNDERS], {...FOUNDER_NODES}),
    });
    services.push(service);
    return service;
  };
  const founderA = build(REPLICA_A, false);
  const founderB = build(REPLICA_B, true);
  await founderA.initialize();
  await founderB.initialize();
  await founderA.raft.campaign();
  assert.equal(await waitForCondition(() =>
    founderA.raft.readStatus().role === RAFT_ROLE.LEADER, BUDGET_MS), true,
  'setup: founder A leads');
  founderB.startElection?.();
  const host = (nodeId, service) => {
    const handler = new ReplicaHandler({nodeId, ownerIncarnation: 1,
      systemTableCache: service.systemTableCache, cdcIntegrationService: {},
      controlPlaneSystemTableGateway: gatewayOver(rows),
      createPartitionService: (options) => new PartitionService(options),
      messageRouter: routers[nodeId], dataDir: directory});
    handler.registerWithRouter(routers[nodeId]);
    handler.replaceLocalReplicaService(service.replicaId, service);
    handlers.push(handler);
    return handler;
  };
  host(NODE_A, founderA);
  const handlerB = host(NODE_B, founderB);
  // B's committed create admission, as its create path holds it.
  const rowB = rows[1];
  const evidenceB = await handlerB.getReplicaCreateAdmissionOwner()
    .authorizeParticipantRelease({operationId: rowB.operation_id,
      operationType: rowB.type, entityType: rowB.entity_type,
      entityId: rowB.entity_id, partitionId: PARTITION_ID, replicaId: REPLICA_B,
      targetNodeId: NODE_B, admissionToken: rowB.create_admission_token,
      replicaCreatedAt: rowB.create_admission_replica_created_at});
  assert.ok(evidenceB, 'setup: B holds its MATERIALIZED create admission');
  const keepAlive = setInterval(() => {}, 250);
  let answer;
  try {
    answer = await handlerB.participantReleaseRecovery.releaseFreshCreate(PARTITION_ID, {
      createAdmissionEvidence: evidenceB, identityExisted: false,
      deadlineAtMs: Date.now() + BUDGET_MS});
  } catch (error) {
    assert.fail(`the non-leader founder's release failed: ${error.message}`);
  } finally {
    clearInterval(keepAlive);
  }
  assert.equal(answer.outcome, OUTCOME.CUT_OVER,
    'the leader on the other node released the fresh founding group');
});
