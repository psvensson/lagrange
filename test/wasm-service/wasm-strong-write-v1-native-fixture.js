// Separately identified v1 input companion. The historical RF3 transport,
// clocks and observation fixture are imported unchanged. INIT and ENROLL are
// actual lifecycle-admin requests and native application, never seeded rows.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {WasmServiceLifecycle} from '../../src/wasm-service/wasm-service-lifecycle.js';
import {encodeProposal} from '../../src/raft/raft-rs-proposal-codec.js';
import {deliverScheduled, evidence, fixture as historicalFixture, startWrite} from
  './wasm-strong-write-native-fixture.js';

const TYPE = 'WASM_WRITER_V1';
const PROFILE = 'wasm-writer-v1/1';
const INCARNATION = '11'.repeat(32);
const INIT_NONCE = '22'.repeat(32);
const ENROLL_NONCE = '33'.repeat(32);
const SLOT = 0;
const GENERATION = 1;
const SEQUENCE = 1;

function commandBytes(command) {
  return Buffer.from(encodeProposal(command));
}

function commandDigest(command) {
  return createHash('sha256').update(commandBytes(command)).digest('hex');
}

function entriesFor(command, view) {
  const data = commandBytes(command).toString('base64');
  return view.durable.entries.filter((entry) => entry.data === data);
}

function writeCommand(request) {
  // Independent exact contract matcher: field order is DESIGN.md v1, not
  // an expected transcript obtained from the candidate's writer codec.
  return {type: TYPE, profile: PROFILE, action: 'WRITE', identity: request.requestId,
    ack: request.ack, sessionId: request.sessionId, key: request.key,
    value: Buffer.from(request.value).toString('base64'), valueEncoding: 'base64'};
}

function proposalEntries(f, view) {
  return entriesFor(writeCommand(f.request), view);
}

function assertPositionApplied(command, receipt, views) {
  assert.ok(Number.isSafeInteger(receipt.index) && receipt.index > 0);
  assert.ok(Number.isSafeInteger(receipt.term) && receipt.term >= 0);
  assert.equal(receipt.commandDigest, commandDigest(command));
  for (const view of views) {
    const entries = entriesFor(command, view);
    assert.equal(entries.length, 1, 'canonical command has one actual log position');
    assert.equal(BigInt(receipt.index), BigInt(entries[0].index));
    assert.equal(BigInt(receipt.term), BigInt(entries[0].term));
    assert.ok(BigInt(view.durable.hardState.commit) >= BigInt(receipt.index));
    assert.ok(BigInt(view.durable.appliedIndex) >= BigInt(receipt.index));
  }
}

async function administer(t, f, lifecycle, command, token) {
  let response = {state: 'pending'};
  const pending = lifecycle.administerWriter(f.groupId, command);
  Promise.resolve(pending).then((value) => {
    response = {state: 'fulfilled', value};
  }, (error) => {
    response = {state: 'rejected', message: error.message};
  });
  // Setup actuation only: the same fixed native delivery schedule used by
  // the historical fixture, while the original admin caller awaits apply.
  await deliverScheduled(f);
  const observed = evidence(t, f, `v1-${command.action.toLowerCase()}-applied`);
  t.diagnostic(JSON.stringify({v1Admin: {hostedServiceId: f.groupId,
    command, response}}));
  assert.equal(response.state, 'fulfilled', 'actual admin caller settled in setup');
  const {value} = response;
  assert.equal(value.status, 'RECORDED');
  assert.equal(value.accepted, true);
  assert.deepEqual(value.receipt.outcome, {accepted: true, token});
  assert.deepEqual(Object.keys(value.receipt).sort(),
    ['commandDigest', 'index', 'outcome', 'term', 'version']);
  assert.equal(value.receipt.version, 1);
  assertPositionApplied(command, value.receipt, observed.views);
  return observed.views;
}

async function fixture(t, label) {
  const f = await historicalFixture(t, `v1-${label}`);
  f.phase = 'v1-admin-setup';
  const lifecycle = new WasmServiceLifecycle({messageRouter: f.transport,
    nodeId: f.leader.nodeId});
  // This fixture composes the existing hosted-replica registry with the
  // already initialized REAL replica. It does not claim guest/module/port
  // deployment coverage. Replica resource ownership stays with the historical
  // fixture; this local lifecycle registry owns only admin ingress selection.
  lifecycle.activeReplicas.set(f.groupId, f.leader);
  t.after(() => lifecycle.activeReplicas.delete(f.groupId));
  assert.equal(typeof lifecycle.administerWriter, 'function',
    'v1 setup surface must exist; a missing method is not a semantic RED');
  const serviceId = f.groupId;
  const incarnation = INCARNATION;
  await administer(t, f, lifecycle,
    {type: TYPE, profile: PROFILE, action: 'INIT', serviceId, incarnation,
      nonce: INIT_NONCE}, {serviceId, incarnation});
  const before = await administer(t, f, lifecycle,
    {type: TYPE, profile: PROFILE, action: 'ENROLL', serviceId, incarnation,
      slot: SLOT, expectedGeneration: 0, expectedCompletedSequence: 0,
      expectedReceiptDigest: null, newGeneration: GENERATION, nonce: ENROLL_NONCE},
    {serviceId, incarnation, slot: SLOT, generation: GENERATION});
  f.request = {...f.request,
    requestId: {serviceId, incarnation, slot: SLOT, generation: GENERATION,
      sequence: SEQUENCE}, ack: null};
  f.before = before;
  f.events.length = 0;
  f.phase = 'measured';
  return f;
}

function assertRecordedWrite(f, result) {
  assert.equal(result.response.state, 'fulfilled');
  const response = result.response.value;
  assert.deepEqual(Object.keys(response).sort(), ['accepted', 'async', 'receipt', 'status']);
  assert.equal(response.status, 'RECORDED');
  assert.equal(response.accepted, true);
  assert.equal(response.async, false);
  const {receipt} = response;
  assert.deepEqual(Object.keys(receipt).sort(),
    ['commandDigest', 'identity', 'index', 'outcome', 'term', 'version']);
  assert.equal(receipt.version, 1);
  assert.deepEqual(receipt.identity, f.request.requestId);
  assert.deepEqual(receipt.outcome, {accepted: true, error: null});
  assertPositionApplied(writeCommand(f.request), receipt, result.views);
}

export {assertRecordedWrite, deliverScheduled, evidence, fixture,
  proposalEntries, startWrite};
