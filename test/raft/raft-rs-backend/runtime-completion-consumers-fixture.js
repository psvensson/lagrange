// Test-only composition over actual transport/application owners. A held
// delivery returns its original recipient's answer after release; it never
// fabricates a successful transport or consensus response.
import {createHash} from 'node:crypto';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {PARTITION_SERVICE_SHARED} from
  '../../../src/partition/partition-service-shared.js';

const {WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS} = PARTITION_SERVICE_SHARED;

function traceConsumer(t, phase, value) {
  t.diagnostic(JSON.stringify({consumer: phase, value}, (_, item) =>
    typeof item === 'bigint' ? item.toString() : item));
}

function trackAnswer(promise) {
  const record = {settled: false, answer: null, error: null};
  record.promise = Promise.resolve(promise).then((answer) => {
    record.settled = true;
    record.answer = answer;
    return answer;
  }, (error) => {
    record.settled = true;
    record.error = error;
    throw error;
  });
  record.promise.catch(() => undefined);
  return record;
}

function holdNativeDeliveries(transport, predicate) {
  const original = transport.deliver;
  const records = [];
  let holding = true;
  transport.deliver = function(...args) {
    const [address, packet] = args;
    if (!holding || !predicate(address, packet)) {
      return Reflect.apply(original, this, args);
    }
    const deferred = Promise.withResolvers();
    const record = {address, packet: structuredClone(packet),
      hash: createHash('sha256').update(JSON.stringify(packet)).digest('hex'),
      release: deferred.resolve, fail: deferred.reject};
    const delivery = deferred.promise.then(() =>
      Reflect.apply(original, this, args));
    record.delivery = trackAnswer(delivery);
    records.push(record);
    return delivery;
  };
  return {
    records,
    release() {
      holding = false;
      records.forEach((record) => record.release());
    },
    async restore() {
      holding = false;
      transport.deliver = original;
      records.forEach((record) => record.release());
      await Promise.allSettled(records.map((record) => record.delivery.promise));
    },
    evidence: () => records.map(({address, packet, hash, delivery}) =>
      ({address, packet, hash, settled: delivery.settled,
        answer: delivery.answer, error: delivery.error?.message ?? null})),
  };
}

function observeConsumerDeliveries(transport, predicate) {
  const original = transport.deliver;
  const records = [];
  transport.deliver = function(...args) {
    const [address, packet] = args;
    if (!predicate(address, packet)) return Reflect.apply(original, this, args);
    const record = {address, packet: structuredClone(packet)};
    records.push(record);
    record.delivery = trackAnswer(Reflect.apply(original, this, args));
    return record.delivery.promise;
  };
  const restore = () => {
    transport.deliver = original;
  };
  return {records, restore,
    evidence: () => records.map(({address, packet, delivery}) =>
      ({address, packet, settled: delivery.settled,
        answer: delivery.answer, error: delivery.error?.message ?? null}))};
}

function durableConsumerView(service) {
  const store = Object.create(RaftRsDurableStore.prototype);
  store.db = service.db;
  const record = store.readDurableRecord(service.partitionId);
  return {replicaId: service.replicaId, appliedIndex: record.appliedIndex,
    commitIndex: record.hardState.commit, term: record.hardState.term,
    entries: record.entries};
}

// Existing metrics callback after handOffToConsensus settled. This observer
// preserves the original call and result; it does not answer the proposal or
// enter consensus. It distinguishes waiting for application from waiting for
// the proposal's transport sends in these controls.
function observeProposalDispatch(service, phaseTimings) {
  const original = service.recordWritePhaseDuration;
  const completed = [];
  service.recordWritePhaseDuration = function(...args) {
    const answer = Reflect.apply(original, this, args);
    if (args[0] === phaseTimings &&
        args[1] === WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS) {
      completed.push({phase: args[1], recorded: args[0]?.[args[1]] ?? null});
    }
    return answer;
  };
  return {completed, restore: () => {
    service.recordWritePhaseDuration = original;
  }};
}

export {traceConsumer, trackAnswer, holdNativeDeliveries,
  durableConsumerView, observeProposalDispatch, observeConsumerDeliveries};
