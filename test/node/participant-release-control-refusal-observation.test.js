// Adversarial value checks supplement the registered native release witnesses.
// They establish bounded diagnostic capture, not release authority or progress.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {captureParticipantControlRefusal as capture,
  captureParticipantReleaseRecoveryDetail as captureRecovery} from
  '../../src/node/participant-release-diagnostic-observation.js';
import {PARTICIPANT_CUTOVER_BOUND as BOUND, PARTICIPANT_CUTOVER_OUTCOME as OUTCOME} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';

const EMPTY = Object.freeze({
  controlMissingFact: null, controlPhase: null, controlReason: null,
});

const GENERATION = Object.freeze({nodeId: 'control-node', replicaId: 'control-r1',
  ownerIncarnation: 1, lifecycleIncarnation: 'live-generation', runtimeGeneration: 2,
  connectionGeneration: 3, admissionGeneration: 4});
const WORK = Object.freeze({sqliteTransactionOpen: false, participantStaging: false,
  participantPrepared: 0, proposals: 1, pendingOutcomes: 0,
  appliedIndex: 5, commitIndex: 5, lastIndex: 6});

test('capture keeps one exact drain of bounded own data through both boundaries', () => {
  const unknown = () => {
    throw new Error('unlisted diagnostic payload must never be read');
  };
  const generation = {...GENERATION, get siblings() {
    return unknown();
  }};
  const work = {...WORK, error: new Error('unlisted error')};
  const blockedDrain = {generation, work, get census() {
    return unknown();
  }};
  const answer = {outcome: OUTCOME.DRAIN_PENDING, blockedDrain};
  const captured = capture(answer);
  const expected = {generation: GENERATION, work: WORK};
  assert.deepEqual(captured, {...EMPTY, controlBlockedDrain: expected});
  assert.deepEqual(captureRecovery(answer), {blockedDrain: expected});

  const controlPartitionId = 'sql_transactions-p1';
  const outer = {outcome: OUTCOME.UNAVAILABLE, controlOutcome: OUTCOME.DRAIN_PENDING,
    controlPartitionId, controlNodeId: GENERATION.nodeId, ...captured};
  const observed = captureRecovery(outer);
  assert.deepEqual(observed, {...EMPTY, controlOutcome: OUTCOME.DRAIN_PENDING,
    controlPartitionId, controlNodeId: GENERATION.nodeId, controlBlockedDrain: expected});
  for (const record of [observed.controlBlockedDrain, observed.controlBlockedDrain.generation,
    observed.controlBlockedDrain.work]) {
    assert.equal(Object.isFrozen(record), true);
  }
  generation.lifecycleIncarnation = 123;
  work.proposals = 20;
  assert.deepEqual(observed.controlBlockedDrain, expected);
  assert.deepEqual(captureRecovery({...answer, outcome: OUTCOME.CUT_OVER}), {});
});

test('drain observation excludes incomplete, hostile, and oversized values', () => {
  let reads = 0;
  const getter = () => {
    reads += 1;
    throw new Error('drain diagnostic accessor or trap must never run');
  };
  const longIdentity = 'g'.repeat(BOUND.CONTROL_REFUSAL_TEXT_MAX_LENGTH + 1);
  const malformed = [null, [], new Proxy({}, {getOwnPropertyDescriptor: getter}),
    Object.create({generation: GENERATION, work: WORK}),
    Object.defineProperty({work: WORK}, 'generation', {get: getter}),
    {generation: {...GENERATION, nodeId: longIdentity}, work: WORK},
    {generation: {...GENERATION, ownerIncarnation: 0}, work: WORK},
    {generation: GENERATION, work: {...WORK, proposals: Infinity}},
    {generation: GENERATION, work: {...WORK, appliedIndex: -1}},
    {generation: GENERATION, work: {...WORK, sqliteTransactionOpen: 'false'}},
    {generation: GENERATION, work: {proposals: 1}},
  ];
  for (const blockedDrain of malformed) {
    const answer = {outcome: OUTCOME.DRAIN_PENDING, blockedDrain};
    assert.deepEqual(capture(answer), EMPTY);
    assert.deepEqual(captureRecovery(answer), {});
  }
  const malformedWrapper = Object.defineProperty({outcome: OUTCOME.UNAVAILABLE,
    controlPartitionId: 'sql_transactions-p1', controlOutcome: OUTCOME.DRAIN_PENDING},
  'controlBlockedDrain', {get: getter});
  assert.equal(Object.hasOwn(captureRecovery(malformedWrapper), 'controlBlockedDrain'), false);
  assert.equal(reads, 0);
});

