import {test} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {
  captureCdcCoverageToken,
  isCurrentCdcCoverageLifecycle,
  registerCdcCoverageLifecycleCleanup,
} from '../../src/cdc/cdc-coverage-lifecycle-owner.js';
import {readCdcCoverageTransferDiagnostics,
  enterCdcCoverageListenerTerminalCheck,
  registerCdcCoverageTransferWake, releaseCdcCoverageTransferSession,
  reserveCdcCoverageListenerBase, reserveCdcCoverageTransfer,
  resizeCdcCoverageTransfer, setCdcCoverageTransferValue,
  transferCdcCoverageListenerToTerminal,
  retireCdcCoverageTransferOwner} from
  '../../src/cdc/cdc-coverage-transfer-owner.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

function service(cache = {}) {
  return new CDCIntegrationService({nodeId: 'node-cdc-coverage',
    systemTableCache: cache, cacheMutationTarget: cache});
}

function listenerTerminalDescriptor(listenerGenerationId) {
  return {listenerGenerationId, immediateCount: 2, immediateBytes: 4096,
    completionCount: 2, completionBytes: 8192, aliasSetCount: 1,
    aliasBytes: 4096, destroyIdCount: 2};
}

function completeListener(owner, claim, shutdownRecord, descriptor) {
  return transferCdcCoverageListenerToTerminal(owner, claim, {
    shutdownRecord, descriptor,
    terminalize(result) {
      shutdownRecord.state = result.state;
      shutdownRecord.transport = null;
      shutdownRecord.result = result;
      return result;
    },
  });
}

test('C17 CDC coverage lifecycle token survives initialize only while live', (t) => {
  const owner = service();
  const first = captureCdcCoverageToken(owner);
  owner.initialize();
  const second = captureCdcCoverageToken(owner);
  t.equal(first.token, second.token, 'initialize does not mint a new token');
  t.equal(isCurrentCdcCoverageLifecycle(first), true,
    'captured lifecycle remains current while targets are exact');
  owner.markShuttingDown();
  t.equal(isCurrentCdcCoverageLifecycle(first), false,
    'shutdown retires the token');
  t.equal(captureCdcCoverageToken(owner), null,
    'terminal service cannot issue another token');
  t.end();
});

test('C17 exact cache and mutation targets fence a captured generation', (t) => {
  const firstCache = {};
  const secondCache = {};
  const owner = service(firstCache);
  const captured = captureCdcCoverageToken(owner);
  const oldTransfer = reserveCdcCoverageTransfer(owner, {
    transferId: 'reused-transfer-id', retainedBytes: 10,
    category: 'consumer'});
  const cleanupOrder = [];
  registerCdcCoverageLifecycleCleanup(owner, () => cleanupOrder.push(
    isCurrentCdcCoverageLifecycle(captured)));
  owner.setSystemTableCache(secondCache);
  owner.setCacheMutationTarget(secondCache);
  t.equal(isCurrentCdcCoverageLifecycle(captured), false,
    'changing either publication target retires the observation');
  const replacement = captureCdcCoverageToken(owner);
  t.same(cleanupOrder, [false],
    'old target cleanup runs only after its token is fenced');
  t.not(replacement.token, captured.token,
    'replacement target tuple owns a fresh private token');
  t.equal(replacement.systemTableCache, secondCache);
  t.equal(replacement.cacheMutationTarget, secondCache);
  t.equal(isCurrentCdcCoverageLifecycle(replacement), true);
  const replacementTransfer = reserveCdcCoverageTransfer(owner, {
    transferId: 'reused-transfer-id', retainedBytes: 10,
    category: 'consumer'});
  t.ok(replacementTransfer, 'replacement target owns a new reservation');
  t.equal(releaseCdcCoverageTransferSession(owner,
    'reused-transfer-id', oldTransfer), false,
  'late old cleanup cannot release the replacement reservation');
  t.equal(readCdcCoverageTransferDiagnostics(owner).sessions, 1,
    'replacement reservation remains live');
  owner.markShuttingDown();
  t.end();
});

