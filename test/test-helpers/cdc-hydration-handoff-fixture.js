// The one fixture of the hydration -> live CDC hand-off witnesses (CDC
// decision D4): committed traffic on a controllable-port PartitionService
// leader, the CDC_DELIVERED pump, and the late subscriber's measured view.
// Users: test/partition/cdc-hydration-live-handoff.test.js (W-D4a) and
// test/partition/cdc-hydration-old-order.test.js (its negative).
import {PARTITION_SERVICE_OPERATION} from '../../src/partition/partition-service-constants.js';
import {
  PARTITION_CDC_COMMAND,
  PARTITION_CDC_OBLIGATION_BOUND,
} from '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {ELSEWHERE, TABLE, applyCommitted, settleTicks} from './participant-transaction-fixture.js';
import {acknowledgingCdcSubscriber} from './acknowledging-cdc-subscriber.js';

const IMAGE_SQL = `SELECT * FROM ${TABLE}`;
const EARLIER_EVENTS = 20;
const PENDING_EVENTS = 7;
const LATER_EVENTS = 600;
const IMAGE_ROW_KEYS = 50;
const DELETED_IMAGE_ROW = 'r-3';
const PUMP_ROUNDS = 30;

function committedStatement(leader, entryId, sql, params) {
  return {type: PARTITION_SERVICE_OPERATION.QUERY, entryId, sql, params,
    timestamp: leader.hlcClock.now().toString(), proposedBy: ELSEWHERE, proposedAt: 0};
}
const upsertOf = (leader, tag, index) => committedStatement(leader, `${tag}-${index}`,
  `INSERT OR REPLACE INTO ${TABLE} (id, value) VALUES (?, ?)`,
  [`r-${index % IMAGE_ROW_KEYS}`, `${tag}-${index}`]);
const insertOf = (leader, tag, index) => committedStatement(leader, `${tag}-d-${index}`,
  `INSERT OR REPLACE INTO ${TABLE} (id, value) VALUES (?, ?)`, [`${tag}-${index}`, `v-${index}`]);
const deleteOf = (leader, tag) => committedStatement(leader, `${tag}-del`,
  `DELETE FROM ${TABLE} WHERE id = ?`, [DELETED_IMAGE_ROW]);

// The CDC_DELIVERED commands the lane proposed, applied back once each.
async function pump(timeSource, leader, proposed, applied, rounds = PUMP_ROUNDS) {
  for (let round = 0; round < rounds; round += 1) {
    timeSource.advance(PARTITION_CDC_OBLIGATION_BOUND.ACK_FLUSH_DEADLINE_MS);
    await settleTicks();
    for (const command of proposed) {
      if (command.type !== PARTITION_CDC_COMMAND.DELIVERED || applied.has(command.entryId)) {
        continue;
      }
      applied.add(command.entryId);
      applyCommitted(leader, command);
    }
    await settleTicks();
  }
}

function commitLaterTraffic(leader, tag) {
  applyCommitted(leader, deleteOf(leader, tag));
  for (let index = 1; index < LATER_EVENTS; index += 1) {
    applyCommitted(leader, insertOf(leader, tag, index));
  }
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

function measure(leader, late, image, position) {
  const ledgerAbove = leader.db.prepare('SELECT event_key FROM _cdc_obligations ' +
    'WHERE log_index > ? ORDER BY log_index, ordinal').all(position);
  const received = new Set(late.events.map((event) => event.eventKey));
  const truth = new Map(leader.db.prepare(IMAGE_SQL).all().map((row) => [row.id, row.value]));
  const view = viewOf(image, late.events, position);
  const keys = new Set([...truth.keys(), ...view.keys()]);
  return {
    ledgerAbove: ledgerAbove.length,
    missingAbove: ledgerAbove.filter((row) => !received.has(row.event_key)).length,
    divergentRows: [...keys].filter((key) => truth.get(key) !== view.get(key)).length,
    deletedRowInView: view.has(DELETED_IMAGE_ROW),
    owed: countCdcObligations(leader.db).owed,
    outsideLane: late.events.filter((event) => event.replayOnly === true).length,
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
  DELETED_IMAGE_ROW, IMAGE_SQL, LATER_EVENTS, PENDING_EVENTS, commitLaterTraffic,
  earlierTraffic, measure, pump, upsertOf,
};
