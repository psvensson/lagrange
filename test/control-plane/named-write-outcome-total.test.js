// The named-write judge is total, and an unknown named write never says
// "applied" (line-regression-causes stage 2, items 1 and 2).
//
// judgeNamedWriteOutcome (src/control-plane/control-plane-named-write-outcome.js)
// answers for EVERY input: APPLIED only on a durable commit witness bound to
// the attempt's own declared partition AND entry; FAILED / NOT_PROPOSED only
// on their bound typed answers; anything else UNKNOWN; never a thrown
// TypeError. The unknown answer runControlPlaneWrite returns carries no field
// that claims the write applied, and its owned next action is the re-send
// under the same key.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TABLES} from '../../src/constants/index.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {CONTROL_PLANE_MUTATION_OUTCOME} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {NAMED_WRITE_ATTEMPT, judgeNamedWriteOutcome} from
  '../../src/control-plane/control-plane-named-write-outcome.js';
import {
  controlPlaneWriteIdentity,
  releaseControlPlaneWriteIdentity,
  runControlPlaneWrite,
} from '../../src/control-plane/control-plane-write-identity.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {PARTITION_COMMITTED_COMMAND_OUTCOME, PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-service-constants.js';
import {deriveParticipantEntryId} from
  '../../src/query/distributed/distributed-write-coordinator.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const KEY = 'cpw-total-judge-key';
const PARTITION = 'nodes-p1';
const OTHER_PARTITION = 'services-p1';
const ENTRY = deriveParticipantEntryId(KEY, PARTITION);
const ATTEMPT = Object.freeze({key: KEY, partitionId: PARTITION});
const {APPLIED, FAILED, NOT_PROPOSED, UNKNOWN} = NAMED_WRITE_ATTEMPT;

function witness(fields = {}) {
  return {partitionId: PARTITION, entryId: ENTRY, logIndex: 7, term: 2,
    leaderNodeId: 'node-a', leaderReplicaId: 'nodes-p1-r1', ...fields};
}

function partitionAnswer(fields = {}) {
  return {success: true, affectedRows: 1, partitionId: PARTITION,
    durableCommitWitness: witness(), ...fields};
}

function cdcWrapped(partitionResult) {
  return {success: true, committed: true, partitionResult};
}

function distributed(participantResults, fields = {}) {
  return {success: true, affectedRows: 1, partitions: [PARTITION], mirrorPartitions: [],
    idempotencyKey: KEY, operationId: 'dwrite-total', participantResults, ...fields};
}

