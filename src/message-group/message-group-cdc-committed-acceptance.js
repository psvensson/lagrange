// MessageGroupService's transient response custody. Only its native
// application afterCommit can produce an accepted receipt; this queue stores
// no durable outcome and cannot discharge the source ledger's obligation.
import {CDC_EVENT_METADATA_FIELD, captureCdcEvents} from
  '../cdc/cdc-event-envelope.js';
import {CDC_COMPLETION, buildAlreadyAppliedCdcOutcome, buildCommittedCdcOutcome,
  buildProvisionalCdcOutcome, cdcCommitWaitIdentity, hasDurableCdcEvents,
  isAlreadyAppliedCdcOutcome, isCommittedCdcOutcome, isProvisionalCdcOutcome,
  unconfirmedCdcAcceptance, unknownCdcAcceptance} from
  '../cdc/cdc-delivery-outcome.js';
import {isSourceRange} from '../cache/system-table-cache-cdc-observation.js';
import {DURABLE_RANGE_DECISION, classifyDurableRangeAtLeader} from
  './message-group-cdc-source-range.js';
import {assertCdcDeliveryInvocation} from '../cdc/cdc-delivery-invocation.js';
import {appendOwnArrayValue, copyArrayByIndex, isDenseDataArray, isRecord} from
  '../utils/canonical-json-data.js';
import {createTimeoutBudget, getRemainingBudgetMs} from '../control-plane/timeout-budget.js';
import {PROPOSAL_QUEUE_DEFAULT, PROPOSAL_QUEUE_BACKPRESSURE_CODE} from
  '../partition/proposal-queue-constants.js';
import {MESSAGE_GROUP_COMMAND_TYPE} from './constants.js';
import {MESSAGE_GROUP_CDC_FORWARD_MODE} from './message-group-forwarding-owner-constants.js';
import {proposeMessageGroupCommand} from './message-group-proposal-routing.js';

const objectHasOwn = Object.hasOwn;
const objectFreeze = Object.freeze;
const objectAssign = Object.assign;
const numberIsFinite = Number.isFinite;
const mathMin = Math.min;
const promiseWithResolvers = Promise.withResolvers.bind(Promise);
const promiseRace = Promise.race.bind(Promise);
const reservationToken = Symbol;
const arraySome = Function.call.bind(Array.prototype.some);
const arrayFind = Function.call.bind(Array.prototype.find);

// A durable vector has one committed form, whatever its length: CDC_BATCH
// with the source range it was shipped as (CDC Stage 3), so every member
// decides the range against its own cache when the entry applies.
function capturedCommand(events, sourceRange) {
  return objectFreeze({type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events, sourceRange});
}

const CDC_ACCEPTANCE_LOG_MSG = objectFreeze({
  DUPLICATE_IN_FLIGHT:
    'CDC vector refused as a duplicate: raw work for the identical vector is still open',
});

function invalidCdcInput() {
  return objectAssign(new Error(CDC_COMPLETION.INVALID), {code: CDC_COMPLETION.INVALID});
}

// The source range of a durable vector (CDC Stage 3), captured once. Every
// durable vector carries one: there is no positionless durable form.
function captureSourceRange(options) {
  const range = options.sourceRange;
  if (!isSourceRange(range)) throw invalidCdcInput();
  return objectFreeze({sourcePartition: range.sourcePartition, incarnation: range.incarnation,
    after: objectFreeze({logIndex: range.after.logIndex, ordinal: range.after.ordinal}),
    through: objectFreeze({logIndex: range.through.logIndex, ordinal: range.through.ordinal})});
}

// The typed gap answer: nothing proposed, the table is listed again here;
// the source retries the range on this hint.
function positionGapAcceptance() {
  return {...unknownCdcAcceptance(CDC_COMPLETION.POSITION_GAP),
    retryAfterMs: PROPOSAL_QUEUE_DEFAULT.BACKPRESSURE_RETRY_AFTER_MS};
}

function backpressuredCdcAcceptance() {
  return {...unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE),
    retryAfterMs: PROPOSAL_QUEUE_DEFAULT.BACKPRESSURE_RETRY_AFTER_MS};
}

