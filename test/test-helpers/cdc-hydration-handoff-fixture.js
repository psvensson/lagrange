// The one fixture of the CDC_TABLE ledger witnesses: committed traffic on
// controllable-port PartitionService replicas, the CDC_DELIVERED pump (applied
// back to the leader and to every follower in one committed order), the late
// subscriber's measured view (CDC decision D4) and the ledger's physical
// facts (CDC decision D1). Users: test/partition/cdc-hydration-live-handoff.test.js
// (W-D4a), test/partition/cdc-hydration-old-order.test.js (its negative) and
// test/partition/partition-cdc-obligation-reclamation.test.js (W-D1a-d).
import {PARTITION_SERVICE_OPERATION} from '../../src/partition/partition-service-constants.js';
import {
  PARTITION_CDC_COMMAND,
  PARTITION_CDC_OBLIGATION_BOUND,
} from '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations, readCdcObligationCensusIn} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
// Hosted under the fixture's CDC-carrying table: the CDC policy owner records
// obligations only for internally propagated system tables (decision D2), so
// a user table would leave the ledger empty and the hand-off unmeasurable.
import {CDC_TABLE, ELSEWHERE, applyCommitted, settleTicks} from './participant-transaction-fixture.js';
import {acknowledgingCdcSubscriber} from './acknowledging-cdc-subscriber.js';

const IMAGE_SQL = `SELECT * FROM ${CDC_TABLE}`;
const EARLIER_EVENTS = 20;
const PENDING_EVENTS = 7;
const LATER_EVENTS = 600;
const IMAGE_ROW_KEYS = 50;
const DELETED_IMAGE_ROW = 'r-3';
const PUMP_ROUNDS = 30;
// The ledger's own b-trees (the obligation rows, their indexes and the
// compact progress row), as SQLite's page census names them.
const LEDGER_PAGES_SQL = 'SELECT COUNT(*) AS pages FROM dbstat ' +
  'WHERE name LIKE \'%\\_cdc\\_obligation%\' ESCAPE \'\\\'';
const LEDGER_ROWS_SQL = 'SELECT COUNT(*) AS rows FROM _cdc_obligations';

function committedStatement(leader, entryId, sql, params) {
  return {type: PARTITION_SERVICE_OPERATION.QUERY, entryId, sql, params,
    timestamp: leader.hlcClock.now().toString(), proposedBy: ELSEWHERE, proposedAt: 0};
}
const upsertOf = (leader, tag, index) => committedStatement(leader, `${tag}-${index}`,
  `INSERT OR REPLACE INTO ${CDC_TABLE} (id, value) VALUES (?, ?)`,
  [`r-${index % IMAGE_ROW_KEYS}`, `${tag}-${index}`]);
const insertOf = (leader, tag, index) => committedStatement(leader, `${tag}-d-${index}`,
  `INSERT OR REPLACE INTO ${CDC_TABLE} (id, value) VALUES (?, ?)`, [`${tag}-${index}`, `v-${index}`]);
const deleteOf = (leader, tag) => committedStatement(leader, `${tag}-del`,
  `DELETE FROM ${CDC_TABLE} WHERE id = ?`, [DELETED_IMAGE_ROW]);
// The durable event key a committed statement's obligation carries.
const eventKeyOf = (command) => `entry:${command.entryId}`;

// One committed entry, applied on every replica in the same order; the typed
// apply answers (null when applied).
function commitOnAll(replicas, command) {
  return replicas.map((replica) => applyCommitted(replica, command));
}

// The CDC_DELIVERED commands the lane proposed, applied back once each, on
// the leader and then on each follower (one committed order).
async function pump(timeSource, leader, proposed, applied, rounds = PUMP_ROUNDS, followers = []) {
  for (let round = 0; round < rounds; round += 1) {
    timeSource.advance(PARTITION_CDC_OBLIGATION_BOUND.ACK_FLUSH_DEADLINE_MS);
    await settleTicks();
    for (const command of proposed) {
      if (command.type !== PARTITION_CDC_COMMAND.DELIVERED || applied.has(command.entryId)) {
        continue;
      }
      applied.add(command.entryId);
      commitOnAll([leader, ...followers], command);
    }
    await settleTicks();
  }
}