// [name, answer, attempt, expected verdict]
const CASES = [
  ['partition answer with its bound witness', partitionAnswer(), ATTEMPT, APPLIED],
  ['partition answer without a witness', partitionAnswer({durableCommitWitness: undefined}),
    ATTEMPT, UNKNOWN],
  ['the exact shape that threw: success and a count, no witness, no partitionId',
    {success: true, affectedRows: 1}, ATTEMPT, UNKNOWN],
  ['the engine fake behind the real CDC service (threw)',
    cdcWrapped({success: true, affectedRows: 1}), ATTEMPT, UNKNOWN],
  ['the heartbeat engine fake (threw)',
    {success: true, affectedRows: 1, partitionResult: {affectedRows: 1}}, ATTEMPT, UNKNOWN],
  ['bare success', {success: true}, ATTEMPT, UNKNOWN],
  ['witness without a top-level partitionId',
    partitionAnswer({partitionId: undefined}), ATTEMPT, UNKNOWN],
  ['witness for another partition than declared',
    partitionAnswer({partitionId: OTHER_PARTITION,
      durableCommitWitness: witness({partitionId: OTHER_PARTITION,
        entryId: deriveParticipantEntryId(KEY, OTHER_PARTITION)})}), ATTEMPT, UNKNOWN],
  ['answer partition differs from its witness',
    partitionAnswer({partitionId: OTHER_PARTITION}), ATTEMPT, UNKNOWN],
  ['witness bound to another entry',
    partitionAnswer({durableCommitWitness: witness({entryId: 'dwrite-participant-other'})}),
    ATTEMPT, UNKNOWN],
  ['witness that is not an object', partitionAnswer({durableCommitWitness: 'witness'}),
    ATTEMPT, UNKNOWN],
  ['witness without logIndex', partitionAnswer({durableCommitWitness: witness({
    logIndex: undefined})}), ATTEMPT, UNKNOWN],
  ['CDC-wrapped bound partition answer', cdcWrapped(partitionAnswer()), ATTEMPT, APPLIED],
  ['CDC-wrapped partition answer without witness',
    cdcWrapped(partitionAnswer({durableCommitWitness: undefined})), ATTEMPT, UNKNOWN],
  ['CDC-wrapped non-object partition result', cdcWrapped(7), ATTEMPT, UNKNOWN],
  ['complete distributed answer with bound participant',
    distributed([partitionAnswer()]), ATTEMPT, APPLIED],
  ['CDC-wrapped complete distributed answer',
    cdcWrapped(distributed([partitionAnswer()])), ATTEMPT, APPLIED],
  ['distributed participant without witness',
    distributed([partitionAnswer({durableCommitWitness: undefined})]), ATTEMPT, UNKNOWN],
  ['distributed participant that is not an object',
    distributed([null]), ATTEMPT, UNKNOWN],
  ['distributed answer for another key',
    distributed([partitionAnswer()], {idempotencyKey: 'cpw-other'}), ATTEMPT, UNKNOWN],
  ['distributed answer and attempt both without a key',
    distributed([partitionAnswer({durableCommitWitness: witness({
      entryId: deriveParticipantEntryId(undefined, PARTITION)})})],
    {idempotencyKey: undefined}), {partitionId: PARTITION}, UNKNOWN],
  ['attempt without a declared partition', partitionAnswer(), {key: KEY}, UNKNOWN],
  ['bound committed statement failure',
    {success: false, committed: true, outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED,
      failureCode: 'constraint_failed', partitionId: PARTITION, entryId: ENTRY, logIndex: 5},
    ATTEMPT, FAILED],
  ['pre-proposal refusal on the declared partition',
    Object.assign(new Error('not leader'), {failureCode:
      PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER, partitionId: PARTITION}),
    ATTEMPT, NOT_PROPOSED],
  ['single nested failure without partition ids (double undefined)',
    {success: false, participantFailures: [{committed: true,
      outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED,
      failureCode: 'constraint_failed', logIndex: 5}]}, ATTEMPT, UNKNOWN],
  ['single nested failure that is not an object',
    {success: false, participantFailures: [null]}, ATTEMPT, UNKNOWN],
  ['null answer', null, ATTEMPT, UNKNOWN],
  ['undefined answer', undefined, ATTEMPT, UNKNOWN],
  ['string answer', 'applied', ATTEMPT, UNKNOWN],
  ['numeric answer', 1, ATTEMPT, UNKNOWN],
  ['missing attempt', partitionAnswer(), undefined, UNKNOWN],
  // Stage 3 (corrective), item 2: the shapes the verifier listed as missing.
  // No partition evaluated the statement, so nothing is proven of the named
  // entry on its declared partition: never APPLIED.
  ['zero participants: no partition was asked',
    distributed([], {affectedRows: 0, partitions: []}), ATTEMPT, UNKNOWN],
  ['zero participants, CDC-wrapped',
    cdcWrapped(distributed([], {affectedRows: 0, partitions: []})), ATTEMPT, UNKNOWN],
  ['a failure that carries a commit witness', partitionAnswer({success: false}),
    ATTEMPT, UNKNOWN],
  ['a refusal that carries a commit witness (contradictory evidence)',
    partitionAnswer({success: false, failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER}),
    ATTEMPT, UNKNOWN],
  ['a deferred answer that carries a commit witness', partitionAnswer({deferRetry: true}),
    ATTEMPT, UNKNOWN],
  ['witness for the right entry on the wrong partition',
    partitionAnswer({durableCommitWitness: witness({partitionId: OTHER_PARTITION})}),
    ATTEMPT, UNKNOWN],
  ['answer and witness on the wrong partition, entry of the declared one',
    partitionAnswer({partitionId: OTHER_PARTITION,
      durableCommitWitness: witness({partitionId: OTHER_PARTITION})}), ATTEMPT, UNKNOWN],
  ['the settled replay of an earlier attempt under the same key (same entry)',
    partitionAnswer({affectedRows: undefined, changes: 1, replayOfLogIndex: 7}),
    ATTEMPT, APPLIED],
  ['the settled replay of an earlier instance of the name (another key)',
    partitionAnswer({replayOfLogIndex: 7, durableCommitWitness: witness({
      entryId: deriveParticipantEntryId('cpw-earlier-instance', PARTITION)})}), ATTEMPT, UNKNOWN],
  ['participants partially witnessed: primary witnessed, mirror not',
    distributed([partitionAnswer(), partitionAnswer({partitionId: OTHER_PARTITION,
      durableCommitWitness: undefined})], {mirrorPartitions: [OTHER_PARTITION]}),
    ATTEMPT, UNKNOWN],
  ['participants partially witnessed: two primaries, one witnessed',
    distributed([partitionAnswer(), partitionAnswer({partitionId: OTHER_PARTITION,
      durableCommitWitness: undefined})], {partitions: [PARTITION, OTHER_PARTITION],
      affectedRows: 2}), ATTEMPT, UNKNOWN],
  ['witness term absent', partitionAnswer({durableCommitWitness: witness({term: undefined})}),
    ATTEMPT, UNKNOWN],
  ['witness term zero', partitionAnswer({durableCommitWitness: witness({term: 0})}),
    ATTEMPT, UNKNOWN],
  ['witness logIndex zero', partitionAnswer({durableCommitWitness: witness({logIndex: 0})}),
    ATTEMPT, UNKNOWN],
  ['witness logIndex negative', partitionAnswer({durableCommitWitness: witness({
    logIndex: -1})}), ATTEMPT, UNKNOWN],
  ['witness logIndex as text', partitionAnswer({durableCommitWitness: witness({
    logIndex: '7'})}), ATTEMPT, UNKNOWN],
  ['array answer', [partitionAnswer()], ATTEMPT, UNKNOWN],
  ['array witness', partitionAnswer({durableCommitWitness: [witness()]}), ATTEMPT, UNKNOWN],
  ['counts that disagree (affectedRows !== changes)', partitionAnswer({changes: 2}),
    ATTEMPT, UNKNOWN],
  ['a CDC wrapper that wraps itself', selfWrapped(), ATTEMPT, UNKNOWN],
];

