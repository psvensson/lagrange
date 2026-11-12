// CDC recipient progress and re-entry (design note S3.11; corrective round of
// the rejected finding F3, 2026-11-11). Every witness runs the production
// entry points on both sides of the range contract (cdc-relist-reentry-fixture.js):
// the source partition's write path, ledger and obligation lane, and a real
// message group's committed acceptance, cache and position cell, re-listing
// from the source leader's paged image through the production fetch and
// install. Each witness pairs the stall or refusal with the useful work that
// resumes after it.
import {RECIPIENT_MODE, attachRecipient, cellOf, detachRecipient, laneOf, lanePrimaryOf,
  ledgerReclaimed, newestOf, owedOf, recipientRowsOf, sourceRowsOf, until, withRelistReentry,
  writeRows} from '../test-helpers/cdc-relist-reentry-fixture.js';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SOURCE_POSITION_STATE} from '../../src/cache/system-table-cache-source-order.js';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND,
  PARTITION_CDC_RECIPIENT_RELEASE as RELEASE,
  PARTITION_CDC_RECIPIENT_STATE as RECIPIENT_STATE} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {PARTITION_CDC_FRONTIER_STATE as FRONTIER_STATE} from
  '../../src/partition/partition-cdc-recipient-progress.js';

// Rows that take an unconfirming recipient past the release rule's lag bound.
const ROWS_PAST_RELEASE = BOUND.RELIST_LAG_ROWS + BOUND.SHIP_MAX_EVENTS;

const confirmedAtNewest = (f) => {
  const primary = lanePrimaryOf(f);
  const newest = newestOf(f);
  return primary.state === RECIPIENT_STATE.CONFIRMED && primary.cursor !== null &&
    primary.cursor.logIndex === newest.logIndex && primary.cursor.ordinal === newest.ordinal;
};

// The recipient's cell is CURRENT at or beyond the ledger's newest event and
// its cache holds the source table.
function assertCurrentWithSourceContent(f, recipient, message) {
  const cell = cellOf(f, recipient);
  assert.equal(cell.state, SOURCE_POSITION_STATE.CURRENT, `${message}: the cell is current`);
  assert.equal(cell.position.logIndex >= newestOf(f).logIndex, true,
    `${message}: the cell is at or beyond the newest event`);
  assert.deepEqual(recipientRowsOf(recipient), sourceRowsOf(f),
    `${message}: the cache holds the source table`);
}

const releasesOf = (f, reason) => lanePrimaryOf(f).relist.releases[reason] ?? 0;
const totalReleasesOf = (f) => Object.values(lanePrimaryOf(f).relist.releases)
  .reduce((sum, count) => sum + count, 0);

const assertEveryRangeWellFormed = (recipient) => assert.deepEqual(
  recipient.shipped.filter((shipped) => !shipped.wellFormed).map((shipped) => shipped.range), [],
  'every range shipped to the real receiver is well-formed');

// A recipient that streams, then stops confirming until the lane releases it
// (MUST_RELIST), while the frontier holder keeps confirming.
async function releasedRecipient(t, f) {
  const recipient = await f.realRecipient('reentry-group-a');
  await attachRecipient(f, recipient);
  await writeRows(f, 3);
  await until(f, () => confirmedAtNewest(f) && owedOf(f) === 0, 'the recipient streams');
  recipient.mode = RECIPIENT_MODE.REFUSING;
  await writeRows(f, ROWS_PAST_RELEASE);
  await until(f, () => lanePrimaryOf(f).state === RECIPIENT_STATE.MUST_RELIST && owedOf(f) === 0,
    'the unconfirming recipient is released and the ledger reclaims past it');
  assert.equal(releasesOf(f, RELEASE.LAG_WITHOUT_RECEIPT), 1, 'released once, by name');
  assert.equal(f.maxOwed < BOUND.OWED_MAX_EVENTS, true,
    `owed rows stayed under the cap (max ${f.maxOwed}): no write was refused`);
  return recipient;
}

