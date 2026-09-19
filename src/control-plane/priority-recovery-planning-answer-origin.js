/**
 * Where the priority-recovery planning answer a consumer holds came from:
 * built from this call's sources, produced by the retention layer out of an
 * earlier active snapshot, or served from a memo rather than rebuilt.
 *
 * A consumer cannot tell these apart from the answer itself, so the planning
 * owner states it, as two independent facts composed per CALL:
 *
 * - WHETHER THIS CALL'S ANSWER CAME OUT OF THE RETENTION LAYER. This is a
 *   property of the path the call took, never of the object it returned. The
 *   retention layer hands back the node's active snapshot, and that same
 *   object is what the node's projection memo serves to everybody else; a
 *   mark on the object is therefore inherited by every later reader of it,
 *   including calls that took the early return and never consulted retention
 *   at all (round-2 verification of this quest measured guard reads stated
 *   `retained` this way on real owners, from retention events raised by the
 *   readiness-evaluation path).
 * - WHETHER THIS CALL REBUILT THE PROJECTION. That is the planning projection
 *   memo's own fact.
 *
 * Both live in ONE per-owner record, reset at the start of every answer by
 * `beginPriorityRecoveryPlanningAnswer`, so nothing an earlier call or another
 * consumer's path observed can survive into this one. Retention that must
 * outlive its call - an answer the memo will serve again - travels on the
 * answer-memo entry's VALUE, never its key, read back through
 * `readPriorityRecoveryPlanningAnswerCallRetention`.
 *
 * The composed `origin` keeps the three names the quest statement fixes
 * (fresh, memoized, retained) with retained winning over memoized, and
 * `servedFromMemo` reports the reuse fact on its own so nothing is lost.
 *
 * No answer, summary, memo key, generation, identity or equality is touched:
 * the records live in two WeakMaps keyed by the owner and die with it (quest
 * learner-promotion-guard-inputs-observed, constraint
 * diagnostics-never-decide).
 *
 * An owner that stated no origin for the node asked about reads as UNSTATED:
 * an explicit named state, never a guess at FRESH.
 */

const PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN = Object.freeze({
  FRESH: 'fresh',
  MEMOIZED: 'memoized',
  RETAINED: 'retained',
  UNSTATED: 'unstated',
});

const PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN_UNSTATED = Object.freeze({
  origin: PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN.UNSTATED,
  servedFromMemo: false,
});

const PLANNING_OWNER_TYPE = 'object';

// The facts of the answer in flight, per owner: reset per call, never keyed by
// anything the answer itself carries.
const answerCallFactsByOwner = new WeakMap();
// The composed record a consumer reads back, per owner.
const lastAnswerOriginByOwner = new WeakMap();

function isPlanningOwner(owner) {
  return Boolean(owner) && typeof owner === PLANNING_OWNER_TYPE;
}

// The call facts, only when they belong to the node being asked about: a
// record left by an answer for another node never answers for this one.
function readCallFacts(owner, nodeId) {
  const facts = answerCallFactsByOwner.get(owner);
  return facts && facts.nodeId === nodeId ? facts : null;
}

/**
 * Start one planning answer: forget everything the previous answer, or
 * another consumer's path, observed on this owner.
 *
 * @param {Object|null} owner - The planning owner answering.
 * @param {string|null} nodeId - The node this answer is for.
 * @return {void}
 */
function beginPriorityRecoveryPlanningAnswer(owner, nodeId) {
  if (!isPlanningOwner(owner)) {
    return;
  }
  answerCallFactsByOwner.set(owner, {
    nodeId,
    servedFromMemo: false,
    retained: false,
  });
}

/**
 * Record whether the planning projection this call needs was served from the
 * projection memo instead of being rebuilt.
 *
 * @param {Object|null} owner - The planning owner answering.
 * @param {string|null} nodeId - The node this answer is for.
 * @param {boolean} servedFromMemo - True when the memo answered.
 * @return {void}
 */
function recordPriorityRecoveryPlanningProjectionReuse(
  owner,
  nodeId,
  servedFromMemo,
) {
  if (!isPlanningOwner(owner)) {
    return;
  }
  const facts = readCallFacts(owner, nodeId);
  if (facts) {
    facts.servedFromMemo = servedFromMemo === true;
  }
}

/**
 * Note that THIS call's answer came out of the retention layer, and hand the
 * answer straight back.
 *
 * @param {Object|null} owner - The planning owner answering.
 * @param {string|null} nodeId - The node this answer is for.
 * @param {Object|null} answer - The answer being returned.
 * @param {boolean} retained - False when the call is only passing an answer
 *   through (a memo entry that was not a retention product).
 * @return {Object|null} That same answer, unchanged.
 */
function notePriorityRecoveryPlanningAnswerRetention(
  owner,
  nodeId,
  answer,
  retained = true,
) {
  if (!isPlanningOwner(owner) || retained !== true) {
    return answer;
  }
  const facts = readCallFacts(owner, nodeId);
  if (facts) {
    facts.retained = true;
  }
  return answer;
}

/**
 * Whether the answer this call produced came out of the retention layer, for
 * the one consumer that must carry it forward: the answer memo's stored value.
 *
 * @param {Object|null} owner - The planning owner answering.
 * @param {string|null} nodeId - The node this answer is for.
 * @return {boolean} True when retention produced this call's answer.
 */
function readPriorityRecoveryPlanningAnswerCallRetention(owner, nodeId) {
  if (!isPlanningOwner(owner)) {
    return false;
  }
  return readCallFacts(owner, nodeId)?.retained === true;
}

/**
 * State the origin of the answer this owner is about to return, and hand the
 * answer straight back.
 *
 * @param {Object|null} owner - The planning owner answering.
 * @param {string|null} nodeId - The node this answer is for.
 * @param {Object|null} answer - The answer being returned.
 * @return {Object|null} That same answer, unchanged.
 */
function statePriorityRecoveryPlanningAnswerOrigin(owner, nodeId, answer) {
  if (!isPlanningOwner(owner)) {
    return answer;
  }
  const facts = readCallFacts(owner, nodeId);
  const servedFromMemo = facts?.servedFromMemo === true;
  lastAnswerOriginByOwner.set(owner, Object.freeze({
    nodeId,
    origin: facts?.retained === true ?
      PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN.RETAINED :
      servedFromMemo ?
        PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN.MEMOIZED :
        PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN.FRESH,
    servedFromMemo,
  }));
  return answer;
}

/**
 * The origin this owner stated for the answer it last returned for a node.
 *
 * @param {Object|null} owner - The planning owner that answered.
 * @param {string|null} nodeId - The node the consumer asked about.
 * @return {Object} Frozen {origin, servedFromMemo}.
 */
function readPriorityRecoveryPlanningAnswerOrigin(owner, nodeId) {
  if (!isPlanningOwner(owner)) {
    return PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN_UNSTATED;
  }
  const record = lastAnswerOriginByOwner.get(owner);
  if (!record || record.nodeId !== nodeId) {
    return PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN_UNSTATED;
  }
  return record;
}

export {
  PRIORITY_RECOVERY_PLANNING_ANSWER_ORIGIN,
  beginPriorityRecoveryPlanningAnswer,
  notePriorityRecoveryPlanningAnswerRetention,
  readPriorityRecoveryPlanningAnswerCallRetention,
  readPriorityRecoveryPlanningAnswerOrigin,
  recordPriorityRecoveryPlanningProjectionReuse,
  statePriorityRecoveryPlanningAnswerOrigin,
};
