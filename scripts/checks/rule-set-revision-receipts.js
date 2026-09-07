/**
 * The claims the rule-set revision proves, and the scenario that measures each.
 *
 * Two quests read from this table: `rule-set-revision-26`, which was
 * superseded before it landed and sealed the first thirteen, and
 * `steering-rule-authority-split`, which supersedes it and seals all of them.
 * A superseded quest keeps the proof artifact its own doneWhen named, so both
 * receipts stay producible and neither harness can drift from the other.
 *
 * What is deliberately absent is a claim that the two rule texts state
 * different invariants. No checker can measure that: a rule may not name the
 * implementation that decides it, so the last link from text to mechanism is a
 * reading, recorded as an independent verifier's judgement on the quest rather
 * than asserted here as proof.
 */

const WITNESS_TEST = 'test/scripts/rule-set-revision.test.js';
const QUEST_DIRECTORY = Object.freeze(['solve', 'quests']);
const EVIDENCE_SEGMENTS = Object.freeze(['evidence', 'receipt.json']);
const PATH_JOINER = '/';
const LIST_SEPARATOR = ', ';
const UNKNOWN_CLAIM_PREFIX = 'rule-set revision receipts: no such claim: ';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);

const RECEIPT = Object.freeze([
  ['manifest-and-rule-bodies-agree-entry-for-entry',
    '^manifest and rule bodies agree entry for entry$',
    'the sealed manifest is the criterion and the current rules are exactly ' +
    'what it seals; the integer follows from it and is never asserted ' +
    'against a literal'],
  ['rule-ids-are-unique-and-contiguous',
    '^rule ids are unique and contiguous$',
    'ids run R01 upward with no gap and no repeat, in the manifest and in the ' +
    'bodies alike'],
  ['one-independently-violable-invariant-per-rule',
    '^one independently violable invariant per rule$',
    'each manifest entry names one invariant and no two entries name the same ' +
    'one, so a rule cannot quietly carry two'],
  ['exactly-one-owner-key-per-rule',
    '^exactly one owner key per rule$',
    'one owner key per entry, and the body names the same owner the manifest does'],
  ['every-owner-key-resolves-through-the-router',
    '^every owner key resolves through the router$',
    'every owner a rule names has a router row that resolves to something ' +
    'which exists'],
  ['no-implementation-identity-leaks-into-a-rule',
    '^no implementation identity leaks into a rule$',
    'no rule names a file, a command or a flag, so moving an implementation ' +
    'never requires editing a rule'],
  ['r16-owner-owns-all-of-r16-and-none-of-r26',
    '^R16 owns all of R16 and none of R26$',
    'the authorization vocabulary is gone from the scope rule entirely: ' +
    'nothing of R26 is left folded into R16'],
  ['r26-routes-to-the-real-authorization-boundary',
    '^R26 routes to the real authorization boundary$',
    'R26\'s owner resolves to at least one mechanism that runs, not only to ' +
    'prose, so the rule is not made green by an invented owner'],
  ['always-load-transitive-path-within-360-lines',
    '^the always-load transitive path is within 360 lines$',
    'adding a rule did not grow the layer an agent must read before acting'],
  ['registered-operation-closure-remains-green',
    '^registered-operation closure remains green$',
    'current instruction still refers only to operations the canonical ' +
    'command registry contains'],
  ['representative-tasks-reach-their-owner-from-always-load',
    '^representative tasks reach their owner from the always-load layer$',
    'every representative task reaches the same owner it reached before the ' +
    'revision, and none of those owners is a stub'],
  ['the-two-rules-share-no-authority',
    '^the two rules route to owners that share no authority$',
    'R16 and R26 resolve through the router to disjoint sets of authorities, ' +
    'each containing the mechanism that decides its own rule, so an editorial ' +
    'split that left both pointing at one place would fail here'],
  ['authorization-removed-inside-scope-fails-r26-only',
    '^authorization removed inside scope fails R26 only$',
    'the directional falsifier, measured on the mechanisms rather than on a ' +
    'table describing them: the change set stays inside what the sealed scope ' +
    'authorises and R26 alone refuses'],
  ['scope-left-with-valid-authorization-fails-r16-only',
    '^scope left with valid authorization fails R16 only$',
    'the converse, measured the same way: the change set reaches a path the ' +
    'sealed scope does not authorise and R16 alone fails, while the outward ' +
    'action carries the signal it needs'],
  ['neither-verdict-moves-with-the-other-rules-input',
    '^neither verdict moves with the other rule\'s input$',
    'the independence itself: the scope mechanism is a function of the paths ' +
    'alone and the authority mechanism of the request alone, so no ' +
    'combination of the two facts makes one verdict depend on the other'],
  ['the-modelled-table-matches-the-mechanisms',
    '^the modelled table matches what the mechanisms actually do$',
    'the decision table is checked against the mechanisms rather than standing ' +
    'in for them, which is what stops it asserting its own conclusion'],
  ['growing-the-sealed-set-requires-a-revision',
    '^growing the sealed rule set requires a revision, not an edit$',
    'a changed rule set carrying the revision it changed is refused, and a ' +
    'revision must name the predecessor revision, the published head it ' +
    'supersedes and a reason'],
  ['no-always-load-document-states-a-rule-count',
    '^the always-load layer states no rule count$',
    'no document an agent must read before acting says how many rules there ' +
    'are, so the count cannot drift from the manifest or become the criterion ' +
    'again'],
]);

/**
 * The receipts a quest seals, in the order this table declares them.
 * @param {string[]} ids
 * @return {Object[]}
 */
function receiptsFor(ids) {
  // Selecting nothing for a name that matches nothing is how a retired
  // measurement once kept reporting success. A quest that seals a claim this
  // table does not carry is a mistake, not an empty result.
  const known = arrayMap(RECEIPT, (entry) => entry[0]);
  const unknown = arrayFilter(ids, (id) => !arrayIncludes(known, id));
  if (unknown.length > 0) {
    throw new Error(`${UNKNOWN_CLAIM_PREFIX}${unknown.join(LIST_SEPARATOR)}`);
  }
  return Object.freeze(arrayMap(
    arrayFilter(RECEIPT, (entry) => arrayIncludes(ids, entry[0])),
    ([id, testNamePattern, detail]) =>
      Object.freeze({id, testFile: WITNESS_TEST, testNamePattern, detail})));
}

/**
 * Where a quest's receipt is written.
 * @param {string} questId
 * @return {string}
 */
function receiptPath(questId) {
  return [...QUEST_DIRECTORY, questId, ...EVIDENCE_SEGMENTS].join(PATH_JOINER);
}

export {receiptPath, receiptsFor};
