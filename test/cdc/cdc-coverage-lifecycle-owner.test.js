import {test} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {
  captureCdcCoverageToken,
  isCurrentCdcCoverageLifecycle,
  registerCdcCoverageLifecycleCleanup,
} from '../../src/cdc/cdc-coverage-lifecycle-owner.js';
import {readCdcCoverageTransferDiagnostics,
  releaseCdcCoverageTransferSession, reserveCdcCoverageTransfer} from
  '../../src/cdc/cdc-coverage-transfer-owner.js';

function service(cache = {}) {
  return new CDCIntegrationService({nodeId: 'node-cdc-coverage',
    systemTableCache: cache, cacheMutationTarget: cache});
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
