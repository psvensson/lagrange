// Independent U1 v3 physical-owner witnesses (D2 clarification and section 10).
// The existing C6 embedding supplies real SQLite owners, native raft-rs objects,
// real files and the data-directory process owner. Paused/failing collaborator
// seams below control ordering; they never manufacture an authority answer.
// This is component/process-custody evidence, not abrupt-process or multi-host
// consensus proof. Expected new vocabulary is literal so an absent new module
// cannot prevent the other independent red cases from executing.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {embedding} from './bound-creation-handler-embedding-fixture.js';
import {consensusBootstrapDescriptor} from '../../src/service/service-consensus-bootstrap.js';
import {PREPARE_STATUS, START_STATUS} from '../../src/runtime/runtime-driver.js';
import {WASM_SERVICE_REPLICA_STATE as STATE} from
  '../../src/wasm-service/wasm-service-constants.js';
import {runtimeServiceConsensusIdentity} from
  '../../src/rebalancer/runtime-service-replica-identity.js';
import {captureConsensusCreationIntent} from '../../src/service/service-consensus-creation-intent.js';
import {ReplicaOperationMessageType as MESSAGE} from
  '../../src/rebalancer/replica-operation-constants.js';
import {EXECUTOR_OUTCOME_TYPE as EXECUTOR} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {deriveEndpointId} from '../../src/runtime/runtime-endpoint-writer.js';

const TURNS = 4;
const CLEANUP_FAULT = 'INDEPENDENT_EXACT_HANDLER_RETIREMENT_FAILURE';
const OTHER_RUNTIME = 'fixture/other-valid-runtime-reference';

