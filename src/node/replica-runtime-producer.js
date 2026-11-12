// The existing runtime publisher captures one producer before it suspends.
// A factory pairs that capture with construction; neither half is replaceable
// after capture. These are retained values, not a logical-ID authority index.
import {runtimePublicationRefused} from '../partition/partition-runtime-publication.js';

class CapturedReplicaRuntimeProducer {
  #assertion;

  constructor(context, assertion) {
    this.#assertion = assertion;
    Object.assign(this, context);
    Object.freeze(this);
  }

  assertCurrent = () => this.#assertion();
}

function requireReplicaRuntimeProducer(producer, replicaId) {
  if (!(producer instanceof CapturedReplicaRuntimeProducer) ||
      producer.replicaId !== replicaId) throw runtimePublicationRefused(replicaId);
  producer.assertCurrent();
  return producer;
}

function isReplicaRuntimeProducerCurrent(producer) {
  try {
    requireReplicaRuntimeProducer(producer, producer?.replicaId);
    return true;
  } catch {
    return false;
  }
}

function captureReplicaRuntimeProducer(handler, owner, replicaId) {
  if (!handler || !owner || typeof replicaId !== 'string' || replicaId.length === 0) {
    throw runtimePublicationRefused(replicaId);
  }
  const localServices = handler.localServices;
  const localReplicas = handler.localReplicas;
  const nodeId = handler.nodeId;
  const ownerNodeId = owner.nodeId;
  const handlerIncarnation = handler.ownerIncarnation;
  const ownerIncarnation = owner.ownerIncarnation;
  const assertCurrent = () => {
    if (handler.replicaStateMachine !== owner || handler.nodeId !== nodeId ||
        owner.nodeId !== ownerNodeId ||
        handler.ownerIncarnation !== handlerIncarnation ||
        owner.ownerIncarnation !== ownerIncarnation || handler.shuttingDown ||
        handler.localServices !== localServices || handler.localReplicas !== localReplicas ||
        owner.replicaMutationAdmissionClosed === true) throw runtimePublicationRefused(replicaId);
  };
  assertCurrent();
  return new CapturedReplicaRuntimeProducer({handler, owner, replicaId, nodeId,
    localServices, localReplicas, factory: null}, assertCurrent);
}

function captureReplicaRuntimeHost(host, replicaId, producer) {
  const original = requireReplicaRuntimeProducer(producer, replicaId);
  const lifecycleHolder = host.replicaLifecycleOwner;
  if (!lifecycleHolder) throw runtimePublicationRefused(replicaId);
  const holderRecord = lifecycleHolder.record;
  const hostServices = host.partitionServices;
  const bootIncarnation = host.bootIncarnation;
  const transport = host.transport;
  const messageRouter = host.messageRouter;
  const {assertCurrent: assertProducerCurrent, ...context} = original;
  const assertCurrent = () => {
    assertProducerCurrent();
    if (host.isShuttingDown === true || host.startupAbortSignal?.aborted === true ||
        host.replicaHandler !== original.handler || host.replicaStateMachine !== original.owner ||
        host.replicaLifecycleOwner !== lifecycleHolder || lifecycleHolder.record !== holderRecord ||
        host.partitionServices !== hostServices || host.bootIncarnation !== bootIncarnation ||
        host.transport !== transport || host.messageRouter !== messageRouter) {
      throw runtimePublicationRefused(replicaId);
    }
  };
  assertCurrent();
  return new CapturedReplicaRuntimeProducer({...context, hostServices, transport, messageRouter},
    assertCurrent);
}

function requireReplicaRuntimeFactory(factory) {
  const capture = factory && Object.getOwnPropertyDescriptor(factory, 'captureProducer');
  const create = factory && Object.getOwnPropertyDescriptor(factory, 'create');
  if (!factory || typeof factory !== 'object' || !Object.isFrozen(factory) ||
      typeof capture?.value !== 'function' || typeof create?.value !== 'function') {
    throw new TypeError('Replica runtime factory requires a frozen capture/construction pair');
  }
  return factory;
}

function createReplicaRuntimeFactory({captureProducer, create}) {
  if (typeof captureProducer !== 'function' || typeof create !== 'function') {
    throw new TypeError('Replica runtime factory requires capture and construction');
  }
  const factory = Object.freeze({
    captureProducer(handler, replicaId) {
      const captured = requireReplicaRuntimeProducer(captureProducer(handler, replicaId), replicaId);
      if (captured.handler !== handler) throw runtimePublicationRefused(replicaId);
      const {assertCurrent, ...context} = captured;
      return new CapturedReplicaRuntimeProducer({...context, factory}, assertCurrent);
    },
    create(request) {
      const producer = requireReplicaRuntimeProducer(request.runtimeProducer, request.replicaId);
      if (producer.factory !== factory) throw runtimePublicationRefused(request.replicaId);
      return create(request, producer);
    },
  });
  return factory;
}

export {captureReplicaRuntimeProducer, captureReplicaRuntimeHost,
  createReplicaRuntimeFactory, requireReplicaRuntimeFactory,
  requireReplicaRuntimeProducer, isReplicaRuntimeProducerCurrent};
