// CDC Stage 3 and the dead-recipient measures at the source (design note,
// "Stage 3 as built"). Real source partition, ledger, obligation lane,
// subscription, CDCGroupPropagationService and the partition's own
// hydration-image query; the target group's transport is controlled
// (cdc-topology-progress-fixture.js). Where a witness needs a recipient that
// keeps a position, the target is a Stage 3 recipient model built on the real
// position cell (SystemTableCacheSourceOrder) whose re-list is the partition's
// real hydration-image answer (handleRemoteQuery): only its row store is a
// map, because the fixture table is not a system-cache table. The recipient
// side through the real committed application, handler and cache is
// witnessed in test/message-group/cdc-vector-application-equivalence.test.js.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {SOURCE_RANGE_DECISION, SOURCE_RELIST_OUTCOME, SystemTableCacheSourceOrder} from
  '../../src/cache/system-table-cache-source-order.js';
import {CDC_COMPLETION, buildAlreadyAppliedCdcOutcome, buildCommittedCdcOutcome,
  unknownCdcAcceptance} from '../../src/cdc/cdc-delivery-outcome.js';
import {COLUMN, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE, CONTROL_PLANE_READ_LEADER_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {NODE_STATE} from '../../src/constants/node-state.js';
import {PARTITION_CDC_COMMAND, PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_RECIPIENT_DETACH_REASON as DETACH_REASON,
  PARTITION_CDC_RECIPIENT_STATE as RECIPIENT_STATE} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations, readCdcLedgerIncarnation, readCdcLedgerNewest,
  readCdcObligationProgress, readCdcPredecessorPosition} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTITION_HYDRATION_IMAGE_ERROR, PARTITION_HYDRATION_IMAGE_PAGE_FIELD,
  PARTITION_HYDRATION_IMAGE_QUERY_FIELD} from
  '../../src/partition/partition-service-hydration-image-methods.js';
import {QUERY_MESSAGE_TYPE} from '../../src/query/query-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {deliveredEventsOf, setupConfig, teardownConfig} from
  '../topology/cdc-group-propagation-service-harness.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/topology/latency-topology-constants.js';
import {CDC_TABLE, clearFixtureSingletons, resetFixtureSingletons, settleTicks} from
  '../test-helpers/participant-transaction-fixture.js';
import {commitAcknowledgements} from '../test-helpers/cdc-delivery-progress-fixture.js';
import {assertShippedSourceVector, registerModeledRelister} from
  '../test-helpers/cdc-source-range-fixture.js';
import {RESPONSE, TARGET_GROUP, TARGET_NODE, addRequiredGroup, addTopologySourceRow,
  omitTarget, targetService, topologyProgressFixture, updateTargetService} from '../test-helpers/cdc-topology-progress-fixture.js';

beforeEach(() => {
  resetFixtureSingletons();
  setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
});
afterEach(() => {
  teardownConfig();
  clearFixtureSingletons();
});

const GAP_RETRY_AFTER_MS = 25;

async function stage3Fixture(t) {
  const f = await topologyProgressFixture(t, {otherSubscriber: false});
  f.acks = () => f.proposed.filter((command) => command.type === PARTITION_CDC_COMMAND.DELIVERED);
  f.targetPayloads = [];
  const deliver = f.topology.messageRouter.deliver;
  f.topology.messageRouter.deliver = async (address, payload, options) => {
    f.targetPayloads.push(payload);
    if (f.target) return buildDeliveryEnvelope({acknowledged: true}, f.target(payload));
    return deliver(address, payload, options);
  };
  return f;
}

const recipientsOf = (f) => f.leader.cdcDelivery.getCdcObligationDiagnostics().recipients;
const targetOf = (f, groupId = TARGET_GROUP) =>
  recipientsOf(f).find((recipient) => recipient.groupId === groupId);
const positionOf = (row) => ({logIndex: row.logIndex, ordinal: row.ordinal});

const imagePageQuery = (tableName, cursor) => ({type: QUERY_MESSAGE_TYPE.QUERY,
  sql: `SELECT * FROM ${tableName}`, params: [], [PARTITION_HYDRATION_IMAGE_QUERY_FIELD]: true,
  [PARTITION_HYDRATION_IMAGE_PAGE_FIELD]: cursor});

