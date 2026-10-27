// Component orchestration: real BootstrapService cleanup delegates and real
// MessageRouter registration/retirement, with bounded shutdown doubles only.
// This does not measure native message-group close, startup or recovery.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {CLEANUP_RESULT} from '../../src/bootstrap/bootstrap-constants.js';
import {registerMessageGroupTransportHandler} from
  '../../src/bootstrap/shared/message-group-transport-handler.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {ADDRESS, ENTITY_TYPE} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const NODE_ID = 'seed-mg-cleanup-node';
const CLEANUP_ENTRY = Object.freeze({
  FAILED_STEP: 'failed-bootstrap message-group step',
  GRACEFUL: 'graceful cleanup',
});

ConfigurationManager.resetInstance();
LoggingService.resetInstance();
ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
LoggingService.getInstance().initialize({level: 'error'});

function createSilentLogger() {
  return {debug() {}, info() {}, warn() {}, error() {}};
}

function createFixture() {
  const bootstrap = new BootstrapService({
    nodeId: NODE_ID,
    nodeAddress: 'localhost:8080',
    bootIncarnation: TEST_BOOT_INCARNATION,
  });
  const router = new MessageRouter({
    nodeId: NODE_ID,
    bootIncarnation: TEST_BOOT_INCARNATION,
  });
  bootstrap.logger = createSilentLogger();
  bootstrap.messageRouter = router;
  bootstrap.transport = router;
  const fixture = {
    bootstrap, router, created: [], attempts: [], events: [],
    replicas: bootstrap.messageGroupReplicas,
    retirementFault: null,
    originalUnregisterExact: router.unregisterExact,
    originalUnregisterDescriptor:
      Object.getOwnPropertyDescriptor(router, 'unregisterExact'),
  };
  observeExactRetirement(fixture);
  return fixture;
}

function observeExactRetirement(fixture) {
  fixture.router.unregisterExact = function(address, handler) {
    const service = fixture.created.find((entry) =>
      entry.transportHandler === handler);
    const observation = {
      kind: 'retirement', address, handler,
      shutdownCompleted: service?.closed,
      originalCalls: 0, returned: null, error: null,
    };
    fixture.events.push(observation);
    if (fixture.retirementFault?.handler === handler) {
      observation.error = fixture.retirementFault.error;
      throw observation.error;
    }
    observation.originalCalls += 1;
    observation.returned = fixture.originalUnregisterExact.call(
      this, address, handler);
    return observation.returned;
  };
}

function addMessageGroup(fixture, replicaId) {
  const service = {
    replicaId, logger: createSilentLogger(), closed: false,
    shutdownCalls: 0, shutdownCompletions: 0, shutdownFailure: null,
    shutdownGate: null, shutdownEntered: Promise.withResolvers(),
    receiveMessage() {},
    async shutdown() {
      this.shutdownCalls += 1;
      this.shutdownEntered.resolve();
      if (this.closed) return;
      fixture.events.push({kind: 'shutdown-entered', service: this});
      if (this.shutdownGate) await this.shutdownGate.promise;
      if (this.shutdownFailure) throw this.shutdownFailure;
      this.closed = true;
      this.shutdownCompletions += 1;
      fixture.events.push({kind: 'shutdown-completed', service: this});
    },
  };
  service.address = [NODE_ID, ENTITY_TYPE.MESSAGE_GROUP, replicaId]
    .join(ADDRESS.SEPARATOR);
  registerMessageGroupTransportHandler(service, {
    messageRouter: fixture.router,
    address: service.address,
  });
  fixture.created.push(service);
  fixture.bootstrap.messageGroupServices.set(replicaId, service);
  fixture.bootstrap.messageGroupReplicas.push(service);
  return service;
}

function startCleanup(fixture, entry) {
  const owner = fixture.bootstrap.seedCleanupHandler;
  const operation = entry === CLEANUP_ENTRY.FAILED_STEP ?
    owner._cleanupMessageGroups() : owner.cleanup();
  const attempt = operation.then(
    (result) => ({result, error: null}),
    (error) => ({result: null, error}),
  );
  fixture.attempts.push(attempt);
  return attempt;
}

