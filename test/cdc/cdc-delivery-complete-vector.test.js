// Pure response/coverage contract inputs. Builder-produced replies here cannot
// establish native commit or authorize a real source ACK.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {CDC_COMPLETION, CDC_COVERAGE_STATE, buildCommittedCdcOutcome, buildProvisionalCdcOutcome,
  cdcCommitWaitIdentity, cdcCoverageState, completeCdcPropagation,
  isCommittedCdcOutcome, isProvisionalCdcOutcome, observeCdcCoverage} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {captureCdcEvents} from '../../src/cdc/cdc-event-envelope.js';

const SOURCE_GROUP = 'complete-vector-source';
const TARGET_GROUP = 'complete-vector-target';
const POSITION = Object.freeze({index: 31, term: 4});

function fixture() {
  const timestamp = new HLCTimestamp(1000, 0, 'complete-vector-producer').toString();
  const durable = {tableName: TABLES.CONFIG, operation: CDC_OPERATION.INSERT,
    data: {config_key: 'durable', config_value: 'unchanged'}, timestamp,
    sourcePartition: 'config-source', eventKey: 'durable-write-1',
    entryId: 'durable-write-1', sourceLogIndex: 17, sourceOrdinal: 0};
  const ordinary = {tableName: TABLES.CONFIG, operation: CDC_OPERATION.UPDATE,
    data: {config_key: 'ordinary', config_value: 'A'}, timestamp};
  return {durable, ordinary, events: [durable, ordinary]};
}

function alternatives({durable, ordinary}) {
  const changed = {...ordinary, data: {...ordinary.data, config_value: 'B'}};
  return [
    ['changed ordinary body', [durable, changed]],
    ['omitted ordinary member', [durable]],
    ['appended ordinary member', [durable, ordinary, changed]],
    ['duplicated identical ordinary member', [durable, ordinary, ordinary]],
    ['reordered whole vector', [ordinary, durable]],
    ['changed ordinary operation', [durable, {...ordinary, operation: CDC_OPERATION.DELETE}]],
    ['changed ordinary timestamp', [durable, {...ordinary,
      timestamp: new HLCTimestamp(1001, 0, 'complete-vector-producer').toString()}]],
  ];
}

const builders = [
  ['native', (events, group) => buildCommittedCdcOutcome(events, group, POSITION),
    isCommittedCdcOutcome],
  ['provisional', (events, group) => buildProvisionalCdcOutcome(events, 20, group),
    isProvisionalCdcOutcome],
];

for (const [kind, build, validate] of builders) {
  test(`${kind} reply binds every ordinary member alongside the unchanged durable occurrence`, () => {
    const f = fixture();
    const answer = build(f.events, SOURCE_GROUP);
    assert.equal(validate(answer, f.events, SOURCE_GROUP), true);
    assert.equal(answer.cdcVectorDigest, cdcCommitWaitIdentity(f.events));
    assert.match(answer.cdcVectorDigest, /^sha256:[a-f0-9]{64}$/u);
    for (const [name, changed] of alternatives(f)) {
      assert.equal(validate(answer, changed, SOURCE_GROUP), false, name);
      assert.equal(validate(build(changed, SOURCE_GROUP), f.events, SOURCE_GROUP), false,
        `a remote result for ${name} cannot answer the original vector`);
      assert.equal(validate(build(changed, SOURCE_GROUP), changed, SOURCE_GROUP), true,
        `${name} has valid self-correspondence rather than malformed input`);
    }
    const {cdcVectorDigest: _omitted, ...missing} = answer;
    assert.equal(validate(missing, f.events, SOURCE_GROUP), false);
    for (const digest of [null, '', answer.cdcVectorDigest.slice(7),
      answer.cdcVectorDigest.toUpperCase(), 'sha256:' + '0'.repeat(64)]) {
      assert.equal(validate({...answer, cdcVectorDigest: digest}, f.events, SOURCE_GROUP), false);
    }
    let getterCalls = 0;
    const accessor = {...answer};
    Object.defineProperty(accessor, 'cdcVectorDigest', {get() {
      getterCalls += 1;
      return answer.cdcVectorDigest;
    }, enumerable: true});
    assert.equal(validate(accessor, f.events, SOURCE_GROUP), false);
    assert.equal(getterCalls, 0, 'an unreadable result cannot run user code during validation');
    assert.equal(validate(Object.assign(Object.create({cdcVectorDigest: answer.cdcVectorDigest}),
      missing), f.events, SOURCE_GROUP), false);
  });
}

for (const [sourceKind, sourceBuilder] of builders) {
  for (const [targetKind, targetBuilder] of builders) {
    test(`aggregation retains original vector binding for ${sourceKind}/${targetKind} coverage`,
      () => {
        const f = fixture();
        const source = observeCdcCoverage(sourceBuilder(f.events, SOURCE_GROUP),
          f.events, SOURCE_GROUP);
        const target = observeCdcCoverage(targetBuilder(f.events, TARGET_GROUP),
          f.events, TARGET_GROUP);
        const exact = completeCdcPropagation(f.events, source, [target], SOURCE_GROUP, 20);
        const expectedNative = sourceKind === 'native' && targetKind === 'native';
        assert.equal(isCommittedCdcOutcome(exact, f.events, SOURCE_GROUP), expectedNative);
        assert.equal(isProvisionalCdcOutcome(exact, f.events, SOURCE_GROUP), !expectedNative);
        assert.equal(source.cdcVectorDigest, exact.cdcVectorDigest);
        assert.equal(target.cdcVectorDigest, exact.cdcVectorDigest);
        for (const [name, changed] of alternatives(f)) {
          const rebound = completeCdcPropagation(changed, source, [target], SOURCE_GROUP, 20);
          assert.equal(isCommittedCdcOutcome(rebound, changed, SOURCE_GROUP), false, name);
          assert.equal(isProvisionalCdcOutcome(rebound, changed, SOURCE_GROUP), false, name);
          assert.equal(cdcCoverageState([source, target], cdcCommitWaitIdentity(changed)),
            CDC_COVERAGE_STATE.UNCOVERED, name);
        }
        const {cdcVectorDigest: _omitted, ...unbound} = target;
        assert.equal(cdcCoverageState([source, unbound]), CDC_COVERAGE_STATE.UNCOVERED);
      });
  }
}

