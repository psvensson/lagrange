// Loaded only into the existing embedded fixture. The sole fault parks one
// original authenticated response frame before the router settles its waiter.
import {AsyncLocalStorage} from 'node:async_hooks';
import {writeFileSync} from 'node:fs';
import {INITIAL_PARTITION_IDS} from '../../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES, STATE} from '../../../src/constants/index.js';
import {isValidLeaderReadAuthorityWitness} from
  '../../../src/control-plane/control-plane-authoritative-read-witness.js';
import {CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE} from
  '../../../src/control-plane/control-plane-constants.js';
import {NODE_LIFECYCLE_PUBLICATION_OUTCOME, NodeLifecyclePublication} from
  '../../../src/control-plane/node-lifecycle-publication.js';
import {PartitionService} from '../../../src/partition/partition-service.js';
import {SchemaProvisioningJobRepository} from '../../../src/query/schema-provisioning-job-repository.js';
import {decodeTypedRowSet} from '../../../src/query/sql-value-codec.js';
import {materializeAndPresentRowObjects} from '../../../src/query/sql-value-presentation.js';
import {COPY_PHASE_WORKFLOW_STEPS} from '../../../src/rebalancer/replica-operation-step-policy.js';
import {OperationType} from '../../../src/rebalancer/replica-status.js';
import {MessageRouter, RouterMessageType} from '../../../src/transport/message-router.js';
import {isDeliveredTransportDeliveryOutcome} from
  '../../../src/transport/transport-semantic-outcome.js';