test('W1 quiet-table attach: with every row reclaimed, a recipient that attaches is shipped a ' +
  'well-formed probe by the handshake alone, answers a gap, re-lists once and ends CURRENT at ' +
  'the newest position with the source table, without a write', async (t) => {
  await withRelistReentry(t, async (f) => {
    const first = await f.realRecipient('reentry-group-a');
    // The late recipient exists (its cache listed the empty source) before
    // any row is written.
    const late = await f.realRecipient('reentry-group-b');
    await until(f, () => late.images.length === 1 && late.images[0].installed,
      'the late group listed the source at its start');
    const firstAttachment = await attachRecipient(f, first);
    await writeRows(f, 3);
    await until(f, () => confirmedAtNewest(f) && ledgerReclaimed(f),
      'the first recipient confirmed every row and the ledger reclaimed them all');
    const newest = newestOf(f);
    assert.notDeepEqual(recipientRowsOf(late), sourceRowsOf(f), 'the late group lacks the rows');

    // The stall: nothing is owed and nothing was ever shipped to the late
    // group. The attach itself must contact it.
    detachRecipient(f, firstAttachment);
    await attachRecipient(f, late);
    await until(f, () => confirmedAtNewest(f), 'the late recipient confirms the newest position');
    assert.deepEqual(newestOf(f), newest, 'no write happened');
    assert.equal(late.shipped.length >= 2, true, 'the probe, then the probe again after the list');
    assertEveryRangeWellFormed(late);
    assert.deepEqual(late.shipped[0].range.through, newest, 'the probe ends at the newest event');
    assert.equal(late.images.length, 2, 'its gap answer listed the source once more');
    assertCurrentWithSourceContent(f, late, 'the late recipient');
    assert.equal(owedOf(f), 0);

    // The useful work that resumes: the next write streams to it.
    await writeRows(f, 1);
    await until(f, () => confirmedAtNewest(f) && owedOf(f) === 0, 'the next write is delivered');
    assert.equal(late.images.length, 2, 'streaming needs no further list');
    assertCurrentWithSourceContent(f, late, 'after the next write');
  });
});

test('W2 write during the image: a row committed while a released recipient re-lists is held ' +
  'for it although the frontier holder confirmed it, and is applied by the recipient after ' +
  'the install; its cell is never current below a committed row it lacks', async (t) => {
  await withRelistReentry(t, async (f) => {
    const recipient = await releasedRecipient(t, f);
    const listsBefore = recipient.images.length;
    let heldDuringImage = null;
    recipient.duringImage = async () => {
      recipient.duringImage = null;
      await writeRows(f, 1);
      const written = `reentry-${f.written}`;
      await until(f, () => f.holderShipped.includes(written),
        'the frontier holder confirmed the row committed during the image');
      await f.partition.cdcDelivery.flushCdcAcknowledgements('flush_deadline');
      heldDuringImage = {owed: owedOf(f), state: lanePrimaryOf(f).state,
        hold: lanePrimaryOf(f).relist.hold};
    };
    // A current cell over a cache that lacks a committed row is the defect.
    f.invariant = () => {
      if (cellOf(f, recipient).state !== SOURCE_POSITION_STATE.CURRENT) return;
      if (cellOf(f, recipient).position.logIndex < newestOf(f).logIndex) return;
      assert.deepEqual(recipientRowsOf(recipient), sourceRowsOf(f),
        'a cell current at the newest event holds every committed row');
    };
    recipient.mode = RECIPIENT_MODE.REAL;
    await until(f, () => confirmedAtNewest(f) && owedOf(f) === 0,
      'the recipient re-entered and everything drained');
    assert.equal(heldDuringImage.owed, 1, 'the row committed during the image stayed owed');
    assert.equal(heldDuringImage.state, RECIPIENT_STATE.POSITION_GAP);
    assert.notEqual(heldDuringImage.hold, null, 'the re-list hold stood during the image');
    assert.equal(recipient.images.length - listsBefore, 1, 'one image');
    assert.equal(recipient.shipped.at(-1).keys.includes(`reentry-${f.written}`), true,
      'the row committed during the image was shipped to the recipient after the install');
    assertEveryRangeWellFormed(recipient);
    assertCurrentWithSourceContent(f, recipient, 'the re-entered recipient');
  }, {holder: true});
});

