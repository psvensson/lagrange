// Fixture of quest fresh-create-release-authority-from-committed-operation:
// a fresh founding group (no write origin) of the control partition with its
// GENESIS founders on separate nodes, real PartitionServices on the real
// raft-rs operation port, and one real ReplicaHandler per node. The release
// route between nodes is JSON-encoded, as production remote delivery is; a
// node's delivery to itself passes the payload by reference, as production
// local delivery does. Seams (stated): each handler's control-plane gateway
// answers the replica_operations rows of one shared durable map (with an
// optional per-node read fault); the group is formed directly from its GENESIS
// stamp rather than by the provisioning job.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
import {COMMITTED_MEMBERSHIP_STAMP_KIND} from
  '../../src/raft/raft-committed-membership-constants.js';
import {OPERATION_METADATA_KEY, OperationType} from '../../src/rebalancer/replica-status.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {createLoopbackTransport, waitForCondition} from './partition-service-test-support.js';

const PARTITION_ID = INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS];
const CREATED_AT = 1_793_600_000_000;
const BUDGET_MS = 15000;
// The create-admission owner is shared per (node, owner incarnation) within a
// process; each formed group takes its own incarnation so no group reads
// another group's operation rows.
let nextOwnerIncarnation = 1;
const AUTHORITY_REFUSAL = Object.freeze({success: false, outcome: 'owner_not_ready',
  error: 'all_services_filtered_by_readiness'});

function nodeOf(index) {
  return `founder-node-${String.fromCharCode(97 + index)}`;
}

function replicaOf(index) {
  return `${PARTITION_ID}-founder-${String.fromCharCode(97 + index)}`;
}

function nodeRouters(nodeIds) {
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
  return Object.fromEntries(nodeIds.map((nodeId) => [nodeId, make(nodeId)]));
}

/**
 * The committed create-operation row of one founder.
 * @param {Object} options - {replicaId, nodeId, founders, founderNodes,
 *   stampKind ('genesis' | 'committed'), completed, partitionId}.
 * @return {Object} A replica_operations row.
 */
function founderOperationRow({replicaId, nodeId, founders, founderNodes,
  stampKind = 'genesis', completed = false, partitionId = PARTITION_ID}) {
  const stamp = stampKind === 'genesis' ?
    genesisStamp([...founders], {...founderNodes}) :
    {kind: COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED};
  return {
    operation_id: `schema-job-release-authority:operation:${partitionId}:${nodeId}`,
    type: OperationType.ADD, entity_type: 'partition', entity_id: partitionId,
    partition_id: partitionId, replica_id: replicaId, source_node_id: nodeOf(0),
    target_node_id: nodeId, status: 'syncing', workflow_step: 'SYNCING',
    created_at: CREATED_AT, updated_at: CREATED_AT + 10,
    completed_at: completed ? CREATED_AT + 20 : null,
    create_admission_state: 'MATERIALIZED',
    create_admission_token: `admission:${replicaId}`,
    create_admission_replica_created_at: CREATED_AT + 1,
    create_admission_attempt_token: `attempt:${replicaId}:1`,
    create_admission_previous_attempt_token: null,
    create_admission_attempt_seq: 1,
    create_admission_workflow_updated_at: CREATED_AT + 10,
    create_admission_owner_incarnation: 1,
    steps_history: JSON.stringify([{
      [OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP]: stamp}]),
  };
}

// faults: {[nodeId]: {refusals, onRefusal}} - the authoritative operation
// read of that node's gateway answers unavailable `refusals` times.
function gatewayOver(rows, nodeId, faults) {
  return {
    async readAuthoritativeRows(tableName, sql, params) {
      if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS ||
          !sql.includes('WHERE operation_id = ?')) {
        return {success: true, rows: []};
      }
      const fault = faults[nodeId];
      faults.reads = {...faults.reads, [nodeId]: (faults.reads?.[nodeId] ?? 0) + 1};
      await fault?.holdRead?.(params[0]);
      if (fault && fault.refusals > 0) {
        fault.refusals -= 1;
        fault.refused = (fault.refused ?? 0) + 1;
        await fault.onRefusal?.();
        return AUTHORITY_REFUSAL;
      }
      return {success: true, rows: rows.filter((row) =>
        row.operation_id === params[0]).map((row) => ({...row}))};
    },
  };
}

