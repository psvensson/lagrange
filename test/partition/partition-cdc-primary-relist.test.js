// CDC delivery finding F3 (2026-11-11): the dead-recipient measures hold for
// the propagation subscriber's primary recipient (its source message group)
// as for its target groups. Real source partition, ledger, obligation lane,
// subscription, CDCGroupPropagationService and the partition's own paged
// hydration-image answer; the source group is a Stage 3 recipient model on
// the real position cell (SystemTableCacheSourceOrder) whose re-list is that
// image (its row store is a map: the fixture table is not a system-cache
// table). The target group commits every range.
import assert from 'node:assert/strict';
import {COLUMN} from '../../src/constants/index.js';
import {afterEach, beforeEach, test} from 'node:test';
import {SOURCE_RANGE_DECISION, SOURCE_RELIST_OUTCOME, SystemTableCacheSourceOrder} from
  '../../src/cache/system-table-cache-cdc-observation.js';
import {CDC_COMPLETION, buildCommittedCdcOutcome, unknownCdcAcceptance} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {PARTITION_CDC_COMMAND, PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_RECIPIENT_STATE as RECIPIENT_STATE} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTITION_HYDRATION_IMAGE_PAGE_FIELD, PARTITION_HYDRATION_IMAGE_QUERY_FIELD} from
  '../../src/partition/partition-service-hydration-image-methods.js';
import {QUERY_MESSAGE_TYPE} from '../../src/query/query-constants.js';
import {setupConfig, teardownConfig} from '../topology/cdc-group-propagation-service-harness.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/topology/latency-topology-constants.js';
import {CDC_TABLE, clearFixtureSingletons, resetFixtureSingletons, settleTicks} from
  '../test-helpers/participant-transaction-fixture.js';
import {commitAcknowledgements} from '../test-helpers/cdc-delivery-progress-fixture.js';
import {assertShippedSourceRange} from '../test-helpers/cdc-source-range-fixture.js';
import {RESPONSE, SOURCE_GROUP, TARGET_GROUP, addTopologySourceRow, targetService,
  topologyProgressFixture} from
  '../test-helpers/cdc-topology-progress-fixture.js';

beforeEach(() => {
  resetFixtureSingletons();
  setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
});
afterEach(() => {
  teardownConfig();
  clearFixtureSingletons();
});

const GAP_RETRY_AFTER_MS = 25;
const REFUSAL_RETRY_AFTER_MS = 40;

const imagePageQuery = (tableName, cursor) => ({type: QUERY_MESSAGE_TYPE.QUERY,
  sql: `SELECT * FROM ${tableName}`, params: [], [PARTITION_HYDRATION_IMAGE_QUERY_FIELD]: true,
  [PARTITION_HYDRATION_IMAGE_PAGE_FIELD]: cursor});

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

// The source group as a Stage 3 recipient: it applies a range only after its
// predecessor, answers a gap otherwise and lists the leader's image; every
// position it applied is recorded (a second apply is a duplicate).
function primaryModel(f) {
  const cell = new SystemTableCacheSourceOrder();
  const model = {cell, rows: new Map(), lists: 0, refusing: false, applied: new Set(),
    duplicates: 0};
  cell.registerRelister(async ({sourcePartition, tableName}) => {
    const answer = await leaderImage(f, tableName);
    model.lists += 1;
    model.rows = new Map(answer.rows.map((row) => [row.id, row.value]));
    cell.recordListedPosition({sourcePartition, tableName,
      incarnation: answer.sourceImage.incarnation, appliedIndex: answer.sourceImage.appliedIndex});
    return SOURCE_RELIST_OUTCOME.STOPPED;
  });
  model.answer = (events, range) => {
    assertShippedSourceRange(range);
    if (model.refusing) {
      return {...unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE),
        retryAfterMs: REFUSAL_RETRY_AFTER_MS};
    }
    if (cell.classifyRange(range).decision === SOURCE_RANGE_DECISION.GAP) {
      cell.recordGap(range, events[0].tableName);
      return {...unknownCdcAcceptance(CDC_COMPLETION.POSITION_GAP),
        retryAfterMs: GAP_RETRY_AFTER_MS};
    }
    for (const event of events) {
      const position = {logIndex: event.sourceLogIndex, ordinal: event.sourceOrdinal};
      if (cell.memberApplied(range, position)) continue;
      const key = `${position.logIndex}:${position.ordinal}`;
      if (model.applied.has(key)) model.duplicates += 1;
      model.applied.add(key);
      model.rows.set(event.data.id, event.data.value);
    }
    cell.advance(range, events[0].tableName);
    return buildCommittedCdcOutcome(events, SOURCE_GROUP, {index: 30 + model.applied.size,
      term: 2});
  };
  return model;
}