function assertFailure(attempt, entry, expectedError = null) {
  if (entry === CLEANUP_ENTRY.FAILED_STEP) {
    assert.equal(attempt.error, null);
    assert.equal(attempt.result, CLEANUP_RESULT.ERROR);
    return;
  }
  assert.ok(attempt.error instanceof AggregateError,
    'graceful cleanup rejects while a captured resource remains owed');
  if (expectedError) {
    assert.ok(attempt.error.errors.includes(expectedError),
      'the actual cleanup aggregate retains the injected error identity');
  } else {
    assert.deepEqual(attempt.error.errors, [],
      'a current successor alone retains map custody after old success');
  }
}

function assertRetained(fixture, service) {
  assert.equal(fixture.bootstrap.messageGroupServices.get(service.replicaId),
    service, 'the exact service remains with the existing cleanup owner');
  assert.equal(fixture.router.getRegisteredHandler(service.address),
    service.transportHandler, 'the exact handler remains registered');
  assert.equal(fixture.bootstrap.messageGroupReplicas, fixture.replicas,
    'replica bookkeeping is not reset while the owned map retains debt');
  assert.ok(fixture.bootstrap.messageGroupReplicas.includes(service),
    'the retained service remains in replica bookkeeping');
}

function retirementEvents(fixture, service) {
  return fixture.events.filter((event) =>
    event.kind === 'retirement' && event.handler === service.transportHandler);
}

function assertRetired(fixture, service, returned) {
  const observations = retirementEvents(fixture, service);
  const observed = observations.at(-1);
  assert.ok(observed, 'cleanup reached the real exact-retirement API');
  assert.equal(observed.address, service.address);
  assert.equal(observed.shutdownCompleted, true,
    'retirement follows successful shutdown-double completion');
  assert.equal(observed.originalCalls, 1);
  assert.equal(observed.error, null);
  assert.equal(observed.returned, returned);
  const completion = fixture.events.findIndex((event) =>
    event.kind === 'shutdown-completed' && event.service === service);
  assert.ok(completion >= 0 && completion < fixture.events.indexOf(observed),
    'the actual exact API invocation follows the captured shutdown settlement');
}

function assertSuccess(fixture, attempt, entry) {
  assert.equal(attempt.error, null);
  assert.equal(attempt.result,
    entry === CLEANUP_ENTRY.FAILED_STEP ? CLEANUP_RESULT.SUCCESS : undefined);
  assert.equal(fixture.bootstrap.messageGroupServices.size, 0);
  assert.deepEqual(fixture.bootstrap.messageGroupReplicas, []);
  assert.notEqual(fixture.bootstrap.messageGroupReplicas, fixture.replicas,
    'successful map discharge permits the existing replica-array reset');
}

function restoreRetirementApi(fixture) {
  if (fixture.originalUnregisterDescriptor) {
    Object.defineProperty(fixture.router, 'unregisterExact',
      fixture.originalUnregisterDescriptor);
  } else {
    delete fixture.router.unregisterExact;
  }
}

async function cleanupFixture(fixture) {
  fixture.retirementFault = null;
  for (const service of fixture.created) {
    service.shutdownFailure = null;
    service.shutdownGate?.resolve();
  }
  const failures = [];
  const steps = [
    () => restoreRetirementApi(fixture),
    () => Promise.all(fixture.attempts),
    () => fixture.bootstrap.seedCleanupHandler.cleanup(),
    () => fixture.router.shutdown(),
    () => {
      for (const service of fixture.created) {
        assert.equal(service.closed, true,
          `existing cleanup must complete shutdown double ${service.replicaId}`);
      }
    },
  ];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Fixture cleanup failed');
}

async function withFixture(run) {
  const fixture = createFixture();
  const failures = [];
  try {
    await run(fixture);
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      await cleanupFixture(fixture);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) {
    throw new AggregateError(failures, 'Message-group custody witness failed');
  }
}

