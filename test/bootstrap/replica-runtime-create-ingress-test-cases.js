import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/tables.js';
import {CREATE_ADMISSION_STATE} from '../../src/node/replica-create-admission-owner.js';
import {isReplicaCreateAdmissionEvidence} from '../../src/node/replica-create-admission-evidence.js';
import {TrackedServiceRegistry} from '../../src/node/replica-handler-membership-relay.js';
import {PARTITION_RUNTIME_PUBLICATION_REFUSED} from
  '../../src/partition/partition-runtime-publication.js';
import {ReplicaOperationResponseStatus} from '../../src/rebalancer/replica-operation-constants.js';
import {buildReplicaCreateAdmissionToken, buildReplicaCreateAttemptToken} from
  '../../src/rebalancer/replica-create-admission-token.js';
import {operationRow, routedCreateRequest, sqlOperationsAuthority} from
  '../test-helpers/replica-create-admission-recovery-fixture.js';

// Actual request/admission/queue owners and actual SQLite operation CAS over
// an explicitly retained ACTIVE birth. The context producer stops before
// native construction. This does not prove a fresh CREATE or allocation.
function admittedIngressFixture(t, makeBootstrap, name) {
  const operationId = `factory-ingress-${name}`;
  const admissionToken = buildReplicaCreateAdmissionToken({operationId,
    replicaId: 'factory-p1-r1', targetNodeId: 'factory-seed', workflowUpdatedAt: 11});
  const attemptToken = buildReplicaCreateAttemptToken(admissionToken, 1);
  const f = makeBootstrap(t, {createAttemptToken: attemptToken});
  const operation = operationRow({operation_id: operationId,
    entity_id: f.row.partition_id, partition_id: f.row.partition_id,
    replica_id: f.row.replica_id, target_node_id: f.row.node_id,
    create_admission_token: admissionToken,
    create_admission_attempt_token: attemptToken,
    create_admission_replica_created_at: f.row.created_at,
    create_admission_state: CREATE_ADMISSION_STATE.MATERIALIZED,
    create_admission_owner_incarnation: f.handler.ownerIncarnation});
  const authority = sqlOperationsAuthority(f.store.cache, [operation], f.handler.ownerIncarnation);
  f.handler.controlPlaneSystemTableGateway = authority.gateway;
  f.owner.controlPlaneSystemTableGateway = authority.gateway;
  const admissionOwner = f.handler.getReplicaCreateAdmissionOwner();
  t.teardown(async () => { await f.handler.shutdown(); authority.close(); });
  const effects = {context: 0, metadata: 0, failedProjection: 0};
  const setLocal = f.handler.setLocalReplica.bind(f.handler);
  f.handler.setLocalReplica = (...args) => {
    effects.metadata += 1;
    return setLocal(...args);
  };
  const persistFailed = f.handler.persistOrConfirmReplicaCreateFailed.bind(f.handler);
  f.handler.persistOrConfirmReplicaCreateFailed = (...args) => {
    effects.failedProjection += 1;
    return persistFailed(...args);
  };
  f.handler.resolveReplicaContextWithRetry = async () => {
    effects.context += 1;
    throw Object.assign(new Error('fixture context reached before native opening'),
      {code: 'FIXTURE_CONTEXT_REACHED'});
  };
  return {...f, effects, authority, admissionOwner,
    request: routedCreateRequest(operation), operationId};
}

function lifecycleRow(f) {
  return f.authority.lifecycleStore.durableRow(TABLES.SERVICES, f.row.replica_id);
}

async function settleQueuedTasks(f) {
  await Promise.allSettled([...f.handler.operationTasks]);
}

function retainScheduledCreate(f) {
  const ready = Promise.withResolvers();
  const start = f.handler.startCreateReplicaAsync.bind(f.handler);
  let scheduled;
  f.handler.startCreateReplicaAsync = (request) => {
    // Hold exactly this synchronous scheduling call. The host scheduler is
    // restored before any await or other fixture work can run.
    const schedule = globalThis.setImmediate;
    try {
      globalThis.setImmediate = (callback, ...args) => {
        scheduled = {request, run: () => callback(...args)};
        return Object.freeze({});
      };
      start(request);
    } finally {
      globalThis.setImmediate = schedule;
    }
    ready.resolve(scheduled);
  };
  return ready.promise;
}

async function requireQueue(t, f, scheduled, pending) {
  const observed = await Promise.race([scheduled,
    pending.then((answer) => ({answer}), (error) => ({error}))]);
  t.ok(observed?.run, 'the real public CREATE reached its existing queue');
  return observed?.run ? observed : null;
}

function assertNoLaterEffects(t, f, before) {
  t.same(f.effects, {context: 0, metadata: 0, failedProjection: 0},
    'an obsolete invocation cannot reach construction context or success/failure projection');
  t.same(lifecycleRow(f), before, 'the original canonical lifecycle row is unchanged');
}