const primaryOf = (f) => f.leader.cdcDelivery.getCdcObligationDiagnostics().recipients
  .find((recipient) => recipient.groupId === SOURCE_GROUP);
const sourceRowsOf = (f) => new Map(f.leader.db.prepare(`SELECT id, value FROM ${CDC_TABLE}`)
  .all().map((row) => [row.id, row.value]));

async function retryHeld(f) {
  for (let round = 0; round < 6; round += 1) {
    await f.drive();
    await settleTicks();
  }
}

test('F3 a dead primary recipient (the source group) past RELIST_LAG_ROWS leaves the frontier ' +
  'as MUST_RELIST: the target keeps confirming, owed rows stay under the cap and are ' +
  'reclaimed; on return the primary re-lists once and equals the source with no row lost ' +
  'or applied twice', async (t) => {
  const f = await stageFixture(t);
  const primary = primaryModel(f);
  f.source.applyCDCBatch = (events, options) => primary.answer(events, options.sourceRange);
  await retryHeld(f);
  assert.equal(primaryOf(f).state, RECIPIENT_STATE.CONFIRMED, 'the primary streams');
  assert.equal(primary.lists, 1, 'its first contact gapped and listed once');

  // The source group stops confirming (lost quorum): its local service stays
  // live and selected, so nothing rebinds the propagation.
  primary.refusing = true;
  let maxOwed = 0;
  const rows = BOUND.RELIST_LAG_ROWS + BOUND.ACK_BATCH_MAX_EVENTS * 2;
  for (let index = 0; index < rows; index += 1) {
    addTopologySourceRow(f, `P${index}`);
    if (index % 128 === 127) {
      await settleTicks();
      await commitAcknowledgements(f);
    }
    maxOwed = Math.max(maxOwed, countCdcObligations(f.leader.db).owed);
  }
  await settleTicks();
  await commitAcknowledgements(f);
  assert.equal(primaryOf(f).state, RECIPIENT_STATE.MUST_RELIST, 'the dead primary is MUST_RELIST');
  assert.equal(maxOwed < BOUND.OWED_MAX_EVENTS, true,
    `owed rows stayed under the cap (max ${maxOwed}): no write was refused for capacity`);
  assert.equal(countCdcObligations(f.leader.db).owed < BOUND.ACK_BATCH_MAX_EVENTS * 2, true,
    'the ledger reclaimed past the dead primary');

  primary.refusing = false;
  await retryHeld(f);
  await settleTicks();
  await retryHeld(f);
  assert.equal(primary.lists, 2, 'exactly one re-list on return');
  assert.equal(primaryOf(f).state, RECIPIENT_STATE.CONFIRMED, 'it streams again');
  addTopologySourceRow(f, 'after-return');
  await f.drive();
  await settleTicks();
  assert.deepEqual(primary.rows, sourceRowsOf(f), 'the primary equals the source: nothing lost');
  assert.equal(primary.duplicates, 0, 'no position was applied twice');
  await commitAcknowledgements(f);
  assert.equal(countCdcObligations(f.leader.db).owed, 0, 'everything drains');
});

async function stageFixture(t) {
  const f = await topologyProgressFixture(t, {otherSubscriber: false});
  f.acks = () => f.proposed.filter((command) => command.type === PARTITION_CDC_COMMAND.DELIVERED);
  f.targetMode = RESPONSE.NATIVE;
  assert.equal(targetService(f)[COLUMN.GROUP_ID], TARGET_GROUP, 'one target group');
  return f;
}
