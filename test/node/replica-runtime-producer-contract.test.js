import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {captureReplicaRuntimeProducer, createReplicaRuntimeFactory,
  isReplicaRuntimeProducerCurrent} from '../../src/node/replica-runtime-producer.js';
import {PARTITION_RUNTIME_PUBLICATION_REFUSED} from
  '../../src/partition/partition-runtime-publication.js';
import {createLifecycleStateStore} from '../test-helpers/lifecycle-state-store.js';

const NODE_ID = 'producer-contract-node';
const REPLICA_ID = 'producer-contract-r1';

function ownerFixture(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const store = createLifecycleStateStore();
  const owner = new ReplicaStateMachine({nodeId: NODE_ID,
    systemTableCache: store.cache, controlPlaneSystemTableGateway: store.gateway});
  const handlers = [];
  t.teardown(async () => {
    for (const handler of handlers) await handler.shutdown();
    await owner.clear();
  });
  const construct = (partitionServiceFactory) => {
    const handler = new ReplicaHandler({nodeId: NODE_ID, ownerIncarnation: 1,
      dataDir: '/tmp/replica-runtime-producer-contract', systemTableCache: store.cache,
      controlPlaneSystemTableGateway: store.gateway, cdcIntegrationService: {},
      replicaStateMachine: owner, partitionServiceFactory});
    handlers.push(handler);
    return handler;
  };
  return {owner, construct};
}

function canonicalFixture(t) {
  const f = ownerFixture(t);
  let handler;
  const calls = [];
  const factory = createReplicaRuntimeFactory({
    captureProducer(requestingHandler, replicaId) {
      if (requestingHandler !== handler) throw new Error('unexpected construction owner');
      return captureReplicaRuntimeProducer(handler, f.owner, replicaId);
    },
    create(request, producer) {
      calls.push({request, producer});
      return producer;
    },
  });
  handler = f.construct(factory);
  return {...f, handler, factory, calls};
}

test('a handwritten frozen factory cannot bypass the retained construction pair', (t) => {
  const f = canonicalFixture(t);
  const original = f.factory.captureProducer(f.handler, REPLICA_ID);
  for (const description of ['literal frozen pair', 'factory prototype copy']) {
    let rawCalls = 0;
    const rawCreate = () => { rawCalls += 1; };
    const counterfeit = description === 'literal frozen pair' ?
      Object.freeze({captureProducer: f.factory.captureProducer, create: rawCreate}) :
      Object.freeze(Object.assign(Object.create(Object.getPrototypeOf(f.factory)), {
        captureProducer: f.factory.captureProducer, create: rawCreate,
      }));
    let accepted;
    let refusal;
    try {
      accepted = f.construct(counterfeit);
    } catch (error) {
      refusal = error;
    }
    t.ok(refusal instanceof TypeError, `${description} is refused at the real constructor`);
    if (accepted) {
      // This is the actual bypass: the accepted descriptor's raw callback
      // receives another factory's producer without its pairing check.
      accepted.partitionServiceFactory.create({replicaId: REPLICA_ID,
        runtimeProducer: original});
    }
    t.equal(rawCalls, 0, 'an unpaired callback cannot acquire construction effects');
  }
  const result = f.factory.create({replicaId: REPLICA_ID, runtimeProducer: original});
  t.equal(result, original, 'the unchanged original pair still executes its own continuation');
  t.equal(f.calls.length, 1, 'refused descriptors do not consume or duplicate the original call');
});

