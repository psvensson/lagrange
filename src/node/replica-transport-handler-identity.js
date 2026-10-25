// A replica's transport handler is bound to its exact registration identity
// (owner decision N2): activation proves the handler it registered is the one
// at the address, and retirement removes only that handler, against the
// activation effect boundary of the replica's lifecycle owner. Nothing here
// ever removes by address: a transport without the identity API is refused.

const TYPEOF_FUNCTION = 'function';

// Named outcomes of one retirement (R07).
const REPLICA_HANDLER_RETIREMENT_OUTCOME = Object.freeze({
  // This replica's exact handler was registered and is now removed.
  RETIRED: 'retired',
  // This replica's exact handler is not registered (never registered, e.g.
  // shut down before registration, or already removed): nothing is touched.
  ALREADY_ABSENT: 'already_absent',
  // The transport cannot prove handler identity: refused, nothing is touched.
  REFUSED_NO_IDENTITY: 'refused_transport_without_handler_identity',
});

// A retirement that leaves the replica's handler registered is a leak its
// owner must surface, never discard.
const REPLICA_HANDLER_RETIREMENT_LOG_MSG = Object.freeze({
  LEFT_REGISTERED:
    'Replica transport handler left registered: the transport cannot ' +
    'prove handler identity, so retirement was refused',
  NOT_SERVING:
    'Replica transport handler is not serving: its runtime is shut down or ' +
    'it is no longer the exact handler registered at its address',
});

// The typed refusal a handler raises for a delivery it must not take.
const REPLICA_HANDLER_NOT_SERVING_CODE = 'REPLICA_HANDLER_NOT_SERVING';

// Consumers may proceed to dependent releases only after this owner has
// confirmed exact retirement or absence. Logging a refusal is not settlement.
function requireReplicaHandlerRetirement(outcome) {
  if (outcome !== REPLICA_HANDLER_RETIREMENT_OUTCOME.RETIRED &&
      outcome !== REPLICA_HANDLER_RETIREMENT_OUTCOME.ALREADY_ABSENT) {
    throw Object.assign(new Error(REPLICA_HANDLER_RETIREMENT_LOG_MSG.LEFT_REGISTERED),
      {code: outcome});
  }
}

function hasHandlerIdentityApi(transport) {
  return typeof transport?.getRegisteredHandler === TYPEOF_FUNCTION &&
    typeof transport?.unregisterExact === TYPEOF_FUNCTION;
}

/**
 * Whether the exact handler (identity, not presence) is registered at the
 * address: a successor generation's handler never satisfies it, and a router
 * without the identity API fails closed.
 * @param {Object} messageRouter
 * @param {string} address
 * @param {Function|null} handler - The handler the replica registered.
 * @return {boolean}
 */
function isExactReplicaHandlerRegistered(messageRouter, address, handler) {
  if (typeof messageRouter?.getRegisteredHandler !== TYPEOF_FUNCTION) {
    return false;
  }
  return Boolean(handler) &&
    messageRouter.getRegisteredHandler(address) === handler;
}

/**
 * Whether a replica runtime's exact transport handler is registered AND its
 * handler retirement runs through `lifecycleOwner`, so an activation effect
 * section opened on that owner holds retirement off until the ACTIVE CAS
 * settles. A runtime retired through another owner cannot be bound.
 * @param {Object} service - The replica runtime (transport, unifiedAddress,
 *   transportHandler, retirement lane).
 * @param {Object} lifecycleOwner - The ReplicaStateMachine running the
 *   activation.
 * @return {boolean}
 */
function isReplicaServiceHandlerBound(service, lifecycleOwner) {
  const retirementLane = service?.resolveHandlerRetirementLane?.() ||
    service?.replicaStateMachine || null;
  return Boolean(lifecycleOwner) && retirementLane === lifecycleOwner &&
    isExactReplicaHandlerRegistered(service.transport,
      service.unifiedAddress, service.transportHandler);
}

/**
 * The one dispatch-side identity policy (finding F1): a handler takes a
 * delivery only while its runtime is open and it is the exact handler
 * registered at its address. Otherwise it refuses with a typed error, which
 * the router reports as the handler's failure: a retired incarnation never
 * answers for a message it dropped.
 * @param {Object} service - {transport, unifiedAddress, transportHandler,
 *   isShutdown}.
 * @return {void}
 * @throws {Error} REPLICA_HANDLER_NOT_SERVING.
 */
