// "Outcome unknown" is ONE named outcome of a named control-plane write,
// whether its producer RETURNED an answer without the durable commit receipt
// or its transport THREW the typed unknown (line-regression-causes stage 3,
// item 1). R07: the unknown is a named state, never inferred from a missing
// `outcome` (the gateway telemetry counted it owner_not_ready, the outcome
// snapshot answered owner_not_ready, the admin route answered 503
// owner_not_ready - a code the split-brain verifier reads as "refused before
// the mutation" - and a thrown unknown kept the transport's own shape). R08:
// both arrive as the same typed answer, the producer's own answer or error
// carried as its cause.
//
// Production construction from the gateway down: the control-plane gateway,
// the real CDC integration service, a system-metadata owner (the retry owner
// every named owner write uses) and the admin owner route; only the engine
// answer is hand-built (the two shapes the real producers emit for an
// unproven write: a success without its receipt, and the coordinator's
// failure whose one participant is the typed transport unknown).
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TABLES} from '../../src/constants/index.js';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {AdminOwnerOperations, ADMIN_OWNER_OPERATION_ERROR_CODE} from
  '../../src/admin/admin-owner-operations.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {CONTROL_PLANE_MUTATION_OUTCOME} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {classifyControlPlaneMutationResult} from
  '../../src/control-plane/control-plane-mutation-outcome-classifier.js';
import {resolveControlPlaneMutationOutcomeSnapshot} from
  '../../src/control-plane/control-plane-system-table-gateway-mutation-contracts.js';
import {
  controlPlaneWriteIdentity,
  isControlPlaneWriteOutcomeUnknown,
  releaseControlPlaneWriteIdentity,
} from '../../src/control-plane/control-plane-write-identity.js';
import {OWNER_CONTRACT_NEXT_ACTION, OWNER_CONTRACT_STATE} from
  '../../src/control-plane/owner-contract-outcome.js';
import {SystemMetadataOwnerBase} from
  '../../src/control-plane/owners/system-metadata-owner-base.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';
import {deriveParticipantEntryId} from
  '../../src/query/distributed/distributed-write-coordinator.js';

// The literal the named outcome must have (never compared to a member the
// vocabulary may not define).
const UNKNOWN = 'unknown';
const TABLE = TABLES.NODE_ENDPOINTS;
const PARTITION = INITIAL_PARTITION_IDS[TABLE];
const NODE_ID = 'unknown-shape-node';
const TRANSPORT_TIMEOUT = 'Message timeout';
const OUTCOME_UNKNOWN = PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN;
const COUNT_FIELDS = Object.freeze(['affectedRows', 'changes', 'rows', 'partitionResult',
  'participantResults', 'durableCommitWitness', 'committed']);

// The coordinator's answer to a write whose one participant's delivery
// timed out after it was handed over: the typed transport unknown.
function transportTimeoutAnswer(idempotencyKey) {
  const failure = {partitionId: PARTITION, role: 'primary', success: false,
    error: TRANSPORT_TIMEOUT, failureCode: OUTCOME_UNKNOWN,
    entryId: deriveParticipantEntryId(idempotencyKey, PARTITION)};
  return {success: false, operation: 'INSERT', affectedRows: 0, rows: [],
    partitions: [PARTITION], mirrorPartitions: [], failedPartitions: [PARTITION],
    partitionErrors: [{...failure}], participantFailures: [failure],
    firstFailedParticipant: failure, participantResults: [failure],
    errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE', error: TRANSPORT_TIMEOUT,
    idempotencyKey, operationId: `dwrite-${idempotencyKey}`};
}

const PRODUCERS = Object.freeze({
  'returned: a success without the producer receipt': () => ({success: true, affectedRows: 1}),
  'thrown: a transport timeout after delivery': (options) =>
    transportTimeoutAnswer(options?.idempotencyKey),
});

class WitnessEndpointOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = 'unknown-shape-owner';
  static TABLE_NAME = TABLE;
}

function quietEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function endpointRow(id) {
  return {endpoint_id: id, node_id: NODE_ID, endpoint_type: 'ws', address: `ws://${id}:1`,
    boot_incarnation: 1, created_at: 1, updated_at: 1};
}

function surface(produce) {
  const engine = {
    async executeQuery(sql, params, options) {
      return produce(options);
    },
  };
  const cdc = new CDCIntegrationService({nodeId: NODE_ID, sqlQueryEngine: engine});
  cdc.initialize();
  cdc.retryDelayMs = 1;
  const gateway = new ControlPlaneSystemTableGateway({nodeId: NODE_ID, cdcIntegrationService: cdc});
  const ledger = [];
  const record = gateway.recordControlPlaneOperation.bind(gateway);
  gateway.recordControlPlaneOperation = (entry) => {
    ledger.push(entry);
    return record(entry);
  };
  const owner = new WitnessEndpointOwner({controlPlaneSystemTableGateway: gateway,
    controlPlaneWriteRetryTimeoutMs: 1});
  return {cdc, gateway, ledger, owner};
}