async function turns() {
  for (let index = 0; index < TURNS; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function retainedHost(t) {
  const e = await embedding(t);
  const host = await e.addHost(0);
  const retained = await e.retain(host);
  assert.equal(retained.outcome, 'ADMISSION_RETAINED');
  const owned = {serviceId: e.serviceId, definition: consensusBootstrapDescriptor(retained),
    consensusCreation: retained, consensusOpeningOwner: host.manager};
  return {e, host, retained, owned};
}

async function preparedHost(t) {
  const world = await retainedHost(t);
  const {e, host, owned} = world;
  assert.equal((await host.driver.prepare(owned.definition, owned)).status, PREPARE_STATUS.READY);
  return {...world, replica: e.replicaOf(host)};
}

function createExact(host, retained) {
  const definition = JSON.parse(retained.intent.descriptor.runtimeConfig).definition;
  return host.lifecycle.createReplica(
    {...definition, serviceId: retained.intent.descriptor.serviceId},
    {consensusCreation: retained, consensusOpeningOwner: host.manager});
}

function current(host, retained) {
  assert.equal(typeof host.lifecycle.observeCurrentCreation, 'function',
    'PHYSICAL_OWNER_CURRENTNESS_OBSERVATION_MISSING');
  const answer = host.lifecycle.observeCurrentCreation(retained);
  assert.notEqual(typeof answer?.then, 'function', 'CURRENTNESS_MUST_BE_SYNCHRONOUS');
  return answer.outcome;
}

function changedIntent(retained) {
  const changed = structuredClone(retained);
  changed.intent.descriptor.runtimeRef = OTHER_RUNTIME;
  // The counterexample changes a valid immutable body field, not malformed
  // data or the slot token. Token-only comparison would incorrectly accept it.
  captureConsensusCreationIntent(changed.intent);
  assert.deepEqual(changed.token, retained.token);
  return changed;
}

function localPath(host, retained) {
  const identity = runtimeServiceConsensusIdentity(retained.intent.consensusBinding,
    retained.intent.consensusSlotRequest);
  return host.dataDirectoryManager.getWasmServiceDbPath(identity.groupId, identity.replicaId);
}

function localRecord(host, retained) {
  const database = new Database(localPath(host, retained), {readonly: true, fileMustExist: true});
  try {
    return JSON.parse(database.prepare('SELECT record FROM _wasm_creation_local WHERE id = 1')
      .get().record);
  } finally {
    database.close();
  }
}

async function advanceHistory(e) {
  for (const nonce of [201, 202]) {
    const state = e.metadata.state();
    const answer = await e.metadata.primary.selectConsensusInstance(
      e.metadata.request(state.version, nonce, state.selected.binding.incarnation));
    assert.equal(answer.outcome, 'SELECTED', 'real owner must advance the binding history');
  }
}

test('U1 services-row publication: a current retained origin admits one PRESENT mark',
  async (t) => {
    const {e, host, retained, replica} = await preparedHost(t);
    assert.equal(current(host, retained), 'CURRENT',
      'the real retained origin is current through its physical owner');
    assert.deepEqual({...replica.servicesRow}, {state: 'ABSENT', serviceType: null});

    const token = retained.token;
    // Exact token identity is necessary but never sufficient: the
    // physical owner validates the whole retained creation first.
    const stale = {...token, operationId: `${token.operationId}-other`};
    replica.pendingRoleUpdate = null;
    assert.equal(host.lifecycle.enableServicesRowPublication(e.serviceId,
      'runtime_service', stale).outcome, 'NOT_REGISTERED',
    'WRONG_TOKEN_MARKED_CURRENT_REPLICA_PRESENT');
    assert.deepEqual({...replica.servicesRow}, {state: 'ABSENT', serviceType: null});
    assert.equal(replica.pendingRoleUpdate, null, 'REFUSED_MARK_QUEUED_ROLE_EFFECT');

    // The runtime's completion call after row projection: the local latch
    // records service_type and publishes the role once for this exact token.
    assert.equal(host.lifecycle.enableServicesRowPublication(e.serviceId,
      'runtime_service', token).outcome, 'PRESENT');
    assert.deepEqual({...replica.servicesRow},
      {state: 'PRESENT', serviceType: 'runtime_service'});
    replica.pendingRoleUpdate = null;
    assert.equal(host.lifecycle.enableServicesRowPublication(e.serviceId,
      'runtime_service', token).outcome, 'ALREADY_PRESENT');
    assert.equal(replica.pendingRoleUpdate, null, 'PRESENT_LATCH_REPLAYED_THE_ROLE');

    const stopping = replica.shutdown();
    assert.equal(current(host, retained), 'UNAVAILABLE',
      'STOPPING never grants publication after its shutdown fence');
    assert.equal(host.lifecycle.enableServicesRowPublication(e.serviceId,
      'runtime_service', token).outcome, 'NOT_REGISTERED',
    'STOPPING_REPLICA_REPUBLISHED_AFTER_FENCE');
    await stopping;
  });

test('U1 physical owner: CREATED, STARTING and READY are current; fenced objects remain held',
  async (t) => {
    const {e, host, retained, owned, replica} = await preparedHost(t);
    assert.equal(replica.lifecycleState, STATE.CREATED);
    assert.equal(replica.live, false, 'resource custody differs from start admission');
    assert.equal(current(host, retained), 'CURRENT', 'CREATED_ORIGIN_MUST_REMAIN_STARTABLE');
    const opening = replica.initialize();
    assert.equal(replica.lifecycleState, STATE.STARTING);
    assert.equal(current(host, retained), 'CURRENT');
    await opening;
    assert.equal(replica.lifecycleState, STATE.READY);
    assert.equal(current(host, retained), 'CURRENT');
    assert.equal((await host.driver.start(owned)).status, 'BOOTSTRAPPED_HELD',
      'the ordinary bound prepare/start path remains reachable');
    const stopping = replica.shutdown();
    assert.equal(replica.lifecycleState, STATE.STOPPING);
    assert.equal(current(host, retained), 'UNAVAILABLE', 'STOPPING_IS_NOT_ABSENT');
    assert.equal(current(host, changedIntent(retained)), 'DIFFERENT',
      'different origin is distinguished before lifecycle-state admission');
    await stopping;
    assert.strictEqual(e.replicaOf(host), replica, 'direct stop still leaves the registered object');
    assert.equal(replica.lifecycleState, STATE.STOPPED);
    assert.equal(current(host, retained), 'UNAVAILABLE', 'STOPPED_BUT_REGISTERED_IS_NOT_ABSENT');
    await host.lifecycle.stopReplica(e.serviceId);
    assert.equal(current(host, retained), 'ABSENT');
    await host.lifecycle.shutdownAll();
    assert.equal(current(host, retained), 'UNAVAILABLE', 'closed lifetime takes precedence');
  });

test('U1 physical owner: full intent identity is compared even when the token is identical',
  async (t) => {
    const {host, retained, replica} = await preparedHost(t);
    const changed = changedIntent(retained);
    assert.equal(current(host, changed), 'DIFFERENT', 'TOKEN_ONLY_COMPARISON_ACCEPTED_OTHER_INTENT');
    assert.equal(current(host, retained), 'CURRENT');
    assert.equal(replica.lifecycleState, STATE.CREATED);
    assert.equal(fs.existsSync(localPath(host, retained)), false, 'observation never opens storage');
  });

test('U1 physical owner: actual failed cleanup is unavailable while its resource custody stays live',
  async (t) => {
    const {e, host, retained, replica} = await preparedHost(t);
    await replica.initialize();
    const unregister = e.transport.unregisterExact;
    e.transport.unregisterExact = () => {
      throw new Error(CLEANUP_FAULT);
    };
    try {
      await assert.rejects(host.lifecycle.stopReplica(e.serviceId), {message: CLEANUP_FAULT});
      assert.equal(replica.lifecycleState, STATE.CLEANUP_REQUIRED);
      assert.equal(replica.live, true, 'the old cleanup still blocks replacement');
      assert.equal(replica.db.open, true, 'fault engaged before database release');
      assert.equal(current(host, retained), 'UNAVAILABLE', 'CLEANUP_REQUIRED_MUST_NOT_GRANT_START');
      assert.equal(current(host, changedIntent(retained)), 'DIFFERENT');
    } finally {
      e.transport.unregisterExact = unregister;
      await host.lifecycle.stopReplica(e.serviceId);
    }
  });

test('U1 retirement custody: failed activity stop after closing DB remains unresolved',
  async (t) => {
    const {host, retained, replica} = await preparedHost(t);
    await replica.initialize();
    const original = replica.roleMutationHelper.shutdown.bind(replica.roleMutationHelper);
    let faults = 0;
    replica.roleMutationHelper.shutdown = () => {
      faults += 1;
      if (faults === 1) throw new Error('U1_ACTIVITY_RETIREMENT_FAILED_AFTER_FENCE');
      return original();
    };
    let first;
    try {
      // Real metadata release, native shutdown and local tombstone. Only one
      // synchronous activity cleanup seam is faulted.
      first = await host.lifecycle.retireReplica(retained);
    } finally {
      replica.roleMutationHelper.shutdown = original;
    }
    assert.equal(faults, 1, 'the admitted local stop actually reached its fault');
    assert.equal(replica.lifecycleState, STATE.CLEANUP_REQUIRED);
    assert.equal(replica.db, null, 'native file closure finished before activity cleanup settled');
    assert.equal(host.lifecycle.retiringReplicas.has(replica), true,
      'FAILED_ACTIVITY_STOP_LOST_EXACT_RETRY_CUSTODY');
    assert.equal(first.closed, false,
      'INCOMPLETE_ACTIVITY_CLEANUP_CLOSED_ORIGINAL_CREATION_JOURNAL');
    assert.equal(first.finality, 'UNRESOLVED',
      'INCOMPLETE_ACTIVITY_CLEANUP_CLAIMED_PERMANENT_FINALITY');
    const second = await host.lifecycle.retireReplica(retained);
    assert.equal(second.finality, 'FINAL', 'owner retry settles the same original creation');
    assert.equal(second.closed, true);
    assert.equal(host.lifecycle.retiringReplicas.has(replica), false,
      'successful owned retry did not release the exact retired object');
  });

test('U1 retirement custody: registration precedes a synchronously reentrant shutdown', async (t) => {
  const {e, host, retained} = await retainedHost(t);
  const releaseResource = e.metadata.primary.releaseInstanceResource.bind(e.metadata.primary);
  const release = Promise.withResolvers();
  let shutdown = null;
  let shutdownFinished = false;
  let calls = 0;
  e.metadata.primary.releaseInstanceResource = (...args) => {
    calls += 1;
    shutdown = host.lifecycle.shutdownAll().then(() => {
      shutdownFinished = true;
    });
    return release.promise.then(() => releaseResource(...args));
  };
  const retirement = host.lifecycle.retireReplica(retained);
  try {
    await turns();
    assert.equal(calls, 1, 'the real metadata-release boundary was reached');
    assert.equal(shutdownFinished, false, 'REENTRANT_SHUTDOWN_MISSED_ADMITTED_RETIREMENT');
    const afterFence = host.lifecycle.retireReplica(retained);
    await turns();
    assert.equal(calls, 1, 'a post-fence duplicate did not reenter metadata');
    release.resolve();
    assert.equal((await afterFence).outcome, 'UNAVAILABLE', 'retirement admission stays closed');
  } finally {
    release.resolve();
    e.metadata.primary.releaseInstanceResource = releaseResource;
    await Promise.allSettled([retirement, shutdown]);
  }
  assert.equal((await retirement).finality, 'FINAL');
  assert.equal(shutdownFinished, true);
});

test('U1 retirement custody: equal requests coalesce and an operation-id body collision is refused',
  async (t) => {
    const {e, host, retained} = await retainedHost(t);
    const releaseResource = e.metadata.primary.releaseInstanceResource.bind(e.metadata.primary);
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    let calls = 0;
    e.metadata.primary.releaseInstanceResource = async (...args) => {
      calls += 1;
      entered.resolve();
      await release.promise;
      return releaseResource(...args);
    };
    const first = host.lifecycle.retireReplica(retained);
    const repeats = [];
    try {
      await entered.promise;
      for (let index = 0; index < 20; index += 1) {
        repeats.push(host.lifecycle.retireReplica(structuredClone(retained)));
      }
      const conflict = host.lifecycle.retireReplica(changedIntent(retained));
      // Avoid awaiting the old faulty implementation's second metadata call
      // until its gate is released, while retaining a direct content oracle.
      repeats.push(conflict);
      await turns();
      assert.equal(calls, 1, 'DUPLICATE_OR_CONFLICTING_RETIREMENT_ENTERED_OWNER_AGAIN');
      release.resolve();
      const answers = await Promise.all(repeats);
      assert.equal(answers.at(-1).outcome, 'CONTENT_CONFLICT', 'CHANGED_BODY_JOINED_ORIGINAL_TASK');
      assert.ok(answers.slice(0, -1).every((answer) => answer.finality === 'FINAL'));
    } finally {
      release.resolve();
      e.metadata.primary.releaseInstanceResource = releaseResource;
      await Promise.allSettled([first, ...repeats]);
    }
    assert.equal((await first).finality, 'FINAL');
  });

test('U1 retirement custody: shutdown retry preserves a failed retirement tombstone obligation',
  async (t) => {
    const {e, host, retained, replica} = await preparedHost(t);
    await replica.initialize();
    assert.equal(localRecord(host, retained).phase, 'ADMITTED');
    const unregister = e.transport.unregisterExact;
    e.transport.unregisterExact = () => {
      throw new Error(CLEANUP_FAULT);
    };
    let result;
    try {
      result = await host.lifecycle.retireReplica(retained);
    } finally {
      e.transport.unregisterExact = unregister;
    }
    assert.equal(result.retired, false);
    assert.equal(replica.db.open, true, 'the failed retirement still holds the original file');
    assert.equal(localRecord(host, retained).phase, 'ADMITTED', 'the fault precedes the tombstone');
    await host.lifecycle.shutdownAll();
    assert.equal(localRecord(host, retained).phase, 'RETIRED',
      'SHUTDOWN_RETRY_DROPPED_THE_ADMITTED_RETIREMENT_INTENT');
    assert.equal(replica.db, null);
    assert.equal(e.replicaOf(host), null);
  });

test('U1 retirement custody: joining an ordinary stop retains debt when that stop fails',
  async (t) => {
    const {e, host, retained, replica} = await preparedHost(t);
    await replica.initialize();
    const shutdown = replica.creationReconciliation.shutdown.bind(replica.creationReconciliation);
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    // LABELLED SEAM: pause the actual ordinary shutdown before the real exact
    // handler retirement fails. The later request must retain its own debt.
    replica.creationReconciliation.shutdown = async () => {
      entered.resolve();
      await release.promise;
      return shutdown();
    };
    const unregister = e.transport.unregisterExact;
    e.transport.unregisterExact = () => {
      throw new Error(CLEANUP_FAULT);
    };
    const stopping = replica.shutdown().then(() => null, (error) => error);
    let retirement;
    let result;
    try {
      await entered.promise;
      assert.equal(replica.lifecycleState, STATE.STOPPING);
      retirement = host.lifecycle.retireReplica(retained);
      await turns();
      assert.equal(e.metadata.state().selected.resources[host.slot].phase, 'RELEASING',
        'the real retirement reached its owner while the ordinary stop was paused');
      release.resolve();
      assert.equal((await stopping)?.message, CLEANUP_FAULT);
      result = await retirement;
    } finally {
      release.resolve();
      replica.creationReconciliation.shutdown = shutdown;
      e.transport.unregisterExact = unregister;
      await Promise.allSettled([stopping, retirement]);
    }
    assert.equal(result.retired, false);
    assert.equal(replica.lifecycleState, STATE.CLEANUP_REQUIRED);
    assert.equal(replica.db.open, true);
    assert.equal(localRecord(host, retained).phase, 'ADMITTED');
    await host.lifecycle.shutdownAll();
    assert.equal(localRecord(host, retained).phase, 'RETIRED',
      'JOINED_ORDINARY_STOP_DROPPED_THE_ADMITTED_RETIREMENT_INTENT');
    assert.equal(replica.db, null);
    assert.equal(e.replicaOf(host), null);
  });

test('U1 physical admission: a directly stopping object blocks a second bound object',
  async (t) => {
    const {e, host, retained, replica} = await preparedHost(t);
    await replica.initialize();
    const shutdown = replica.creationReconciliation.shutdown.bind(replica.creationReconciliation);
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    replica.creationReconciliation.shutdown = async () => {
      entered.resolve();
      await release.promise;
      return shutdown();
    };
    const stopping = replica.shutdown();
    try {
      await entered.promise;
      assert.equal(replica.lifecycleState, STATE.STOPPING);
      assert.equal(host.lifecycle.retiringReplicas.has(replica), false,
        'direct ordinary shutdown has not passed through lifecycle retirement');
      assert.throws(() => createExact(host, retained), {code: 'wasm_service_replica_live'},
        'DIRECT_STOPPING_OBJECT_DID_NOT_FENCE_BOUND_RECREATION');
      assert.strictEqual(e.replicaOf(host), replica, 'the held object keeps physical registration');
      assert.equal(replica.db.open, true, 'its original database is still held');
    } finally {
      release.resolve();
      replica.creationReconciliation.shutdown = shutdown;
      await stopping;
    }
    await host.lifecycle.stopReplica(e.serviceId);
    const successor = createExact(host, retained);
    assert.notStrictEqual(successor, replica, 'settled ordinary cleanup permits explicit recreation');
    assert.equal(successor.lifecycleState, STATE.CREATED);
  });

for (const opened of [true, false]) {
  test(`U1 retirement finality: lost metadata history with ${opened ? 'RETIRED' : 'missing'} storage`,
    async (t) => {
      const {e, host, retained} = opened ? await preparedHost(t) : await retainedHost(t);
      if (opened) await e.replicaOf(host).initialize();
      const initial = await host.lifecycle.retireReplica(retained);
      assert.equal(initial.closed, true, 'initial retirement used the real CLOSED owner');
      assert.equal(fs.existsSync(localPath(host, retained)), opened);
      if (opened) assert.equal(localRecord(host, retained).phase, 'RETIRED');
      await advanceHistory(e);
      const history = await e.metadata.primary.closeInstanceResource(
        retained.intent.consensusBinding, retained.token);
      assert.equal(history.outcome, 'HISTORY_UNAVAILABLE', 'genuine bounded owner history');
      const result = await host.lifecycle.retireReplica(retained);
      assert.equal(result.close.outcome, 'HISTORY_UNAVAILABLE', 'raw evidence is preserved');
      assert.equal(result.closed, false, 'history is not an acknowledged CLOSED CAS');
      assert.equal(result.finality, opened ? 'FINAL' : 'UNRESOLVED',
        opened ? 'EXACT_RETIRED_HISTORY_DID_NOT_PROVE_PHYSICAL_FINALITY' :
          'STORAGE_ABSENCE_WAS_MISTAKEN_FOR_A_RETIRED_TOMBSTONE');
    });
}

test('U1 driver admission: a stale prepared origin cannot start the physically current successor',
  async (t) => {
    const {e, host, retained, owned} = await preparedHost(t);
    assert.equal((await host.lifecycle.retireReplica(retained)).closed, true);
    const selected = await e.metadata.primary.selectConsensusInstance(
      e.metadata.request(1, 203, retained.intent.consensusBinding.incarnation));
    assert.equal(selected.outcome, 'SELECTED');
    const intent = e.intentFor(host.slot, selected.binding, 'physical-successor');
    const successor = await host.manager.prepareConsensusCreation(intent);
    assert.equal(successor.outcome, 'ADMISSION_RETAINED');
    const successorOwned = {serviceId: e.serviceId,
      definition: consensusBootstrapDescriptor(successor), consensusCreation: successor,
      consensusOpeningOwner: host.manager};
    assert.equal((await host.driver.prepare(successorOwned.definition, successorOwned)).status,
      PREPARE_STATUS.READY);
    const replica = e.replicaOf(host);
    assert.equal(replica.lifecycleState, STATE.CREATED);
    // LABELLED SEAM: a retained pre-await pointer is presented after the real
    // successor obtained physical custody. It is not an admission authority.
    host.driver._prepared.set(e.serviceId, owned.definition);
    const start = host.lifecycle.startReplica.bind(host.lifecycle);
    let calls = 0;
    host.lifecycle.startReplica = (...args) => {
      calls += 1;
      return start(...args);
    };
    const answer = await host.driver.start(owned);
    assert.equal(calls, 0, 'OLD_CONTEXT_STARTED_A_SUCCESSOR_THROUGH_SERVICE_ID');
    assert.equal(answer.status, START_STATUS.FAILED);
    assert.strictEqual(e.replicaOf(host), replica);
    assert.equal(replica.lifecycleState, STATE.CREATED);
    assert.equal(fs.existsSync(localPath(host, successor)), false);
  });

async function publishedWorld(t) {
  const e = await embedding(t);
  for (let slot = 0; slot < 3; slot += 1) {
    const host = await e.addHost(slot);
    host.retained = await e.retain(host);
    assert.equal(host.retained.outcome, 'ADMISSION_RETAINED');
  }
  for (const host of e.hosts) await e.dispatch(host, MESSAGE.CREATE_REPLICA);
  const eachAnswered = (type) => e.hosts.every((host) => e.outcomeTypes(host).includes(type));
  await e.settle(() => eachAnswered(EXECUTOR.RUNTIME_SERVICE_CREATE_HELD), 'custody founders held');
  await e.form();
  await e.settle(() => eachAnswered(EXECUTOR.RUNTIME_SERVICE_CREATE_ACTIVE),
    'custody founders published');
  return e;
}

for (const fault of ['throw', 'retained', 'absent']) {
  test(`U1 retirement debt: ${fault} STOPPED projection cannot complete the original journal`,
    async (t) => {
      const e = await publishedWorld(t);
      const host = e.hosts[0];
      const retained = host.retained;
      const physical = runtimeServiceConsensusIdentity(retained.intent.consensusBinding,
        retained.intent.consensusSlotRequest);
      const originalRow = () => e.metadata.db.prepare(
        'SELECT * FROM wasm_operations WHERE operation_id = ?').get(retained.operationId);
      const serviceRow = () => e.rows('services').find((row) =>
        row.service_id === physical.replicaId);
      assert.equal(serviceRow().status, 'active', 'real native publication created the old row');
      assert.equal(originalRow().state, 'in_progress');
      const journalCount = e.rows('wasm_operations').length;
      const writer = host.runtime._stateProjectionWriter;
      let calls = 0;
      // LABELLED SEAM: only the exact old STOPPED projection is withheld.
      // The native publication, local retirement and metadata close are real.
      host.runtime._stateProjectionWriter = fault === 'absent' ? null : async (...args) => {
        if (args[0] !== physical.replicaId || args[1].status !== 'stopped') return writer(...args);
        calls += 1;
        if (fault === 'throw') throw new Error('INDEPENDENT_STOPPED_PROJECTION_FAILURE');
        return {retained: true};
      };
      const owned = {definition: consensusBootstrapDescriptor(retained),
        consensusCreation: retained, consensusOpeningOwner: host.manager};
      let result;
      try {
        result = await host.manager.stopReplica(owned);
        assert.equal(e.metadata.state().selected.resources[host.slot].phase, 'CLOSED');
        assert.equal(localRecord(host, retained).phase, 'RETIRED');
        assert.equal(serviceRow().status, 'active', 'the withheld services effect remains owed');
        assert.equal(originalRow().state, 'in_progress',
          'ORIGINAL_JOURNAL_COMPLETED_BEFORE_ITS_STOPPED_PROJECTION');
        assert.equal(result.finality, 'FINAL', 'physical finality remains separately visible');
        assert.equal(result.status, 'RETIRED_UNPROJECTED');
        assert.equal(result.completion, undefined);
        assert.equal(calls, fault === 'absent' ? 0 : 1);
      } finally {
        host.runtime._stateProjectionWriter = writer;
      }
      const retried = await host.manager.stopReplica(owned);
      assert.equal(retried.completion.outcome, 'CREATION_ROW_COMPLETED');
      assert.equal(originalRow().state, 'completed');
      assert.equal(serviceRow(), undefined);
      assert.equal(e.rows('wasm_operations').length, journalCount, 'no generic STOP journal');
      assert.ok(e.rows('wasm_operations').filter((row) => row.operation_id !== retained.operationId)
        .every((row) => row.state === 'in_progress'), 'other original journals stay live');
    });
}

// NEW reconstruction of the five actual-return obligations described in
// u1-post-await-independent-oracle-verdict-20261019.md. These are new bytes,
// requiring their own review and execution; the unavailable nineteen-case
// checkpoint's approval and measurements do not transfer to this candidate.
// All fourteen preceding cases are preserved unchanged.
const RETURN_SUCCESSOR_NONCE = 211;

function returnedOriginHandle(host, retained) {
  return {serviceId: retained.intent.descriptor.serviceId,
    definition: consensusBootstrapDescriptor(retained), consensusCreation: retained,
    consensusOpeningOwner: host.manager};
}

// LABELLED actual-return seam: the original collaborator has completed its
// real effect before delivery of its exact answer is withheld. Only the first
// matching completed call pauses; retirement and J's later calls run normally.
function pauseOwnerReturn(owner, method, matches) {
  const original = owner[method];
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  let held = false;
  owner[method] = async function(...args) {
    const answer = await Reflect.apply(original, this, args);
    if (!held && matches(answer, args)) {
      held = true;
      entered.resolve({answer, args});
      await release.promise;
    }
    return answer;
  };
  return {
    release: release.resolve,
    restore: () => {
      owner[method] = original;
    },
    wait: (pending) => Promise.race([entered.promise, pending.then((answer) => {
      assert.fail(`${method}: original call settled before the required return seam: ` +
        JSON.stringify(answer));
    })]),
  };
}

// An invocation observer returns the owner's original value or promise. In
// particular, it preserves the physical PRESENT mark's synchronous contract.
function countOwnerCalls(owner, method, matches) {
  const original = owner[method];
  const calls = [];
  owner[method] = function(...args) {
    if (matches(args)) calls.push(args);
    return Reflect.apply(original, this, args);
  };
  return {calls, restore: () => {
    owner[method] = original;
  }};
}

function creationPhysicalRows(e, host, retained) {
  const physical = runtimeServiceConsensusIdentity(retained.intent.consensusBinding,
    retained.intent.consensusSlotRequest);
  const endpointId = deriveEndpointId(physical.replicaId, host.nodeId);
  return {
    services: e.rows('services').filter((row) => row.service_id === physical.replicaId),
    endpoints: e.rows('service_endpoints').filter((row) => row.endpoint_id === endpointId),
  };
}

function creationJournalRow(e, retained) {
  return e.rows('wasm_operations').find((row) => row.operation_id === retained.operationId);
}

function creationOutcomes(host, operationId, outcomeType) {
  return host.outcomes.filter((outcome) => outcome.operationId === operationId &&
    outcome.outcomeType === outcomeType);
}

async function replaceReturnedCreation(e, host, original, label) {
  const oldReplica = e.replicaOf(host);
  const replicaId = original.intent.consensusSlotRequest.replicaId;
  assert.equal(current(host, original), 'CURRENT');
  assert.equal(oldReplica.initialized, true);
  assert.equal(oldReplica.serving, true, 'the old answer belongs to a real PUBLISHED replica');
  const removeId = `${label}-remove-original`;
  assert.equal((await e.dispatch(host, MESSAGE.REMOVE_REPLICA, removeId)).status, 'initiated');
  await e.settle(() => creationOutcomes(host, removeId,
    EXECUTOR.RUNTIME_SERVICE_REMOVE_COMPLETED).length === 1, `${label}: original removal`);
  assert.equal(creationJournalRow(e, original).state, 'completed');
  assert.equal(localRecord(host, original).phase, 'RETIRED');
  assert.equal(oldReplica.db, null, 'actual retirement released the original native database');
  assert.equal(e.replicaOf(host), null);
  const closed = await e.metadata.primary.resolveInstanceResource(
    original.intent.consensusBinding, original.token);
  assert.equal(closed.outcome, 'ADMITTED');
  assert.equal(closed.phase, 'CLOSED');
  assert.deepEqual(closed.token, original.token);
  assert.deepEqual(creationPhysicalRows(e, host, original), {services: [], endpoints: []});
  const state = e.metadata.state();
  const selected = await e.metadata.primary.selectConsensusInstance(e.metadata.request(
    state.version, RETURN_SUCCESSOR_NONCE, state.selected.binding.incarnation));
  assert.equal(selected.outcome, 'SELECTED', 'replacement selection comes from the real owner');
  const successor = await host.manager.prepareConsensusCreation(
    e.intentFor(host.slot, selected.binding, `${label}-successor`));
  assert.equal(successor.outcome, 'ADMISSION_RETAINED');
  assert.equal(successor.intent.consensusSlotRequest.replicaId, replicaId);
  assert.notDeepEqual(successor.intent.consensusBinding, original.intent.consensusBinding);
  assert.equal((await e.dispatch(host, MESSAGE.CREATE_REPLICA, successor.operationId)).status,
    'initiated');
  await e.settle(() => creationOutcomes(host, successor.operationId,
    EXECUTOR.RUNTIME_SERVICE_CREATE_HELD).length === 1, `${label}: successor held`);
  const replica = e.replicaOf(host);
  const memo = host.handler.localReplicas.get(replicaId);
  const record = host.manager._replicaStateById.get(replicaId);
  assert.notStrictEqual(replica, oldReplica);
  assert.equal(replica.initialized, true);
  assert.equal(replica.lifecycleState, STATE.READY);
  assert.equal(replica.serving, false);
  assert.equal(replica.servingState, 'HELD');
  assert.equal(replica.servicesRow.state, 'ABSENT');
  assert.equal(localRecord(host, successor).phase, 'ADMITTED');
  assert.equal(current(host, successor), 'CURRENT');
  assert.equal(current(host, original), 'DIFFERENT');
  assert.equal(memo.operationId, successor.operationId);
  assert.equal(memo.status, 'held');
  assert.equal(record.state, 'starting');
  assert.equal(record.ownership, 'CREATION');
  assert.deepEqual(record.origin.token, successor.token);
  assert.deepEqual(host.driver._prepared.get(e.serviceId), consensusBootstrapDescriptor(successor));
  assert.strictEqual(host.driver._lifecycles.get(e.serviceId), host.lifecycle);
  assert.equal(host.driver._running.has(e.serviceId), false,
    'a real HELD successor cannot hide an old running-set write');
  assert.equal(host.driver._replicaContexts.has(e.serviceId), false,
    'a real HELD successor cannot hide an old context write');
  assert.deepEqual(creationPhysicalRows(e, host, successor), {services: [], endpoints: []});
  return {e, host, original, successor, oldReplica, replicaId, replica, memo, record,
    prepared: host.driver._prepared.get(e.serviceId),
    lifecycle: host.driver._lifecycles.get(e.serviceId),
    memoValue: structuredClone(memo), recordValue: structuredClone(record),
    rows: creationPhysicalRows(e, host, successor), journals: e.rows('wasm_operations'),
    local: localRecord(host, successor)};
}

function assertReturnedAnswerPreservesSuccessor(witness) {
  const {e, host, original, successor, oldReplica, replicaId, replica, memo, record} = witness;
  assert.strictEqual(host.manager._replicaStateById.get(replicaId), record,
    'LATE_ORIGINAL_RETURN_REPLACED_SUCCESSOR_MANAGER_RECORD');
  assert.deepEqual(record, witness.recordValue, 'LATE_ORIGINAL_RETURN_MUTATED_SUCCESSOR_STATE');
  assert.equal(host.driver._running.has(e.serviceId), false,
    'LATE_ORIGINAL_RETURN_MARKED_HELD_SUCCESSOR_RUNNING');
  assert.equal(host.driver._replicaContexts.has(e.serviceId), false,
    'LATE_ORIGINAL_RETURN_INSTALLED_A_CONTEXT_OVER_HELD_SUCCESSOR');
  assert.strictEqual(host.driver._prepared.get(e.serviceId), witness.prepared,
    'LATE_ORIGINAL_RETURN_REPLACED_SUCCESSOR_PREPARATION');
  assert.deepEqual(witness.prepared, consensusBootstrapDescriptor(successor));
  assert.strictEqual(host.driver._lifecycles.get(e.serviceId), witness.lifecycle,
    'LATE_ORIGINAL_RETURN_REPLACED_SUCCESSOR_LIFECYCLE');
  assert.strictEqual(e.replicaOf(host), replica, 'LATE_ORIGINAL_RETURN_REPLACED_NATIVE_SUCCESSOR');
  assert.equal(replica.initialized, true);
  assert.equal(replica.servingState, 'HELD');
  assert.equal(replica.servicesRow.state, 'ABSENT');
  assert.strictEqual(host.handler.localReplicas.get(replicaId), memo,
    'LATE_ORIGINAL_RETURN_REPLACED_SUCCESSOR_MEMO');
  assert.deepEqual(memo, witness.memoValue, 'LATE_ORIGINAL_RETURN_MUTATED_SUCCESSOR_MEMO');
  assert.equal(current(host, successor), 'CURRENT');
  assert.equal(current(host, original), 'DIFFERENT');
  assert.equal(oldReplica.db, null);
  assert.deepEqual(localRecord(host, successor), witness.local);
  assert.equal(localRecord(host, original).phase, 'RETIRED');
  assert.deepEqual(creationPhysicalRows(e, host, successor), witness.rows,
    'LATE_ORIGINAL_RETURN_CHANGED_SUCCESSOR_DISCOVERY_ROWS');
  assert.deepEqual(creationPhysicalRows(e, host, original), {services: [], endpoints: []},
    'LATE_ORIGINAL_RETURN_RECREATED_RETIRED_DISCOVERY_ROWS');
  assert.deepEqual(e.rows('wasm_operations'), witness.journals,
    'LATE_ORIGINAL_RETURN_CHANGED_ORIGINAL_JOURNALS');
}

// Positive continuation after each negative oracle: the handler must actually
// reenter J's retained CREATE. Its unchanged owner prerequisite leaves it HELD;
// neither a stale I return nor an overly broad refusal may prevent that work.
async function redriveReturnedSuccessor(witness) {
  const {e, host, original, successor, replicaId, replica} = witness;
  const count = creationOutcomes(host, successor.operationId,
    EXECUTOR.RUNTIME_SERVICE_CREATE_HELD).length;
  assert.equal((await e.dispatch(host, MESSAGE.CREATE_REPLICA, successor.operationId)).status,
    'in_progress', 'SURVIVING_SUCCESSOR_CREATE_WAS_NOT_READMITTED');
  await e.settle(() => creationOutcomes(host, successor.operationId,
    EXECUTOR.RUNTIME_SERVICE_CREATE_HELD).length === count + 1, 'surviving successor redrive');
  assert.strictEqual(e.replicaOf(host), replica, 'SUCCESSOR_REDRIVE_REPLACED_ITS_NATIVE_OBJECT');
  assert.equal(replica.initialized, true);
  assert.equal(replica.servingState, 'HELD');
  assert.equal(current(host, successor), 'CURRENT');
  assert.equal(current(host, original), 'DIFFERENT');
  const memo = host.handler.localReplicas.get(replicaId);
  assert.equal(memo.operationId, successor.operationId);
  assert.equal(memo.status, 'held');
  const record = host.manager._replicaStateById.get(replicaId);
  assert.equal(record.state, 'starting');
  assert.deepEqual(record.origin.token, successor.token);
  assert.deepEqual(e.rows('wasm_operations'), witness.journals,
    'SUCCESSOR_REDRIVE_CHANGED_OR_REPLACED_THE_RETAINED_JOURNALS');
  assert.equal(host.handler.inProgressOperations.size, 0);
}

test('U1 actual return: old driver READY cannot replace the manager state of a HELD successor',
  async (t) => {
    const e = await publishedWorld(t);
    const host = e.hosts[0];
    const original = host.retained;
    const pause = pauseOwnerReturn(host.driver, 'prepare', (answer, args) =>
      answer.status === PREPARE_STATUS.READY &&
      args[1]?.consensusCreation?.operationId === original.operationId);
    const pending = host.manager.resumeConsensusCreation(original.operationId,
      {nodeId: host.nodeId});
    let starts;
    try {
      const held = await pause.wait(pending);
      assert.equal(held.answer.status, PREPARE_STATUS.READY);
      const witness = await replaceReturnedCreation(e, host, original, 'return-manager-prepare');
      starts = countOwnerCalls(host.lifecycle, 'startReplica', (args) => args[0] === e.serviceId);
      pause.release();
      const answer = await pending;
      assertReturnedAnswerPreservesSuccessor(witness);
      assert.equal(starts.calls.length, 0, 'LATE_PREPARE_STARTED_SUCCESSOR_UNDER_OLD_CONTEXT');
      assert.equal(answer.outcome, 'CONTENT_CONFLICT');
      assert.equal(answer.operationId, original.operationId);
      await redriveReturnedSuccessor(witness);
    } finally {
      pause.release();
      pause.restore();
      starts?.restore();
      await Promise.allSettled([pending]);
    }
  });

test('U1 actual return: old physical PUBLISHED cannot mark a HELD successor running in the driver',
  async (t) => {
    const e = await publishedWorld(t);
    const host = e.hosts[0];
    const original = host.retained;
    const pause = pauseOwnerReturn(host.lifecycle, 'startReplica', (answer) =>
      answer?.status === 'PUBLISHED' &&
      answer.consensusResourceToken?.operationId === original.operationId);
    const pending = host.driver.start(returnedOriginHandle(host, original));
    try {
      const held = await pause.wait(pending);
      assert.equal(held.answer.started, true);
      assert.deepEqual(held.answer.consensusResourceToken, original.token);
      const witness = await replaceReturnedCreation(e, host, original, 'return-driver-published');
      pause.release();
      const answer = await pending;
      assert.equal(host.driver._running.has(e.serviceId), false,
        'LATE_PUBLISHED_DRIVER_RETURN_MARKED_HELD_SUCCESSOR_RUNNING');
      assert.equal(host.driver._replicaContexts.has(e.serviceId), false,
        'LATE_PUBLISHED_DRIVER_RETURN_INSTALLED_OLD_CONTEXT_OVER_SUCCESSOR');
      assertReturnedAnswerPreservesSuccessor(witness);
      assert.equal(answer.status, START_STATUS.FAILED);
      assert.equal(answer.outcome, 'UNAVAILABLE');
      await redriveReturnedSuccessor(witness);
    } finally {
      pause.release();
      pause.restore();
      await Promise.allSettled([pending]);
    }
  });

test('U1 actual return: old authoritative PUBLISHED confirmation cannot overwrite successor state',
  async (t) => {
    const e = await publishedWorld(t);
    const host = e.hosts[0];
    const original = host.retained;
    const start = host.runtime.start;
    let runtimePublished = false;
    // Arm only after this real runtime invocation returned PUBLISHED. Recovery
    // and physical publication also resolve metadata; call counts are not an
    // authoritative way to identify the manager's later confirmation.
    host.runtime.start = async function(...args) {
      const answer = await Reflect.apply(start, this, args);
      if (args[0]?.consensusCreation?.operationId === original.operationId &&
          answer.status === 'PUBLISHED') runtimePublished = true;
      return answer;
    };
    const pause = pauseOwnerReturn(e.metadata.primary, 'resolveInstanceResource', (answer, args) =>
      runtimePublished && args[1]?.operationId === original.operationId &&
      answer?.outcome === 'ADMITTED' && answer.phase === 'PUBLISHED');
    const pending = host.manager.resumeConsensusCreation(original.operationId,
      {nodeId: host.nodeId});
    try {
      const held = await pause.wait(pending);
      assert.equal(runtimePublished, true);
      assert.deepEqual(held.answer.token, original.token);
      const witness = await replaceReturnedCreation(e, host, original, 'return-manager-confirm');
      pause.release();
      const answer = await pending;
      assertReturnedAnswerPreservesSuccessor(witness);
      // U1 governs canonical ownership here; it does not change this existing
      // per-request presentation mapping of the actual old confirmation.
      assert.equal(answer.status, 'PUBLISHED');
      assert.equal(answer.operationId, original.operationId);
      assert.deepEqual(answer.consensusResourceToken, original.token);
      await redriveReturnedSuccessor(witness);
    } finally {
      pause.release();
      pause.restore();
      host.runtime.start = start;
      await Promise.allSettled([pending]);
    }
  });

for (const boundary of ['services', 'endpoint']) {
  test(`U1 actual return: completed ${boundary} effect cannot authorize the next owner after replacement`,
    async (t) => {
      const e = await publishedWorld(t);
      const host = e.hosts[0];
      const original = host.retained;
      const physical = runtimeServiceConsensusIdentity(original.intent.consensusBinding,
        original.intent.consensusSlotRequest);
      const endpoints = countOwnerCalls(host.runtime, '_endpointWriter',
        (args) => args[0] === physical.replicaId);
      const marks = countOwnerCalls(host.driver, 'markServicesRowPresent',
        (args) => args[2]?.operationId === original.operationId);
      const method = boundary === 'services' ? '_stateProjectionWriter' : '_endpointWriter';
      const pause = pauseOwnerReturn(host.runtime, method, (_answer, args) =>
        args[0] === physical.replicaId &&
        (boundary === 'endpoint' || args[1]?.status === 'active'));
      const pending = host.runtime.start(returnedOriginHandle(host, original));
      try {
        const held = await pause.wait(pending);
        assert.equal(creationPhysicalRows(e, host, original).services[0].status, 'active');
        if (boundary === 'endpoint') {
          assert.equal(held.answer.success, true, 'the real endpoint owner completed its effect');
          assert.equal(creationPhysicalRows(e, host, original).endpoints.length, 1);
        }
        assert.equal(endpoints.calls.length, boundary === 'services' ? 0 : 1);
        assert.equal(marks.calls.length, 0, 'the seam is before the original physical PRESENT mark');
        const witness = await replaceReturnedCreation(e, host, original, `return-${boundary}`);
        pause.release();
        const answer = await pending;
        // Forbidden next-owner invocation is checked before the returned
        // status: a late endpoint/mark refusal cannot hide that it was called.
        assert.equal(endpoints.calls.length, boundary === 'services' ? 0 : 1,
          'LATE_SERVICES_RETURN_INVOKED_RETIRED_CREATIONS_ENDPOINT_WRITER');
        assert.equal(marks.calls.length, 0,
          'LATE_ENDPOINT_RETURN_INVOKED_RETIRED_CREATIONS_PHYSICAL_MARK');
        assertReturnedAnswerPreservesSuccessor(witness);
        assert.equal(answer.status, 'PUBLISHED_UNPROJECTED');
        assert.equal(answer.projection.outcome, 'CURRENT_CREATION_UNAVAILABLE');
        assert.deepEqual(answer.consensusResourceToken, original.token);
        await redriveReturnedSuccessor(witness);
      } finally {
        pause.release();
        pause.restore();
        endpoints.restore();
        marks.restore();
        await Promise.allSettled([pending]);
      }
    });
}