test('W3 sustained writes: a steady writer during the re-list is retained behind the hold, the ' +
  'recipient re-enters with one image and the ledger stays under the cap; past the hold\'s ' +
  'row bound the hold is released by name and the next offer succeeds', async (t) => {
  await withRelistReentry(t, async (f) => {
    const recipient = await releasedRecipient(t, f);
    const listsBefore = recipient.images.length;
    const duringImage = BOUND.SHIP_MAX_EVENTS * 2;
    let retained = null;
    recipient.duringImage = async () => {
      recipient.duringImage = null;
      for (let burst = 0; burst < 8; burst += 1) await writeRows(f, duringImage / 8);
      retained = owedOf(f);
    };
    recipient.mode = RECIPIENT_MODE.REAL;
    await until(f, () => confirmedAtNewest(f) && owedOf(f) === 0,
      'the recipient re-entered under a steady writer');
    assert.equal(retained, duringImage, 'every row written during the image was retained');
    assert.equal(recipient.images.length - listsBefore, 1, 'one image sufficed');
    assert.equal(f.maxOwed < BOUND.OWED_MAX_EVENTS, true, `owed max ${f.maxOwed} under the cap`);
    assertCurrentWithSourceContent(f, recipient, 'after one image');

    // Above the threshold: more rows than the hold may pin are written while
    // an image is in flight. The hold is released by name; nothing is lost.
    recipient.mode = RECIPIENT_MODE.REFUSING;
    await writeRows(f, ROWS_PAST_RELEASE);
    await until(f, () => lanePrimaryOf(f).state === RECIPIENT_STATE.MUST_RELIST && owedOf(f) === 0,
      'released again');
    const listsBeforeFlood = recipient.images.length;
    recipient.duringImage = async () => {
      recipient.duringImage = null;
      await writeRows(f, BOUND.RELIST_LAG_ROWS + BOUND.SHIP_MAX_EVENTS);
      await until(f, () => releasesOf(f, RELEASE.HOLD_LAG_EXCEEDED) === 1,
        'the hold past its row bound is released');
    };
    recipient.mode = RECIPIENT_MODE.REAL;
    await until(f, () => confirmedAtNewest(f) && owedOf(f) === 0,
      'the recipient re-entered after the flood');
    assert.equal(releasesOf(f, RELEASE.HOLD_LAG_EXCEEDED), 1, 'the degraded outcome is named');
    assert.equal(recipient.images.length - listsBeforeFlood, 2,
      'the flooded image, then one more under a new hold');
    assert.equal(f.maxOwed < BOUND.OWED_MAX_EVENTS, true, `owed max ${f.maxOwed} under the cap`);
    assertCurrentWithSourceContent(f, recipient, 'after the flood');
  }, {holder: true});
});

