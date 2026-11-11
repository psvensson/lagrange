/**
 * The shape of an operation row's steps_history.
 *
 * The row is rewritten whole on every step and shipped through the ledger's
 * log and CDC, so its history holds only what is durable authority:
 *
 *  - the transition mirror: one entry per committed step, each write
 *    extending the previous history by exactly one entry and changing none;
 *  - entry 0's metadata channel (OPERATION_METADATA_KEY): the facts decided
 *    at creation that later steps and a restarted owner read back.
 *
 * A readiness snapshot is an observation, not authority: no entry carries
 * one, and an old row that still does is read as if it did not.
 */
import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OPERATION_METADATA_KEY} from
  '../../src/rebalancer/replica-operation-progress.js';
import {ReplicaOperationField} from
  '../../src/rebalancer/replica-operation-constants.js';
import {createDurableStepWorld} from './durable-step-authority-fixture.js';

const RETIRED_READINESS_FIELD = 'readinessSnapshot';
const TRANSITION_ENTRY_FIELDS = Object.freeze(
  ['ownerKey', 'previousStep', 'reason', 'step', 'timestamp']);
// A transition entry is five short scalars: step, previousStep and reason
// are enum words, timestamp is 13 digits, ownerKey is the operation id
// (bounded here by the fixture's id). 256 bytes leaves room for a UUID id.
const TRANSITION_ENTRY_MAX_BYTES = 256;
const PARTITION_ID = 'sql_write_operations-p1';
const REPLICA_IDS = Object.freeze(
  [`${PARTITION_ID}-r1`, `${PARTITION_ID}-r2`, `${PARTITION_ID}-r4`]);
const PEER_ADDRESSES = Object.freeze([
  `node-1/partition/${PARTITION_ID}-r1`,
  `node-3/partition/${PARTITION_ID}-r2`,
  `node-2/partition/${PARTITION_ID}-r4`,
]);
// Every key of the metadata channel, with a value of its real shape.
const ENTRY_ZERO_METADATA = Object.freeze({
  [OPERATION_METADATA_KEY.SOURCE_REPLICA_ID]: `${PARTITION_ID}-r1`,
  [OPERATION_METADATA_KEY.REPLICA_IDS]: REPLICA_IDS,
  [OPERATION_METADATA_KEY.PEER_ADDRESSES]: PEER_ADDRESSES,
  [OPERATION_METADATA_KEY.BOOTSTRAP_TABLE_METADATA]: {tableName: 't'},
  [OPERATION_METADATA_KEY.BOOTSTRAP_PARTITION_METADATA]: {partitionKey: 'k'},
  [OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP]: {voters: REPLICA_IDS},
  [OPERATION_METADATA_KEY.BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED]: false,
  [OPERATION_METADATA_KEY.CURE_TRANSITION_AUTHORIZATION]: {transition: 'x'},
  [OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]:
    {service_id: `${PARTITION_ID}-r4`},
});

function byteLength(value) {
  return Buffer.byteLength(
    typeof value === 'string' ? value : JSON.stringify(value));
}

// Drive one ADD through every step it has, recording the history each
// committed write carried.
async function driveAddThroughAllSteps(entryZeroExtra = {}) {
  const world = createDurableStepWorld({partitionId: PARTITION_ID});
  const entryZero = {
    step: WORKFLOW_STEP.PENDING,
    timestamp: world.durable.created_at,
    ...ENTRY_ZERO_METADATA,
    ...entryZeroExtra,
  };
  world.durable.steps_history = JSON.stringify([entryZero]);
  const histories = [JSON.parse(world.durable.steps_history)];
  try {
    for (const step of [
      WORKFLOW_STEP.SENDING,
      WORKFLOW_STEP.CREATING,
      WORKFLOW_STEP.SYNCING,
    ]) {
      await world.owner.updateStep(world.durableOperation(), step);
      histories.push(JSON.parse(world.durable.steps_history));
    }
    await world.owner.completeOperation(world.durableOperation());
    histories.push(JSON.parse(world.durable.steps_history));
    return {
      world,
      entryZero,
      histories,
      decoded: world.durableOperation(),
      row: {...world.durable},
    };
  } finally {
    await world.coordinator.shutdown();
  }
}

