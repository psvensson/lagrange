import {ProposalQueue} from '../partition/proposal-queue.js';
import {PROPOSAL_QUEUE_PROPOSAL_STATE} from '../partition/proposal-queue-constants.js';
import {
  buildCommittedCdcOutcome,
  buildProvisionalCdcOutcome,
  CDC_COMPLETION,
  cdcCommitWaitIdentity,
  isCommittedCdcOutcome,
  unknownCdcAcceptance,
} from '../cdc/cdc-delivery-outcome.js';
import {MESSAGE_GROUP_COMMAND_TYPE} from './constants.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {NUM} from '../constants/numbers.js';
import {digest, serializeJsonData} from '../utils/canonical-json-data.js';
import {MESSAGE_GROUP_CDC_INGRESS_ACTION} from
  './message-group-forwarding-owner-constants.js';

const owners = new WeakMap();
const CDC_COMMIT_WAIT_BOUND = Object.freeze({
  MAX_WAITS: NUM.SIXTY_FOUR,
  MAX_EVENTS_PER_WAIT: NUM.TWO_HUNDRED_FIFTY_SIX,
  MAX_BYTES_PER_WAIT: NUM.BYTES_PER_MIB,
  MAX_PENDING_EVENTS: NUM.TWO_HUNDRED_FIFTY_SIX * NUM.TWO,
  MAX_PENDING_BYTES: NUM.BYTES_PER_MIB * NUM.FOUR,
  RETRY_AFTER_MS: NUM.HUNDRED,
});

function createState(service) {
  return {closed: false, generation: Object.freeze({}),
    queue: new ProposalQueue({timeSource: service.timeSource,
      maxCapacity: CDC_COMMIT_WAIT_BOUND.MAX_WAITS}),
    requestKeys: new Map(), pendingEvents: 0, pendingBytes: 0};
}

function stateOf(service) {
  let state = owners.get(service);
  if (!state) {
    state = createState(service);
    owners.set(service, state);
  }
  return state;
}

function openCdcCommitWaits(service) {
  const current = owners.get(service);
  if (current && !current.closed) return current.generation;
  const replacement = createState(service);
  owners.set(service, replacement);
  return replacement.generation;
}

function readCdcCommitWaitGeneration(service) {
  return stateOf(service).generation;
}

function commandEvents(command) {
  return command.type === MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH ? command.events : [command];
}

function requestIdentity(events) {
  return digest(events.map((event) => ({
    sourcePartition: event.sourcePartition, eventKey: event.eventKey,
  })));
}

function retainedBytesOf(events) {
  return Buffer.byteLength(serializeJsonData(events.map((event) => ({
    tableName: event.tableName,
    operation: event.operation,
    data: event.data,
    timestamp: event.timestamp,
    sourcePartition: event.sourcePartition,
    eventKey: event.eventKey,
  })), {sortKeys: true}));
}

function capacityRefusal(events, state) {
  const eventCount = events.length;
  const retainedBytes = retainedBytesOf(events);
  const distinct = new Set(events.map((event) =>
    JSON.stringify([event.sourcePartition, event.eventKey]))).size;
  if (distinct !== eventCount) {
    return {answer: {success: false, error: CDC_COMPLETION.INVALID,
      deferRetry: false}, eventCount, retainedBytes};
  }
  if (eventCount === 0 || eventCount > CDC_COMMIT_WAIT_BOUND.MAX_EVENTS_PER_WAIT ||
      retainedBytes > CDC_COMMIT_WAIT_BOUND.MAX_BYTES_PER_WAIT ||
      state.pendingEvents + eventCount > CDC_COMMIT_WAIT_BOUND.MAX_PENDING_EVENTS ||
      state.pendingBytes + retainedBytes > CDC_COMMIT_WAIT_BOUND.MAX_PENDING_BYTES) {
    return {answer: {...unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE),
      retryAfterMs: CDC_COMMIT_WAIT_BOUND.RETRY_AFTER_MS}, eventCount, retainedBytes};
  }
  return {answer: null, eventCount, retainedBytes};
}

function retireEntry(state, entry) {
  if (entry.retired) return;
  entry.retired = true;
  state.pendingEvents -= entry.eventCount;
  state.pendingBytes -= entry.retainedBytes;
  if (state.requestKeys.get(entry.requestKey) === entry.semanticKey) {
    state.requestKeys.delete(entry.requestKey);
  }
}

