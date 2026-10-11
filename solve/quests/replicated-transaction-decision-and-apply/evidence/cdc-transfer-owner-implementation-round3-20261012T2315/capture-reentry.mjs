import {writeFileSync} from 'node:fs';
import {
  reserveCdcCoverageListenerBase as reserve,
  enterCdcCoverageListenerTerminalCheck as enter,
  transferCdcCoverageListenerToTerminal as transfer,
  retireCdcCoverageTransferOwner as retire,
  registerCdcCoverageTransferWake as wake,
  reserveCdcCoverageTransfer as reserveRow,
  releaseCdcCoverageTransferSession as releaseRow,
  readCdcCoverageTransferDiagnostics as read,
} from '../../../../../src/cdc/cdc-coverage-transfer-owner.js';

const results = [];

function desc(id) {
  return {listenerGenerationId: id, immediateCount: 2,
    immediateBytes: 4096, completionCount: 2, completionBytes: 8192,
    aliasSetCount: 1, aliasBytes: 4096, destroyIdCount: 2};
}

function setup(id) {
  const owner = {nodeId: `round3-${id}`};
  const record = {};
  const claim = reserve(owner, {bootIncarnation: 1,
    listenerGenerationId: id, shutdownRecord: record});
  enter(owner, claim);
  return {owner, record, claim, id};
}

function finish(fixture, options = {}) {
  return transfer(fixture.owner, fixture.claim, {
    shutdownRecord: fixture.record, descriptor: desc(fixture.id),
    terminalize: (result) => result, ...options,
  });
}