async function settle(promise) {
  try {
    return {answer: await promise, thrown: null};
  } catch (thrown) {
    return {answer: null, thrown};
  }
}

// What every consumer of the one unknown write reports.
async function consumersOf(produce, label) {
  const {cdc, gateway, ledger, owner} = surface(produce);
  const name = controlPlaneWriteIdentity('unknown-shape', label);
  try {
    const caller = await settle(gateway.insertSystemTableRow(TABLE, endpointRow(`${label}-a`),
      {writeIdentity: name, queryTimeoutMs: 2000}));
    const seen = caller.answer ?? caller.thrown;
    const mutationLedger = ledger.filter((entry) => entry.mutationOperation !== undefined);
    const ownerWrite = await settle(owner.insertRow(endpointRow(`${label}-b`)));
    const admin = await new AdminOwnerOperations({
      getDynamicConfigService: () => ({set: () => owner.insertRow(endpointRow(`${label}-c`))}),
    }, NODE_ID).setConfig('unknown-shape-key', {value: 1});
    const classification = classifyControlPlaneMutationResult(seen);
    return {
      caller,
      view: {
        callerDelivery: caller.thrown ? 'thrown' : 'returned',
        callerOutcome: seen?.outcome ?? null,
        telemetry: Object.keys(gateway.gatewayMetrics.mutationOutcomeCounts).sort(),
        ledger: mutationLedger.map((entry) => entry.outcome ?? null),
        snapshot: resolveControlPlaneMutationOutcomeSnapshot(seen).outcome,
        classifier: {known: classification.known, outcome: classification.outcome,
          applied: classification.applied, zeroAffectedRows: classification.zeroAffectedRows},
        ownerError: ownerWrite.thrown ? ownerWrite.thrown.outcome ?? null : 'did not throw',
        adminOutcome: admin.body.outcome,
        adminMutationOutcome: admin.body.mutationOutcome ?? null,
        adminSaysNotReady:
          admin.body.errorCode === ADMIN_OWNER_OPERATION_ERROR_CODE.OWNER_NOT_READY,
      },
    };
  } finally {
    releaseControlPlaneWriteIdentity(name);
    cdc.markShuttingDown();
  }
}

const EXPECTED_VIEW = Object.freeze({
  callerDelivery: 'returned',
  callerOutcome: UNKNOWN,
  telemetry: [UNKNOWN],
  ledger: [UNKNOWN],
  snapshot: UNKNOWN,
  classifier: {known: true, outcome: UNKNOWN, applied: false, zeroAffectedRows: false},
  ownerError: UNKNOWN,
  adminOutcome: UNKNOWN,
  adminMutationOutcome: UNKNOWN,
  adminSaysNotReady: false,
});

test('the vocabulary names the unknown outcome', () => {
  assert.equal(CONTROL_PLANE_MUTATION_OUTCOME.UNKNOWN, UNKNOWN);
});

for (const [label, produce] of Object.entries(PRODUCERS)) {
  test(`every consumer sees the one named unknown outcome - ${label}`, async () => {
    quietEnvironment();
    const {view} = await consumersOf(produce, label);
    assert.deepEqual(view, EXPECTED_VIEW);
  });
}

test('a returned and a thrown unknown arrive as the same typed answer, cause carried', async () => {
  quietEnvironment();
  const shapes = [];
  for (const [label, produce] of Object.entries(PRODUCERS)) {
    const {caller} = await consumersOf(produce, `shape-${label}`);
    const answer = caller.answer ?? caller.thrown;
    shapes.push({label, answer});
    assert.equal(caller.thrown, null, `${label}: answered, not thrown`);
    assert.deepEqual({
      success: answer.success, outcome: answer.outcome, completionState: answer.completionState,
      deferRetry: answer.deferRetry, failureCode: answer.failureCode,
      contractState: answer.contractState, nextAction: answer.nextAction,
      pendingOutcome: answer.pendingInstance?.outcome,
      pendingEntry: answer.pendingInstance?.entryId === answer.entryId,
      unknownByPredicate: isControlPlaneWriteOutcomeUnknown(answer),
      countFields: COUNT_FIELDS.filter((field) => Object.hasOwn(answer, field)),
      hasCause: answer.cause !== undefined && answer.cause !== null,
    }, {
      success: false, outcome: UNKNOWN, completionState: UNKNOWN, deferRetry: true,
      failureCode: OUTCOME_UNKNOWN, contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY, pendingOutcome: UNKNOWN,
      pendingEntry: true, unknownByPredicate: true, countFields: [], hasCause: true,
    }, `${label}: the canonical unknown`);
  }
  const thrownCause = shapes[1].answer.cause;
  assert.ok(thrownCause instanceof Error, 'the transport error is the cause, not swallowed');
  assert.ok(isControlPlaneWriteOutcomeUnknown(thrownCause), 'the cause keeps its typed unknown');
  assert.deepEqual(Object.keys(shapes[0].answer).sort(), Object.keys(shapes[1].answer).sort(),
    'one field set: what the producer answered or threw travels only as the cause');
});