// The identical vector's response already retired but its raw work (a
// proposal or forward) is still open: this caller retries after the hint. It
// is not a capacity refusal, and no relay may treat it as a fault of its route.
function duplicateInFlightAcceptance(service, key) {
  service.logger?.info?.(CDC_ACCEPTANCE_LOG_MSG.DUPLICATE_IN_FLIGHT,
    {groupId: service.groupId, vectorDigest: key});
  return {...unknownCdcAcceptance(CDC_COMPLETION.DUPLICATE_IN_FLIGHT),
    retryAfterMs: PROPOSAL_QUEUE_DEFAULT.BACKPRESSURE_RETRY_AFTER_MS};
}

// A second caller with the identical vector while the first one's response is
// pending (a new source leader re-shipping what the old one has in flight, a
// sender retry) joins it: one proposal, and the joiner receives the first
// one's settled answer.
function joinableWait(service, key) {
  const first = service.cdcCommitWaiters.get(key);
  return service.cdcCommitWaiters.isResponsePending(key) && liveWait(service, first) ?
    first : null;
}

function currentWait(service, key, entry) {
  return service.cdcCommitWaiters.get(key) === entry &&
    service.cdcCommitWaiters.isResponsePending(key);
}

function parentWaitIsLive(entry) {
  try {
    entry.parent.assertCurrent?.();
    if (entry.parent.context !== null) assertCdcDeliveryInvocation(entry.parent.context);
    const remaining = entry.parent.remainingMs?.() ?? Infinity;
    return remaining > 0 && (numberIsFinite(remaining) || !entry.parent.remainingMs);
  } catch (_parentRefused) {
    // The parent's typed retirement makes this receipt UNKNOWN even if this
    // recipient's creating clock has not dispatched its own deadline yet.
    return false;
  }
}

function liveWait(service, entry) {
  return !service.isShutdown && service.initialized && service.raft === entry.port &&
    service.cdcCommitLifetime === entry.lifetime && service.groupId === entry.groupId &&
    getRemainingBudgetMs(entry.budget, {now: entry.now}) > 0 && parentWaitIsLive(entry);
}

function armCdcWait(service, key, entry, budget) {
  if (entry.timeoutId !== null) entry.clock.clearTimeout(entry.timeoutId);
  entry.budget = budget;
  entry.timeoutId = entry.clock.setTimeout(() => {
    if (currentWait(service, key, entry)) {
      service.cdcCommitWaiters.resolve(key, unknownCdcAcceptance());
    }
  }, getRemainingBudgetMs(budget, {now: entry.now}));
}

function normalizeOrdinaryCdcEvent(service, event, options) {
  const normalized = service.normalizeCDCBatchEvents([event], options);
  if (!isDenseDataArray(normalized) || normalized.length !== 1 || !isRecord(normalized[0])) {
    throw objectAssign(new Error(CDC_COMPLETION.INVALID), {code: CDC_COMPLETION.INVALID});
  }
  const member = normalized[0];
  if (member.tableName !== event.tableName || member.operation !== event.operation ||
      member.data !== event.data || !objectHasOwn(member, CDC_EVENT_METADATA_FIELD.TIMESTAMP) ||
      typeof member.timestamp !== 'string' ||
      member.timestamp.length === 0) {
    throw objectAssign(new Error(CDC_COMPLETION.INVALID), {code: CDC_COMPLETION.INVALID});
  }
  if (objectHasOwn(event, CDC_EVENT_METADATA_FIELD.TIMESTAMP) &&
      member.timestamp !== event.timestamp) {
    throw objectAssign(new Error(CDC_COMPLETION.INVALID), {code: CDC_COMPLETION.INVALID});
  }
  // The existing normalizer owns stamp assignment. Every other captured
  // envelope field and the detached data remain those of the original member.
  return {...event, timestamp: member.timestamp};
}

function captureCdcCommandVector(service, events, options) {
  const input = captureCdcEvents(events);
  const inputVectorDigest = cdcCommitWaitIdentity(input);
  const normalized = copyArrayByIndex(input, (event) =>
    objectHasOwn(event, CDC_EVENT_METADATA_FIELD.EVENT_KEY) ? event :
      normalizeOrdinaryCdcEvent(service, event, options));
  return {events: captureCdcEvents(normalized), inputVectorDigest};
}