// Every page of one image from the leader (the fixture table is not a
// system-cache table, so the model stages its rows itself).
async function leaderImage(f, tableName) {
  const rows = [];
  let answer;
  let cursor = {imageId: null, page: 0};
  do {
    answer = await f.leader.handleRemoteQuery(imagePageQuery(tableName, cursor));
    assert.equal(answer.success, true, answer.errorCode);
    rows.push(...answer.rows);
    cursor = {imageId: answer.imagePage.imageId, page: cursor.page + 1};
  } while (!answer.imagePage.last);
  return {rows, sourceImage: answer.sourceImage};
}

// A Stage 3 recipient model of one target group: the real position cell, and
// a re-list that is the source leader's real paged hydration-image answer.
function stage3Recipient(t, f, groupId = TARGET_GROUP) {
  const cell = new SystemTableCacheSourceOrder();
  const model = {cell, rows: new Map(), lists: [], refusing: false, applied: 0, groupId};
  registerModeledRelister(t, cell, f.clock, async ({sourcePartition, tableName}) => {
    const answer = await leaderImage(f, tableName);
    model.lists.push(answer.sourceImage);
    model.rows = new Map(answer.rows.map((row) => [row.id, row.value]));
    cell.recordListedPosition({sourcePartition, tableName,
      incarnation: answer.sourceImage.incarnation, appliedIndex: answer.sourceImage.appliedIndex});
    return SOURCE_RELIST_OUTCOME.RETRY;
  });
  model.answer = (payload) => {
    const events = deliveredEventsOf(payload);
    assertShippedSourceVector(payload.sourceRange, events);
    if (model.refusing) {
      return {...unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE), retryAfterMs: 40};
    }
    const range = payload.sourceRange;
    if (cell.classifyRange(range).decision === SOURCE_RANGE_DECISION.GAP) {
      cell.recordGap(range, events[0].tableName);
      return {...unknownCdcAcceptance(CDC_COMPLETION.POSITION_GAP),
        retryAfterMs: GAP_RETRY_AFTER_MS};
    }
    const context = cell.captureEffectContext(range.sourcePartition,
      events[0].tableName, range.incarnation);
    for (const event of events) {
      if (cell.memberApplied(range, {logIndex: event.sourceLogIndex,
        ordinal: event.sourceOrdinal})) continue;
      model.rows.set(event.data.id, event.data.value);
      model.applied += 1;
    }
    assert.equal(cell.advance(range, events[0].tableName, context), true,
      'the synchronous model row effects remain bound to their source generation');
    return buildCommittedCdcOutcome(events, groupId, {index: 30 + model.applied, term: 2});
  };
  return model;
}

const sourceRowsOf = (f) => new Map(f.leader.db.prepare(`SELECT id, value FROM ${CDC_TABLE}`)
  .all().map((row) => [row.id, row.value]));

async function retryHeld(f) {
  for (let round = 0; round < 6; round += 1) {
    await f.drive();
    await settleTicks();
  }
}

test('S3-L1 the partition answers a hydration image from one snapshot on its leader: rows, ' +
  'the applied index and the ledger incarnation; a follower answers a typed refusal',
async (t) => {
  const f = await stage3Fixture(t);
  addTopologySourceRow(f, 'B');
  const incarnation = readCdcLedgerIncarnation(f.leader.db);
  assert.equal(typeof incarnation, 'string', 'the first recording minted the incarnation');
  addTopologySourceRow(f, 'C');
  assert.equal(readCdcLedgerIncarnation(f.leader.db), incarnation, 'minted once');
  const query = imagePageQuery(CDC_TABLE, {imageId: null, page: 0});
  const answer = await f.leader.handleRemoteQuery(query);
  assert.equal(answer.success, true);
  assert.equal(answer.imagePage.last, true, 'a small table is a one-page image');
  assert.deepEqual(answer.rows.map((row) => row.id).sort(), ['A', 'B', 'C']);
  assert.deepEqual(answer.sourceImage, {sourcePartition: f.leader.partitionId, incarnation,
    appliedIndex: readCdcLedgerNewest(f.leader.db).logIndex});
  assert.equal(answer.readAuthorityWitness.role, RAFT_ROLE.LEADER);
  assert.equal(answer.readAuthorityWitness.appliedIndex, answer.sourceImage.appliedIndex);

  f.leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
  const refused = await f.leader.handleRemoteQuery(query);
  assert.deepEqual({success: refused.success, errorCode: refused.errorCode},
    {success: false, errorCode: PARTITION_HYDRATION_IMAGE_ERROR.NOT_LEADER});
  assert.equal(Object.hasOwn(refused, 'rows'), false, 'nothing a recipient could install');
});

