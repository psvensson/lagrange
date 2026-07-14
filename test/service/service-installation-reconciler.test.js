import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  ServiceInstallationReconciler,
  buildUnsupportedActivationFailureId,
} from '../../src/service/service-installation-reconciler.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

const ACTIVE = 'active';
const REMOVED = 'removed';
const RECORDED = 'recorded_not_running';
const FAILED = 'failed';

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return {promise, resolve};
}

function installation(overrides = {}) {
  return {
    installationId: 'installation-oci',
    revisionId: 'revision-oci',
    serviceDefinitionId: 'service-oci',
    desiredState: ACTIVE,
    rolloutState: RECORDED,
    operationId: 'operation-oci',
    latestFailureId: null,
    ...overrides,
  };
}

function clone(value) {
  return structuredClone(value);
}

class FakeCatalogOwner {
  constructor(options = {}) {
    this.installations = new Map(
      (options.installations || []).map((row) => [row.installationId, clone(row)]),
    );
    this.revisions = new Map(
      (options.revisions || []).map((row) => [row.revisionId, clone(row)]),
    );
    this.packages = new Map(
      (options.packages || []).map((row) => [row.packageId, clone(row)]),
    );
    this.failures = new Map(
      (options.failures || []).map((row) => [row.failureId, clone(row)]),
    );
    this.calls = [];
    this.listHook = null;
    this.beforeRecordFailure = null;
    this.afterRecordFailure = null;
    this.throwAfterFailureMutation = false;
    this.activeFailureWrites = 0;
    this.maxActiveFailureWrites = 0;
  }

  async listInstallations() {
    this.calls.push({method: 'listInstallations'});
    if (this.listHook) await this.listHook();
    return [...this.installations.values()].map(clone);
  }

  async getRevision(revisionId) {
    this.calls.push({method: 'getRevision', revisionId});
    return clone(this.revisions.get(revisionId) || null);
  }

  async getPackage(packageId) {
    this.calls.push({method: 'getPackage', packageId});
    return clone(this.packages.get(packageId) || null);
  }

  async getFailure(failureId) {
    this.calls.push({method: 'getFailure', failureId});
    return clone(this.failures.get(failureId) || null);
  }

  async recordFailure(request) {
    this.calls.push({method: 'recordFailure', request: clone(request)});
    this.activeFailureWrites += 1;
    this.maxActiveFailureWrites = Math.max(
      this.maxActiveFailureWrites,
      this.activeFailureWrites,
    );
    try {
      if (this.beforeRecordFailure) await this.beforeRecordFailure();
      const row = this.installations.get(request.installationId);
      const existing = this.failures.get(request.failureId);
      if (!existing) {
        this.failures.set(request.failureId, {
          failureId: request.failureId,
          installationId: request.installationId,
          revisionId: row.revisionId,
          code: request.failureCode,
          phase: request.failurePhase,
          retryable: request.retryable,
          occurredAt: 1,
        });
      }
      if (row.latestFailureId === null) {
        row.latestFailureId = request.failureId;
        row.rolloutState = FAILED;
      }
      if (this.afterRecordFailure) await this.afterRecordFailure();
      if (this.throwAfterFailureMutation) {
        this.throwAfterFailureMutation = false;
        throw new Error('simulated lost response after durable failure');
      }
      return {
        failure: clone(this.failures.get(request.failureId)),
        installation: clone(row),
      };
    } finally {
      this.activeFailureWrites -= 1;
    }
  }

  async recordRolloutOutcome(request) {
    this.calls.push({method: 'recordRolloutOutcome', request: clone(request)});
    const row = this.installations.get(request.installationId);
    row.rolloutState = request.rolloutState;
    return clone(row);
  }
}

function createCatalog(installations) {
  const revisions = [];
  const packages = [];
  for (const row of installations) {
    const suffix = row.revisionId.replace('revision-', '');
    revisions.push({
      revisionId: row.revisionId,
      packageId: `package-${suffix}`,
      artifactDigest: `sha256:${'a'.repeat(64)}`,
      configDigest: `sha256:${'b'.repeat(64)}`,
    });
    packages.push({
      packageId: `package-${suffix}`,
      runtimeKind: suffix.includes('wasm') ? 'wasm_component' : 'oci_container',
    });
  }
  return new FakeCatalogOwner({installations, revisions, packages});
}

function createReconciler(catalogOwner, options = {}) {
  return new ServiceInstallationReconciler({
    catalogOwner,
    sweepIntervalMs: 1_000,
    logger: {error() {}, warn() {}, info() {}},
    ...options,
  });
}