test('C17 cleanup is fenced before shutdown releases and replacement use', (t) => {
  const cache = {};
  const oldService = service(cache);
  const old = captureCdcCoverageToken(oldService);
  const order = [];
  registerCdcCoverageLifecycleCleanup(oldService, () => {
    order.push(`cleanup:${isCurrentCdcCoverageLifecycle(old)}`);
  });
  oldService.holdUntilShutdown(() => order.push('release'));
  oldService.markShuttingDown();
  const replacementService = service(cache);
  const replacement = captureCdcCoverageToken(replacementService);
  t.same(order, ['cleanup:false', 'release'],
    'old token is fenced and cleaned before waiters release');
  t.equal(isCurrentCdcCoverageLifecycle(old), false,
    'old callback cannot enter against the shared cache');
  t.equal(isCurrentCdcCoverageLifecycle(replacement), true,
    'replacement owns a distinct live lifecycle');
  replacementService.markShuttingDown();
  t.end();
});

test('C17 transfer expiry disposes owner-held fragment references', (t) => {
  const timeSource = new VirtualTimeSource({startMs: 1000});
  const owner = {nodeId: 'expiry-node', timeSource};
  const chunks = [Buffer.alloc(32), Buffer.alloc(32)];
  const session = reserveCdcCoverageTransfer(owner, {
    transferId: 'expiring-transfer', retainedBytes: 64,
    category: 'consumer', ttlMs: 10,
  });
  setCdcCoverageTransferValue(owner, 'expiring-transfer', {chunks});
  timeSource.advance(10);
  t.equal(session.released, true, 'expiry marks the exact session retired');
  t.equal(session.value, null, 'owner releases its retained value graph');
  t.equal(chunks.length, 0, 'retained chunk references are disposed');
  t.equal(readCdcCoverageTransferDiagnostics(owner).retainedBytes, 0,
    'capacity is released only with the owner-held copies');
  t.end();
});

test('C17 publication top-up is atomic against the shared byte cap', (t) => {
  const owner = {nodeId: 'resize-node', cdcCoverageTransferCapacityBytes: 15};
  const session = reserveCdcCoverageTransfer(owner, {
    transferId: 'resized-transfer', retainedBytes: 10,
    category: 'consumer'});
  t.equal(resizeCdcCoverageTransfer(
    owner, 'resized-transfer', session, 20), false,
  'unavailable top-up is refused before accounting changes');
  t.equal(readCdcCoverageTransferDiagnostics(owner).retainedBytes, 10,
    'failed top-up leaves the original exact charge');
  t.equal(resizeCdcCoverageTransfer(
    owner, 'resized-transfer', session, 15), true,
  'adequate remaining capacity accepts the current publication estimate');
  t.equal(readCdcCoverageTransferDiagnostics(owner).retainedBytes, 15);
  releaseCdcCoverageTransferSession(owner, 'resized-transfer', session);
  t.end();
});