// A shared finite wait for the exact semantic command, registered before the
// port can synchronously commit it. Re-entry never replaces its deadline.
function registerCdcCommitWait(service, events, timeoutMs) {
  const state = stateOf(service);
  const key = cdcCommitWaitIdentity(events);
  const requestKey = requestIdentity(events);
  if (state.closed) return {promise: Promise.resolve(unknownCdcAcceptance()), active: () => false};
  const requestOwner = state.requestKeys.get(requestKey);
  if (requestOwner && requestOwner !== key) {
    return {promise: Promise.resolve({success: false, error: CDC_COMPLETION.INVALID,
      deferRetry: false}), active: () => false};
  }
  const existing = state.queue.get(key);
  if (existing) return {promise: existing.promise, active: () => false};
  const capacity = capacityRefusal(events, state);
  if (capacity.answer) {
    return {promise: Promise.resolve(capacity.answer), active: () => false};
  }
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes; reject = no;
  })
    .catch((error) => error.answer || unknownCdcAcceptance());
  const entry = {promise, timeoutId: null, requestKey, semanticKey: key,
    eventCount: capacity.eventCount, retainedBytes: capacity.retainedBytes, retired: false};
  entry.resolve = (answer) => {
    retireEntry(state, entry);
    resolve(answer);
  };
  entry.reject = (error) => {
    retireEntry(state, entry);
    reject(error);
  };
  try {
    state.queue.enqueue(key, entry);
  } catch (error) {
    resolve({...unknownCdcAcceptance(), retryAfterMs: error.retryAfterMs});
    return {promise, active: () => false};
  }
  state.requestKeys.set(requestKey, key);
  state.pendingEvents += entry.eventCount;
  state.pendingBytes += entry.retainedBytes;
  entry.timeoutId = service.timeSource.setTimeout(() => {
    if (state.closed || state.queue.get(key) !== entry) return;
    reportWaitBoundSpent(service.logger, {
      wait: 'computeCdcProposeTimeoutMs',
      awaited: 'exact message-group CDC command committed application',
      boundMs: timeoutMs,
      elapsedMs: timeoutMs,
      lastObserved: {committed: false, pending: state.queue.size},
      scope: {groupId: service.groupId, replicaId: service.replicaId},
      subject: service.replicaId,
    });
    state.queue.releaseEntry(key, () => unknownCdcAcceptance());
  }, timeoutMs);
  return {
    promise,
    active: () => !state.closed && state.queue.get(key) === entry,
    submitted: () => state.queue.get(key) === entry &&
      state.queue.markProposal(key, PROPOSAL_QUEUE_PROPOSAL_STATE.PROPOSED),
    resolve: (answer) => state.queue.get(key) === entry && state.queue.resolve(key, answer),
  };
}

function applyImmediateEvents(service, events, skipSubscriptionCheck) {
  const applied = [];
  for (const event of events) {
    if (service.cdcHandler.applyImmediate(event, {skipSubscriptionCheck})) {
      applied.push(event);
    }
  }
  service.emitCDCAppliedEvents(applied, null);
  return applied;
}

function followerIngressOutcome(service, events, strictIngressDecision,
  skipSubscriptionCheck) {
  if (service.isCurrentRaftLeader()) return null;
  const retryAfterMs = service.resolveStrictCdcForwardRetryAfterMs();
  if (strictIngressDecision?.localIngress === true) {
    const applied = applyImmediateEvents(
      service, events, skipSubscriptionCheck);
    return applied.length === events.length ?
      buildProvisionalCdcOutcome(events, retryAfterMs) :
      unknownCdcAcceptance();
  }
  return strictIngressDecision?.ready === false ?
    {...unknownCdcAcceptance(), retryAfterMs} : null;
}

function cdcCommandOf(events) {
  return events.length === 1 ?
    {type: MESSAGE_GROUP_COMMAND_TYPE.CDC, ...events[0]} :
    {type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events};
}

function proposeForCommitReceipt(service, command, events, wait) {
  void service.proposeCDCCommand(command, {shouldContinue: wait.active}).then((answer) => {
    if (isCommittedCdcOutcome(answer, events, service.groupId)) wait.resolve(answer);
  }, (error) => {
    wait.resolve({...unknownCdcAcceptance(), retryAfterMs: error.retryAfterMs});
  });
}

async function applyDurableCdcBatch(service, events, options) {
  const {strictIngressDecision, skipSubscriptionCheck} = options;
  const followerOutcome = followerIngressOutcome(
    service, events, strictIngressDecision, skipSubscriptionCheck);
  if (followerOutcome) return followerOutcome;
  const shouldApplyEarly = strictIngressDecision?.action ===
    MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL;
  const wait = registerCdcCommitWait(service, events, service.computeCdcProposeTimeoutMs(1));
  if (!wait.active()) return wait.promise;
  const applied = shouldApplyEarly ?
    applyImmediateEvents(service, events, skipSubscriptionCheck) : [];
  const command = cdcCommandOf(events);
  wait.submitted();
  // Routing still means append. Only an exact remote committed receipt or
  // this replica's afterCommit callback can settle positive acceptance.
  proposeForCommitReceipt(service, command, events, wait);
  const answer = await wait.promise;
  if (isCommittedCdcOutcome(answer, events, service.groupId)) return answer;
  return applied.length === events.length ?
    buildProvisionalCdcOutcome(events, service.resolveStrictCdcForwardRetryAfterMs()) :
    answer;
}

function scheduleCdcCommittedAcceptance(service, committed, generation) {
  const state = owners.get(service);
  if (!state || state.closed || state.generation !== generation) return;
  const events = commandEvents(committed.command);
  const key = cdcCommitWaitIdentity(events);
  const answer = buildCommittedCdcOutcome(events, service.groupId, committed);
  committed.effects.afterCommit.push(() => {
    if (!state.closed && owners.get(service) === state) {
      state.queue.resolve(key, answer);
    }
  });
}

function closeCdcCommitWaits(service) {
  const state = owners.get(service);
  if (!state) return;
  state.closed = true;
  state.queue.release(() => unknownCdcAcceptance());
}

function readCdcCommitWaits(service) {
  const state = owners.get(service);
  return state ? {...state.queue.getStats(), pendingEvents: state.pendingEvents,
    pendingBytes: state.pendingBytes, closed: state.closed} :
    {size: 0, maxCapacity: CDC_COMMIT_WAIT_BOUND.MAX_WAITS,
      pendingEvents: 0, pendingBytes: 0, closed: false};
}

export {
  CDC_COMMIT_WAIT_BOUND,
  applyDurableCdcBatch,
  closeCdcCommitWaits,
  openCdcCommitWaits,
  readCdcCommitWaitGeneration,
  readCdcCommitWaits,
  registerCdcCommitWait,
  scheduleCdcCommittedAcceptance,
};