describe('ServiceInstallationReconciler', () => {
  it('records one deterministic unsupported failure for each OCI and WASM intent',
    async () => {
      const rows = [
        installation(),
        installation({
          installationId: 'installation-oci-upgrade',
          revisionId: 'revision-oci-upgrade',
          serviceDefinitionId: 'service-oci',
          operationId: 'operation-oci-upgrade',
        }),
        installation({
          installationId: 'installation-wasm',
          revisionId: 'revision-wasm',
          serviceDefinitionId: 'service-wasm',
          operationId: 'operation-wasm',
        }),
        installation({
          installationId: 'installation-wasm-upgrade',
          revisionId: 'revision-wasm-upgrade',
          serviceDefinitionId: 'service-wasm',
          operationId: 'operation-wasm-upgrade',
        }),
      ];
      const catalog = createCatalog(rows);
      const forbiddenCalls = [];
      const reconciler = createReconciler(catalog, {
        runtimeDriverRegistry: {activate: () => forbiddenCalls.push('driver')},
        serviceLifecycleManager: {activate: () => forbiddenCalls.push('manager')},
        serviceReconciler: {reconcile: () => forbiddenCalls.push('legacy')},
        runtimeServiceRebalancerOwner: {refresh: () => forbiddenCalls.push('runtime')},
      });

      await reconciler.setLeader(true);
      await reconciler.whenIdle();
      await reconciler.reconcileNow();

      assert.equal(catalog.failures.size, 4);
      assert.equal(catalog.installations.get('installation-oci').rolloutState,
        RECORDED);
      assert.equal(
        catalog.installations.get('installation-oci-upgrade').rolloutState,
        RECORDED,
      );
      assert.equal(catalog.installations.get('installation-wasm').rolloutState,
        RECORDED);
      assert.equal(
        catalog.installations.get('installation-wasm-upgrade').rolloutState,
        RECORDED,
      );
      const failureRequests = catalog.calls
        .filter((call) => call.method === 'recordFailure')
        .map((call) => call.request);
      assert.equal(failureRequests.length, 4);
      assert.deepEqual(new Set(failureRequests.map((request) => request.failureCode)),
        new Set(['activation_unsupported']));
      assert.deepEqual(new Set(failureRequests.map((request) => request.failurePhase)),
        new Set(['activation']));
      assert.deepEqual(new Set(failureRequests.map((request) => request.retryable)),
        new Set([false]));
      assert.equal(
        catalog.installations.get('installation-oci').latestFailureId,
        'sha256:d200d46a4420bae73b64b572bd8b72505fce346684cccee88e93acc519bba693',
      );
      assert.equal(
        buildUnsupportedActivationFailureId(rows[0]),
        'sha256:d200d46a4420bae73b64b572bd8b72505fce346684cccee88e93acc519bba693',
      );
      assert.deepEqual(forbiddenCalls, []);
      reconciler.shutdown();
    });

  it('removes a never-activated installation using only catalog transitions',
    async () => {
      const row = installation({desiredState: REMOVED});
      const catalog = createCatalog([row]);
      const forbiddenCalls = [];
      const reconciler = createReconciler(catalog, {
        runtimeDriverRegistry: {activate: () => forbiddenCalls.push('driver')},
        serviceLifecycleManager: {remove: () => forbiddenCalls.push('manager')},
        serviceReconciler: {reconcile: () => forbiddenCalls.push('legacy')},
        runtimeServiceRebalancerOwner: {refresh: () => forbiddenCalls.push('runtime')},
      });

      await reconciler.setLeader(true);
      await reconciler.whenIdle();

      assert.equal(catalog.installations.get(row.installationId).rolloutState,
        REMOVED);
      assert.deepEqual(
        catalog.calls
          .filter((call) => call.method === 'recordRolloutOutcome')
          .map((call) => call.request.rolloutState),
        ['removing', REMOVED],
      );
      assert.equal(catalog.failures.size, 0);
      assert.deepEqual(forbiddenCalls, []);
      reconciler.shutdown();
    });

  it('invalidates stale work on leadership loss and lets the next leader repair it',
    async () => {
      const row = installation();
      const catalog = createCatalog([row]);
      const reconciler = createReconciler(catalog);
      catalog.afterRecordFailure = () => reconciler.setLeader(false);

      await reconciler.setLeader(true);
      await reconciler.whenIdle();

      assert.equal(catalog.installations.get(row.installationId).rolloutState,
        FAILED);
      assert.equal(catalog.failures.size, 1);
      catalog.afterRecordFailure = null;
      await reconciler.setLeader(true);
      await reconciler.whenIdle();
      assert.equal(catalog.installations.get(row.installationId).rolloutState,
        RECORDED);
      assert.equal(catalog.failures.size, 1);
      reconciler.shutdown();
    });

  it('recovers an immutable failure insertion with a missing installation pointer',
    async () => {
      const row = installation();
      const failureId = buildUnsupportedActivationFailureId(row);
      const catalog = createCatalog([row]);
      catalog.failures.set(failureId, {
        failureId,
        installationId: row.installationId,
        revisionId: row.revisionId,
        code: 'activation_unsupported',
        phase: 'activation',
        retryable: false,
        occurredAt: 1,
      });
      const reconciler = createReconciler(catalog);

      await reconciler.setLeader(true);
      await reconciler.whenIdle();

      assert.equal(catalog.failures.size, 1);
      assert.equal(catalog.installations.get(row.installationId).latestFailureId,
        failureId);
      assert.equal(catalog.installations.get(row.installationId).rolloutState,
        RECORDED);
      reconciler.shutdown();
    });

  it('repairs a lost response after durable failure persistence on the next sweep',
    async () => {
      const row = installation();
      const catalog = createCatalog([row]);
      catalog.throwAfterFailureMutation = true;
      const reconciler = createReconciler(catalog);

      await reconciler.setLeader(true);
      await reconciler.whenIdle();
      assert.equal(catalog.installations.get(row.installationId).rolloutState,
        FAILED);

      await reconciler.reconcileNow();
      assert.equal(catalog.installations.get(row.installationId).rolloutState,
        RECORDED);
      assert.equal(catalog.failures.size, 1);
      reconciler.shutdown();
    });

  it('coalesces reentrant triggers into one serial rerun', async () => {
    const row = installation();
    const catalog = createCatalog([row]);
    const gate = deferred();
    let activeLists = 0;
    let maxActiveLists = 0;
    let listCalls = 0;
    catalog.listHook = async () => {
      listCalls += 1;
      activeLists += 1;
      maxActiveLists = Math.max(maxActiveLists, activeLists);
      if (listCalls === 1) await gate.promise;
      activeLists -= 1;
    };
    const reconciler = createReconciler(catalog);

    const first = reconciler.setLeader(true);
    const second = reconciler.reconcileNow();
    const third = reconciler.reconcileNow();
    await Promise.resolve();
    assert.equal(maxActiveLists, 1);
    gate.resolve();
    await Promise.all([first, second, third]);
    await reconciler.whenIdle();

    assert.equal(maxActiveLists, 1);
    assert.equal(listCalls, 2);
    assert.equal(catalog.failures.size, 1);
    reconciler.shutdown();
  });

  it('single-flights overlapping event work for the same installation',
    async () => {
      const row = installation();
      const catalog = createCatalog([row]);
      catalog.installations.clear();
      const writeGate = deferred();
      const writeStarted = deferred();
      catalog.beforeRecordFailure = async () => {
        writeStarted.resolve();
        await writeGate.promise;
      };
      const reconciler = createReconciler(catalog);
      await reconciler.setLeader(true);
      await reconciler.whenIdle();
      catalog.installations.set(row.installationId, clone(row));

      const first = reconciler.enqueueInstallation(clone(row));
      await writeStarted.promise;
      const second = reconciler.enqueueInstallation(clone(row));
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(catalog.maxActiveFailureWrites, 1);
      writeGate.resolve();
      await Promise.all([first, second]);
      assert.equal(
        catalog.calls.filter((call) => call.method === 'recordFailure').length,
        1,
      );
      reconciler.shutdown();
    });

  it('does not catalog-only rewrite an installation that already converged',
    async () => {
      const active = installation({rolloutState: 'converged'});
      const removed = installation({
        installationId: 'installation-remove-converged',
        revisionId: 'revision-remove-converged',
        operationId: 'operation-remove-converged',
        desiredState: REMOVED,
        rolloutState: 'converged',
      });
      const catalog = createCatalog([active, removed]);
      const reconciler = createReconciler(catalog);

      await reconciler.setLeader(true);
      await reconciler.whenIdle();

      assert.equal(catalog.failures.size, 0);
      assert.deepEqual(
        catalog.calls.filter((call) =>
          call.method === 'recordRolloutOutcome' ||
          call.method === 'recordFailure'),
        [],
      );
      assert.equal(catalog.installations.get(active.installationId).rolloutState,
        'converged');
      assert.equal(catalog.installations.get(removed.installationId).rolloutState,
        'converged');
      reconciler.shutdown();
    });

  it('uses the injected periodic clock and cleanup stops all later work', async () => {
    const timeSource = new VirtualTimeSource({startMs: 10});
    const catalog = createCatalog([]);
    const reconciler = createReconciler(catalog, {timeSource});

    await reconciler.setLeader(true);
    await reconciler.whenIdle();
    const readsAfterStartup = catalog.calls.length;
    const missedEventInstallation = installation();
    catalog.installations.set(
      missedEventInstallation.installationId,
      clone(missedEventInstallation),
    );
    catalog.revisions.set('revision-oci', {
      revisionId: 'revision-oci',
      packageId: 'package-oci',
    });
    catalog.packages.set('package-oci', {
      packageId: 'package-oci',
      runtimeKind: 'oci_container',
    });
    timeSource.advance(1_000);
    await Promise.resolve();
    await reconciler.whenIdle();
    assert.ok(catalog.calls.length > readsAfterStartup);
    assert.equal(catalog.failures.size, 1);
    assert.equal(
      catalog.installations.get('installation-oci').rolloutState,
      RECORDED,
    );

    reconciler.shutdown();
    const readsAfterShutdown = catalog.calls.length;
    assert.equal(timeSource.pendingTimerCount(), 0);
    timeSource.advance(10_000);
    await Promise.resolve();
    assert.equal(catalog.calls.length, readsAfterShutdown);
  });

  it('does no authoritative reads or writes while not leader', async () => {
    const catalog = createCatalog([installation()]);
    const reconciler = createReconciler(catalog);

    await reconciler.reconcileNow();
    await reconciler.whenIdle();

    assert.deepEqual(catalog.calls, []);
    assert.equal(catalog.failures.size, 0);
    reconciler.shutdown();
  });
});