for (const seam of ['proxy-descriptor', 'options-descriptor',
  'options-terminalize', 'options-shutdownRecord']) {
  const fixture = setup(seam);
  let nested = null;
  let successor = null;
  let outerCalls = 0;
  let fired = false;
  const successorRecord = {};
  function reenter() {
    if (fired) return;
    fired = true;
    nested = finish(fixture);
    successor = reserve(fixture.owner, {bootIncarnation: 1,
      listenerGenerationId: `${seam}-next`,
      shutdownRecord: successorRecord});
  }
  const rawOptions = {shutdownRecord: fixture.record, descriptor: desc(seam),
    terminalize: (result) => {
      outerCalls += 1;
      return result;
    }};
  let options = rawOptions;
  if (seam === 'proxy-descriptor') {
    rawOptions.descriptor = new Proxy(desc(seam), {
      getOwnPropertyDescriptor(target, key) {
        reenter();
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
  } else {
    const optionField = seam.slice('options-'.length);
    options = new Proxy(rawOptions, {
      getOwnPropertyDescriptor(target, key) {
        if (key === optionField) reenter();
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
  }
  let result = null;
  let thrown = null;
  try {
    result = transfer(fixture.owner, fixture.claim, options);
  } catch (error) {
    thrown = error.message;
  }
  const after = read(fixture.owner);
  enter(fixture.owner, successor);
  const successorCompleted = transfer(fixture.owner, successor, {
    shutdownRecord: successorRecord, descriptor: desc(`${seam}-next`),
    terminalize: (value) => value,
  });
  results.push({name: seam,
    contractHolds: result === false && thrown === null && outerCalls === 0 &&
      nested === true && successor !== null && successorCompleted === true,
    result, thrown, outerCalls, nested, successor: Boolean(successor), after,
    successorCompleted, afterSuccessor: read(fixture.owner)});
  retire(fixture.owner);
}

for (const field of ['shutdownRecord', 'terminalize', 'descriptor']) {
  const fixture = setup(`accessor-${field}`);
  const options = {shutdownRecord: fixture.record,
    descriptor: desc(fixture.id), terminalize: (result) => result};
  const value = options[field];
  let calls = 0;
  Object.defineProperty(options, field, {get() {
    calls += 1;
    return value;
  }});
  const result = transfer(fixture.owner, fixture.claim, options);
  const retry = finish(fixture);
  results.push({name: `accessor-${field}-refusal-and-valid-retry`,
    contractHolds: result === false && calls === 0 && retry === true,
    result, calls, retry, after: read(fixture.owner)});
  retire(fixture.owner);
}

{
  const fixture = setup('throwing-options-proxy');
  let calls = 0;
  const rawOptions = {shutdownRecord: fixture.record,
    descriptor: desc(fixture.id), terminalize: (result) => result};
  const options = new Proxy(rawOptions, {getOwnPropertyDescriptor() {
    calls += 1;
    throw new Error('capture');
  }});
  const result = transfer(fixture.owner, fixture.claim, options);
  const before = read(fixture.owner);
  const retry = finish(fixture);
  results.push({name: 'throwing-options-proxy-refusal-and-valid-retry',
    contractHolds: result === false && retry === true && calls === 1,
    result, retry, calls, before, after: read(fixture.owner)});
  retire(fixture.owner);
}

{
  const fixture = setup('throwing-descriptor-proxy');
  let calls = 0;
  const descriptor = new Proxy(desc(fixture.id), {
    getOwnPropertyDescriptor() {
      calls += 1;
      throw new Error('capture');
    },
  });
  const result = finish(fixture, {descriptor});
  const before = read(fixture.owner);
  const retry = finish(fixture);
  results.push({name: 'throwing-descriptor-proxy-refusal-and-valid-retry',
    contractHolds: result === false && retry === true && calls === 1,
    result, retry, calls, before, after: read(fixture.owner)});
  retire(fixture.owner);
}

{
  const fixture = setup('plain-proxies');
  const optionCounts = {};
  const descriptorCounts = {};
  const descriptor = new Proxy(desc(fixture.id), {
    getOwnPropertyDescriptor(target, key) {
      descriptorCounts[key] = (descriptorCounts[key] ?? 0) + 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  const rawOptions = {shutdownRecord: fixture.record, descriptor,
    terminalize: (result) => result};
  const options = new Proxy(rawOptions, {
    getOwnPropertyDescriptor(target, key) {
      optionCounts[key] = (optionCounts[key] ?? 0) + 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  const result = transfer(fixture.owner, fixture.claim, options);
  results.push({name: 'plain-proxies-captured-once',
    contractHolds: result === true && Object.keys(optionCounts).length === 3 &&
      Object.values(optionCounts).every((count) => count === 1) &&
      Object.keys(descriptorCounts).length === 8 &&
      Object.values(descriptorCounts).every((count) => count === 1),
    result, optionCounts, descriptorCounts});
  retire(fixture.owner);
}

{
  const fixture = setup('fixed-snapshot');
  let firstCalls = 0;
  let lateCalls = 0;
  let removeLate = null;
  const removeFirst = wake(fixture.owner, () => {
    firstCalls += 1;
    if (!removeLate) removeLate = wake(fixture.owner, () => {
      lateCalls += 1;
    });
  });
  const result = finish(fixture);
  const afterFirst = {firstCalls, lateCalls};
  const row = reserveRow(fixture.owner, {transferId: 'next-real-release',
    retainedBytes: 1, category: 'consumer'});
  const released = releaseRow(fixture.owner, 'next-real-release', row);
  results.push({name: 'fixed-snapshot-does-not-expand',
    contractHolds: result === true && afterFirst.firstCalls === 1 &&
      afterFirst.lateCalls === 0 && released === true && firstCalls === 2 &&
      lateCalls === 1,
    result, afterFirst, released, firstCalls, lateCalls});
  removeFirst();
  removeLate();
  retire(fixture.owner);
}

writeFileSync(new URL('./capture-reentry.json', import.meta.url),
  `${JSON.stringify(results, null, 2)}\n`);
for (const result of results) {
  console.log(`${result.contractHolds ? 'PASS' : 'COUNTEREXAMPLE'} ${result.name}`);
}
process.exitCode = results.every((result) => result.contractHolds) ? 0 : 1;