test('a producer prototype copy cannot supply its own source assertion or factory pairing', (t) => {
  const f = canonicalFixture(t);
  const original = f.factory.captureProducer(f.handler, REPLICA_ID);
  let identityReads = 0;
  let assertionCalls = 0;
  const counterfeit = Object.create(Object.getPrototypeOf(original));
  Object.defineProperties(counterfeit, {
    replicaId: {get() { identityReads += 1; return REPLICA_ID; }},
    factory: {value: f.factory},
    assertCurrent: {value: () => { assertionCalls += 1; }},
  });
  Object.freeze(counterfeit);
  let refusal;
  try {
    f.factory.create({replicaId: REPLICA_ID, runtimeProducer: counterfeit});
  } catch (error) {
    refusal = error;
  }
  t.equal(refusal?.code, PARTITION_RUNTIME_PUBLICATION_REFUSED,
    'a copied prototype does not carry the original private capture');
  t.equal(identityReads, 0, 'an unbranded value cannot supply the observed identity');
  t.equal(assertionCalls, 0, 'an unbranded value cannot provide a replacement source assertion');
  t.equal(f.calls.length, 0, 'forged producer fields cannot authorize construction');
  t.equal(f.factory.create({replicaId: REPLICA_ID, runtimeProducer: original}), original,
    'the exact original private capture still owns its unchanged factory continuation');
  t.equal(f.calls.length, 1);
});

test('a reflected producer constructor cannot issue a caller-owned source assertion', (t) => {
  const f = canonicalFixture(t);
  const original = f.factory.captureProducer(f.handler, REPLICA_ID);
  const ReflectedProducer = Object.getPrototypeOf(original).constructor;
  let identityReads = 0;
  let assertionCalls = 0;
  let refusal;
  try {
    const counterfeit = new ReflectedProducer({
      get replicaId() { identityReads += 1; return REPLICA_ID; },
      factory: f.factory,
    }, () => { assertionCalls += 1; });
    f.factory.create({replicaId: REPLICA_ID, runtimeProducer: counterfeit});
  } catch (error) {
    refusal = error;
  }
  t.equal(refusal?.code, PARTITION_RUNTIME_PUBLICATION_REFUSED,
    'constructor reflection cannot issue the private producer brand');
  t.equal(identityReads, 0, 'issuance refuses before reading caller-owned context');
  t.equal(assertionCalls, 0, 'the caller cannot replace original currentness authority');
  t.equal(f.calls.length, 0, 'reflected construction cannot reach the actual factory effect');
  t.equal(f.factory.create({replicaId: REPLICA_ID, runtimeProducer: original}), original);
  t.equal(f.calls.length, 1, 'the legitimate original capture remains useful');
});

test('producer currentness preserves an unexpected owner-read failure', (t) => {
  const f = canonicalFixture(t);
  const producer = f.factory.captureProducer(f.handler, REPLICA_ID);
  const descriptor = Object.getOwnPropertyDescriptor(f.handler, 'replicaStateMachine');
  const cause = Object.assign(new Error('original lifecycle dependency failed'), {
    code: 'FIXTURE_LIFECYCLE_DEPENDENCY_FAILED',
  });
  let result;
  let observed;
  try {
    Object.defineProperty(f.handler, 'replicaStateMachine', {
      configurable: true, get() { throw cause; },
    });
    try {
      result = isReplicaRuntimeProducerCurrent(producer);
    } catch (error) {
      observed = error;
    }
  } finally {
    Object.defineProperty(f.handler, 'replicaStateMachine', descriptor);
  }
  t.equal(observed, cause, 'dependency failure retains the exact original error');
  t.equal(result, undefined, 'an unexpected failure is not an obsolete-source result');
  t.equal(f.calls.length, 0, 'checking a producer never invokes construction');
});

test('producer currentness classifies a canonical lifetime refusal without construction', (t) => {
  const f = canonicalFixture(t);
  const producer = f.factory.captureProducer(f.handler, REPLICA_ID);
  t.equal(isReplicaRuntimeProducerCurrent(producer), true, 'the original source is current');
  f.handler.localReplicas = new Map();
  t.equal(isReplicaRuntimeProducerCurrent(producer), false,
    'replacement of the original metadata map is a canonical publication refusal');
  t.equal(f.calls.length, 0);
});
