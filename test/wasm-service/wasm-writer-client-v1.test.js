// Component proof. Storage below is an injected atomic-CAS fake, not disk durability.
// Delivery replies are controlled boundary inputs, not claimed native committed outcomes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WasmWriterClient} from '../../src/wasm-service/wasm-writer-client.js';
import {writerCommandFromDelivery, writerDigest} from '../../src/wasm-service/wasm-writer-codec.js';
import {WRITER_REASON as R} from '../../src/wasm-service/wasm-writer-profile.js';

const TOKEN = {serviceId: 'client-component', incarnation: 'a'.repeat(64), slot: 0, generation: 1};
const PAYLOAD = {sessionId: 'session', key: 'key', value: 'A'};

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return {promise, resolve};
}

function atomicStorageFake() {
  let record = {revision: 0, state: {token: {...TOKEN}, lastReceipt: null, pending: null}};
  const calls = [];
  return {
    calls,
    load: async () => structuredClone(record),
    snapshot: () => structuredClone(record),
    compareAndSwap: async (expected, state) => {
      calls.push({expected, state: structuredClone(state)});
      if (record.revision !== expected) return {swapped: false};
      record = {revision: expected + 1, state: structuredClone(state)};
      return {swapped: true, revision: record.revision};
    },
  };
}

function terminal(delivery, accepted = true) {
  const command = writerCommandFromDelivery(delivery);
  return {status: 'RECORDED', accepted, async: false,
    receipt: {version: 1, identity: command.identity, commandDigest: writerDigest(command),
      outcome: {accepted, error: accepted ? null : 'deterministic refusal'}, index: 7, term: 2}};
}

test('WasmWriterClient synchronously claims busy before awaiting caller storage', async () => {
  const storage = atomicStorageFake();
  const loadStarted = deferred();
  const release = deferred();
  const originalLoad = storage.load;
  storage.load = async () => {
    loadStarted.resolve();
    await release.promise;
    return originalLoad();
  };
  const sent = [];
  const client = new WasmWriterClient({storage, deliver: async (value) => {
    sent.push(value);
    return terminal(value);
  }});
  const first = client.write(PAYLOAD);
  const second = client.write({...PAYLOAD, value: 'B'});
  assert.equal((await second).reason, R.BUSY);
  await loadStarted.promise;
  assert.equal(storage.calls.length, 0);
  assert.equal(sent.length, 0);
  release.resolve();
  assert.equal((await first).status, 'RECORDED');
  assert.equal(sent.length, 1);
  assert.equal(storage.snapshot().state.lastReceipt.identity.sequence, 1);
});

test('WasmWriterClient concurrent helpers share one CAS winner before any delivery', async () => {
  const storage = atomicStorageFake();
  const originalLoad = storage.load;
  const bothLoaded = deferred();
  let loaded = 0;
  storage.load = async () => {
    const snapshot = await originalLoad();
    if (++loaded === 2) bothLoaded.resolve();
    await bothLoaded.promise;
    return snapshot;
  };
  const deliveries = [];
  const deliver = async (value) => {
    deliveries.push(value);
    return {status: 'UNKNOWN', reason: 'lost reply', identity: value.requestId};
  };
  const a = new WasmWriterClient({storage, deliver});
  const b = new WasmWriterClient({storage, deliver});
  const results = await Promise.all([a.write(PAYLOAD), b.write({...PAYLOAD, value: 'B'})]);
  assert.equal(deliveries.length, 1);
  assert.equal(results.filter((r) => r.reason === R.STORAGE).length, 1);
  assert.deepEqual(storage.snapshot().state.pending, writerCommandFromDelivery(deliveries[0]));
  assert.equal(storage.snapshot().revision, 1);
});

test('WasmWriterClient failed or ambiguous pre-delivery CAS never sends; restart reconciles stored pending', async () => {
  for (const persists of [false, true]) {
    const storage = atomicStorageFake();
    const originalCas = storage.compareAndSwap;
    storage.compareAndSwap = async (...args) => {
      if (persists) await originalCas(...args);
      throw new Error('storage acknowledgment lost');
    };
    let sends = 0;
    const deliver = async (value) => {
      sends += 1; return terminal(value);
    };
    const first = await new WasmWriterClient({storage, deliver}).write(PAYLOAD);
    assert.equal(first.status, 'UNKNOWN');
    assert.equal(sends, 0);
    assert.equal(storage.snapshot().state.lastReceipt, null);
    assert.equal(storage.snapshot().state.pending !== null, persists);
    storage.compareAndSwap = originalCas;
    const retry = await new WasmWriterClient({storage, deliver}).retry();
    assert.equal(retry.status, persists ? 'RECORDED' : 'REFUSED');
    assert.equal(sends, persists ? 1 : 0);
  }
});

