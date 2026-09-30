/**
 * The provenance of the closure choice the membership-publication derivation
 * made for one candidate: which of the two priority-partition summaries it
 * took — its own base summary, or the one the priority-recovery closure
 * witness refreshed — and the evidence that choice was made on.
 *
 * DERIVED names the derivation's BASE summary, which is itself already the
 * more advanced of the planning snapshot's own summary and the locally
 * derived service-row census: `source` states which side of the CLOSURE
 * choice won, and `baseSummarySource` states which side of that earlier one.
 * The two closure names are the ones the quest statement fixes.
 *
 * The record also carries the route the closure evidence owner took
 * (retained, built or none), the witness object it produced and the decision
 * snapshots behind it, so a downstream decision can state not only WHICH
 * summary it read but WHY that summary said what it said (quest
 * closure-witness-route-observed). Every entry is a REFERENCE to what the
 * evaluation produced; nothing is copied, projected or re-derived here.
 *
 * The record is kept BESIDE the chosen summary, in a registry keyed by the
 * summary object, and never as a field on it. A field would travel into the
 * publication row, the readiness-planning memo version keys, the planning
 * generation digests and `arePriorityPartitionSummariesEqual` — every place
 * that decides publication reuse and change detection — so a diagnostic field
 * there would decide behaviour (quest learner-promotion-guard-inputs-observed,
 * constraint diagnostics-never-decide). The registry is a WeakMap, so an entry
 * dies with the summary it describes.
 *
 * A summary this owner never chose reads as UNRECORDED: an explicit named
 * state, never a silent "derived". The registry is last-writer-wins, which
 * matters on the retained route: a retained witness hands back the very
 * summary object the derivation that BUILT it chose, so the record describes
 * the most recent choice of that object. A consumer that must know whether
 * the record belongs to the answer in its hand compares
 * `closureWitness` with the witness that answer carries.
 */

import {
  chooseMoreAdvancedPriorityPartitionSummaryWithProvenance,
} from './membership-publication-priority-partition-summary.js';

const PRIORITY_PARTITION_SUMMARY_SOURCE = Object.freeze({
  DERIVED: 'derived',
  CLOSURE_REFRESHED: 'closure_refreshed',
  UNRECORDED: 'unrecorded',
});

// Which side of the BASE choice won, before the closure witness was
// consulted: the planning snapshot's own summary in normal form, or the
// census this node derived from its service rows.
const PRIORITY_PARTITION_SUMMARY_BASE_SOURCE = Object.freeze({
  PUBLISHED_NORMALIZED: 'published_normalized',
  DERIVED: 'derived',
  UNRECORDED: PRIORITY_PARTITION_SUMMARY_SOURCE.UNRECORDED,
});

const SUMMARY_OBJECT_TYPE = 'object';

const UNRECORDED_CLOSURE_CHOICE = Object.freeze({
  source: PRIORITY_PARTITION_SUMMARY_SOURCE.UNRECORDED,
  closureRoute: PRIORITY_PARTITION_SUMMARY_SOURCE.UNRECORDED,
  closureWitness: null,
  decisionSnapshots: null,
  baseSummary: null,
  baseSummarySource: PRIORITY_PARTITION_SUMMARY_BASE_SOURCE.UNRECORDED,
});

const closureChoiceByChosenSummary = new WeakMap();

/**
 * Choose between the planning snapshot's own summary and this node's derived
 * census, exactly as `chooseMoreAdvancedPriorityPartitionSummary` does, and
 * say which side won.
 *
 * @param {Object|null} publishedNormalizedSummary - The snapshot's own.
 * @param {Object|null} derivedSummary - The local service-row census.
 * @param {Object} helperFns - The derivation's normalization helpers.
 * @return {Object} {summary, source} — the summary is unchanged.
 */
function choosePriorityPartitionSummaryBase(
  publishedNormalizedSummary,
  derivedSummary,
  helperFns = {},
) {
  const choice = chooseMoreAdvancedPriorityPartitionSummaryWithProvenance(
    publishedNormalizedSummary,
    derivedSummary,
    helperFns,
  );
  return {
    summary: choice.summary,
    source: choice.chosenFromCandidate ?
      PRIORITY_PARTITION_SUMMARY_BASE_SOURCE.DERIVED :
      PRIORITY_PARTITION_SUMMARY_BASE_SOURCE.PUBLISHED_NORMALIZED,
  };
}

