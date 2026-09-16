/**
 * The node-local authorities a replica hosted on this node inherits.
 *
 * A replica is not a free-standing thing: it reads a node's cache, stamps on a
 * node's clock, and - when that node owns one - hosts its consensus timers
 * there too, and draws its election timing from that node's randomness. Both seed phases resolve the same two authorities the same way,
 * so the rule lives in one place rather than in each phase.
 *
 * Both default to undefined, which is what every caller that does not host
 * several node runtimes in one process has always passed.
 *
 * @module bootstrap/shared/hosted-replica-authorities
 */

/**
 * @param {Object} delegates - The seed delegates.
 * @return {{timeSource: Object|undefined, nodeService: Object|undefined}}
 */
function resolveHostedReplicaAuthorities(delegates) {
  return {
    timeSource: delegates.getTimeSource ? delegates.getTimeSource() : undefined,
    nodeService: delegates.getNodeService ?
      delegates.getNodeService() :
      undefined,
    randomSource: delegates.getRandomSource ?
      delegates.getRandomSource() :
      undefined,
  };
}

/**
 * The clock a seed phase reads for waits it takes ON BEHALF OF THIS NODE -
 * leadership waits, backoff deadlines. Without a hosting runtime clock it is
 * the host clock, exactly as these sites read it before.
 *
 * @param {Object} delegates - The seed delegates.
 * @return {Function} a millisecond clock.
 */
function resolveHostedNodeClock(delegates) {
  const timeSource = delegates.getTimeSource ?
    delegates.getTimeSource() :
    null;
  return timeSource ? () => timeSource.now() : Date.now;
}

export {resolveHostedNodeClock, resolveHostedReplicaAuthorities};