for (const mode of [RECIPIENT_MODE.NEVER_SETTLING, RECIPIENT_MODE.PROVISIONAL]) {
  test(`W4 a dead recipient (${mode}) cannot pin the ledger: it is released after the lag bound ` +
    'with no receipt, owed rows return below the cap and no write is refused; when it answers ' +
    'again it re-lists once and holds the source table', async (t) => {
    await withRelistReentry(t, async (f) => {
      const recipient = await f.realRecipient('reentry-group-a');
      await attachRecipient(f, recipient);
      await writeRows(f, 3);
      await until(f, () => confirmedAtNewest(f) && owedOf(f) === 0, 'the recipient streams');
      recipient.mode = mode;
      await writeRows(f, ROWS_PAST_RELEASE);
      await until(f, () => lanePrimaryOf(f).state === RECIPIENT_STATE.MUST_RELIST &&
        owedOf(f) < BOUND.ACK_BATCH_MAX_EVENTS, 'the dead recipient is released');
      assert.equal(releasesOf(f, RELEASE.LAG_WITHOUT_RECEIPT), 1);
      assert.equal(f.maxOwed < BOUND.OWED_MAX_EVENTS, true, `owed max ${f.maxOwed} under the cap`);
      // Still dead: further writes are acknowledged past it.
      await writeRows(f, BOUND.SHIP_MAX_EVENTS);
      await until(f, () => owedOf(f) < BOUND.ACK_BATCH_MAX_EVENTS, 'writes keep draining');
      if (mode === RECIPIENT_MODE.NEVER_SETTLING) return;
      const listsBefore = recipient.images.length;
      recipient.mode = RECIPIENT_MODE.REAL;
      await until(f, () => confirmedAtNewest(f) && owedOf(f) === 0, 'it answers again');
      assert.equal(recipient.images.length - listsBefore, 1, 'one image on return');
      assertCurrentWithSourceContent(f, recipient, 'the returned recipient');
    });
  });
}

test('W2 a recipient that holds the frontier and answers a gap is held like a re-lister: its ' +
  'hold is the newest position as of the gapped range, the backlog its image covers is ' +
  'acknowledged, a row committed during the image is retained and applied after the install, ' +
  'with one image', async (t) => {
  await withRelistReentry(t, async (f) => {
    // The recipient listed the source before its ledger existed: its first
    // range is of an incarnation its cache has no position of.
    const recipient = await f.realRecipient('reentry-group-a');
    await until(f, () => recipient.images.length === 1 && recipient.images[0].installed,
      'the group listed the source at its start');
    const backlog = BOUND.SHIP_MAX_EVENTS + 1;
    await writeRows(f, backlog);
    const newestAtAttach = newestOf(f);
    let duringImage = null;
    recipient.duringImage = async () => {
      recipient.duringImage = null;
      await until(f, () => owedOf(f) === 0, 'the backlog the image covers is acknowledged');
      await writeRows(f, 1);
      await f.partition.cdcDelivery.flushCdcAcknowledgements('flush_deadline');
      duringImage = {owed: owedOf(f), state: lanePrimaryOf(f).state,
        hold: lanePrimaryOf(f).relist.hold?.position ?? null, cursor: lanePrimaryOf(f).cursor};
    };
    await attachRecipient(f, recipient);
    await until(f, () => confirmedAtNewest(f) && owedOf(f) === 0, 'it re-listed and streams');
    assert.deepEqual(duringImage, {owed: 1, state: RECIPIENT_STATE.POSITION_GAP,
      hold: newestAtAttach, cursor: null},
    'held from the newest position as of the gapped range; its cursor did not move');
    assert.equal(totalReleasesOf(f), 0, 'a re-lister inside its bounds is not released');
    assert.equal(recipient.images.length, 2, 'one image for the gap');
    assert.equal(recipient.shipped.at(-1).keys.includes(`reentry-${f.written}`), true,
      'the row committed during the image was shipped after the install');
    assertEveryRangeWellFormed(recipient);
    assertCurrentWithSourceContent(f, recipient, 'the re-listed recipient');
  });
});