async function shutdownFailureCase(fixture, entry) {
  const failed = addMessageGroup(fixture, 'mg-failed-r1');
  const healthy = addMessageGroup(fixture, 'mg-healthy-r1');
  const failure = new Error('selected message-group shutdown failed');
  failed.shutdownFailure = failure;

  assertFailure(await startCleanup(fixture, entry), entry, failure);
  assertRetained(fixture, failed);
  assert.equal(failed.shutdownCalls, 1);
  assert.equal(failed.shutdownCompletions, 0);
  assert.equal(failed.closed, false);
  assert.deepEqual(retirementEvents(fixture, failed), [],
    'failed shutdown must not attempt handler retirement');
  assert.equal(healthy.shutdownCompletions, 1,
    'a failed entry does not prevent another captured shutdown');
  assertRetired(fixture, healthy, true);
  assert.equal(fixture.bootstrap.messageGroupServices.has(healthy.replicaId), false);
  assert.equal(fixture.router.getRegisteredHandler(healthy.address), null);

  failed.shutdownFailure = null;
  assertSuccess(fixture, await startCleanup(fixture, entry), entry);
  assert.equal(failed.shutdownCalls, 2);
  assert.equal(failed.shutdownCompletions, 1);
  assert.equal(healthy.shutdownCalls, 1);
  assertRetired(fixture, failed, true);
}

async function retirementFailureCase(fixture, entry) {
  const service = addMessageGroup(fixture, 'mg-retirement-r1');
  const failure = new Error('selected exact retirement API failed');
  fixture.retirementFault = {handler: service.transportHandler, error: failure};

  assertFailure(await startCleanup(fixture, entry), entry, failure);
  assertRetained(fixture, service);
  assert.equal(service.closed, true);
  assert.equal(service.shutdownCalls, 1);
  assert.equal(service.shutdownCompletions, 1);
  const faults = retirementEvents(fixture, service);
  assert.equal(faults.length, 1);
  const [fault] = faults;
  assert.equal(fault.error, failure, 'the API throws the selected exact error');
  assert.equal(fault.originalCalls, 0,
    'the injected throw does not pretend the original API retired anything');
  assert.equal(fault.shutdownCompleted, true);

  fixture.retirementFault = null;
  assertSuccess(fixture, await startCleanup(fixture, entry), entry);
  assert.equal(service.shutdownCalls, 2);
  assert.equal(service.shutdownCompletions, 1,
    'same-owner retry does not repeat completed shutdown-double work');
  assert.equal(retirementEvents(fixture, service).length, 2);
  assertRetired(fixture, service, true);
}

async function successorCase(fixture, entry) {
  const old = addMessageGroup(fixture, 'mg-replaced-r1');
  old.shutdownGate = Promise.withResolvers();
  const first = startCleanup(fixture, entry);
  const entered = await Promise.race([
    old.shutdownEntered.promise.then(() => true),
    first.then(() => false),
  ]);
  assert.equal(entered, true, 'the actual cleanup entered old shutdown before settlement');
  assert.equal(old.closed, false);

  // Controlled host publication tests late-completion identity only. It does
  // not grant replacement permission while failed old cleanup remains owed.
  const successor = addMessageGroup(fixture, old.replicaId);
  assert.notEqual(successor.transportHandler, old.transportHandler);
  old.shutdownGate.resolve();
  assertFailure(await first, entry);
  assert.equal(old.shutdownCompletions, 1);
  assertRetired(fixture, old, false);
  assertRetained(fixture, successor);
  assert.equal(successor.shutdownCalls, 0,
    'the captured cleanup attempt cannot select a successor for shutdown');
  assert.deepEqual(retirementEvents(fixture, successor), []);

  assertSuccess(fixture, await startCleanup(fixture, entry), entry);
  assert.equal(old.shutdownCalls, 1);
  assert.equal(successor.shutdownCalls, 1);
  assert.equal(successor.shutdownCompletions, 1);
  assertRetired(fixture, successor, true);
}

for (const entry of Object.values(CLEANUP_ENTRY)) {
  test(`${entry}: failed message-group shutdown retains exact custody and retries`,
    () => withFixture((fixture) => shutdownFailureCase(fixture, entry)));
  test(`${entry}: exact retirement failure retains a closed message group for retry`,
    () => withFixture((fixture) => retirementFailureCase(fixture, entry)));
  test(`${entry}: old shutdown and retirement preserve a current successor`,
    () => withFixture((fixture) => successorCase(fixture, entry)));
}