test('C17 listener terminal reserve survives a synchronous successor wake',
  (t) => {
    const nodeId = 'listener-terminal-node';
    const firstOwner = {nodeId};
    const successorOwner = {nodeId};
    const firstRecord = {state: 'active', transport: {socket: true}};
    const successorRecord = {state: 'active', transport: {socket: true}};
    const first = reserveCdcCoverageListenerBase(firstOwner, {
      bootIncarnation: 1, listenerGenerationId: 'listener-1',
      shutdownRecord: firstRecord,
    });
    const baseBytes = 16 * 1024 * 1024;
    const terminalBytes = 16 * 1024;
    t.ok(first, 'first generation atomically owns the complete base');
    t.match(readCdcCoverageTransferDiagnostics(firstOwner), {
      sessions: 0, retainedBytes: baseBytes, listenerActive: true,
      listenerGenerations: 1, terminalRetained: true,
      liveBytesByCategory: {
        'coverage-listener': baseBytes - terminalBytes,
        'coverage-listener-terminal': terminalBytes,
      },
    }, 'standing terminal bytes do not consume a root session');
    t.equal(retireCdcCoverageTransferOwner(firstOwner), false,
      'an active listener claim prevents endpoint retirement');

    let successor = null;
    let wakeSnapshot = null;
    const removeWake = registerCdcCoverageTransferWake(firstOwner, () => {
      if (successor) return;
      t.equal(firstRecord.state, 'terminal-transferred',
        'the old shutdown record is terminal before the wake');
      t.equal(firstRecord.transport, null,
        'the terminal record exposes no old transport graph');
      successor = reserveCdcCoverageListenerBase(successorOwner, {
        bootIncarnation: 1, listenerGenerationId: 'listener-2',
        shutdownRecord: successorRecord,
      });
      wakeSnapshot = readCdcCoverageTransferDiagnostics(successorOwner);
    });
    t.equal(enterCdcCoverageListenerTerminalCheck(firstOwner, first), true,
      'first check establishes the native terminal phase');
    const firstDescriptor = {
      listenerGenerationId: 'listener-1', immediateCount: 2,
      immediateBytes: 4096, completionCount: 2, completionBytes: 8192,
      aliasSetCount: 1, aliasBytes: 4096, destroyIdCount: 2,
      retainedGraph: {mustNotCrossTerminalTransfer: true},
    };
    let reentrantDisposition = null;
    t.equal(transferCdcCoverageListenerToTerminal(firstOwner, first, {
      shutdownRecord: firstRecord, descriptor: firstDescriptor,
      terminalize(result) {
        reentrantDisposition = transferCdcCoverageListenerToTerminal(
          firstOwner, first, {
            shutdownRecord: firstRecord, descriptor: firstDescriptor,
            terminalize: (nestedResult) => nestedResult,
          });
        firstRecord.state = result.state;
        firstRecord.transport = null;
        firstRecord.result = result;
        return result;
      },
    }), true, 'exact terminal transfer returns listener capacity once');
    t.equal(reentrantDisposition, false,
      'terminal mutation cannot recursively consume the release token');
    t.ok(successor, 'the synchronous wake can reserve one successor');
    t.match(wakeSnapshot, {retainedBytes: baseBytes, listenerActive: true,
      listenerGenerations: 2, terminalRetained: true},
    'successor reuses the standing reserve without a free interval');
    t.notOk(Object.hasOwn(wakeSnapshot.terminalDescriptor, 'retainedGraph'),
      'the standing descriptor copies only bounded scalar custody facts');
    t.equal(transferCdcCoverageListenerToTerminal(firstOwner, first, {
      shutdownRecord: firstRecord, descriptor: firstDescriptor,
      terminalize: (result) => result,
    }), false, 'the consumed old claim cannot release its successor');

    removeWake();
    t.equal(enterCdcCoverageListenerTerminalCheck(
      successorOwner, successor), true);
    t.equal(transferCdcCoverageListenerToTerminal(successorOwner, successor, {
      shutdownRecord: successorRecord,
      descriptor: {...firstDescriptor, listenerGenerationId: 'listener-2'},
      terminalize(result) {
        successorRecord.state = result.state;
        successorRecord.transport = null;
        successorRecord.result = result;
        return result;
      },
    }), true);
    t.match(readCdcCoverageTransferDiagnostics(successorOwner), {
      retainedBytes: terminalBytes, listenerActive: false,
      terminalRetained: true,
    }, 'only the node-lifetime terminal reserve remains');
    t.equal(retireCdcCoverageTransferOwner(firstOwner), true);
    t.equal(retireCdcCoverageTransferOwner(successorOwner), true);
    t.match(readCdcCoverageTransferDiagnostics(firstOwner), {
      retainedBytes: terminalBytes, listenerActive: false,
      terminalRetained: true, listenerGenerations: 2,
    }, 'retired endpoint still projects the standing node charge');

    const afterEndpointFreeInterval = {nodeId};
    const thirdRecord = {state: 'active', transport: {socket: true}};
    const third = reserveCdcCoverageListenerBase(afterEndpointFreeInterval, {
      bootIncarnation: 1, listenerGenerationId: 'listener-3',
      shutdownRecord: thirdRecord,
    });
    t.ok(third, 'same node pool persists across an endpoint-free interval');
    t.equal(readCdcCoverageTransferDiagnostics(
      afterEndpointFreeInterval).retainedBytes, baseBytes,
    'later generation acquires only Wlistener beside retained Rterminal');
    t.equal(enterCdcCoverageListenerTerminalCheck(
      afterEndpointFreeInterval, third), true);
    t.equal(transferCdcCoverageListenerToTerminal(
      afterEndpointFreeInterval, third, {
        shutdownRecord: thirdRecord,
        descriptor: {...firstDescriptor, listenerGenerationId: 'listener-3'},
        terminalize(result) {
          thirdRecord.state = result.state;
          thirdRecord.transport = null;
          thirdRecord.result = result;
          return result;
        },
      }), true);
    t.equal(retireCdcCoverageTransferOwner(afterEndpointFreeInterval), true);
    t.end();
  });