function assertReplicaHandlerServing(service) {
  if (service.isShutdown === true || !isExactReplicaHandlerRegistered(
    service.transport, service.unifiedAddress, service.transportHandler)) {
    throw Object.assign(new Error(REPLICA_HANDLER_RETIREMENT_LOG_MSG.NOT_SERVING),
      {code: REPLICA_HANDLER_NOT_SERVING_CODE});
  }
}

// The one retirement of an exact handler: never by address, refused when the
// transport cannot prove identity.
function retireExactTransportHandler(transport, address, handler) {
  if (!transport || !handler) {
    return REPLICA_HANDLER_RETIREMENT_OUTCOME.ALREADY_ABSENT;
  }
  if (!hasHandlerIdentityApi(transport)) {
    return REPLICA_HANDLER_RETIREMENT_OUTCOME.REFUSED_NO_IDENTITY;
  }
  return transport.unregisterExact(address, handler) === true ?
    REPLICA_HANDLER_RETIREMENT_OUTCOME.RETIRED :
    REPLICA_HANDLER_RETIREMENT_OUTCOME.ALREADY_ABSENT;
}

/**
 * Retire a node-singleton handler (one per node, no replica lifecycle lane)
 * by its exact registered identity, through the same outcome, report and
 * fail-closed settlement as a replica handler (findings F2, F4).
 * @param {Object} logger - The retiring owner's logger.
 * @param {Object} retirement - {transport, address, handler}.
 * @return {string} RETIRED or ALREADY_ABSENT.
 * @throws {Error} When the transport cannot prove handler identity.
 */
function retireNodeTransportHandler(logger, retirement) {
  const {transport, address, handler} = retirement;
  const outcome = reportReplicaHandlerRetirement(logger, {address, replicaId: null},
    retireExactTransportHandler(transport, address, handler));
  requireReplicaHandlerRetirement(outcome);
  return outcome;
}

/**
 * Retire a replica's exact transport handler through its lifecycle owner: an
 * activation that confirmed the handler completes its ACTIVE CAS first; a
 * later one finds it gone. A successor's handler is never removed.
 * @param {Object} retirement - {transport, address, handler, replicaId, lane}.
 * @return {Promise<string>} A REPLICA_HANDLER_RETIREMENT_OUTCOME.
 */
async function retireReplicaTransportHandler(retirement) {
  const {transport, address, handler, replicaId, lane} = retirement;
  if (!transport || !handler) {
    return REPLICA_HANDLER_RETIREMENT_OUTCOME.ALREADY_ABSENT;
  }
  if (!hasHandlerIdentityApi(transport)) {
    return REPLICA_HANDLER_RETIREMENT_OUTCOME.REFUSED_NO_IDENTITY;
  }
  let outcome = REPLICA_HANDLER_RETIREMENT_OUTCOME.ALREADY_ABSENT;
  const retire = () => {
    outcome = retireExactTransportHandler(transport, address, handler);
  };
  if (typeof lane?.retireReplicaHandler === TYPEOF_FUNCTION && replicaId) {
    await lane.retireReplicaHandler(replicaId, retire);
  } else {
    retire();
  }
  return outcome;
}

/**
 * Surface one retirement outcome through the retiring owner's logger: a
 * refused retirement left the replica's handler registered (a leak), and is
 * reported as an error with the address and replica; the other outcomes
 * leave nothing behind.
 * @param {Object} logger - The retiring owner's subsystem logger.
 * @param {Object} retirement - {address, replicaId}.
 * @param {string} outcome - A REPLICA_HANDLER_RETIREMENT_OUTCOME.
 * @return {string} The outcome.
 */
function reportReplicaHandlerRetirement(logger, retirement, outcome) {
  if (outcome === REPLICA_HANDLER_RETIREMENT_OUTCOME.REFUSED_NO_IDENTITY) {
    logger.error(REPLICA_HANDLER_RETIREMENT_LOG_MSG.LEFT_REGISTERED, {
      address: retirement.address,
      replicaId: retirement.replicaId,
      outcome,
    });
  }
  return outcome;
}

export {
  REPLICA_HANDLER_RETIREMENT_LOG_MSG,
  REPLICA_HANDLER_RETIREMENT_OUTCOME,
  assertReplicaHandlerServing,
  isExactReplicaHandlerRegistered,
  isReplicaServiceHandlerBound,
  reportReplicaHandlerRetirement,
  requireReplicaHandlerRetirement,
  retireNodeTransportHandler,
  retireReplicaTransportHandler,
};