// The later traffic: one DELETE of an image row, then distinct inserts. The
// committed event keys, in log order.
function commitLaterTraffic(leader, tag, followers = []) {
  const commands = [deleteOf(leader, tag)];
  for (let index = 1; index < LATER_EVENTS; index += 1) {
    commands.push(insertOf(leader, tag, index));
  }
  for (const command of commands) commitOnAll([leader, ...followers], command);
  return commands.map(eventKeyOf);
}

// The late subscriber's view: the image, then every event above P it was
// handed, in log order (once per event key).
function viewOf(imageRows, events, position) {
  const view = new Map(imageRows.map((row) => [row.id, row.value]));
  const above = [...new Map(events.filter((event) => event.logIndex > position)
    .map((event) => [event.eventKey, event])).values()]
    .sort((left, right) => left.logIndex - right.logIndex);
  for (const event of above) {
    const id = event.data?.id ?? event.oldData?.id ?? event.previousData?.id;
    if (event.operation === 'DELETE') view.delete(id);
    else view.set(id, event.data?.value);
  }
  return view;
}

// What the late subscriber missed of the events committed above P (their keys
// come from the committed traffic, not from the ledger, which reclaims them).
function measure(leader, late, image, position, committedAbove) {
  const received = new Set(late.events.filter((event) => event.logIndex > position)
    .map((event) => event.eventKey));
  const truth = new Map(leader.db.prepare(IMAGE_SQL).all().map((row) => [row.id, row.value]));
  const view = viewOf(image, late.events, position);
  const keys = new Set([...truth.keys(), ...view.keys()]);
  return {
    committedAbove: committedAbove.length,
    missingAbove: committedAbove.filter((eventKey) => !received.has(eventKey)).length,
    divergentRows: [...keys].filter((key) => truth.get(key) !== view.get(key)).length,
    deletedRowInView: view.has(DELETED_IMAGE_ROW),
    owed: countCdcObligations(leader.db).owed,
    outsideLane: late.events.filter((event) => event.replayOnly === true).length,
  };
}

// The ledger as one replica holds it: its physical size (rows, pages) and the
// owner's census (every retained row and the compact progress; the census
// reads inside one read transaction, as the retained-seed observer does).
function ledgerFactsOf(replica) {
  const census = replica.db.transaction(() => readCdcObligationCensusIn(replica.db))();
  return {
    rows: census.exists ? replica.db.prepare(LEDGER_ROWS_SQL).get().rows : 0,
    pages: replica.db.prepare(LEDGER_PAGES_SQL).get().pages,
    ...countCdcObligations(replica.db),
    progress: census.progress ?? null,
    image: JSON.stringify(census),
  };
}

async function earlierTraffic(leader, proposed, timeSource, applied, earlierCount) {
  const earlier = [];
  for (let index = 0; index < earlierCount; index += 1) {
    const subscriber = acknowledgingCdcSubscriber();
    earlier.push(subscriber);
    await leader.subscribeToCDCWithHandshake(subscriber, {subscriberId: `A${index}`});
  }
  for (let index = 0; index < EARLIER_EVENTS; index += 1) {
    applyCommitted(leader, upsertOf(leader, 'pre', index));
  }
  await settleTicks();
  await pump(timeSource, leader, proposed, applied, 5);
  return earlier;
}

export {
  DELETED_IMAGE_ROW, EARLIER_EVENTS, IMAGE_SQL, LATER_EVENTS, PENDING_EVENTS, commitLaterTraffic,
  commitOnAll, earlierTraffic, eventKeyOf, insertOf, ledgerFactsOf, measure, pump, upsertOf,
};