function reserveCdcWait(service, command, timeoutMs, parent, options) {
  const queue = service.cdcCommitWaiters;
  const reservation = reservationToken();
  // The queue owner reserves capacity BEFORE immutable capture or digesting.
  // Every durable caller, the public receiver included, reaches this point
  // having read only shallow wrapper fields: message type, the durable
  // classification, the remaining duration and the forward context. No event
  // payload is traversed or copied before this reservation.
  queue.enqueue(reservation, {});
  try {
    const clock = queue.timeSource;
    const now = () => clock.now();
    const budget = createTimeoutBudget({configuredBudgetMs: timeoutMs, now});
    const {events, inputVectorDigest} = captureCdcCommandVector(service,
      command.events, options);
    // The range decision of the replica that will propose (CDC Stage 3), on
    // the captured vector: a gap or an already-committed range proposes
    // nothing.
    const classified = classifyDurableRangeAtLeader(service, command.sourceRange,
      events[0].tableName);
    if (classified.decision === DURABLE_RANGE_DECISION.GAP) {
      return {answer: positionGapAcceptance()};
    }
    if (classified.decision === DURABLE_RANGE_DECISION.ALREADY_APPLIED) {
      return {answer: buildAlreadyAppliedCdcOutcome(events, service.groupId,
        classified.committed.through, classified.committed.incarnation)};
    }
    const key = cdcCommitWaitIdentity(events);
    if (queue.has(key)) {
      const first = joinableWait(service, key);
      return first === null ? {answer: duplicateInFlightAcceptance(service, key)} :
        {join: {first, events, inputVectorDigest, timeoutMs}};
    }
    const completion = promiseWithResolvers();
    const entry = {events, inputVectorDigest, budget, originalBudget: budget,
      settled: completion.promise,
      clock, now, parent, port: service.raft,
      lifetime: service.cdcCommitLifetime, groupId: service.groupId,
      resolve: completion.resolve,
      reject: (error) => completion.resolve(error.answer ?? unknownCdcAcceptance()),
      timeoutId: null};
    if (!liveWait(service, entry)) return {answer: unknownCdcAcceptance()};
    // No await or caller callback separates the reservation's release and
    // installation under the exact semantic identity.
    queue.resolve(reservation);
    queue.enqueue(key, entry);
    armCdcWait(service, key, entry, budget);
    return {key, entry, completion: completion.promise,
      command: capturedCommand(events, command.sourceRange)};
  } finally {
    queue.resolve(reservation);
  }
}

function proposeCdcAndAwaitCommitted(service, wait) {
  // A resolved receipt/refusal belongs to this invocation. A route retry
  // cannot reopen its waiter or append again after that settlement.
  if (!currentWait(service, wait.key, wait.entry)) return wait.completion;
  const raw = service.cdcCommitWaiters.ownOperation(wait.key,
    () => runCdcProposal(service, wait));
  // Charge the original operation before its first port call and before the
  // routing deadline can detach the response. Remote calls still retain the
  // same recipient queue slot even though no local source brand crossed wire.
  wait.entry.parent.context?.ownChild(raw);
  return raw;
}

function forwardCdcWithinWait(service, wait, forward) {
  // A follower's forward is raw work of this same admitted entry. The slot
  // stays charged until the forward's own transport promise settles, while
  // the caller's response still retires at its original deadline. A FORWARD
  // attempt that finds this entry's PROPOSE raw still open deliberately joins
  // it (ownOperation) instead of forwarding: one raw effect per entry at a time.
  if (!currentWait(service, wait.key, wait.entry)) return wait.completion;
  const raw = service.cdcCommitWaiters.ownOperation(wait.key, forward);
  wait.entry.parent.context?.ownChild(raw);
  // Retiring the response settles wait.completion in the same synchronous
  // step, before the raw body can observe it and reject RELEASED, so a late
  // raw refusal or failure never replaces the caller's settled answer.
  return promiseRace([raw, wait.completion]);
}

async function runCdcProposal(service, wait) {
  if (!currentWait(service, wait.key, wait.entry)) return wait.completion;
  assertCdcRequestCurrent(service, wait, null);
  const timeoutMs = mathMin(service.computeCdcProposeTimeoutMs(service.retryMaxAttempts),
    getRemainingBudgetMs(wait.entry.originalBudget, {now: wait.entry.now}));
  armCdcWait(service, wait.key, wait.entry,
    createTimeoutBudget({configuredBudgetMs: timeoutMs, now: wait.entry.now}));
  try {
    await proposeMessageGroupCommand(service, wait.command);
    return await wait.completion;
  } catch (error) {
    if (currentWait(service, wait.key, wait.entry)) {
      armCdcWait(service, wait.key, wait.entry, wait.entry.originalBudget);
    }
    throw error;
  }
}