test('S3-L2 every shipped vector names its source range: partition, ledger incarnation, the ' +
  'predecessor from the ledger and its last row', async (t) => {
  const f = await stage3Fixture(t);
  const recipient = stage3Recipient(t, f);
  f.target = recipient.answer;
  await f.drive();
  await settleTicks();
  const [first] = f.targetPayloads;
  const head = readCdcLedgerNewest(f.leader.db);
  assert.deepEqual(first.sourceRange, {sourcePartition: f.leader.partitionId,
    incarnation: readCdcLedgerIncarnation(f.leader.db),
    after: readCdcPredecessorPosition(f.leader.db, positionOf(head)),
    through: positionOf(head)});
  assert.deepEqual(first.sourceRange.after, {logIndex: 0, ordinal: -1},
    'the first event of the ledger has no predecessor');
});

test('S3-L3 a recipient with no position answers a gap, re-lists once from the leader image, ' +
  'and the retried range then confirms it; while it re-lists it holds the ledger from the ' +
  'newest position as of the gapped range (design note S3.11)',
async (t) => {
  const f = await stage3Fixture(t);
  const recipient = stage3Recipient(t, f);
  f.target = recipient.answer;
  // The recipient's first contact: the row A range against an unknown cell.
  recipient.cell.recordGap({sourcePartition: f.leader.partitionId, incarnation: 'stale',
    after: {logIndex: 0, ordinal: -1}, through: {logIndex: 1, ordinal: 0}}, CDC_TABLE);
  await settleTicks();
  assert.equal(recipient.lists.length, 1, 'the unknown cell listed once');
  addTopologySourceRow(f, 'B');
  await f.drive();
  await settleTicks();
  assert.equal(targetOf(f).state, RECIPIENT_STATE.CONFIRMED,
    'the listed recipient applies the range from its listed position');
  // A gap: the recipient lost its position (a restart): it answers the next
  // range with a gap, lists, and the retry confirms.
  recipient.cell.clear();
  addTopologySourceRow(f, 'C');
  await f.drive();
  await settleTicks();
  assert.equal(targetOf(f).state, RECIPIENT_STATE.POSITION_GAP);
  assert.deepEqual(targetOf(f).relist.hold.position, positionOf(readCdcLedgerNewest(f.leader.db)),
    'the gapped recipient holds the ledger from the newest position its image will cover');
  await settleTicks();
  assert.equal(recipient.lists.length, 2, 'one re-list for the gap');
  await retryHeld(f);
  assert.equal(targetOf(f).state, RECIPIENT_STATE.CONFIRMED);
  assert.deepEqual(recipient.rows, sourceRowsOf(f), 'the recipient equals the source');
});

test('S3-L4 an already-applied answer confirms through the group\'s committed position of ' +
  'the same incarnation, and never beyond the vector for another incarnation', async (t) => {
  const f = await stage3Fixture(t);
  const newest = () => positionOf(readCdcLedgerNewest(f.leader.db));
  let through = null;
  let incarnation = null;
  f.target = (payload) => buildAlreadyAppliedCdcOutcome(deliveredEventsOf(payload),
    payload.targetGroupId, through, incarnation);
  through = {logIndex: 900, ordinal: 3};
  incarnation = 'another-incarnation';
  await f.drive();
  await settleTicks();
  assert.deepEqual(targetOf(f).cursor, newest(), 'another incarnation: the vector only');
  addTopologySourceRow(f, 'B');
  incarnation = readCdcLedgerIncarnation(f.leader.db);
  await f.drive();
  await settleTicks();
  assert.deepEqual(targetOf(f).cursor, through,
    'the same incarnation: through the position the group\'s log committed');
  assert.equal(targetOf(f).state, RECIPIENT_STATE.CONFIRMED);
});