/**
 * Form the founding group and host it.
 * @param {Object} t - The node:test context (for cleanup).
 * @param {Object} options - {founderCount (2), leaderIndex (0), rowOverrides
 *   ({[index]: founderOperationRow options}), extraRows, faults}.
 * @return {Promise<Object>} {services, handlers, rows, faults, founders,
 *   founderNodes, evidenceFor(index), release(index, evidence, budgetMs),
 *   directory, transport}.
 */
async function formFoundingGroup(t, {founderCount = 2, leaderIndex = 0,
  rowOverrides = {}, extraRows = [], faults = {}} = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-authority-'));
  const transport = createLoopbackTransport();
  const founders = Array.from({length: founderCount}, (_, index) => replicaOf(index));
  const nodes = Array.from({length: founderCount}, (_, index) => nodeOf(index));
  const founderNodes = Object.fromEntries(founders.map((id, index) => [id, nodes[index]]));
  const routers = nodeRouters(nodes);
  const ownerIncarnation = nextOwnerIncarnation;
  nextOwnerIncarnation += 1;
  const rows = founders.map((replicaId, index) => founderOperationRow({replicaId,
    nodeId: nodes[index], founders, founderNodes, ...(rowOverrides[index] ?? {})}));
  rows.push(...extraRows);
  const services = [];
  const handlers = [];
  t.after(async () => {
    for (const handler of handlers) {
      await handler.participantReleaseRecovery.shutdown().catch(() => {});
    }
    await Promise.allSettled(services.map((service) => service.shutdown()));
    fs.rmSync(directory, {recursive: true, force: true});
  });
  const addressOf = (replicaId) => `${founderNodes[replicaId]}/partition/${replicaId}`;
  for (const [index, replicaId] of founders.entries()) {
    services.push(new PartitionService({
      partitionId: PARTITION_ID, replicaId, replicaIds: [...founders],
      peerAddresses: founders.map(addressOf), nodeId: nodes[index],
      tableId: TABLES.SQL_TRANSACTIONS, tableName: TABLES.SQL_TRANSACTIONS,
      schema: SQL_TRANSACTIONS_SCHEMA, systemTableCache: new SystemTableCache(),
      transport, dbPath: path.join(directory, `${replicaId}.sqlite`),
      deferElection: index !== leaderIndex,
      bootstrapMembership: genesisStamp([...founders], {...founderNodes}),
    }));
  }
  for (const service of services) await service.initialize();
  const leader = services[leaderIndex];
  await leader.raft.campaign();
  assert.equal(await waitForCondition(() =>
    leader.raft.readStatus().role === RAFT_ROLE.LEADER, BUDGET_MS), true,
  'setup: the chosen founder leads');
  for (const [index, service] of services.entries()) {
    if (index !== leaderIndex) service.startElection?.();
    const handler = new ReplicaHandler({nodeId: nodes[index], ownerIncarnation,
      systemTableCache: service.systemTableCache, cdcIntegrationService: {},
      controlPlaneSystemTableGateway: gatewayOver(rows, nodes[index], faults),
      createPartitionService: (options) => new PartitionService(options),
      messageRouter: routers[nodes[index]], dataDir: directory});
    handler.registerWithRouter(routers[nodes[index]]);
    handler.replaceLocalReplicaService(service.replicaId, service);
    handlers.push(handler);
  }
  // A founder's create admission evidence, as its create path holds it
  // (read before any fault is armed by the caller).
  const evidenceFor = async (index) => {
    const row = rows[index];
    const evidence = await handlers[index].getReplicaCreateAdmissionOwner()
      .authorizeParticipantRelease({operationId: row.operation_id,
        operationType: row.type, entityType: row.entity_type,
        entityId: row.entity_id, partitionId: row.partition_id,
        replicaId: row.replica_id, targetNodeId: row.target_node_id,
        admissionToken: row.create_admission_token,
        replicaCreatedAt: row.create_admission_replica_created_at});
    assert.ok(evidence, 'setup: the founder holds its create admission');
    return evidence;
  };
  const release = async (index, evidence, budgetMs = BUDGET_MS) => {
    const keepAlive = setInterval(() => {}, 250);
    try {
      return await handlers[index].participantReleaseRecovery.releaseFreshCreate(
        PARTITION_ID, {createAdmissionEvidence: evidence, identityExisted: false,
          deadlineAtMs: Date.now() + budgetMs});
    } finally {
      clearInterval(keepAlive);
    }
  };
  return {services, handlers, routers, rows, faults, founders, founderNodes, nodes,
    evidenceFor, release, directory, transport, addressOf};
}

export {BUDGET_MS, PARTITION_ID, formFoundingGroup, founderOperationRow};
