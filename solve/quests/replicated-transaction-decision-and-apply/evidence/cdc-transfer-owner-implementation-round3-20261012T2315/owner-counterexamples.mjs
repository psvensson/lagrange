import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {writeFileSync} from 'node:fs';
import {
  reserveCdcCoverageListenerBase as reserve,
  enterCdcCoverageListenerTerminalCheck as enter,
  transferCdcCoverageListenerToTerminal as transfer,
  retireCdcCoverageTransferOwner as retire,
  registerCdcCoverageTransferWake as wake,
  readCdcCoverageTransferDiagnostics as read,
} from '/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011/src/cdc/cdc-coverage-transfer-owner.js';

const B = 16 * 1024 * 1024;
const R = 16 * 1024;
const results = [];
function descriptor(id) {
  return {listenerGenerationId: id, immediateCount: 2, immediateBytes: 4096,
    completionCount: 2, completionBytes: 8192, aliasSetCount: 1,
    aliasBytes: 4096, destroyIdCount: 2};
}
function fixture(id, extra = {}) {
  const service = {nodeId: `independent-${id}`, ...extra};
  const record = {state: 'active', transport: {socket: true}};
  const claim = reserve(service, {bootIncarnation: 1,
    listenerGenerationId: id, shutdownRecord: record});
  assert.ok(claim);
  assert.equal(enter(service, claim), true);
  return {service, record, claim, id};
}
function finish(f, override = {}) {
  return transfer(f.service, f.claim, {shutdownRecord: f.record,
    descriptor: descriptor(f.id), terminalize(result) {
      f.record.state = result.state;
      f.record.transport = null;
      f.record.result = result;
      return result;
    }, ...override});
}
function add(name, contractHolds, evidence) {
  results.push({name, contractHolds, evidence});
}

// A supported exact-capacity transfer and synchronous successor use real owner APIs.
{
  const f = fixture('valid', {cdcCoverageTransferCapacityBytes: B});
  const afterReserve = read(f.service);
  const wrong = finish(f, {shutdownRecord: {}});
  const fail = finish(f, {terminalize() {throw new Error('first attempt');}});
  assert.equal(read(f.service).retainedBytes, B);
  let successor = null;
  let observed = null;
  const remove = wake(f.service, () => {
    observed = {state: f.record.state, transport: f.record.transport,
      bytes: read(f.service).retainedBytes};
    successor = reserve(f.service, {bootIncarnation: 1,
      listenerGenerationId: 'valid-next', shutdownRecord: {}});
  });
  const completed = finish(f);
  remove();
  const duplicate = finish(f);
  const after = read(f.service);
  assert.equal(completed, true);
  assert.ok(successor);
  assert.equal(after.retainedBytes, B);
  add('valid-exact-capacity-and-synchronous-successor', wrong === false &&
    fail === false && duplicate === false && observed.bytes === R &&
    observed.transport === null, {afterReserve, observed, completed, duplicate,
      successorAllocated: !!successor, after});
}
{
  const service = {nodeId: 'independent-low', cdcCoverageTransferCapacityBytes: B - 1};
  const refused = reserve(service, {bootIncarnation: 1,
    listenerGenerationId: 'low', shutdownRecord: {}});
  const after = read(service);
  add('below-capacity-refusal', refused === null && after.retainedBytes === 0 &&
    after.terminalRetained === false, {refused, after});
  retire(service);
}

// No accessor trick: a plain descriptor changes in the supported callback boundary.
function createMutatedRetention() {
  const f = fixture('descriptor-mutation');
  const d = descriptor(f.id);
  let graph = {buffer: Buffer.alloc(1024 * 1024, 0x42)};
  const mutationWeak = new WeakRef(graph);
  const completed = finish(f, {descriptor: d, terminalize(result) {
    d.immediateBytes = graph;
    f.record.transport = null;
    f.record.state = result.state;
    return result;
  }});
  const after = read(f.service);
  const retainedSameObject = after.terminalDescriptor.immediateBytes === graph;
  add('descriptor-mutates-between-validation-and-custody', !retainedSameObject,
    {completed, chargedBytes: after.retainedBytes,
      descriptorValueType: typeof after.terminalDescriptor.immediateBytes,
      actualBufferBytes: graph.buffer.length, retainedSameObject});
  assert.equal(retire(f.service), true);
  graph = null;
  return mutationWeak;
}
function createCleanRetention() {
  const f = fixture('normal-graph-control');
  const refs = {service: new WeakRef(f.service), record: new WeakRef(f.record)};
  assert.equal(finish(f), true);
  assert.equal(retire(f.service), true);
  return refs;
}
const mutationWeak = createMutatedRetention();
const cleanRefs = createCleanRetention();
await nextTurn();
global.gc();
await nextTurn();
global.gc();
add('mutated-graph-survives-zero-endpoints', mutationWeak.deref() === undefined,
  {weakGraphAliveAfterTwoGcTurns: mutationWeak.deref() !== undefined});
