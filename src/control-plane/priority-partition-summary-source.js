/**
 * Which of the two priority-partition summaries the membership-publication
 * derivation chose for one candidate: its own base summary, or the one the
 * priority-recovery closure witness refreshed.
 *
 * DERIVED names the derivation's BASE summary, which is itself already the
 * more advanced of the planning snapshot's own summary and the locally
 * derived service-row census: this owner states which side of the CLOSURE
 * choice won, not which side of that earlier one. The two names are the ones
 * the quest statement fixes.
 *
 * The label is recorded BESIDE the chosen summary, in a registry keyed by the
 * summary object, and never as a field on it. A field would travel into the
 * publication row, the readiness-planning memo version keys, the planning
 * generation digests and `arePriorityPartitionSummariesEqual` — every place
 * that decides publication reuse and change detection — so a diagnostic field
 * there would decide behaviour (quest learner-promotion-guard-inputs-observed,
 * constraint diagnostics-never-decide). The registry is a WeakMap, so an entry
 * dies with the summary it describes.
 *
 * A summary this owner never chose reads as UNRECORDED: an explicit named
 * state, never a silent "derived".
 */

import {
  chooseMoreAdvancedPriorityPartitionSummaryWithProvenance,
} from './membership-publication-priority-partition-summary.js';

const PRIORITY_PARTITION_SUMMARY_SOURCE = Object.freeze({
  DERIVED: 'derived',
  CLOSURE_REFRESHED: 'closure_refreshed',
  UNRECORDED: 'unrecorded',
});

const SUMMARY_OBJECT_TYPE = 'object';

const summarySourceByChosenSummary = new WeakMap();

/**
 * Choose between the derivation's own summary and the closure witness's
 * refreshed one, exactly as `chooseMoreAdvancedPriorityPartitionSummary`
 * does, and record which one the choice took.
 *
 * @param {Object|null} derivedSummary - The derivation's own summary.
 * @param {Object|null} closureRefreshedSummary - The closure witness's.
 * @param {Object} helperFns - The derivation's normalization helpers.
 * @return {Object|null} The chosen summary, unchanged.
 */
function chooseClosureRefreshedPriorityPartitionSummary(
  derivedSummary,
  closureRefreshedSummary,
  helperFns = {},
) {
  const choice = chooseMoreAdvancedPriorityPartitionSummaryWithProvenance(
    derivedSummary,
    closureRefreshedSummary,
    helperFns,
  );
  if (choice.summary && typeof choice.summary === SUMMARY_OBJECT_TYPE) {
    summarySourceByChosenSummary.set(
      choice.summary,
      choice.chosenFromCandidate ?
        PRIORITY_PARTITION_SUMMARY_SOURCE.CLOSURE_REFRESHED :
        PRIORITY_PARTITION_SUMMARY_SOURCE.DERIVED,
    );
  }
  return choice.summary;
}

/**
 * The recorded source of one summary object.
 *
 * @param {Object|null} priorityPartitionSummary - The summary a decision read.
 * @return {string} A PRIORITY_PARTITION_SUMMARY_SOURCE state.
 */
function readPriorityPartitionSummarySource(priorityPartitionSummary) {
  if (
    !priorityPartitionSummary ||
    typeof priorityPartitionSummary !== SUMMARY_OBJECT_TYPE
  ) {
    return PRIORITY_PARTITION_SUMMARY_SOURCE.UNRECORDED;
  }
  return summarySourceByChosenSummary.get(priorityPartitionSummary) ??
    PRIORITY_PARTITION_SUMMARY_SOURCE.UNRECORDED;
}

export {
  PRIORITY_PARTITION_SUMMARY_SOURCE,
  chooseClosureRefreshedPriorityPartitionSummary,
  readPriorityPartitionSummarySource,
};
