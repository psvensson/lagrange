import {AddressManager} from '../address/address-manager.js';
import {RealTimeSource} from '../time/time-source.js';

const ROUTING_PROBE_ELAPSED = Symbol('routing probe elapsed');
const READ_DELIVERY_CLOSED = 'Recovery read delivery closed';
const READ_ROUTE_SUPERSEDED = 'Recovery read route superseded';
const EXECUTOR_SHUTDOWN = 'Query execution aborted: SQL query engine is shutting down';
const EXECUTOR_SHUTDOWN_CODE = 'QUERY_EXECUTOR_SHUTTING_DOWN';

function executorShutdownError() {
  return Object.assign(new Error(EXECUTOR_SHUTDOWN), {code: EXECUTOR_SHUTDOWN_CODE});
}

function peerIdentityOf(router, nodeId) {
  return nodeId === router.nodeId ? router.getLocalBootIncarnationIdentity?.() :
    router.getCurrentPrimaryConnectionBootIncarnation?.(nodeId);
}

function matchesRoute(ticket, candidate) {
  return ticket.address === candidate.address &&
    ticket.serviceInfo.nodeId === candidate.nodeId &&
    ticket.serviceInfo.replicaId === candidate.replicaId;
}

function isCurrentPeer(router, ticket) {
  const prior = ticket.peer;
  if (!prior) return true; // The bounded cold-route attempt had no primary at submission.
  const current = peerIdentityOf(router, prior.nodeId);
  return current?.bootIncarnation === prior.bootIncarnation &&
    current?.connectionId === prior.connectionId;
}

/**
 * One invocation owns its submissions and their replies. A routing probe
 * only lets that invocation inspect other eligible routes. The transport
 * retains each issued reply on its caller grant.
 * @param {Object} executor - Partition routing owner.
 * @param {Object} options - Original caller cancellation.
 * @return {Object} Per-invocation scope.
 */
function createRecoveryReadDelivery(executor, options) {
  const router = executor.messageRouter;
  const clock = router?.timeSource || new RealTimeSource();
  const close = new AbortController();
  const sources = [close.signal, executor.partitionReadShutdownController.signal];
  if (options.signal) sources.push(options.signal);
  const signal = globalThis.AbortSignal.any(sources);
  const unsubscribe = options.cancellationToken?.onCancel?.((reason) => {
    close.abort(new Error(reason));
  });
  const pending = new Map();
  const issued = new Map();

  function cancelSupersededRoute(address, record) {
    pending.delete(address);
    record.controller.abort(new Error(READ_ROUTE_SUPERSEDED));
  }

  function currentIn(ticket, candidates) {
    return candidates.some((candidate) => matchesRoute(ticket, candidate)) &&
      isCurrentPeer(router, ticket);
  }

  function reconcile(candidates) {
    for (const [address, record] of pending) {
      if (!currentIn(record.ticket, candidates)) cancelSupersededRoute(address, record);
    }
  }

  function canSelect(candidate, mayRetry) {
    if (mayRetry || pending.has(candidate.address)) return true;
    const previous = issued.get(candidate.address);
    return !previous || !currentIn(previous, [candidate]);
  }

  function start(ticket, routerOptions) {
    const {address, serviceInfo, request} = ticket;
    const existing = pending.get(address);
    if (existing && currentIn(existing.ticket, [serviceInfo])) return existing.completion;
    if (existing) cancelSupersededRoute(address, existing);
    const controller = new AbortController();
    const boundTicket = {...ticket, peer: peerIdentityOf(router, serviceInfo.nodeId)};
    const deliverySignal = globalThis.AbortSignal.any([signal, controller.signal]);
    ticket.submit?.();
    const completion = router.deliver(
      address, request, {...routerOptions, signal: deliverySignal},
    ).then((delivery) => ({ticket: boundTicket, delivery}),
      (error) => ({ticket: boundTicket, error}));
    pending.set(address, {controller, ticket: boundTicket, completion, probed: false});
    issued.set(address, {address, serviceInfo, peer: boundTicket.peer});
    return completion;
  }

  async function select(ticket, routerOptions, candidateQueue, probeMs) {
    signal.throwIfAborted();
    start(ticket, routerOptions);
    let timer;
    const events = candidateQueue.flatMap(({address}) => {
      const record = pending.get(address);
      return record ? [record.completion] : [];
    });
    if (probeMs !== null) {
      events.push(new Promise((resolve) => {
        timer = clock.setTimeout(() => resolve(ROUTING_PROBE_ELAPSED), probeMs);
      }));
    }
    try {
      const selected = await Promise.race(events);
      signal.throwIfAborted();
      if (selected === ROUTING_PROBE_ELAPSED) {
        pending.get(ticket.address).probed = true;
      } else {
        pending.delete(selected.ticket.address);
      }
      return selected;
    } finally {
      if (timer !== undefined) clock.clearTimeout(timer);
    }
  }

  return {
    select,
    reconcile,
    currentIn,
    hasPending: () => pending.size > 0,
    canSelect,
    wasProbed: (candidate) => pending.get(candidate.address)?.probed === true,
    hasUnstarted: (candidates, mayRetry) => candidates.some((candidate) =>
      !pending.has(candidate.address) && canSelect(candidate, mayRetry)),
    throwIfAborted: () => signal.throwIfAborted(),
    async redirect(address, request, routerOptions, submit) {
      const {nodeId, serviceId: replicaId} = AddressManager.getInstance().parse(address);
      const result = await start(
        {address, request, serviceInfo: {address, nodeId, replicaId}, submit}, routerOptions);
      signal.throwIfAborted();
      pending.delete(address);
      if (result.error) throw result.error;
      return result;
    },
    redirectedRouteIsCurrent(origin, target, candidates) {
      // A typed redirect from the still-selected owner may lead publication.
      // A third or now-unavailable canonical route cannot inherit that grant.
      return isCurrentPeer(router, target) &&
        (currentIn(target, candidates) || currentIn(origin, candidates));
    },
    dispose() {
      close.abort(new Error(READ_DELIVERY_CLOSED));
      unsubscribe?.();
      pending.clear();
      issued.clear();
    },
  };
}

export {createRecoveryReadDelivery, executorShutdownError, ROUTING_PROBE_ELAPSED};
