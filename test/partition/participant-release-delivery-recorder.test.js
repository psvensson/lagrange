import assert from 'node:assert/strict';
import test from 'node:test';
import {observeParticipantReleaseDelivery} from './participant-release-delivery-recorder.js';

test('nested release recorders preserve receiver, every argument and original Promise', async () => {
  const receiver = {name: 'actual delivery receiver'};
  const payload = {type: 'observed'};
  const options = {deadline: 123, priority: 'critical'};
  const extra = Symbol('opaque fourth argument');
  const args = ['partition/address', payload, options, extra];
  const answer = {success: true};
  const {promise: pending, resolve} = Promise.withResolvers();
  const calls = [];
  const observations = [];
  const errors = [];
  function deliver(...received) {
    calls.push({receiver: this, args: received});
    return pending;
  }
  const observe = (received, value) => observations.push({args: received, value});
  const inner = observeParticipantReleaseDelivery(deliver, observe, errors);
  const outer = observeParticipantReleaseDelivery(inner, observe, errors);
  const returned = Reflect.apply(outer, receiver, args);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].receiver, receiver);
  assert.equal(calls[0].args.length, args.length);
  args.forEach((value, index) => assert.equal(calls[0].args[index], value));
  assert.equal(returned, pending);
  await Promise.resolve();
  assert.deepEqual(observations, []);
  resolve(answer);
  assert.equal(await returned, answer);
  assert.equal(observations.length, 2);
  for (const received of [calls[0].args, ...observations.map((item) => item.args)]) {
    assert.equal(received.length, args.length);
    args.forEach((value, index) => assert.equal(received[index], value));
  }
  observations.forEach((item) => assert.equal(item.value, answer));
  assert.deepEqual(errors, []);
});

test('release recorder preserves a transport acknowledgment without semantic success', async () => {
  const answer = {ack: true, noHandler: true, success: false};
  const pending = Promise.resolve(answer);
  const observations = [];
  const errors = [];
  const deliver = observeParticipantReleaseDelivery(() => pending,
    (_args, value) => observations.push(value), errors);
  const returned = deliver('address', {type: 'observed'});
  assert.equal(returned, pending);
  assert.equal(await returned, answer);
  assert.deepEqual(observations, [answer]);
  assert.equal(observations[0], answer);
  assert.deepEqual(errors, []);
});

test('release recorder preserves rejection and synchronous throw without recording success', async () => {
  const failure = new Error('original delivery failure');
  const rejected = Promise.reject(failure);
  const observations = [];
  const errors = [];
  let calls = 0;
  const record = (...args) => observations.push(args);
  const rejecting = observeParticipantReleaseDelivery(() => {
    calls += 1;
    return rejected;
  }, record, errors);
  const returned = rejecting('address', {type: 'observed'}, {deadline: 123});
  assert.equal(returned, rejected);
  await assert.rejects(returned, (error) => error === failure);
  const throwing = observeParticipantReleaseDelivery(() => {
    calls += 1;
    throw failure;
  }, record, errors);
  assert.throws(() => throwing('address', {}), (error) => error === failure);
  assert.equal(calls, 2);
  assert.deepEqual(observations, []);
  assert.deepEqual(errors, []);
});

test('release recorder reports clone failure separately and preserves later delivery', async () => {
  const answer = {success: true};
  const pending = Promise.resolve(answer);
  const errors = [];
  const records = [];
  let calls = 0;
  const deliver = observeParticipantReleaseDelivery(() => {
    calls += 1;
    return pending;
  }, ([address, payload], value) => {
    records.push(structuredClone({address, payload, answer: value}));
  }, errors);
  const returned = deliver('address', {notCloneable: () => undefined});
  assert.equal(returned, pending);
  assert.equal(await returned, answer);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].name, 'DataCloneError');
  assert.deepEqual(records, []);
  assert.equal(await deliver('address', {cloneable: true}), answer);
  assert.equal(calls, 2);
  assert.equal(errors.length, 1);
  assert.deepEqual(records, [{address: 'address', payload: {cloneable: true}, answer}]);
});