add('normal-owner-and-shutdown-record-collect',
  cleanRefs.service.deref() === undefined && cleanRefs.record.deref() === undefined,
  {serviceCollected: cleanRefs.service.deref() === undefined,
    shutdownRecordCollected: cleanRefs.record.deref() === undefined});

// A final-copy failure is outside the callback catch and leaves an unfinishable claim.
{
  const f = fixture('descriptor-throws');
  const d = descriptor(f.id);
  let throwOnRead = false;
  Object.defineProperty(d, 'immediateBytes', {get() {
    if (throwOnRead) throw new Error('descriptor final copy');
    return 4096;
  }});
  let thrown = null;
  try {finish(f, {descriptor: d, terminalize(result) {
    throwOnRead = true;
    f.record.transport = null;
    f.record.state = result.state;
    return result;
  }});} catch (error) {thrown = error.message;}
  const after = read(f.service);
  const retry = finish(f);
  const retired = retire(f.service);
  const nextOwner = {nodeId: f.service.nodeId};
  const next = reserve(nextOwner, {bootIncarnation: 1,
    listenerGenerationId: 'descriptor-throws-next', shutdownRecord: {}});
  add('final-copy-throw-strands-listener', thrown === null && retry === true,
    {thrown, after, retry, retired, next: !!next, later: read(nextOwner)});
}

// Reentry through another public owner mutation must retain a retryable capability.
for (const mode of ['throw', 'wrong-result']) {
  const f = fixture(`retire-${mode}`);
  let retiredInside;
  const result = finish(f, {terminalize() {
    retiredInside = retire(f.service);
    if (mode === 'throw') throw new Error('after retirement');
    return null;
  }});
  const retry = finish(f);
  const nextOwner = {nodeId: f.service.nodeId};
  const next = reserve(nextOwner, {bootIncarnation: 1,
    listenerGenerationId: `${mode}-next`, shutdownRecord: {}});
  add(`retirement-during-terminalize-${mode}`, retiredInside === false && retry === true,
    {retiredInside, result, retry, next: !!next, later: read(nextOwner)});
}

// Failure of one registered wake cannot silently consume the later wake.
{
  const f = fixture('wake-throws');
  let laterWakeCount = 0;
  const removeFirst = wake(f.service, () => {throw new Error('wake failure');});
  const removeSecond = wake(f.service, () => {laterWakeCount += 1;});
  let thrown = null;
  try {finish(f);} catch (error) {thrown = error.message;}
  const after = read(f.service);
  removeFirst();
  const retry = finish(f);
  add('wake-error-after-irreversible-transfer', thrown === null && laterWakeCount === 1,
    {thrown, laterWakeCount, after, retry});
  removeSecond();retire(f.service);
}

// All retained terminal bytes remain visible only after a new endpoint is created.
{
  const f = fixture('diagnostics-zero-endpoints');
  assert.equal(finish(f), true);
  const before = read(f.service);
  assert.equal(retire(f.service), true);
  const retiredRead = read(f.service);
  const peer = {nodeId: f.service.nodeId};
  const remove = wake(peer, () => {});
  const reattachedRead = read(peer);
  add('standing-charge-diagnostics-after-retirement',
    retiredRead.retainedBytes === R,
    {before, retiredRead, reattachedRead});
  remove();retire(peer);
}

writeFileSync(new URL('./counterexamples.json', import.meta.url),
  JSON.stringify({runtime: {node: process.version, uv: process.versions.uv},
    results}, null, 2) + '\n');
for (const r of results) console.log(`${r.contractHolds ? 'PASS' : 'COUNTEREXAMPLE'} ${r.name}`);
process.exitCode = results.every((r) => r.contractHolds) ? 0 : 1;