test('control refusal observation retains only frozen bounded own string prefixes', () => {
  const answer = {missingFact: 'fact', phase: 'phase',
    reason: 'x'.repeat(BOUND.CONTROL_REFUSAL_TEXT_MAX_LENGTH + 1),
    origin: {mustNotRetain: true}, census: ['must not retain']};
  const observed = capture(answer);
  assert.deepEqual(observed, {controlMissingFact: 'fact', controlPhase: 'phase',
    controlReason: 'x'.repeat(BOUND.CONTROL_REFUSAL_TEXT_MAX_LENGTH)});
  assert.equal(Object.isFrozen(observed), true);
  answer.missingFact = 'changed';
  assert.equal(observed.controlMissingFact, 'fact');
  assert.deepEqual(capture(Object.assign(Object.create(null),
    {missingFact: '', phase: 'enable', reason: 'closed'})),
  {controlMissingFact: '', controlPhase: 'enable', controlReason: 'closed'});
});

test('control refusal observation never invokes inherited or own getters', () => {
  let calls = 0;
  const getter = () => {
    calls += 1;
    throw new Error('diagnostic getter must not run');
  };
  const inherited = Object.create(Object.defineProperties({}, {
    missingFact: {get: getter}, phase: {get: getter}, reason: {get: getter},
  }));
  assert.deepEqual(capture(inherited), EMPTY);
  const own = Object.defineProperties({}, {
    missingFact: {get: getter}, phase: {get: getter}, reason: {get: getter},
  });
  assert.deepEqual(capture(own), EMPTY);
  assert.equal(calls, 0);
});

test('control refusal observation rejects proxies without invoking traps', () => {
  let calls = 0;
  const trap = () => {
    calls += 1;
    throw new Error('diagnostic proxy trap must not run');
  };
  const answer = new Proxy({}, {get: trap, getOwnPropertyDescriptor: trap,
    getPrototypeOf: trap, ownKeys: trap});
  assert.deepEqual(capture(answer), EMPTY);
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();
  assert.deepEqual(capture(revocable.proxy), EMPTY);
  assert.equal(calls, 0);
});

test('control refusal observation never coerces nonstring or nonrecord values', () => {
  let calls = 0;
  const value = {[Symbol.toPrimitive]() {
    calls += 1;
    throw new Error('diagnostic coercion must not run');
  }};
  for (const invalid of [null, undefined, false, 1, 1n, Symbol('fact'), value,
    Object('boxed')]) {
    assert.deepEqual(capture({missingFact: invalid, phase: invalid, reason: invalid}), EMPTY);
  }
  for (const invalid of [null, undefined, false, 1, 1n, 'text', Symbol('record'), () => {}]) {
    assert.deepEqual(capture(invalid), EMPTY);
  }
  assert.equal(calls, 0);
});

test('uninitialized exotic descriptors cannot replace an already available refusal', async (t) => {
  // The cyclic module is an adversarial input program, not a repository import
  // cycle. Its refusal outcome initializes before its detail bindings do.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'control-refusal-namespace-'));
  t.after(() => fs.rmSync(directory, {recursive: true}));
  const file = path.join(directory, 'uninitialized.mjs');
  const owner = new URL('../../src/node/participant-release-diagnostic-observation.js',
    import.meta.url).href;
  fs.writeFileSync(file, `
import * as pending from './uninitialized.mjs';
import {captureParticipantControlRefusal} from ${JSON.stringify(owner)};
export const outcome = 'unavailable';
export const beforeInitialization = captureParticipantControlRefusal(pending);
export const missingFact = 'initialized later';
export const phase = 'initialized later';
export const reason = 'initialized later';
`);
  const {beforeInitialization, outcome} = await import(pathToFileURL(file).href);
  assert.equal(outcome, 'unavailable');
  assert.deepEqual(beforeInitialization, EMPTY);
});
