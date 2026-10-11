/**
 * Private in-process BEGIN consumer identity and acceptance-token transport.
 * Symbols keep these capabilities out of SQL/public result serialization.
 */

const BEGIN_CONSUMER = Symbol('distributedBeginConsumer');
const BEGIN_ACCEPTANCE = Symbol('distributedBeginAcceptance');

const DISTRIBUTED_BEGIN_CONSUMER_KIND = Object.freeze({
  APPLICATION: 'application',
  DIRECT: 'direct',
  PGWIRE: 'pgwire',
});

function createDistributedBeginConsumer(kind, sessionId) {
  if (!Object.values(DISTRIBUTED_BEGIN_CONSUMER_KIND).includes(kind) ||
      typeof sessionId !== 'string' || sessionId.length === 0) {
    return null;
  }
  return Object.freeze({kind, sessionId, incarnation: Object.freeze({})});
}

function distributedBeginConsumerOf(source) {
  const consumer = source?.[BEGIN_CONSUMER];
  if (!consumer || typeof consumer !== 'object' ||
      typeof consumer.kind !== 'string' ||
      typeof consumer.sessionId !== 'string' ||
      !consumer.incarnation || typeof consumer.incarnation !== 'object') {
    return null;
  }
  return consumer;
}

function attachDistributedBeginConsumer(target, consumer) {
  if (target && typeof target === 'object' && consumer) {
    target[BEGIN_CONSUMER] = consumer;
  }
  return target;
}

function copyDistributedBeginConsumer(source, target) {
  return attachDistributedBeginConsumer(target,
    distributedBeginConsumerOf(source));
}

function attachDistributedBeginAcceptance(result, acceptance) {
  if (result && typeof result === 'object' && acceptance) {
    result[BEGIN_ACCEPTANCE] = acceptance;
  }
  return result;
}

function distributedBeginAcceptanceOf(result) {
  const acceptance = result?.[BEGIN_ACCEPTANCE];
  return acceptance && typeof acceptance === 'object' ? acceptance : null;
}

export {
  DISTRIBUTED_BEGIN_CONSUMER_KIND,
  attachDistributedBeginAcceptance,
  attachDistributedBeginConsumer,
  copyDistributedBeginConsumer,
  createDistributedBeginConsumer,
  distributedBeginAcceptanceOf,
  distributedBeginConsumerOf,
};