test('W4 a freshly attached recipient is not released for a backlog: on a ledger owing more ' +
  'than the lag bound it holds the frontier while its first delivery is in flight, also when ' +
  'the frontier is computed meanwhile; nothing is acknowledged before its own receipt, and it ' +
  'receives every row', async (t) => {
  await withRelistReentry(t, async (f) => {
    // The recipient lists the source after its ledger exists (one row), so
    // its cache has a position in the ledger's incarnation.
    await writeRows(f, 1);
    const recipient = await f.realRecipient('reentry-group-a');
    await until(f, () => recipient.images.length === 1 && recipient.images[0].installed,
      'the group listed the source at its start');
    const backlog = BOUND.RELIST_LAG_ROWS + BOUND.SHIP_MAX_EVENTS;
    await writeRows(f, backlog);
    assert.equal(owedOf(f), backlog + 1, 'no subscriber: everything is owed');
    // While its first vector is in flight a write commits: the lane computes
    // the frontier with the recipient shipped, unconfirmed and past the lag
    // bound.
    let inFlight = null;
    recipient.beforeAnswer = async () => {
      recipient.beforeAnswer = null;
      await writeRows(f, 1);
      inFlight = {state: lanePrimaryOf(f).state, releases: totalReleasesOf(f),
        pending: laneOf(f).pendingAcknowledgements, frontierState: laneOf(f).frontierState};
    };
    await attachRecipient(f, recipient);
    await until(f, () => confirmedAtNewest(f) && owedOf(f) === 0, 'it receives the backlog');
    assert.deepEqual(inFlight, {state: RECIPIENT_STATE.SUBSCRIBER_UNCONFIRMED, releases: 0,
      pending: 0, frontierState: FRONTIER_STATE.UNCONFIRMED},
    'shipped and in flight past the lag bound: held, nothing acknowledged without a receipt');
    assert.equal(totalReleasesOf(f), 0, `never released: ${JSON.stringify(
      {relist: lanePrimaryOf(f).relist, answers: recipient.answers})}`);
    assert.equal(recipient.images.length, 1, 'no list beyond the one at its start');
    assert.equal(recipient.answers.every((answer) => answer === 'accepted'), true,
      'every vector of the backlog was accepted by the real receiver');
    assertCurrentWithSourceContent(f, recipient, 'the fresh recipient');
  });
});

test('W5 unheld frontier: with its only recipient released the ledger is reclaimed with no ' +
  'receipt from anyone; a recipient that attaches while such acknowledgements are still ' +
  'pending is not moved over them: it is probed, answers a gap, lists at or beyond everything ' +
  'reclaimed and holds the source table', async (t) => {
  await withRelistReentry(t, async (f) => {
    // The late recipient exists, with the empty source listed, before any row.
    const late = await f.realRecipient('reentry-group-b');
    await until(f, () => late.images.length === 1 && late.images[0].installed,
      'the late group listed the source at its start');
    await releasedRecipient(t, f);
    assert.equal(laneOf(f).frontierState, FRONTIER_STATE.UNHELD);
    await writeRows(f, BOUND.SHIP_MAX_EVENTS);
    await until(f, () => ledgerReclaimed(f), 'the ledger is reclaimed with no receipt');
    const reclaimedThrough = newestOf(f);
    assert.notDeepEqual(recipientRowsOf(late), sourceRowsOf(f), 'the late group lacks the rows');

    // Rows acknowledged with no receipt, their acknowledgement still pending
    // when the late recipient attaches: its scan steps over them.
    await writeRows(f, 5);
    assert.equal(laneOf(f).pendingAcknowledgements > 0, true,
      'acknowledgements of rows nobody received are pending at the attach');
    const [released] = f.subscribers;
    detachRecipient(f, released);
    await attachRecipient(f, late);
    await until(f, () => confirmedAtNewest(f) && owedOf(f) === 0,
      'the late recipient confirms the newest position by its own receipt');
    assert.equal(late.images.length, 2, 'its gap answer listed the source once');
    assert.equal(late.images.at(-1).appliedIndex >= reclaimedThrough.logIndex, true,
      'its image is at or beyond everything reclaimed without it');
    assertEveryRangeWellFormed(late);
    assertCurrentWithSourceContent(f, late, 'the late recipient');
    assert.equal(laneOf(f).frontierState, FRONTIER_STATE.HELD);
  });
});