function assertUncovered(events, source, targets, name) {
  const result = completeCdcPropagation(events, source, targets, SOURCE_GROUP, 20);
  assert.deepEqual(result,
    {success: false, error: CDC_COMPLETION.UNKNOWN, deferRetry: true}, name);
  assert.equal(cdcCoverageState([source, ...targets], cdcCommitWaitIdentity(events)),
    CDC_COVERAGE_STATE.UNCOVERED, name);
}

for (const [sourceKind, sourceBuilder] of builders) {
  for (const [targetKind, targetBuilder] of builders) {
    test(`coverage binds source and target independently for ${sourceKind}/${targetKind}`, () => {
      const f = fixture();
      const source = observeCdcCoverage(sourceBuilder(f.events, SOURCE_GROUP),
        f.events, SOURCE_GROUP);
      const target = observeCdcCoverage(targetBuilder(f.events, TARGET_GROUP),
        f.events, TARGET_GROUP);
      const expected = sourceKind === 'native' && targetKind === 'native' ?
        CDC_COVERAGE_STATE.COMMITTED : CDC_COVERAGE_STATE.PROVISIONAL;
      assert.equal(cdcCoverageState([source, target]), expected,
        'omitting the binding requires all independently validated observations to agree');
      assert.equal(cdcCoverageState([source, target], cdcCommitWaitIdentity(f.events)), expected);
      for (const missing of [undefined, null, '', false]) {
        assert.equal(cdcCoverageState([source, target], missing), CDC_COVERAGE_STATE.UNCOVERED,
          'an explicit invalid binding never borrows the first observation binding');
      }
      for (const [name, changed] of alternatives(f)) {
        const wrongSource = observeCdcCoverage(sourceBuilder(changed, SOURCE_GROUP),
          changed, SOURCE_GROUP);
        const wrongTarget = observeCdcCoverage(targetBuilder(changed, TARGET_GROUP),
          changed, TARGET_GROUP);
        assertUncovered(f.events, source, [wrongTarget], `${name}: only target differs`);
        assertUncovered(f.events, wrongSource, [target], `${name}: only source differs`);
        assert.equal(cdcCoverageState([source, wrongTarget]), CDC_COVERAGE_STATE.UNCOVERED,
          `${name}: implicit binding still checks the target`);
        assert.equal(cdcCoverageState([wrongSource, target]), CDC_COVERAGE_STATE.UNCOVERED,
          `${name}: implicit binding still checks every observation`);
      }
    });
  }
}

for (const [kind, build, validate] of builders) {
  test(`zero-target propagation preserves the complete ${kind} source vector`, () => {
    const f = fixture();
    const source = observeCdcCoverage(build(f.events, SOURCE_GROUP), f.events, SOURCE_GROUP);
    const complete = completeCdcPropagation(f.events, source, [], SOURCE_GROUP, 20);
    assert.equal(validate(complete, f.events, SOURCE_GROUP), true);
    for (const [name, changed] of alternatives(f)) {
      assertUncovered(changed, source, [], `${name}: no target does not erase source binding`);
      const changedSource = observeCdcCoverage(build(changed, SOURCE_GROUP), changed, SOURCE_GROUP);
      assertUncovered(f.events, changedSource, [], `${name}: source cannot answer another vector`);
      assert.equal(validate(completeCdcPropagation(changed, changedSource, [], SOURCE_GROUP, 20),
        changed, SOURCE_GROUP), true, `${name}: complete source-only self-correspondence`);
    }
  });
}

test('mixed request capture preserves durable stamps and ordinary unassigned-stamp compatibility',
  () => {
    const f = fixture();
    const {timestamp: _unassigned, ...ordinary} = f.ordinary;
    const missing = captureCdcEvents([f.durable, ordinary]);
    assert.equal(missing[0].timestamp, f.durable.timestamp);
    assert.equal(Object.hasOwn(missing[1], 'timestamp'), false);
    for (const stamp of ['', null, 123, false]) {
      const captured = captureCdcEvents([f.durable, {...ordinary, timestamp: stamp}]);
      assert.equal(cdcCommitWaitIdentity(captured), cdcCommitWaitIdentity(missing));
      assert.equal(captured[0].timestamp, f.durable.timestamp);
      assert.equal(Object.hasOwn(captured[1], 'timestamp'), false);
      assert.throws(() => captureCdcEvents([{...f.durable, timestamp: stamp}, ordinary]));
    }
    const supplied = captureCdcEvents(f.events);
    assert.equal(supplied[1].timestamp, f.ordinary.timestamp);
    assert.notEqual(cdcCommitWaitIdentity(supplied), cdcCommitWaitIdentity(missing));
  });