function assertCdcRequestCurrent(service, wait, context) {
  if (context !== null) assertCdcDeliveryInvocation(context);
  if (!liveWait(service, wait.entry)) {
    throw objectAssign(new Error(CDC_COMPLETION.UNKNOWN), {retryable: false});
  }
}

function provisionalCdcIngress(service, wait, options) {
  if (options.skipSubscriptionCheck !== true &&
      arraySome(wait.entry.events, (event) => !service.cdcHandler.isSubscribed(event.tableName))) {
    return unknownCdcAcceptance();
  }
  for (let index = 0; index < wait.entry.events.length; index += 1) {
    service.cdcHandler.applyImmediate(wait.entry.events[index], options);
  }
  return buildProvisionalCdcOutcome(wait.entry.events,
    service.resolveStrictCdcForwardRetryAfterMs(), service.groupId);
}

function capturedCdcIngress(service, wait, options) {
  const strictEvent = arrayFind(wait.entry.events, (event) =>
    service.shouldUseStrictCDCForwarding(event));
  return service.resolveCdcIngressDecision({
    ...(strictEvent ?? wait.entry.events[0]), events: wait.entry.events,
    relayDepth: options.relayDepth, cdcForwardMode: options.cdcForwardMode,
    targetGroupId: options.targetGroupId,
  });
}

async function deliverCapturedCdc(service, wait, options, context) {
  const assertCurrent = () => assertCdcRequestCurrent(service, wait, context);
  assertCurrent();
  const terminal = options.cdcForwardMode === MESSAGE_GROUP_CDC_FORWARD_MODE.NATIVE_COMMIT;
  const ingress = capturedCdcIngress(service, wait, options);
  if (terminal && (options.targetGroupId !== service.groupId ||
      !service.isCurrentRaftLeader() || ingress.ready !== true)) return unknownCdcAcceptance();
  if (!terminal && (options.skipReplication === true ||
      (!service.isCurrentRaftLeader() && ingress?.localIngress === true))) {
    return provisionalCdcIngress(service, wait, options);
  }
  const answer = await service.proposeCDCCommand(wait.command, {
    ...options, assertCurrent,
    applyProvisionalIngress: () => {
      assertCurrent();
      return terminal ? unknownCdcAcceptance() : provisionalCdcIngress(service, wait, options);
    },
    remainingMs: () => {
      assertCurrent();
      return getRemainingBudgetMs(wait.entry.originalBudget, {now: wait.entry.now});
    },
    proposeCommand: () => proposeCdcAndAwaitCommitted(service, wait),
    forwardCommand: (forward) => forwardCdcWithinWait(service, wait, forward),
  });
  assertCurrent();
  return isCommittedCdcOutcome(answer, wait.entry.events, service.groupId) ||
    isAlreadyAppliedCdcOutcome(answer, wait.entry.events, service.groupId) ||
    isProvisionalCdcOutcome(answer, wait.entry.events, service.groupId) ?
    answer : {...unconfirmedCdcAcceptance(answer), cause: answer};
}

function captureCdcParentGrant(service, options) {
  const context = options.deliveryContext ?? null;
  if (context !== null) assertCdcDeliveryInvocation(context);
  options.assertCurrent?.();
  const timeoutMs = mathMin(service.deliveryTimeoutMs,
    context === null ? service.deliveryTimeoutMs : context.remainingMs(),
    options.remainingMs ? options.remainingMs() : service.deliveryTimeoutMs);
  const parent = objectFreeze({context,
    assertCurrent: options.assertCurrent, remainingMs: options.remainingMs});
  return {context, timeoutMs, parent};
}

function inputCdcOutcome(service, wait, answer, context) {
  assertCdcRequestCurrent(service, wait, context);
  if (!isCommittedCdcOutcome(answer, wait.entry.events, wait.entry.groupId) &&
      !isAlreadyAppliedCdcOutcome(answer, wait.entry.events, wait.entry.groupId) &&
      !isProvisionalCdcOutcome(answer, wait.entry.events, wait.entry.groupId)) return answer;
  // Only this live admission owns I -> N. Native/remote/provisional acceptance
  // must first bind the actual normalized command; no receipt field is changed.
  return {...answer, cdcVectorDigest: wait.entry.inputVectorDigest};
}