// A CDC wrapper whose partition result is itself: judged without recursing
// forever (no serialized transport answer has it; the judge is total).
function selfWrapped() {
  const answer = cdcWrapped(null);
  answer.partitionResult = answer;
  return answer;
}

test('judgeNamedWriteOutcome is total over answer shapes and never throws', () => {
  const observed = CASES.map(([name, answer, attempt]) => {
    try {
      return [name, judgeNamedWriteOutcome(answer, attempt)];
    } catch (error) {
      return [name, `THROWS ${error?.name}: ${error?.message}`];
    }
  });
  assert.deepEqual(observed, CASES.map(([name, , , expected]) => [name, expected]));
});

const UNKNOWN_ANSWER_ROUTE = Object.freeze({id: 'total-judge-route', partitionId: PARTITION});

function assertTypedUnknownWithoutApplied(answer, label) {
  assert.equal(answer.success, false, `${label}: not a success`);
  assert.equal(answer.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
    `${label}: the typed unknown`);
  assert.equal(answer.pendingInstance?.outcome, 'unknown', `${label}: names its pending instance`);
  assert.equal(answer.deferRetry, true, `${label}: owned re-send`);
  assert.notEqual(answer.outcome, CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    `${label}: no outcome claims applied`);
  assert.notEqual(answer.completionState, CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    `${label}: no completion state claims applied`);
  assert.notEqual(answer.contractState, OWNER_CONTRACT_STATE.READY,
    `${label}: the contract is not ready`);
  assert.equal(answer.nextAction, OWNER_CONTRACT_NEXT_ACTION.RETRY,
    `${label}: the owned next action is the re-send under the same key`);
}

test('an unknown named write never says applied: the gateway-normalized success', async () => {
  const name = controlPlaneWriteIdentity('total-judge', 'gateway-normalized', 1);
  try {
    const answer = await runControlPlaneWrite({writeIdentity: name, timeoutMs: 2000},
      {statement: 'gateway-normalized'}, UNKNOWN_ANSWER_ROUTE, async () => ({
        success: true, affectedRows: 1, partitionId: PARTITION,
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
        completionState: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
        contractState: OWNER_CONTRACT_STATE.READY,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
      }));
    assertTypedUnknownWithoutApplied(answer, 'receipt-less normalized success');
  } finally {
    releaseControlPlaneWriteIdentity(name);
  }
});

function quietEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

// Production construction across the gateway, the real CDC integration
// service and the judge: an engine answer without the producer's receipt
// (the exact shape that threw) is the typed unknown, re-drivable under its
// own key, never a TypeError.
test('gateway and real CDC: a receipt-less engine answer is the typed unknown, twice',
  async () => {
    quietEnvironment();
    const engine = {
      writes: 0,
      async executeQuery() {
        engine.writes += 1;
        return {success: true, affectedRows: 1};
      },
    };
    const cdc = new CDCIntegrationService({nodeId: 'total-judge-node', sqlQueryEngine: engine});
    cdc.initialize();
    const gateway = new ControlPlaneSystemTableGateway({nodeId: 'total-judge-node',
      cdcIntegrationService: cdc});
    const name = controlPlaneWriteIdentity('total-judge', 'gateway-cdc', 1);
    const row = (address) => ({endpoint_id: 'ep-total-judge-ws', node_id: 'total-judge-node',
      endpoint_type: 'ws', address, boot_incarnation: 1, created_at: 1, updated_at: 1});
    try {
      for (const [label, address] of [['first', 'ws://a:1'], ['changed content', 'ws://a:2']]) {
        let answer;
        try {
          answer = await gateway.insertSystemTableRow(TABLES.NODE_ENDPOINTS, row(address),
            {writeIdentity: name, queryTimeoutMs: 2000});
        } catch (error) {
          assert.fail(`${label}: the write threw ${error?.name}: ${error?.message}; ` +
            `cause ${error?.cause?.name}: ${error?.cause?.message}`);
        }
        assertTypedUnknownWithoutApplied(answer, label);
      }
      assert.ok(engine.writes >= 2, 'the held instance was re-delivered under its own key');
    } finally {
      releaseControlPlaneWriteIdentity(name);
      cdc.markShuttingDown();
    }
  });