test('S3-L5 a group that becomes a recipient after the last write is contacted without a new ' +
  'write: the sender\'s cache change wakes the lane and the newest row probes the group, which ' +
  'lists what was acknowledged before it existed', async (t) => {
  const f = await stage3Fixture(t);
  f.targetMode = RESPONSE.NATIVE;
  for (const id of ['B', 'C', 'D']) addTopologySourceRow(f, id);
  await f.drive();
  await settleTicks();
  await commitAcknowledgements(f);
  assert.equal(countCdcObligations(f.leader.db).owed, 0, 'everything acknowledged');
  assert.equal(Number(readCdcObligationProgress(f.leader.db).reclaimed), 4,
    'decision D1 reclaimed every row');
  assert.notEqual(readCdcLedgerNewest(f.leader.db), null,
    'the newest event is kept beside the ledger (the position probe)');

  const joiner = 'progress-group-c';
  const recipient = stage3Recipient(t, f, joiner);
  f.target = (payload) => payload.targetGroupId === joiner ? recipient.answer(payload) :
    buildCommittedCdcOutcome(deliveredEventsOf(payload), payload.targetGroupId,
      {index: 9, term: 2});
  const shippedBefore = f.targetPayloads.length;
  // The sender's real cache announces the new row to the lane's
  // recipient-domain watch.
  addRequiredGroup(f, joiner);
  await settleTicks();
  const probes = f.targetPayloads.slice(shippedBefore)
    .filter((payload) => payload.targetGroupId === joiner);
  assert.equal(probes.length >= 1, true, 'the new group was contacted with no write');
  assert.deepEqual(deliveredEventsOf(probes[0]).map((event) => event.eventKey),
    [readCdcLedgerNewest(f.leader.db).eventKey], 'the probe is the newest row');
  await settleTicks();
  assert.equal(recipient.lists.length, 1, 'it answered the gap and listed once');
  await retryHeld(f);
  assert.equal(targetOf(f, joiner).state, RECIPIENT_STATE.CONFIRMED);
  assert.deepEqual(recipient.rows, sourceRowsOf(f),
    'every row acknowledged before the group existed reached it');
});

test('S3-D measure 3: a refusing recipient past RELIST_LAG_ROWS leaves the frontier as ' +
  'MUST_RELIST, writes are never refused for capacity, and on return it re-lists once, ' +
  'streams, and equals the source', async (t) => {
  const f = await stage3Fixture(t);
  const recipient = stage3Recipient(t, f);
  f.target = recipient.answer;
  // Its first contact gaps (no position) and lists; then it streams.
  await retryHeld(f);
  assert.equal(targetOf(f).state, RECIPIENT_STATE.CONFIRMED);
  assert.equal(recipient.lists.length, 1);
  recipient.refusing = true;
  let maxOwed = 0;
  const rows = BOUND.RELIST_LAG_ROWS + BOUND.ACK_BATCH_MAX_EVENTS * 2;
  for (let index = 0; index < rows; index += 1) {
    addTopologySourceRow(f, `R${index}`);
    if (index % 128 === 127) {
      await settleTicks();
      await commitAcknowledgements(f);
    }
    maxOwed = Math.max(maxOwed, countCdcObligations(f.leader.db).owed);
  }
  await settleTicks();
  await commitAcknowledgements(f);
  assert.equal(targetOf(f).state, RECIPIENT_STATE.MUST_RELIST);
  assert.equal(maxOwed < BOUND.OWED_MAX_EVENTS, true,
    `owed rows stayed under the cap (max ${maxOwed}): no write was refused for capacity`);
  assert.equal(countCdcObligations(f.leader.db).owed < BOUND.ACK_BATCH_MAX_EVENTS * 2, true,
    'the ledger reclaimed past the refusing recipient');

  recipient.refusing = false;
  await retryHeld(f);
  await settleTicks();
  await retryHeld(f);
  assert.equal(recipient.lists.length, 2, 'exactly one re-list on return');
  assert.equal(targetOf(f).state, RECIPIENT_STATE.CONFIRMED, 'it streams again');
  addTopologySourceRow(f, 'after-return');
  await f.drive();
  await settleTicks();
  assert.deepEqual(recipient.rows, sourceRowsOf(f), 'the recipient equals the source');
});

