import {createReplicaHandlerFixture} from
  '../test-helpers/replica-handler-construction-fixture.js';
// Actual original preparation, catalog, native opening and handler acquisition.
// The held-facts membrane delays the native owner's unchanged answer. The
// listener tests isolate the existing passive observation/custody kernel; the
// unchanged single-path seed integration root owns useful-service evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SERVICE_STATUS, SERVICE_TYPE, CDC_OPERATION} from '../../src/constants/index.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {TrackedServiceRegistry} from '../../src/node/replica-handler-membership-relay.js';
import {ReplicaLifecycleOwner, REPLICA_LIFECYCLE_OWNER_INCARNATION_MISMATCH} from
  '../../src/bootstrap/shared/replica-handler-setup.js';
import {captureReplicaRuntimeObservation} from '../../src/node/replica-runtime-observation.js';
import {PARTITION_RUNTIME_PUBLICATION_REFUSED} from
  '../../src/partition/partition-runtime-publication.js';
import {readParticipantReleaseFacts} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {observeParticipantAppliedPosition} from
  '../../src/node/participant-release-applied-position-observation.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {BootstrapSystemTableWriter} from '../../src/bootstrap/system-table-writer.js';
import {originalSeedServiceRegistration} from '../../src/bootstrap/seed-original-registration.js';
import {PartitionServiceRowOwner} from '../../src/partition/partition-service-row-owner.js';
import {buildSystemTableMutationSqlParts} from
  '../../src/cdc/cdc-system-table-mutation-sql-helpers.js';
import {commitDurably} from '../../src/raft/raft-rs-durable-store.js';
import {captureReplicaAdmission, runSerializedReplicaMutation} from
  '../../src/node/replica-state-machine-serialization.js';
import {installAuthoritativeReplicaLifecycleInLane} from
  '../../src/node/replica-state-machine-recovery.js';
import {buildReplicaLifecycleMutationPredicateFromRow,
  buildReplicaLifecycleMutationPredicateFromState} from
  '../../src/node/replica-state-machine-lifecycle-observation.js';