test('C17 listener transfer holds capacity on invalid terminal custody', (t) => {
  const owner = {nodeId: 'listener-terminal-refusal-node'};
  const shutdownRecord = {state: 'active', transport: {socket: true}};
  t.equal(reserveCdcCoverageListenerBase(owner, {
    bootIncarnation: 0, listenerGenerationId: 'unissued-boot',
    shutdownRecord,
  }), null, 'an unissued boot cannot acquire the node base');
  t.equal(reserveCdcCoverageListenerBase(owner, {
    bootIncarnation: 3, listenerGenerationId: 'å'.repeat(65),
    shutdownRecord,
  }), null, 'terminal generation identity is bounded in encoded bytes');
  t.equal(readCdcCoverageTransferDiagnostics(owner).retainedBytes, 0,
    'identity refusal retains no terminal or listener bytes');
  const claim = reserveCdcCoverageListenerBase(owner, {
    bootIncarnation: 3, listenerGenerationId: 'listener-refusal',
    shutdownRecord,
  });
  t.equal(enterCdcCoverageListenerTerminalCheck(owner, claim), true);
  let woke = false;
  const removeWake = registerCdcCoverageTransferWake(owner, () => {
    woke = true;
  });
  const oversized = {
    listenerGenerationId: 'listener-refusal', immediateCount: 2,
    immediateBytes: 4097, completionCount: 2, completionBytes: 8192,
    aliasSetCount: 1, aliasBytes: 4096, destroyIdCount: 2,
  };
  t.equal(transferCdcCoverageListenerToTerminal(owner, claim, {
    shutdownRecord, descriptor: oversized,
    terminalize: (result) => result,
  }), false, 'an over-ceiling descriptor cannot return capacity');
  t.equal(transferCdcCoverageListenerToTerminal(owner, claim, {
    shutdownRecord,
    descriptor: {...oversized, immediateBytes: 4096},
    terminalize() {
      throw new Error('terminal mutation failed');
    },
  }), false, 'a failed MessageRouter terminal mutation keeps ownership');
  t.match(readCdcCoverageTransferDiagnostics(owner), {
    retainedBytes: 16 * 1024 * 1024, listenerActive: true,
  });
  t.equal(woke, false, 'no refusal path wakes a successor');
  t.equal(retireCdcCoverageTransferOwner(owner), false,
    'the live exact release capability cannot be dropped by retirement');
  removeWake();
  t.equal(transferCdcCoverageListenerToTerminal(owner, claim, {
    shutdownRecord,
    descriptor: {...oversized, immediateBytes: 4096},
    terminalize(result) {
      shutdownRecord.state = result.state;
      shutdownRecord.transport = null;
      shutdownRecord.result = result;
      return result;
    },
  }), true, 'a valid exact descriptor can complete later');
  t.equal(retireCdcCoverageTransferOwner(owner), true);
  t.end();
});