// Explicit owner-row input to the real lifecycle read boundary. These rows
// model the membership owner's answer; they are not copied from the sender's
// route cache and do not prove a native membership-owner read.
function lifecycleAuthority(rowsByTable, changeResult = (_tableName, result) => result) {
  const reads = [];
  const requests = [];
  return {reads, requests, executeAuthoritativeSystemTableRead: async (
    tableName, sql, params, options) => {
    reads.push(tableName);
    requests.push({tableName, sql, params, options});
    return changeResult(tableName, {success: true, rows: rowsByTable[tableName] ?? [],
      rowSetComplete: true, source: 'owner_rpc_lane',
      readAuthorityWitness: {state: 'observed', partitionId: INITIAL_PARTITION_IDS[tableName],
        role: RAFT_ROLE.LEADER, servingNodeId: 'node-a', servingReplicaId: 'r1',
        observedAtMs: 1}});
  }};
}

test('S3-C measure 2: a dead group pins the frontier; cache omission alone detaches nothing; ' +
  'the lifecycle owner\'s retirement detaches it, the frontier advances and the owed rows are ' +
  'reclaimed, without a restart', async (t) => {
  const f = await stage3Fixture(t);
  f.target = () => unknownCdcAcceptance();
  const services = [{...targetService(f)}];
  const authority = lifecycleAuthority({[TABLES.SERVICES]: services, [TABLES.NODES]: [
    {[COLUMN.NODE_ID]: TARGET_NODE, [COLUMN.STATUS]: 'active'}]});
  f.leader.cdcIntegrationService = authority;
  for (const id of ['B', 'C', 'D']) addTopologySourceRow(f, id);
  await retryHeld(f);
  assert.equal(countCdcObligations(f.leader.db).owed, 4, 'the dead group pins the frontier');

  // The sender's cache stops naming the group: a hint, not evidence.
  omitTarget(f);
  await retryHeld(f);
  assert.equal(authority.reads.includes(TABLES.SERVICES), true, 'the lifecycle owner was asked');
  assert.notEqual(targetOf(f).state, RECIPIENT_STATE.DETACHED,
    'its authoritative rows still say active: nothing is detached');
  assert.equal(countCdcObligations(f.leader.db).owed, 4);

  // The membership owner records the retirement (the replica row stopped).
  services[0][COLUMN.STATUS] = SERVICE_STATUS.STOPPED;
  // A services change in the sender's cache wakes the lane (the row again).
  updateTargetService(f, {});
  await retryHeld(f);
  assert.deepEqual({state: targetOf(f).state, reason: targetOf(f).detachReason},
    {state: RECIPIENT_STATE.DETACHED, reason: DETACH_REASON.LIFECYCLE});
  await commitAcknowledgements(f);
  assert.equal(countCdcObligations(f.leader.db).owed, 0,
    'the frontier passed the detached group: every row acknowledged and reclaimed');
  addTopologySourceRow(f, 'E');
  await retryHeld(f);
  await commitAcknowledgements(f);
  assert.equal(countCdcObligations(f.leader.db).owed, 0, 'later writes drain as well');
});


const INCOMPLETE_LIFECYCLE_ANSWERS = [
  ['missing completeness', () => ({rowSetComplete: undefined})],
  ['incomplete row set', () => ({rowSetComplete: false})],
  ['partial result', () => ({partial: true})],
  ['failed partition count', () => ({failedPartitions: 1})],
  ['partition errors', (tableName) => ({partitionErrors: [
    {partitionId: INITIAL_PARTITION_IDS[tableName], error: 'controlled unavailable owner'}]})],
  ['participant failures', () => ({participantFailures: [{error: 'controlled failed read'}]})],
];