import {settledTurn, turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {ORIGINAL_ALLOCATION, ORIGINAL_ALLOCATION_REASON} from
  '../../src/raft/raft-rs-original-allocation-constants.js';

const HOSTING_FACT = 'current_lifecycle_registry';
const REFUSED = {code: PARTITION_RUNTIME_PUBLICATION_REFUSED};

function assertOriginalLifecycleInstalled(owner, replicaId, evidence, admission, installed) {
  const observed = buildReplicaLifecycleMutationPredicateFromState(owner.getState(replicaId));
  const expected = buildReplicaLifecycleMutationPredicateFromRow(evidence);
  assert.equal(installed, true, `original registration lifecycle install must be accepted: ${
    JSON.stringify({replicaId, ownerNodeId: owner.nodeId, admission, evidence, observed})}`);
  assert.deepEqual(observed, expected,
    'accepted original installation must retain every canonical predicate field before publication');
}

async function openedOriginal(t, owners) {
  const f = await owners.fixture(t);
  await f.service.prepareOriginalSeedAttempt();
  const options = owners.replicaOptions(f, SERVICE_TYPE.PARTITION);
  const context = owners.queueReplica(f, options);
  const admitted = f.service.bootstrapReplicaOptionsByServiceId.get(options.replicaId);
  await f.service.seedPartitionsPhase.createBootstrapPartitionReplica(context);
  const runtime = f.service.partitionServices.get(options.replicaId);
  assert.equal(runtime.initialized, true, 'the actual original native runtime opened');
  assert.equal(runtime.raft.readStatus().outcome, 'CORE_OK');
  f.service.seedRuntimeBridgeOwner.ensureBootstrapCdcIntegrationService();
  f.service.initializeReplicaStateMachine();
  return {...f, options, context, admitted, runtime,
    preparation: f.service.originalAllocationPreparation};
}

function heldNativeMembership(runtime) {
  const original = runtime.raft;
  const entered = Promise.withResolvers();
  const resumed = Promise.withResolvers();
  const membrane = Object.freeze({...original,
    async readCommittedMembership(request) {
      const answer = await original.readCommittedMembership(request);
      entered.resolve(answer);
      await resumed.promise;
      return answer;
    }});
  runtime.raft = membrane;
  return {entered: entered.promise, release: resumed.resolve,
    restore() {
      assert.equal(runtime.raft, membrane, 'the timing membrane retains its original port');
      runtime.raft = original;
    }};
}

function controlledObservation(handler, runtime, read) {
  const now = handler.timeSource.now();
  // This tests the passive kernel's resource owner. It does not claim that
  // a fabricated census, origin, or release request was accepted on the wire.
  const request = {action: ACTION.OBSERVE_APPLIED_POSITION,
    replicaId: runtime.replicaId, partitionId: runtime.partitionId,
    deadlineAtMs: now + 5000, observationDeadlineAtMs: now + 5000,
    release: {releaseId: 'host-custody-control'}, attempt: {}, target: {}, origin: {}};
  return observeParticipantAppliedPosition(handler, runtime, request, read,
    (_handler, _runtime, _request, _port, assessment) =>
      ({answer: assessment.answer, refreshEligible: false}));
}

async function originalRegistrationInfo(f, handler) {
  const owner = handler.replicaStateMachine;
  // The same declared metadata transport seam as the canonical handoff
  // control below. Preparation, row birth, INSERT sealing and lane install
  // are production owners; this is not replicated service provisioning.
  const writer = new BootstrapSystemTableWriter({
    async insertSystemTableRow(table, row) {
      const parts = buildSystemTableMutationSqlParts(CDC_OPERATION.INSERT, row);
      commitDurably(f.runtime.db, () => f.runtime.db.prepare(
        `INSERT INTO ${table} (${parts.columns}) VALUES (${parts.placeholders})`).run(...parts.values));
      return {success: true, affectedRows: 1};
    },
    async readAuthoritativeRows(_table, sql, params) {
      return {success: true, rows: f.runtime.db.prepare(sql).all(...params)};
    },
  }, f.service.partitionServices);
  const rowOwner = new PartitionServiceRowOwner({systemTableWriter: writer,
    replicaStateMachine: owner});
  const registration = originalSeedServiceRegistration(f.preparation, f.options.replicaId, writer);
  const evidence = await rowOwner.registerReplica({partitionId: f.options.partitionId,
    replicaId: f.options.replicaId, nodeId: f.service.nodeId, service: f.runtime,
    status: SERVICE_STATUS.CREATING, originalRegistration: registration});
  const admission = captureReplicaAdmission(owner, f.options.replicaId);
  const installed = await turnChainValue(runSerializedReplicaMutation(owner, f.options.replicaId,
    () => settledTurn(installAuthoritativeReplicaLifecycleInLane(
      owner, f.options.replicaId, evidence, admission))));
  assertOriginalLifecycleInstalled(owner, f.options.replicaId, evidence, admission, installed);
  return {replicaId: f.options.replicaId, partitionId: f.options.partitionId,
    tableName: f.options.tableName, service: f.runtime, sourceEvidence: evidence,
    lifecycleOwner: owner, hostServices: f.service.partitionServices};
}

function registerOriginalSeedRuntimeHostingTests(owners) {
  test('original queue and native constructor retain one preparation-issued publication',
    async (t) => {
      const f = await openedOriginal(t, owners);
      assert.equal(f.runtime.runtimePublication, f.admitted.runtimePublication,
        're-entered preparation admission cannot mint another runtime capability');
      assert.equal(f.runtime.originalAllocationOpening, f.admitted.originalAllocationOpening);
      assert.equal(f.runtime.db.prepare('SELECT COUNT(*) AS count FROM services').get().count, 0,
        'native opening and original physical custody precede SERVICES registration');
    });

  test('original native runtime is physically hosted before any lifecycle row is published',
    async (t) => {
      const f = await openedOriginal(t, owners);
      const handler = f.service.acquireReplicaHandler();
      assert.equal(handler.localServices.get(f.options.replicaId), f.runtime);
      assert.equal(handler.getTrackedService(f.options.replicaId), f.runtime);
      assert.equal(handler.localReplicas.has(f.options.replicaId), false,
        'physical hosting manufactures no lifecycle metadata');
      assert.equal(handler.replicaStateMachine.getState(f.options.replicaId), null);
      assert.equal(captureReplicaRuntimeObservation(handler, f.options.replicaId),
        null, 'a prepared host is not a registered lifecycle generation');
      assert.equal(f.runtime.runtimePublication.assertCurrent(f.runtime), true);
      assert.equal(f.service.acquireReplicaHandler(), handler);
      assert.equal(handler.localServices.get(f.options.replicaId), f.runtime);
      assert.equal(f.runtime.runtimeBinding, undefined);
    });

  for (const changed of ['preparation', 'host-map', 'lifecycle-holder', 'boot']) {
    test(`original hosting refuses a changed ${changed} captured before construction`, async (t) => {
      const f = await openedOriginal(t, owners);
      const host = f.service.partitionServices;
      const holder = f.service.replicaLifecycleOwner;
      const owner = f.service.replicaStateMachine;
      const boot = f.service.bootIncarnation;
      try {
        if (changed === 'preparation') f.preparation.revoke();
        if (changed === 'host-map') f.service.partitionServices = new Map(host);
        if (changed === 'lifecycle-holder') f.service.replicaLifecycleOwner = new ReplicaLifecycleOwner();
        if (changed === 'boot') f.service.bootIncarnation = boot + 1;
        assert.throws(() => f.service.acquireReplicaHandler(),
          (error) => error?.code === PARTITION_RUNTIME_PUBLICATION_REFUSED ||
            error?.code === 'ORIGINAL_ALLOCATION_HOLD' ||
            error?.code === REPLICA_LIFECYCLE_OWNER_INCARNATION_MISMATCH,
          'a current-looking ID cannot renew the original constructor source');
        assert.notEqual(f.service.replicaHandler?.localServices.get(f.options.replicaId), f.runtime);
      } finally {
        const replacement = f.service.replicaLifecycleOwner;
        const replacementOwner = f.service.replicaStateMachine;
        if (replacement !== holder) {
          await f.service.replicaHandler?.shutdown();
          replacement.release();
          if (replacementOwner !== owner) await replacementOwner?.clear();
          f.service.replicaHandler = holder.record?.replicaHandler ?? null;
          f.service.replicaStateMachine = owner;
        }
        f.service.partitionServices = host;
        f.service.replicaLifecycleOwner = holder;
        f.service.bootIncarnation = boot;
      }
    });
  }

  test('an original runtime from another preparation cannot occupy this seed host', async (t) => {
    const original = await openedOriginal(t, owners);
    const foreign = await openedOriginal(t, owners);
    const host = original.service.partitionServices;
    host.set(original.options.replicaId, foreign.runtime);
    try {
      assert.throws(() => original.service.acquireReplicaHandler(), REFUSED);
      assert.notEqual(original.service.replicaHandler?.localServices.get(original.options.replicaId),
        foreign.runtime, 'same birth-shaped address is not this preparation opening');
    } finally {
      host.set(original.options.replicaId, original.runtime);
    }
  });

  test('raw physical map insertion in another handler cannot grant release facts', async (t) => {
    const f = await openedOriginal(t, owners);
    const originalHandler = f.service.acquireReplicaHandler();
    const owner = new ReplicaStateMachine({nodeId: f.service.nodeId, ownerIncarnation: 2,
      cdcIntegrationService: f.service.cdcIntegrationService,
      systemTableCache: f.service.systemTableCache, timeSource: originalHandler.timeSource});
    const foreign = createReplicaHandlerFixture(ReplicaHandler, {nodeId: f.service.nodeId, ownerIncarnation: 2,
      replicaStateMachine: owner, cdcIntegrationService: f.service.cdcIntegrationService,
      systemTableCache: f.service.systemTableCache, timeSource: originalHandler.timeSource,
      createPartitionService: () => { throw new Error('this control creates no runtime'); }});
    // Deliberate hostile publication. Both heads execute the old map-only
    // route; this is not a fixture authority or a candidate fallback.
    foreign.localServices.set(f.options.replicaId, f.runtime);
    try {
      const answer = await readParticipantReleaseFacts(foreign, f.runtime);
      assert.equal(answer.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(answer.missingFact, HOSTING_FACT);
      assert.equal(originalHandler.localReplicas.has(f.options.replicaId), false);
    } finally {
      foreign.localServices.delete(f.options.replicaId);
      await foreign.shutdown();
      await owner.clear();
    }
  });

  for (const changed of ['none', 'preparation', 'registry', 'host-map', 'owner']) {
    test(`held original release facts retain their first hosting claim: ${changed}`, async (t) => {
      const f = await openedOriginal(t, owners);
      const gate = heldNativeMembership(f.runtime);
      const handler = f.service.acquireReplicaHandler();
      // An unconditional hostile same-object write lets the baseline reach
      // the read. It supplies no publication claim on the candidate.
      handler.localServices.set(f.options.replicaId, f.runtime);
      const registry = handler.localServices;
      const host = f.service.partitionServices;
      const owner = handler.replicaStateMachine;
      let replacementOwner = null;
      const work = readParticipantReleaseFacts(handler, f.runtime);
      try {
        await owners.pausedWorkEntered({promise: gate.entered}, work);
        if (changed === 'preparation') f.preparation.revoke();
        if (changed === 'registry') {
          handler.localServices = new TrackedServiceRegistry();
          handler.localServices.set(f.options.replicaId, f.runtime);
        }
        if (changed === 'host-map') f.service.partitionServices = new Map(host);
        if (changed === 'owner') {
          replacementOwner = new ReplicaStateMachine({nodeId: f.service.nodeId,
            ownerIncarnation: 2, cdcIntegrationService: f.service.cdcIntegrationService,
            systemTableCache: f.service.systemTableCache});
          handler.replicaStateMachine = replacementOwner;
        }
        gate.release();
        const answer = await work;
        if (changed === 'none') {
          assert.notEqual(answer.missingFact, HOSTING_FACT,
            'unchanged source still reaches the actual native membership owner');
        } else {
          assert.equal(answer.outcome, OUTCOME.UNAVAILABLE);
          assert.equal(answer.missingFact, HOSTING_FACT,
            'late membership cannot certify or adopt a different physical owner');
        }
      } finally {
        gate.release();
        await work;
        gate.restore();
        if (handler.localServices !== registry) handler.localServices.clear();
        handler.localServices = registry;
        f.service.partitionServices = host;
        handler.replicaStateMachine = owner;
        await replacementOwner?.clear();
      }
    });
  }

  test('applied-position listener custody keeps the original registry across a held read',
    async (t) => {
      const f = await openedOriginal(t, owners);
      const handler = f.service.acquireReplicaHandler();
      handler.localServices.set(f.options.replicaId, f.runtime);
      const registry = handler.localServices;
      const before = registry.serviceListeners.size;
      const entered = Promise.withResolvers();
      const resumed = Promise.withResolvers();
      const work = Promise.resolve(controlledObservation(handler, f.runtime, async () => {
        entered.resolve();
        await resumed.promise;
        return {answer: {outcome: OUTCOME.UNAVAILABLE, missingFact: 'controlled-owner-read'}};
      }));
      let replacement;
      try {
        await owners.pausedWorkEntered(entered, work);
        assert.equal(registry.serviceListeners.size, before + 1);
        replacement = new TrackedServiceRegistry();
        replacement.set(f.options.replicaId, f.runtime);
        handler.localServices = replacement;
        resumed.resolve();
        assert.equal((await work).outcome, OUTCOME.STALE,
          'a new registry with the same object cannot lend its lifetime to old work');
        assert.equal(registry.serviceListeners.size, before,
          'the original listener is released at the original registry');
        assert.equal(replacement.serviceListeners.size, 0,
          'old completion installs and removes no successor listener');
      } finally {
        resumed.resolve();
        await work;
        replacement?.clear();
        handler.localServices = registry;
      }
    });

  test('registry replacement during listener acquisition cannot attach successor resources',
    async (t) => {
      const f = await openedOriginal(t, owners);
      const port = f.runtime.raft;
      let handler;
      let replacement;
      let acquired = 0;
      let released = 0;
      let reads = 0;
      f.runtime.raft = Object.freeze({...port, subscribe(event, listener) {
        const dispose = port.subscribe(event, listener);
        acquired += 1;
        if (replacement === undefined) {
          replacement = new TrackedServiceRegistry();
          replacement.set(f.options.replicaId, f.runtime);
          handler.localServices = replacement;
        }
        return () => {
          released += 1;
          dispose();
        };
      }});
      handler = f.service.acquireReplicaHandler();
      handler.localServices.set(f.options.replicaId, f.runtime);
      const registry = handler.localServices;
      const before = registry.serviceListeners.size;
      try {
        const answer = await controlledObservation(handler, f.runtime, async () => {
          reads += 1;
          return {answer: {outcome: OUTCOME.UNAVAILABLE, missingFact: 'controlled-owner-read'}};
        });
        assert.equal(answer.outcome, OUTCOME.STALE);
        assert.equal(acquired, 1, 'the first native subscription exposes the changed owner');
        assert.equal(released, acquired, 'all resources remain with their acquisition owner');
        assert.equal(reads, 0, 'changed acquisition cannot start a canonical read');
        assert.equal(registry.serviceListeners.size, before);
        assert.equal(replacement.serviceListeners.size, 0);
      } finally {
        replacement?.clear();
        handler.localServices = registry;
        f.runtime.raft = port;
      }
    });

  test('partial original HOSTING is unavailable and failed cleanup keeps the exact runtime',
    async (t) => {
      const f = await openedOriginal(t, owners);
      const holder = f.service.replicaLifecycleOwner;
      const acquire = holder.acquire.bind(holder);
      const primary = new Error('controlled physical-host publication failure');
      const cleanup = new Error('controlled physical-host cleanup failure');
      let handler;
      let observed = 0;
      let detach;
      const shutdown = f.runtime.shutdown.bind(f.runtime);
      t.mock.method(holder, 'acquire', (options) => {
        const result = acquire(options);
        handler = result.replicaHandler;
        detach = handler.localServices.subscribeServiceChanges((change) => {
          if (change.service !== f.runtime) return;
          observed += 1;
          assert.throws(() => f.runtime.runtimePublication.assertCurrent(f.runtime), REFUSED,
            'the map callback cannot consume an unfinished hosting claim');
          assert.equal(handler.localReplicas.has(f.options.replicaId), false);
          throw primary;
        });
        return result;
      });
      try {
        assert.throws(() => f.service.acquireReplicaHandler(), (error) => error === primary);
        assert.equal(observed, 1, 'the actual registry publication reached its observer');
        assert.equal(handler.localServices.get(f.options.replicaId), f.runtime);
        assert.throws(() => f.runtime.runtimePublication.assertCurrent(f.runtime), REFUSED,
          'a written map cannot renew the refused claim');
        const answer = await readParticipantReleaseFacts(handler, f.runtime);
        assert.equal(answer.missingFact, HOSTING_FACT);
        detach();
        let release = false;
        f.runtime.shutdown = () => {
          if (!release) return Promise.reject(cleanup);
          return shutdown();
        };
        await assert.rejects(handler.shutdown(), (error) => error.errors.includes(cleanup));
        const debt = handler.pendingRuntimeShutdowns.get(f.runtime);
        assert.equal(debt.replicaId, f.options.replicaId);
        assert.equal(handler.localServices.get(f.options.replicaId), f.runtime);
        assert.equal(f.service.partitionServices.get(f.options.replicaId), f.runtime,
          'bootstrap retains exact resource custody until release completes');
        release = true;
        await handler.shutdown();
        assert.equal(handler.pendingRuntimeShutdowns.has(f.runtime), false);
      } finally {
        detach?.();
        f.runtime.shutdown = shutdown;
      }
    });

  for (const changed of ['preparation', 'host-map', 'lifecycle-holder']) {
    test(`canonical hosting transfer retains its source after reentrant ${changed} change`,
      async (t) => {
        const f = await openedOriginal(t, owners);
        const handler = f.service.acquireReplicaHandler();
        const info = await originalRegistrationInfo(f, handler);
        const host = f.service.partitionServices;
        const holder = f.service.replicaLifecycleOwner;
        const registry = handler.localServices;
        const setLocal = handler.setLocalReplica.bind(handler);
        const setService = registry.set.bind(registry);
        const setHost = host.set.bind(host);
        let observed = 0;
        let laterRegistryWrites = 0;
        let laterHostWrites = 0;
        registry.set = (...args) => {
          laterRegistryWrites += 1;
          return setService(...args);
        };
        host.set = (...args) => {
          laterHostWrites += 1;
          return setHost(...args);
        };
        handler.setLocalReplica = (...args) => {
          const record = setLocal(...args);
          observed += 1;
          if (changed === 'preparation') f.preparation.revoke();
          if (changed === 'host-map') f.service.partitionServices = new Map(host);
          if (changed === 'lifecycle-holder') {
            f.service.replicaLifecycleOwner = new ReplicaLifecycleOwner();
          }
          return record;
        };
        try {
          const expected = changed === 'preparation' ?
            {code: ORIGINAL_ALLOCATION.HOLD, reason: ORIGINAL_ALLOCATION_REASON.CLOSED} : REFUSED;
          assert.throws(() => handler.registerExistingReplica(info), expected);
          assert.equal(observed, 1, 'the canonical metadata effect reached its original observer');
          assert.equal(laterRegistryWrites, 0, 'revocation precedes the next physical registry write');
          assert.equal(laterHostWrites, 0, 'revocation precedes the next Bootstrap map write');
          assert.throws(() => f.runtime.runtimePublication.assertCurrent(f.runtime), REFUSED);
          assert.equal(registry.get(f.options.replicaId), f.runtime,
            'the exact partial resource remains in original cleanup custody');
          assert.equal(host.get(f.options.replicaId), f.runtime);
        } finally {
          handler.setLocalReplica = setLocal;
          registry.set = setService;
          host.set = setHost;
          f.service.partitionServices = host;
          f.service.replicaLifecycleOwner = holder;
        }
      });
  }

  test('canonical registration consumes only its exact original hosted runtime', async (t) => {
    const f = await openedOriginal(t, owners);
    const handler = f.service.acquireReplicaHandler();
    handler.localServices.set(f.options.replicaId, f.runtime);
    const owner = handler.replicaStateMachine;
    // Declared metadata transport seam: actual original right, row construction,
    // SQLite INSERT and confirming read, evidence seal and publication owners.
    // Replicated service registration/useful service remains the native seed root.
    const writer = new BootstrapSystemTableWriter({
      async insertSystemTableRow(table, row) {
        const parts = buildSystemTableMutationSqlParts(CDC_OPERATION.INSERT, row);
        commitDurably(f.runtime.db, () => f.runtime.db.prepare(
          `INSERT INTO ${table} (${parts.columns}) VALUES (${parts.placeholders})`).run(...parts.values));
        return {success: true, affectedRows: 1};
      },
      async readAuthoritativeRows(_table, sql, params) {
        return {success: true, rows: f.runtime.db.prepare(sql).all(...params)};
      },
    }, f.service.partitionServices);
    const rowOwner = new PartitionServiceRowOwner({systemTableWriter: writer,
      replicaStateMachine: owner});
    const registration = originalSeedServiceRegistration(f.preparation, f.options.replicaId, writer);
    const evidence = await rowOwner.registerReplica({partitionId: f.options.partitionId,
      replicaId: f.options.replicaId, nodeId: f.service.nodeId, service: f.runtime,
      status: SERVICE_STATUS.CREATING, originalRegistration: registration});
    const admission = captureReplicaAdmission(owner, f.options.replicaId);
    const installed = await turnChainValue(runSerializedReplicaMutation(owner, f.options.replicaId,
      () => settledTurn(installAuthoritativeReplicaLifecycleInLane(
        owner, f.options.replicaId, evidence, admission))));
    assertOriginalLifecycleInstalled(owner, f.options.replicaId, evidence, admission, installed);
    const info = {replicaId: f.options.replicaId, partitionId: f.options.partitionId,
      tableName: f.options.tableName, service: f.runtime, sourceEvidence: evidence,
      lifecycleOwner: owner, hostServices: f.service.partitionServices};
    const published = handler.registerExistingReplica(info);
    assert.equal(published.service, f.runtime);
    assert.equal(published.status, SERVICE_STATUS.CREATING);
    assert.equal(handler.registerExistingReplica(info), published,
      'repeated exact registration does not mint another lifecycle association');
    assert.equal(f.runtime.runtimePublication.isPublished(f.runtime, published.runtimeBinding), true);
    f.preparation.revoke();
    assert.equal(f.runtime.runtimePublication.assertCurrent(f.runtime), true,
      'canonical publication no longer borrows the retired preparation admission');
    await assert.rejects(f.service.seedPartitionsPhase.createBootstrapPartitionReplica(f.context),
      (error) => error?.code === 'ORIGINAL_ALLOCATION_HOLD',
      'a later startup attempt cannot renew preparation through a published runtime');
    assert.equal(handler.localServices.get(f.options.replicaId), f.runtime);
    assert.equal(handler.localReplicas.get(f.options.replicaId), published);
  });
}

export {registerOriginalSeedRuntimeHostingTests};
