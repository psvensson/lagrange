import {RealTimeSource} from '../time/time-source.js';

const ROUTING_PROBE_ELAPSED = Symbol('routing probe elapsed');
const READ_DELIVERY_CLOSED = 'Recovery read delivery closed';
const EXECUTOR_SHUTDOWN = 'Query execution aborted: SQL query engine is shutting down';
const EXECUTOR_SHUTDOWN_CODE = 'QUERY_EXECUTOR_SHUTTING_DOWN';

function executorShutdownError() {
  return Object.assign(new Error(EXECUTOR_SHUTDOWN), {code: EXECUTOR_SHUTDOWN_CODE});
}

/**
 * One invocation owns its submissions and their replies. A routing probe
 * only lets that invocation inspect other eligible routes; the transport
 * retains each submitted reply on its caller grant.
 * @param {Object} executor - Partition routing owner.
 * @param {Object} options - Original caller cancellation.
 * @return {Object} Per-invocation scope.
 */
function createRecoveryReadDelivery(executor, options) {
  const clock = executor.messageRouter?.timeSource || new RealTimeSource();
  const close = new AbortController();
  const sources = [close.signal, executor.partitionReadShutdownController.signal];
  if (options.signal) sources.push(options.signal);
  const signal = globalThis.AbortSignal.any(sources);
  const unsubscribe = options.cancellationToken?.onCancel?.((reason) => {
    close.abort(new Error(reason));
  });
  const pending = new Map();

  function start(ticket, routerOptions) {
    const {address, request} = ticket;
    const existing = pending.get(address);
    if (existing) return existing;
    ticket.submit?.();
    const completion = executor.messageRouter.deliver(
      address, request, {...routerOptions, signal},
    ).then((delivery) => ({ticket, delivery}), (error) => ({ticket, error}));
    pending.set(address, completion);
    return completion;
  }

  function eligibleCompletions(candidateQueue) {
    return candidateQueue.flatMap(({address}) =>
      pending.has(address) ? [pending.get(address)] : []);
  }

  async function select(ticket, routerOptions, candidateQueue, probeMs) {
    signal.throwIfAborted();
    if (ticket) start(ticket, routerOptions);
    let timer;
    const events = eligibleCompletions(candidateQueue);
    if (probeMs !== null) {
      events.push(new Promise((resolve) => {
        timer = clock.setTimeout(() => resolve(ROUTING_PROBE_ELAPSED), probeMs);
      }));
    }
    try {
      const selected = await Promise.race(events);
      signal.throwIfAborted();
      if (selected !== ROUTING_PROBE_ELAPSED) pending.delete(selected.ticket.address);
      return selected;
    } finally {
      if (timer !== undefined) clock.clearTimeout(timer);
    }
  }

  return {
    select,
    hasEligible: (candidateQueue) => eligibleCompletions(candidateQueue).length > 0,
    throwIfAborted: () => signal.throwIfAborted(),
    async redirect(ticket, routerOptions) {
      const result = await start(ticket, routerOptions);
      signal.throwIfAborted();
      pending.delete(ticket.address);
      if (result.error) throw result.error;
      return result.delivery;
    },
    dispose() {
      close.abort(new Error(READ_DELIVERY_CLOSED));
      unsubscribe?.();
      pending.clear();
    },
  };
}

export {
  createRecoveryReadDelivery,
  executorShutdownError,
  ROUTING_PROBE_ELAPSED,
};