const EVENT = 'held-add-authority-reply';
const ADD = 'admission';
const NODES = 'nodes-write';
const SCHEMA = 'schema-write';
const LEDGER_PARTITION = INITIAL_PARTITION_IDS[TABLES.REPLICA_OPERATIONS];
const NODES_PARTITION = INITIAL_PARTITION_IDS[TABLES.NODES];
const SCHEMA_PARTITION = INITIAL_PARTITION_IDS[TABLES.SCHEMA_OPERATIONS];
const LEDGER_SQL = 'SELECT * FROM replica_operations WHERE operation_id = ?';
const UPDATE_NODES = /^UPDATE\s+["`]?nodes["`]?\s+SET\s/iu;
const INSERT_SCHEMA = /^INSERT\s+INTO\s+["`]?schema_operations["`]?\s*\(/iu;
const sourceScope = new AsyncLocalStorage();
const pendingAdds = new Map();
const original = {
  admission: PartitionService.prototype.handleReplicaAdmissionRequest,
  renewal: NodeLifecyclePublication.prototype.publish,
  schema: SchemaProvisioningJobRepository.prototype.insertIntent,
  delivery: MessageRouter.prototype.resolveDeliveryOutcome,
  frame: MessageRouter.prototype.routeAuthenticatedInboundFrame,
};

let scope = null;
let held = null;
const admissionAnswersWhileHeld = [];

function emit(kind, data = {}) {
  if (process.connected) process.send({event: EVENT, kind, ...data});
}

function runObserved(kind, identity, invoke, resultOf) {
  const context = {kind, identity, routes: []};
  return sourceScope.run(context, async () => {
    const answer = await invoke();
    const result = resultOf(answer);
    const sameOriginal = identity.operationId === held?.operationId &&
      identity.replicaIdentity === held?.replicaIdentity;
    if (kind === ADD && held && sameOriginal) admissionAnswersWhileHeld.push(result);
    const originalWaiterPending = held?.router.pendingResponses.has(held.messageId) === true;
    emit(kind, {...identity, result, routes: context.routes, originalWaiterPending});
    return answer;
  });
}

PartitionService.prototype.handleReplicaAdmissionRequest = function(payload) {
  const invoke = () => original.admission.call(this, payload);
  if (scope === null || this.tableName !== scope.addTable) return invoke();
  return runObserved(ADD, {
    operationId: payload?.operationId, replicaIdentity: payload?.replicaIdentity,
    partitionId: this.partitionId, tableName: this.tableName,
  }, invoke, (answer) => ({
    outcome: answer?.admission?.outcome, reason: answer?.admission?.reason ?? null,
  }));
};

NodeLifecyclePublication.prototype.publish = function(request) {
  const invoke = () => original.renewal.call(this, request);
  if (!held || request?.state !== STATE.READY ||
    request.publicationMode !== CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_STEADY) {
    return invoke();
  }
  return runObserved(NODES, {
    nodeId: request.nodeId, incarnation: request.bootIncarnation,
  }, invoke, (answer) => ({
    applied: answer?.outcome === NODE_LIFECYCLE_PUBLICATION_OUTCOME.APPLIED,
    outcome: answer?.outcome, incarnation: answer?.row?.boot_incarnation,
    heartbeat: answer?.row?.last_heartbeat, leaseExpiresAt: answer?.row?.ready_lease_expires_at,
  }));
};

SchemaProvisioningJobRepository.prototype.insertIntent = function(row) {
  const invoke = () => original.schema.call(this, row);
  if (!held || row?.table_name !== scope.schemaTable) return invoke();
  return runObserved(SCHEMA, {
    jobId: row.job_id, tableName: row.table_name,
  }, invoke, (answer) => ({
    applied: answer?.created === true, jobId: answer?.row?.job_id,
  }));
};

function relevantDelivery(router, context, payload, targetNodeId) {
  if (!context || targetNodeId === router.nodeId ||
    typeof payload?.sql !== 'string') return false;
  if (context.kind === ADD) {
    return payload.sql === LEDGER_SQL && payload.params?.[0] === context.identity.operationId;
  }
  return context.kind === NODES ? UPDATE_NODES.test(payload.sql) : INSERT_SCHEMA.test(payload.sql);
}

function observationPartition(kind) {
  if (kind === NODES) return NODES_PARTITION;
  return kind === SCHEMA ? SCHEMA_PARTITION : LEDGER_PARTITION;
}

MessageRouter.prototype.resolveDeliveryOutcome = async function(
  target, message, id, targetNodeId, correlationId, options) {
  const delegate = () => original.delivery.call(
    this, target, message, id, targetNodeId, correlationId, options);
  const context = sourceScope.getStore();
  // The outer query transport delegates to the message group. The latter
  // uses a different message ID for the actual, DIRECT_ONLY inner delivery.
  const payload = message.payload;
  if (!relevantDelivery(this, context, payload, targetNodeId)) return delegate();
  const route = {id, partitionId: observationPartition(context.kind),
    sourceNodeId: this.nodeId, targetNodeId, address: target,
    delivered: false, ownerSuccess: false};
  context.routes.push(route);
  if (context.kind === ADD) pendingAdds.set(id, {context, route});
  if (context.kind !== ADD) emit('control-attempt', {control: context.kind, ...route});
  try {
    const result = await delegate();
    route.delivered = isDeliveredTransportDeliveryOutcome(result?.result);
    route.ownerSuccess = result?.answer?.success === true &&
      result.answer.partitionId === route.partitionId;
    return result;
  } finally {
    if (context.kind === ADD) pendingAdds.delete(id);
  }
};

function readLedgerRow(answer) {
  if (answer?.rowSet) {
    const {columns, rows} = decodeTypedRowSet(answer.rowSet);
    return materializeAndPresentRowObjects(columns, rows)[0];
  }
  return answer?.rows?.[0];
}

function exactCommittedAdd(answer, source) {
  const {identity} = source.context;
  const witness = answer?.readAuthorityWitness;
  if (answer?.success !== true || !isValidLeaderReadAuthorityWitness(witness, LEDGER_PARTITION) ||
    witness.servingNodeId !== source.route.targetNodeId) return null;
  const row = readLedgerRow(answer);
  if (row?.operation_id !== identity.operationId || row.partition_id !== identity.partitionId ||
    row.replica_id !== identity.replicaIdentity || row.type !== OperationType.ADD ||
    !COPY_PHASE_WORKFLOW_STEPS.has(row.workflow_step)) return null;
  return {operationId: row.operation_id, partitionId: row.partition_id,
    replicaIdentity: row.replica_id, placementTargetNodeId: row.target_node_id,
    tableName: identity.tableName, workflowStep: row.workflow_step, ledgerWitness: witness};
}

function tryHold(router, args, originalFrame, source, claim) {
  try {
    // A single shared claim for the three subprocesses. No queue or policy
    // state changes on the product owners, even when another peer races.
    writeFileSync(scope.claimFile, JSON.stringify(claim), {flag: 'wx'});
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
  held = {args, router, originalFrame, messageId: source.route.id,
    operationId: claim.operationId, replicaIdentity: claim.replicaIdentity};
  emit('held', claim);
  return true;
}

MessageRouter.prototype.routeAuthenticatedInboundFrame = function(connectionId, socket, frame) {
  const args = [connectionId, socket, frame];
  if (!scope || held || frame.type !== RouterMessageType.SERVICE_RESPONSE ||
    !this.pendingResponses.has(frame.messageId)) {
    return original.frame.apply(this, args);
  }
  const source = pendingAdds.get(frame.messageId);
  const row = source && exactCommittedAdd(frame.result, source);
  if (row && tryHold(this, args, original.frame, source, {
    ...row, ...source.route, partitionId: row.partitionId,
    ledgerPartitionId: source.route.partitionId, connectionId,
  })) return;
  return original.frame.apply(this, args);
};

process.on('message', (message) => {
  if (message?.event !== EVENT) return;
  if (message.kind === 'arm' && scope === null) {
    scope = message.scope;
    emit('armed', {nodeId: process.env.NODE_ID});
    return;
  }
  if (message.kind !== 'release' || !held || message.messageId !== held.messageId) return;
  const originalReply = held;
  held = null;
  const waiterPresent = originalReply.router.pendingResponses.has(originalReply.messageId);
  emit('released', {id: originalReply.messageId, waiterPresent,
    admissionAnswersWhileHeld: [...admissionAnswersWhileHeld]});
  originalReply.originalFrame.apply(originalReply.router, originalReply.args);
});