for (const tableName of [TABLES.SERVICES, TABLES.NODES]) {
  for (const [label, failureFields] of INCOMPLETE_LIFECYCLE_ANSWERS) {
    test(`S3-C complete retirement: ${tableName} ${label} cannot detach or reclaim; ` +
      'the same owner can later establish active membership and complete retirement', async (t) => {
      const f = await stage3Fixture(t);
      f.target = () => unknownCdcAcceptance();
      const stopped = {...targetService(f), [COLUMN.STATUS]: SERVICE_STATUS.STOPPED};
      const active = {...targetService(f),
        [COLUMN.SERVICE_ID]: `${TARGET_GROUP}-still-active`,
        [COLUMN.REPLICA_ID]: `${TARGET_GROUP}-still-active`,
        [COLUMN.NODE_ID]: 'still-active-node'};
      const services = [stopped, active];
      const nodes = [{[COLUMN.NODE_ID]: TARGET_NODE, [COLUMN.STATUS]: NODE_STATE.ACTIVE},
        {[COLUMN.NODE_ID]: active[COLUMN.NODE_ID], [COLUMN.STATUS]: NODE_STATE.ACTIVE}];
      let phase = 'incomplete';
      const authority = lifecycleAuthority({[TABLES.SERVICES]: services,
        [TABLES.NODES]: nodes}, (queriedTable, result) => {
        if (phase !== 'incomplete' || queriedTable !== tableName) return result;
        // The services subset hides an active replica. The nodes subset has
        // terminal evidence but cannot certify the complete queried cohort.
        const rows = tableName === TABLES.SERVICES ? [stopped] : nodes.map((row) =>
          ({...row, [COLUMN.STATUS]: NODE_STATE.STOPPED}));
        return {...result, rows, ...failureFields(tableName)};
      });
      f.leader.cdcIntegrationService = authority;
      for (const id of ['B', 'C', 'D']) addTopologySourceRow(f, id);
      await retryHeld(f);
      assert.equal(countCdcObligations(f.leader.db).owed, 4,
        'the actual refusing recipient holds the source ledger');

      omitTarget(f);
      await retryHeld(f);
      assert.equal(authority.reads.includes(tableName), true,
        'the incomplete owner answer reached the lifecycle decision');
      assert.notEqual(targetOf(f).state, RECIPIENT_STATE.DETACHED,
        'a partial or contradictory success cannot retire a real recipient');
      assert.equal(f.acks().length, 0, 'no delivered command crosses the proposal boundary');
      assert.equal(countCdcObligations(f.leader.db).owed, 4,
        'all actual source obligations remain held');
      assert.equal(readCdcObligationProgress(f.leader.db), null,
        'there is no reclaimed prefix from the incomplete answer');
      for (const request of authority.requests) {
        assert.equal(Object.isFrozen(request.options.readAuthority), true);
        assert.equal(request.options.readAuthority.authoritativeReadMode,
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED);
        assert.equal(request.options.readAuthority.leaderMode,
          CONTROL_PLANE_READ_LEADER_MODE.REQUIRED);
        assert.equal(request.sql, `SELECT * FROM ${request.tableName}`);
        assert.deepEqual(request.params, []);
      }

      phase = 'complete-active';
      updateTargetService(f, {});
      await retryHeld(f);
      assert.notEqual(targetOf(f).state, RECIPIENT_STATE.DETACHED,
        'the same owner now reveals the complete active cohort');
      assert.equal(f.acks().length, 0);
      assert.equal(countCdcObligations(f.leader.db).owed, 4);

      phase = 'complete-retirement';
      active[COLUMN.STATUS] = SERVICE_STATUS.STOPPED;
      updateTargetService(f, {});
      await retryHeld(f);
      assert.deepEqual({state: targetOf(f).state, reason: targetOf(f).detachReason},
        {state: RECIPIENT_STATE.DETACHED, reason: DETACH_REASON.LIFECYCLE},
        'only complete leader-witnessed retirement reaches the detach boundary');
      await commitAcknowledgements(f);
      assert.equal(countCdcObligations(f.leader.db).owed, 0,
        'the actual committed acknowledgement reclaims the retired recipient prefix');
      assert.equal(Number(readCdcObligationProgress(f.leader.db).reclaimed), 4);
    });
  }
}
