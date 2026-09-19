// Witness for the readiness-admission-transitions-observed quest, routing
// half. Raw node:test so the anchored receipt runner selects exactly one
// scenario.
//
// SCOPE. In the formation traced by the second causal packet of 2026-09-19
// the routing layer denied every candidate on a readiness record that was
// 173 s old and carried an inherited verdict, and said neither fact. These
// witnesses pin that the denial now states the record's age and whether it
// was deferred, that the age is read once per emitted line rather than once
// per denied node per snapshot, and that every pre-existing field of that
// payload is byte-identical to main's.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

import {
  QUERY_LOG_MSG,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
} from '../../src/query/query-constants.js';
import {resolveReadinessObservedAgeMs} from
  '../../src/control-plane/eligibility-snapshot.js';
import {
  STALE_HEARTBEAT_MAX_AGE_MS,
  captureDenialEntry,
  createAdmissionDrive,
  createLogSink,
  isDeferredSnapshot,
} from '../control-plane/readiness-admission-transitions-rig.js';

// THE FROZEN ORACLE for the denial payload: the sha256 of the JSON of the one
// denied-candidate entry this scenario produces, measured on the tree at
// b869139a6 - main with the guard-inputs quest landed and not one source line
// of this quest applied. The assertion deletes exactly the two keys this
// quest adds and hashes the rest, so anything else that moved in that payload
// - a value, a key, an order - fails it. The same digest holds for the entry
// the routing snapshot lists and for the entry the denial LINE carries,
// because on main they are the same object.
const MAIN_DENIAL_ENTRY_DIGEST =
  '42fe86ce6fdbe70b03c7fa501c9f457e16af5c03e1da539426e438df6d891e44';
const MAIN_DENIAL_ENTRY_KEYS = Object.freeze([
  'decisionDimension',
  'observedAt',
  'lifecycleState',
  'reasonCodes',
  'failedDimensions',
  'runtimeAuthority',
  'projectionReadinessContract',
]);
const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const ADDED_DENIAL_KEYS = Object.freeze(['observedAgeMs', 'deferred']);
const DEFERRED_RECORD_AGE_MS = STALE_HEARTBEAT_MAX_AGE_MS + 1;
const FUTURE_STAMP_MS = 60_000;

async function createFrozenReadinessDrive() {
  const drive = createAdmissionDrive();
  drive.read();
  await drive.drain();
  assert.equal(isDeferredSnapshot(drive.read()), false,
    'the drive starts from an admitted record');
  drive.advance(DEFERRED_RECORD_AGE_MS);
  assert.equal(isDeferredSnapshot(drive.read()), true,
    'the planning owner is now serving a deferred record');
  return drive;
}

function digestOf(value) {
  return createHash(DIGEST_ALGORITHM).update(JSON.stringify(value))
    .digest(DIGEST_ENCODING);
}

function preExistingFields(entry) {
  const copy = {...entry};
  for (const key of ADDED_DENIAL_KEYS) delete copy[key];
  return copy;
}

test('the routing denial states each denied candidate\'s record age and ' +
  'deferral', async () => {
  const captured = await captureDenialEntry();
  assert.equal(captured.snapshot.reasonCode,
    QUERY_ROUTING_DIAGNOSTIC_REASON.ALL_SERVICES_FILTERED_BY_READINESS,
    'every active addressed candidate was filtered by readiness');
  assert.equal(captured.lineMessage,
    QUERY_LOG_MSG.PARTITION_ROUTING_CANDIDATES_FILTERED,
    'the denial line was emitted under its unchanged message');
  assert.equal(captured.lineLevel, 'warn',
    'at its unchanged level');
  const lineEntry = captured.lineEntry;
  assert.ok(lineEntry, 'the denied candidate is listed on the line');
  assert.equal(lineEntry.observedAgeMs, captured.expectedAgeMs,
    'the line states how old the record the denial was made on is');
  assert.equal(lineEntry.deferred, true,
    'and that the record was a deferred one');
  assert.deepEqual(Object.keys(preExistingFields(lineEntry)),
    [...MAIN_DENIAL_ENTRY_KEYS],
    'no pre-existing key was added, removed or reordered on the line');
  assert.equal(digestOf(preExistingFields(lineEntry)), MAIN_DENIAL_ENTRY_DIGEST,
    'every pre-existing field of the line is byte-identical to main\'s');
  // The routing snapshot itself carries the deferral flag, which costs
  // nothing, and NOT the age, which costs a clock read: the age is added
  // where the throttled line is actually built.
  const snapshotEntry = captured.snapshotEntry;
  assert.equal(snapshotEntry.deferred, true,
    'the snapshot entry states the deferral');
  assert.equal(Object.hasOwn(snapshotEntry, 'observedAgeMs'), false,
    'and does not carry an age nobody is about to log');
  assert.equal(digestOf(preExistingFields(snapshotEntry)),
    MAIN_DENIAL_ENTRY_DIGEST,
    'every pre-existing field of the snapshot entry is main\'s too');
  // No clock read per denied node per routing snapshot; one per emitted line.
  const drive = await createFrozenReadinessDrive();
  try {
    let clockReads = 0;
    const nowFn = drive.executor.nowFn;
    drive.executor.nowFn = () => {
      clockReads += 1;
      return nowFn();
    };
    drive.routingSnapshot();
    assert.equal(clockReads, 0,
      'building a routing snapshot reads no clock for the denial ages');
    const sink = createLogSink();
    drive.executor.logger = sink.logger;
    drive.executor.logPartitionRoutingDenial(drive.routingSnapshot());
    assert.equal(clockReads, 1,
      'one emitted line reads the clock exactly once');
  } finally {
    drive.shutdown();
  }
});

test('the readiness observed-age contract is total', () => {
  const nowMs = 1_700_000_000_000;
  const stamp = new Date(nowMs - DEFERRED_RECORD_AGE_MS).toISOString();
  assert.equal(resolveReadinessObservedAgeMs(stamp, nowMs),
    DEFERRED_RECORD_AGE_MS, 'a parseable stamp states its age');
  assert.equal(resolveReadinessObservedAgeMs(null, nowMs), null,
    'a missing stamp states no age');
  assert.equal(resolveReadinessObservedAgeMs('', nowMs), null,
    'an empty stamp states no age');
  assert.equal(resolveReadinessObservedAgeMs('not-a-date', nowMs), null,
    'an unparseable stamp states no age');
  assert.equal(resolveReadinessObservedAgeMs(nowMs, nowMs), null,
    'a non-string stamp states no age');
  assert.equal(resolveReadinessObservedAgeMs(stamp, null), null,
    'a caller with no clock states no age');
  assert.equal(resolveReadinessObservedAgeMs(stamp, Number.NaN), null,
    'and neither does one whose clock returned nothing');
  // A negative age is truthful, not an error: the record was stamped in the
  // future, which is exactly what a clock skew between two nodes looks like
  // and exactly what an operator needs to see.
  const future = new Date(nowMs + FUTURE_STAMP_MS).toISOString();
  assert.equal(resolveReadinessObservedAgeMs(future, nowMs), -FUTURE_STAMP_MS,
    'a future-dated stamp states a negative age rather than hiding it');
});