test('C17 terminal descriptor is one own-data scalar capture', (t) => {
  const owner = {nodeId: 'listener-descriptor-capture-node'};
  const shutdownRecord = {state: 'active', transport: {socket: true}};
  const claim = reserveCdcCoverageListenerBase(owner, {
    bootIncarnation: 4, listenerGenerationId: 'descriptor-capture',
    shutdownRecord,
  });
  t.equal(enterCdcCoverageListenerTerminalCheck(owner, claim), true);
  const graph = {buffer: Buffer.alloc(1024 * 1024)};
  const descriptor = listenerTerminalDescriptor('descriptor-capture');
  t.equal(transferCdcCoverageListenerToTerminal(owner, claim, {
    shutdownRecord, descriptor,
    terminalize(result) {
      descriptor.immediateBytes = graph;
      descriptor.completionBytes = graph;
      shutdownRecord.state = result.state;
      shutdownRecord.transport = null;
      shutdownRecord.result = result;
      return result;
    },
  }), true, 'callback mutation cannot change captured custody');
  const retained = readCdcCoverageTransferDiagnostics(owner).terminalDescriptor;
  t.equal(retained.immediateBytes, 4096);
  t.equal(retained.completionBytes, 8192);
  t.not(retained.immediateBytes, graph,
    'standing descriptor retains no callback-injected graph');
  t.equal(retireCdcCoverageTransferOwner(owner), true);

  for (const descriptorKind of ['accessor', 'inherited']) {
    const rejectedOwner = {nodeId: `listener-${descriptorKind}-node`};
    const rejectedRecord = {state: 'active', transport: {socket: true}};
    const rejectedClaim = reserveCdcCoverageListenerBase(rejectedOwner, {
      bootIncarnation: 4, listenerGenerationId: descriptorKind,
      shutdownRecord: rejectedRecord,
    });
    t.equal(enterCdcCoverageListenerTerminalCheck(
      rejectedOwner, rejectedClaim), true);
    const valid = listenerTerminalDescriptor(descriptorKind);
    let invalid;
    if (descriptorKind === 'accessor') {
      invalid = {...valid};
      Object.defineProperty(invalid, 'immediateBytes', {
        enumerable: true, get: () => 4096,
      });
    } else {
      invalid = Object.create(valid);
    }
    let callbackCalls = 0;
    t.equal(transferCdcCoverageListenerToTerminal(
      rejectedOwner, rejectedClaim, {
        shutdownRecord: rejectedRecord, descriptor: invalid,
        terminalize() {
          callbackCalls += 1;
          throw new Error('must not run');
        },
      }), false, `${descriptorKind} evidence is rejected before callback`);
    t.equal(callbackCalls, 0);
    t.equal(readCdcCoverageTransferDiagnostics(
      rejectedOwner).retainedBytes, 16 * 1024 * 1024,
    'capture refusal leaves the complete claim owned');
    t.equal(completeListener(
      rejectedOwner, rejectedClaim, rejectedRecord, valid), true,
    'the original claim remains retryable with own-data evidence');
    t.equal(retireCdcCoverageTransferOwner(rejectedOwner), true);
  }
  t.end();
});