function registerReplicaRuntimeCreateIngressTests({bootstrapFactoryFixture, publishSuccessor}) {
  for (const boundary of ['cleanup-barrier', 'ledger-claim']) {
    for (const changed of ['host', 'unchanged']) {
      test(`public CREATE retains its original producer across ${boundary}: ${changed}`, async (t) => {
        const f = admittedIngressFixture(t, bootstrapFactoryFixture, `${boundary}-${changed}`);
        const entered = Promise.withResolvers();
        const release = Promise.withResolvers();
        let original;
        if (boundary === 'cleanup-barrier') {
          original = f.handler.awaitRemovedReplicaCleanupAdmissionBarrier.bind(f.handler);
          f.handler.awaitRemovedReplicaCleanupAdmissionBarrier = async () => {
            await original();
            entered.resolve(true);
            await release.promise;
          };
        } else {
          original = f.admissionOwner.claim.bind(f.admissionOwner);
          f.admissionOwner.claim = async (...args) => {
            const evidence = await original(...args);
            entered.resolve(evidence);
            await release.promise;
            return evidence;
          };
          t.teardown(() => { f.admissionOwner.claim = original; });
        }
        const before = lifecycleRow(f);
        const pending = f.handler.handleCreateReplica(f.request).then(
          (answer) => ({answer}), (error) => ({error}));
        const reached = await Promise.race([entered.promise, pending]);
        const engaged = boundary === 'ledger-claim' ? isReplicaCreateAdmissionEvidence(reached) : reached === true;
        t.equal(engaged, true, 'the actual owner completed the declared held boundary');
        if (changed === 'host') f.service.partitionServices = new Map();
        release.resolve();
        const completion = await pending;
        await settleQueuedTasks(f);
        if (!engaged) return;
        if (changed === 'unchanged') {
          t.equal(completion.answer?.status, ReplicaOperationResponseStatus.INITIATED);
          t.equal(f.effects.context, 1, 'the unchanged admission reaches the real next producer');
        } else {
          t.equal(completion.error?.code ?? completion.answer?.errorCode,
            PARTITION_RUNTIME_PUBLICATION_REFUSED);
          assertNoLaterEffects(t, f, before);
        }
      });
    }
  }

  for (const changed of ['host', 'unchanged']) {
    test(`queued CREATE keeps the request-entry producer: ${changed}`, async (t) => {
      const f = admittedIngressFixture(t, bootstrapFactoryFixture, `queue-${changed}`);
      const scheduled = retainScheduledCreate(f);
      const pending = f.handler.handleCreateReplica(f.request);
      const queued = await requireQueue(t, f, scheduled, pending);
      if (!queued) return;
      const answer = await pending;
      t.equal(answer.status, ReplicaOperationResponseStatus.INITIATED);
      const before = lifecycleRow(f);
      if (changed === 'host') f.service.partitionServices = new Map();
      queued.run();
      await settleQueuedTasks(f);
      if (changed === 'unchanged') {
        t.equal(f.effects.context, 1, 'the original scheduled work reaches context');
      } else {
        assertNoLaterEffects(t, f, before);
      }
    });
  }

  for (const placement of ['same-maps', 'replaced-maps']) {
    test(`queued refusal cannot erase a successor or replacement operation cell: ${placement}`, async (t) => {
      const f = admittedIngressFixture(t, bootstrapFactoryFixture, `queue-custody-${placement}`);
      const scheduled = retainScheduledCreate(f);
      const pending = f.handler.handleCreateReplica(f.request);
      const queued = await requireQueue(t, f, scheduled, pending);
      if (!queued) return;
      await pending;
      const originalOperations = f.handler.inProgressOperations;
      const originalOperation = originalOperations.get(f.operationId);
      t.ok(originalOperation, 'the queued invocation owns an actual operation record');
      if (placement === 'replaced-maps') {
        f.handler.localServices = new TrackedServiceRegistry();
        f.handler.localReplicas = new Map();
        f.handler.inProgressOperations = new Map();
        f.service.partitionServices = new Map();
      }
      const successor = await publishSuccessor(t, f, f.handler, f.service.partitionServices);
      const successorRecord = f.handler.localReplicas.get(f.row.replica_id);
      const successorOperation = Object.freeze({...originalOperation,
        startedAt: originalOperation.startedAt + 1});
      f.handler.inProgressOperations.set(f.operationId, successorOperation);
      const oldClaim = queued.request.createPhysicalWorkerClaim;
      t.equal(f.admissionOwner.releasePhysicalWorker(oldClaim), true);
      const successorClaim = await f.admissionOwner.claimPhysicalWorker(queued.request.createAdmissionEvidence);
      t.ok(successorClaim, 'the same real admission owner issued a later exact worker cell');
      f.handler.shuttingDown = true;
      queued.run();
      await settleQueuedTasks(f);
      t.equal(f.handler.localServices.get(f.row.replica_id), successor);
      t.equal(f.handler.localReplicas.get(f.row.replica_id), successorRecord);
      t.equal(f.service.partitionServices.get(f.row.replica_id), successor);
      t.equal(successor.isShutdown, false, 'queued preconstruction refusal owns no successor runtime');
      t.equal(f.handler.inProgressOperations.get(f.operationId), successorOperation);
      t.equal(f.admissionOwner.activePhysicalWorkerOperationIds.get(f.operationId), successorClaim,
        'the obsolete completion cannot release the replacement worker cell');
      if (placement === 'replaced-maps') {
        t.equal(originalOperations.has(f.operationId), false,
          'the original invocation still releases its own retained operation record');
      }
      t.equal(f.effects.context, 0, 'refusal occurs before construction context');
    });
  }
}

export {registerReplicaRuntimeCreateIngressTests};