test('WasmWriterClient lost reply preserves exact command through a new helper and only then advances', async () => {
  const storage = atomicStorageFake();
  const deliveries = [];
  const first = new WasmWriterClient({storage, deliver: async (value) => {
    deliveries.push(writerCommandFromDelivery(value));
    throw new Error('transport reply lost');
  }});
  assert.equal((await first.write(PAYLOAD)).status, 'UNKNOWN');
  const pending = storage.snapshot().state.pending;
  const next = new WasmWriterClient({storage, deliver: async (value) => {
    deliveries.push(writerCommandFromDelivery(value));
    return terminal(value);
  }});
  assert.equal((await next.write({...PAYLOAD, value: 'other'})).reason, R.BUSY);
  const result = await next.retry();
  assert.equal(result.status, 'RECORDED');
  assert.deepEqual(deliveries, [pending, pending]);
  assert.equal(storage.snapshot().state.pending, null);
  const second = await next.write({...PAYLOAD, value: 'B'});
  assert.equal(second.receipt.identity.sequence, 2);
  assert.equal(deliveries[2].ack, writerDigest(result.receipt));
});

test('WasmWriterClient terminal CAS failure retains pending identity; ambiguous success is read on restart', async () => {
  for (const persists of [false, true]) {
    const storage = atomicStorageFake();
    const originalCas = storage.compareAndSwap;
    storage.compareAndSwap = async (revision, state) => {
      if (revision === 0) return originalCas(revision, state);
      if (persists) await originalCas(revision, state);
      throw new Error('terminal storage uncertain');
    };
    const sent = [];
    const deliver = async (value) => {
      sent.push(writerCommandFromDelivery(value)); return terminal(value);
    };
    const first = await new WasmWriterClient({storage, deliver}).write(PAYLOAD);
    assert.equal(first.status, 'UNKNOWN');
    assert.equal(storage.snapshot().state.pending !== null, !persists);
    storage.compareAndSwap = originalCas;
    const next = new WasmWriterClient({storage, deliver});
    if (persists) {
      assert.equal((await next.retry()).reason, R.SEQUENCE);
      assert.equal(sent.length, 1);
      assert.equal((await next.write(PAYLOAD)).receipt.identity.sequence, 2);
    } else {
      assert.equal((await next.retry()).status, 'RECORDED');
      assert.deepEqual(sent[1], sent[0]);
    }
  }
});

test('WasmWriterClient validates exact receipt identity, digest, position and actual disposition', async () => {
  const mutations = [
    (r) => {
      r.receipt.identity.sequence += 1;
    },
    (r) => {
      r.receipt.commandDigest = 'f'.repeat(64);
    },
    (r) => {
      r.receipt.index = Number.MAX_SAFE_INTEGER + 1;
    },
    (r) => {
      r.accepted = false;
    },
    (r) => {
      delete r.receipt;
    },
  ];
  for (const mutate of mutations) {
    const storage = atomicStorageFake();
    const client = new WasmWriterClient({storage, deliver: async (value) => {
      const result = terminal(value);
      mutate(result);
      return result;
    }});
    assert.equal((await client.write(PAYLOAD)).status, 'UNKNOWN');
    assert.notEqual(storage.snapshot().state.pending, null);
    assert.equal(storage.snapshot().state.lastReceipt, null);
    assert.equal(storage.snapshot().revision, 1);
  }
});

test('WasmWriterClient protocol refusals and redirects do not manufacture a terminal acknowledgment', async () => {
  for (const response of [{status: 'REFUSED', reason: 'WRITER_FENCED'},
    {status: 'REDIRECT', leader: 'other'}, {status: 'UNKNOWN', reason: 'deadline'}]) {
    const storage = atomicStorageFake();
    const client = new WasmWriterClient({storage, deliver: async () => response});
    assert.deepEqual(await client.write(PAYLOAD), response);
    assert.equal(storage.snapshot().revision, 1);
    assert.equal(storage.snapshot().state.lastReceipt, null);
    assert.equal(storage.snapshot().state.pending.identity.sequence, 1);
  }
});

test('WasmWriterClient admitted refusal is retained and acknowledged by the next request', async () => {
  const storage = atomicStorageFake();
  const sent = [];
  const client = new WasmWriterClient({storage, deliver: async (value) => {
    sent.push(writerCommandFromDelivery(value));
    return terminal(value, false);
  }});
  const first = await client.write(PAYLOAD);
  assert.equal(first.accepted, false);
  assert.equal(storage.snapshot().state.pending, null);
  const second = await client.write({...PAYLOAD, value: 'B'});
  assert.equal(second.receipt.identity.sequence, 2);
  assert.equal(sent[1].ack, writerDigest(first.receipt));
});

test('WasmWriterClient async delivery mutation cannot retag persisted retry identity or contents', async () => {
  const storage = atomicStorageFake();
  const entered = deferred();
  const release = deferred();
  const client = new WasmWriterClient({storage, deliver: async (value) => {
    value.requestId.generation = 99;
    value.value.fill(0);
    entered.resolve();
    await release.promise;
    return {status: 'UNKNOWN', reason: 'lost response'};
  }});
  const active = client.write(PAYLOAD);
  await entered.promise;
  const pending = storage.snapshot().state.pending;
  assert.equal(pending.identity.generation, 1);
  assert.equal(Buffer.from(pending.value, 'base64').toString(), 'A');
  assert.equal((await client.retry()).reason, R.BUSY);
  release.resolve();
  await active;
  let retried;
  const reopened = new WasmWriterClient({storage, deliver: async (value) => {
    retried = writerCommandFromDelivery(value);
    return terminal(value);
  }});
  assert.equal((await reopened.retry()).status, 'RECORDED');
  assert.deepEqual(retried, pending);
});