async function retiredCdcOutcome(service, wait, context) {
  // Expiry, shutdown or parent retirement of this admitted wait is named here
  // as the response's own settled typed answer, never an untyped deadline
  // error that a routing wrapper later renames. A committed receipt survives
  // only while this invocation is still live and bound to its input digest.
  if (currentWait(service, wait.key, wait.entry)) {
    service.cdcCommitWaiters.resolve(wait.key, unknownCdcAcceptance());
  }
  const settled = await wait.completion;
  if (!isCommittedCdcOutcome(settled, wait.entry.events, wait.entry.groupId)) return settled;
  return liveWait(service, wait.entry) ? inputCdcOutcome(service, wait, settled, context) :
    {...unknownCdcAcceptance(), cause: settled};
}

// The joiner awaits the first admission's settled answer under its own
// deadline and binds a committed or provisional receipt to its own input
// digest, as inputCdcOutcome binds the first one's. It holds no queue slot and
// starts no raw work: what it costs is bounded by its caller's invocation.
async function joinCdcWait(service, join, context) {
  const {first, events, inputVectorDigest, timeoutMs} = join;
  const deadline = promiseWithResolvers();
  const timer = first.clock.setTimeout(() => deadline.resolve(unknownCdcAcceptance()), timeoutMs);
  try {
    const answer = await promiseRace([first.settled, deadline.promise]);
    if (context !== null) assertCdcDeliveryInvocation(context);
    if (!isCommittedCdcOutcome(answer, events, first.groupId) &&
        !isProvisionalCdcOutcome(answer, events, first.groupId)) return unknownCdcAcceptance();
    return {...answer, cdcVectorDigest: inputVectorDigest};
  } finally {
    first.clock.clearTimeout(timer);
  }
}

async function applyDurableCdcBatch(service, events, options = {}) {
  const sourceRange = captureSourceRange(options);
  const {context, timeoutMs, parent} = captureCdcParentGrant(service, options);
  if (!numberIsFinite(timeoutMs) || timeoutMs <= 0) return unknownCdcAcceptance();
  let wait;
  try {
    wait = reserveCdcWait(service,
      {type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events, sourceRange},
      timeoutMs, parent, options);
  } catch (error) {
    if (error.code === PROPOSAL_QUEUE_BACKPRESSURE_CODE) return backpressuredCdcAcceptance();
    throw error;
  }
  if (wait.answer) return wait.answer;
  if (wait.join) return joinCdcWait(service, wait.join, context);
  // The first admission's own answer, unbound to its input digest: what a
  // joiner receives when this response settles it (a committed receipt
  // settles it earlier, from the apply).
  let settled = unknownCdcAcceptance();
  try {
    settled = await deliverCapturedCdc(service, wait, options, context);
    return inputCdcOutcome(service, wait, settled, context);
  } catch (error) {
    if (currentWait(service, wait.key, wait.entry) && liveWait(service, wait.entry)) throw error;
    return retiredCdcOutcome(service, wait, context);
  } finally {
    if (currentWait(service, wait.key, wait.entry)) {
      service.cdcCommitWaiters.resolve(wait.key, settled);
    }
  }
}

function registerCdcCommittedAcceptance(service, committed, lifetime) {
  if (committed.command.type !== MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH) return;
  const {events} = committed.command;
  if (!hasDurableCdcEvents(events) || lifetime === null) return;
  const key = cdcCommitWaitIdentity(events);
  const entry = service.cdcCommitWaiters.get(key);
  if (!entry || entry.lifetime !== lifetime) return;
  const settle = (answer) => {
    if (currentWait(service, key, entry)) service.cdcCommitWaiters.resolve(key, answer);
  };
  appendOwnArrayValue(committed.effects.afterRollback, () => settle(unknownCdcAcceptance()));
  appendOwnArrayValue(committed.effects.afterCommit, () => {
    if (!currentWait(service, key, entry)) return;
    const answer = buildCommittedCdcOutcome(events, service.groupId, committed);
    settle(liveWait(service, entry) && isCommittedCdcOutcome(answer, entry.events, entry.groupId) ?
      answer : unknownCdcAcceptance());
  });
}

function retireCdcCommitWaiters(service) {
  service.cdcCommitWaiters.release(() => unknownCdcAcceptance());
}

export {applyDurableCdcBatch, registerCdcCommittedAcceptance,
  retireCdcCommitWaiters};