// The record itself, extracted so the choosing function stays one decision.
// A call that states no evidence reads as UNRECORDED in every field rather
// than as an absent one.
function buildClosureChoiceRecord(source, closureEvidence) {
  if (!closureEvidence) {
    return Object.freeze({...UNRECORDED_CLOSURE_CHOICE, source});
  }
  return Object.freeze({
    source,
    closureRoute: closureEvidence.route ??
      PRIORITY_PARTITION_SUMMARY_SOURCE.UNRECORDED,
    closureWitness: closureEvidence.closureWitness ?? null,
    decisionSnapshots: closureEvidence.decisionSnapshots ?? null,
    baseSummary: closureEvidence.baseSummary ?? null,
    baseSummarySource: closureEvidence.baseSummarySource ??
      PRIORITY_PARTITION_SUMMARY_BASE_SOURCE.UNRECORDED,
  });
}

/**
 * Choose between the derivation's own summary and the closure witness's
 * refreshed one, exactly as `chooseMoreAdvancedPriorityPartitionSummary`
 * does, and record which one the choice took and what it was made on.
 *
 * @param {Object|null} derivedSummary - The derivation's own summary.
 * @param {Object|null} closureRefreshedSummary - The closure witness's.
 * @param {Object} helperFns - The derivation's normalization helpers.
 * @param {Object|null} closureEvidence - The route, witness, decision
 *   snapshots and base summary of this same evaluation.
 * @return {Object|null} The chosen summary, unchanged.
 */
function chooseClosureRefreshedPriorityPartitionSummary(
  derivedSummary,
  closureRefreshedSummary,
  helperFns = {},
  closureEvidence = null,
) {
  const choice = chooseMoreAdvancedPriorityPartitionSummaryWithProvenance(
    derivedSummary,
    closureRefreshedSummary,
    helperFns,
  );
  if (choice.summary && typeof choice.summary === SUMMARY_OBJECT_TYPE) {
    closureChoiceByChosenSummary.set(
      choice.summary,
      buildClosureChoiceRecord(
        choice.chosenFromCandidate ?
          PRIORITY_PARTITION_SUMMARY_SOURCE.CLOSURE_REFRESHED :
          PRIORITY_PARTITION_SUMMARY_SOURCE.DERIVED,
        closureEvidence,
      ),
    );
  }
  return choice.summary;
}

/**
 * The recorded closure choice one summary object was chosen by.
 *
 * @param {Object|null} priorityPartitionSummary - The summary a decision read.
 * @return {Object} A frozen record; UNRECORDED when nobody chose it.
 */
function readPriorityPartitionSummaryClosureChoice(
  priorityPartitionSummary,
) {
  if (
    !priorityPartitionSummary ||
    typeof priorityPartitionSummary !== SUMMARY_OBJECT_TYPE
  ) {
    return UNRECORDED_CLOSURE_CHOICE;
  }
  return closureChoiceByChosenSummary.get(priorityPartitionSummary) ??
    UNRECORDED_CLOSURE_CHOICE;
}

/**
 * The recorded source of one summary object.
 *
 * @param {Object|null} priorityPartitionSummary - The summary a decision read.
 * @return {string} A PRIORITY_PARTITION_SUMMARY_SOURCE state.
 */
function readPriorityPartitionSummarySource(priorityPartitionSummary) {
  return readPriorityPartitionSummaryClosureChoice(
    priorityPartitionSummary,
  ).source;
}

export {
  PRIORITY_PARTITION_SUMMARY_BASE_SOURCE,
  PRIORITY_PARTITION_SUMMARY_SOURCE,
  chooseClosureRefreshedPriorityPartitionSummary,
  choosePriorityPartitionSummaryBase,
  readPriorityPartitionSummaryClosureChoice,
  readPriorityPartitionSummarySource,
};