test('an operation driven through every step stores transitions only, ' +
  'within a bound derived from the fields that remain', async (t) => {
  const {entryZero, histories, row} = await driveAddThroughAllSteps();
  const finalHistory = histories.at(-1);

  t.same(finalHistory.map((entry) => entry.step), [
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
    WORKFLOW_STEP.ACTIVE,
  ], 'fixture: the operation committed every step');
  t.notOk(
    finalHistory.some((entry) => RETIRED_READINESS_FIELD in entry),
    'no history entry carries a readiness snapshot',
  );
  for (const entry of finalHistory.slice(1)) {
    t.same(Object.keys(entry).sort(), [...TRANSITION_ENTRY_FIELDS],
      `the ${entry.step} entry holds the transition fields only`);
    t.ok(byteLength(entry) <= TRANSITION_ENTRY_MAX_BYTES,
      `the ${entry.step} entry is ${byteLength(entry)} bytes`);
  }
  const historyBound = byteLength(entryZero) +
    (finalHistory.length - 1) * (TRANSITION_ENTRY_MAX_BYTES + 1) + 2;
  t.ok(
    byteLength(row.steps_history) <= historyBound,
    `steps_history is ${byteLength(row.steps_history)} bytes, bounded by ` +
      `entry 0 plus ${TRANSITION_ENTRY_MAX_BYTES} bytes per later step ` +
      `(${historyBound})`,
  );
  t.comment(`row=${byteLength(row)}B steps_history=` +
    `${byteLength(row.steps_history)}B entry0=${byteLength(entryZero)}B`);
});

test('every write extends the history by one entry and changes no earlier ' +
  'entry', async (t) => {
  const {histories} = await driveAddThroughAllSteps();
  for (let index = 1; index < histories.length; index += 1) {
    t.equal(histories[index].length, histories[index - 1].length + 1,
      `write ${index} appends exactly one entry`);
    t.same(histories[index].slice(0, -1), histories[index - 1],
      `write ${index} leaves the earlier entries as they were`);
  }
});

test('entry 0 keeps its whole metadata channel through every step, and the ' +
  'row decoder reads it back', async (t) => {
  const {entryZero, histories, decoded} = await driveAddThroughAllSteps();

  for (const key of Object.values(OPERATION_METADATA_KEY)) {
    t.ok(key in ENTRY_ZERO_METADATA,
      `fixture: metadata key ${key} is covered by this pin`);
    t.same(histories.at(-1)[0][key], entryZero[key],
      `entry 0 still carries ${key} at the terminal`);
  }
  t.same(decoded[ReplicaOperationField.REPLICA_IDS], [...REPLICA_IDS],
    'the decoder recovers the replica ids');
  t.same(decoded[ReplicaOperationField.PEER_ADDRESSES], [...PEER_ADDRESSES],
    'the peer addresses');
  t.same(decoded[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP],
    ENTRY_ZERO_METADATA[OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP],
    'the committed bootstrap membership');
  t.same(
    decoded[ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION],
    ENTRY_ZERO_METADATA[
      OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION],
    'and the failed-create lifecycle precondition',
  );
});

test('an old row whose entries still carry a readiness snapshot is read and ' +
  'advanced without rewriting or copying it forward', async (t) => {
  const oldSnapshot = {nodeId: 'node-2', reasons: ['old']};
  const {histories, decoded} = await driveAddThroughAllSteps({
    [RETIRED_READINESS_FIELD]: oldSnapshot,
  });
  const finalHistory = histories.at(-1);

  t.same(finalHistory[0][RETIRED_READINESS_FIELD], oldSnapshot,
    'the old entry is left exactly as it was: no migration write');
  t.notOk(
    finalHistory.slice(1).some((entry) => RETIRED_READINESS_FIELD in entry),
    'no new entry copies it forward',
  );
  t.equal(decoded.targetNodeId, 'node-2',
    'the operation decodes from its own columns');
  t.notOk(RETIRED_READINESS_FIELD in decoded,
    'and the decoded operation exposes no readiness snapshot');
});