test('C17 callback-time retirement preserves the retry owner', (t) => {
  for (const mode of ['throw', 'wrong-result']) {
    const nodeId = `listener-terminalize-retire-${mode}`;
    const owner = {nodeId};
    const shutdownRecord = {state: 'active', transport: {socket: true}};
    const generation = `terminalize-retire-${mode}`;
    const claim = reserveCdcCoverageListenerBase(owner, {
      bootIncarnation: 5, listenerGenerationId: generation,
      shutdownRecord,
    });
    t.equal(enterCdcCoverageListenerTerminalCheck(owner, claim), true);
    let retirement = null;
    const first = transferCdcCoverageListenerToTerminal(owner, claim, {
      shutdownRecord, descriptor: listenerTerminalDescriptor(generation),
      terminalize() {
        retirement = retireCdcCoverageTransferOwner(owner);
        if (mode === 'throw') throw new Error('terminalize failed');
        return null;
      },
    });
    t.equal(retirement, false,
      `${mode} callback cannot retire the transferring owner`);
    t.equal(first, false, `${mode} callback remains a retryable refusal`);
    t.equal(completeListener(owner, claim, shutdownRecord,
      listenerTerminalDescriptor(generation)), true,
    'the same canonical owner completes after valid evidence');
    t.equal(retireCdcCoverageTransferOwner(owner), true);
    const successorOwner = {nodeId};
    const successorRecord = {state: 'active', transport: {socket: true}};
    const successor = reserveCdcCoverageListenerBase(successorOwner, {
      bootIncarnation: 5, listenerGenerationId: `${generation}-next`,
      shutdownRecord: successorRecord,
    });
    t.ok(successor, 'successful retry leaves successor capacity available');
    t.equal(enterCdcCoverageListenerTerminalCheck(
      successorOwner, successor), true);
    t.equal(completeListener(successorOwner, successor, successorRecord,
      listenerTerminalDescriptor(`${generation}-next`)), true);
    t.equal(retireCdcCoverageTransferOwner(successorOwner), true);
  }
  t.end();
});

test('C17 wake failures do not truncate committed notification passes', (t) => {
  const listenerOwner = {nodeId: 'listener-wake-failure-node'};
  const record = {state: 'active', transport: {socket: true}};
  const claim = reserveCdcCoverageListenerBase(listenerOwner, {
    bootIncarnation: 6, listenerGenerationId: 'wake-failure',
    shutdownRecord: record,
  });
  t.equal(enterCdcCoverageListenerTerminalCheck(listenerOwner, claim), true);
  let listenerLaterWake = 0;
  const removeListenerThrow = registerCdcCoverageTransferWake(
    listenerOwner, () => {
      throw new Error('listener wake failed');
    });
  const removeListenerLater = registerCdcCoverageTransferWake(
    listenerOwner, () => {
      listenerLaterWake += 1;
    });
  t.equal(completeListener(listenerOwner, claim, record,
    listenerTerminalDescriptor('wake-failure')), true,
  'committed listener transfer remains successful despite one failed wake');
  t.equal(listenerLaterWake, 1, 'later listener wake still runs exactly once');
  t.match(readCdcCoverageTransferDiagnostics(listenerOwner), {
    retainedBytes: 16 * 1024, releases: 1, wakeFailures: 1,
    listenerActive: false,
  }, 'diagnostics report the failed wake and committed release truthfully');
  t.equal(completeListener(listenerOwner, claim, record,
    listenerTerminalDescriptor('wake-failure')), false,
  'notification failure cannot repeat the committed release');
  removeListenerThrow();
  removeListenerLater();
  t.equal(retireCdcCoverageTransferOwner(listenerOwner), true);

  const rowOwner = {nodeId: 'row-wake-failure-node'};
  const rowSession = reserveCdcCoverageTransfer(rowOwner, {
    transferId: 'row-wake', retainedBytes: 32, category: 'consumer',
  });
  let rowLaterWake = 0;
  const removeRowThrow = registerCdcCoverageTransferWake(rowOwner, () => {
    throw new Error('row wake failed');
  });
  const removeRowLater = registerCdcCoverageTransferWake(rowOwner, () => {
    rowLaterWake += 1;
  });
  t.equal(releaseCdcCoverageTransferSession(
    rowOwner, 'row-wake', rowSession), true,
  'row release uses the same bounded successful dispatcher');
  t.equal(rowLaterWake, 1, 'later row wake still runs exactly once');
  t.match(readCdcCoverageTransferDiagnostics(rowOwner), {
    retainedBytes: 0, releases: 1, wakeFailures: 1,
  });
  removeRowThrow();
  removeRowLater();
  t.equal(retireCdcCoverageTransferOwner(rowOwner), true);
  t.end();
});
