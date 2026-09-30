// The LOCAL restore checks, in one place, so the receipt and the corruption
// table cannot disagree about what "caught locally" means.
//
// Verification round 2's blocking finding: the receipt's ConfState oracle was
// `restoredConfState == entitledByDurableState`, and both sides went through
// the same `create_node` on the same durable record. It therefore proved only
// that create_node returns what it was handed. A simulated binding bug that
// dropped the learners set on every restore passed all seven restart tests;
// a "service-row cache" injecting learner 9 into every restored ConfState
// passed all fifteen core tests - the owner's own attack, succeeding.
//
// The oracle here never calls create_node. Its expectation is built from
// three things the restore cannot fabricate:
//
//   1. the victim core's OWN state read immediately before the crash
//      (`facts.inMemoryConfStateFull`, `coreTermBeforeCrash`,
//      `coreVoteBeforeCrash`);
//   2. the durable ConfState the host recorded - the value
//      `apply_conf_change` returned, written by the host, read back as a
//      plain field;
//   3. the SURVIVORS' own core reads, taken after they applied the change.
//
// Which of them applies is decided by the durable commit/applied relation,
// not by the boundary's name:
//
//   * the configuration entry is durably committed and NOT durably applied
//     -> the peer re-applies it from its own log, so the restored
//        configuration must equal what the survivors report;
//   * otherwise nothing is re-applied, so the restored configuration must
//     equal BOTH the durable ConfState and the pre-crash core read.
//
// Every comparison is over the FULL ConfState - voters, outgoing voters,
// learners, learners-next and auto-leave - because round 2 showed that
// comparing voters alone misses a dropped learners set and a truncated
// outgoing set.

const CONF_STATE_FIELDS = Object.freeze([
  'voters', 'votersOutgoing', 'learners', 'learnersNext']);

const CHECK = Object.freeze({
  DELIVERED: 'no-message-delivered-in-the-isolated-window',
  WINDOW_HAD_TRAFFIC: 'the-isolated-window-carried-traffic',
  CONF_STATE: 'restored-conf-state-matches-an-independent-oracle',
  TERM_AND_VOTE: 'term-and-vote-survived-the-restart',
  REAPPLY: 'the-entry-was-re-applied-from-the-peers-own-log',
  REFUSALS: 'no-apply_conf_change-refusal-was-swallowed',
  BLOCKED_TRAFFIC: 'blocked-traffic-did-not-move-the-configuration',
});

function shapeOf(confState) {
  const parts = CONF_STATE_FIELDS
    .map((field) => `${field}=[${[...(confState?.[field] || [])].sort()}]`);
  parts.push(`autoLeave=${confState?.autoLeave === true}`);
  return parts.join(' ');
}

function sameConfState(left, right) {
  return shapeOf(left) === shapeOf(right);
}

/**
 * Which oracle applies to this row, and what it expects.
 * @param {Object} record a boundary row
 * @return {{oracle: string, expected: Object|null, why: string}}
 */
function expectedRestoredConfState(record) {
  const {facts} = record;
  const durablyCommitted =
    Number(facts.durableCommit) >= Number(facts.confIndex);
  const notYetApplied =
    Number(facts.durableApplied) < Number(facts.confIndex);
  if (durablyCommitted && notYetApplied) {
    // The peer is entitled to re-apply the entry from its own durable log,
    // and does. The independent expectation is what the SURVIVORS' cores
    // reported after they applied the same entry.
    if (record.survivorConfStateAfterCrash) {
      return {
        oracle: 'survivors-core-reads-after-they-applied-the-same-entry',
        expected: record.survivorConfStateAfterCrash,
        why: `the entry is durably committed (${facts.durableCommit}) and ` +
          `not durably applied (${facts.durableApplied}), so the isolated ` +
          'peer re-applies it and must reach the configuration the ' +
          'survivors already hold',
      };
    }
    return {
      oracle: 'durable-conf-state-the-host-recorded',
      expected: facts.durableConfStateFull,
      why: 'the entry is re-applied from the peer\'s own log and there is ' +
        'no surviving peer to compare with (single-voter shape), so the ' +
        'durable ConfState the host recorded is the only independent value',
    };
  }
  return {
    oracle: 'durable-conf-state-and-the-pre-crash-core-read',
    expected: facts.durableConfStateFull,
    why: 'nothing above the durable applied index is re-applied, so the ' +
      'restored configuration must be the one the host recorded AND the one ' +
      'the victim\'s own core reported before the crash',
  };
}

function confStateViolations(record) {
  const local = record.localRestoreCorrectness;
  const {oracle, expected, why} = expectedRestoredConfState(record);
  const violations = [];
  if (!sameConfState(local.restoredConfState, expected)) {
    violations.push({
      check: CHECK.CONF_STATE, oracle,
      message: `${record.id}: the restored configuration is not what ${
        oracle} says it must be (${why}). restored ${
        shapeOf(local.restoredConfState)} vs expected ${shapeOf(expected)}`,
    });
  }
  // The second half of the no-re-apply branch: the victim's own core, read
  // before it died, is an oracle nothing about the restore can fabricate.
  if (oracle === 'durable-conf-state-and-the-pre-crash-core-read' &&
      !sameConfState(local.restoredConfState,
        record.facts.inMemoryConfStateFull)) {
    violations.push({
      check: CHECK.CONF_STATE, oracle: 'pre-crash-core-read',
      message: `${record.id}: the restored configuration is not the one the ` +
        `victim's own core reported before the crash. restored ${
          shapeOf(local.restoredConfState)} vs pre-crash ${
          shapeOf(record.facts.inMemoryConfStateFull)}`,
    });
  }
  return violations;
}

function windowViolations(record) {
  const local = record.localRestoreCorrectness;
  const violations = [];
  if (local.messagesDeliveredDuringWindow !== 0) {
    violations.push({check: CHECK.DELIVERED,
      message: `${record.id}: ${local.messagesDeliveredDuringWindow} ` +
        'messages were delivered during the isolated restore window'});
  }
  if (local.messagesBlockedInbound + local.messagesBlockedOutbound === 0) {
    violations.push({check: CHECK.WINDOW_HAD_TRAFFIC,
      message: `${record.id}: the isolation window had no traffic in it, so ` +
        'it measured nothing'});
  }
  if (!sameConfState(local.confStateAfterBlockedTraffic,
    local.restoredConfState)) {
    violations.push({check: CHECK.BLOCKED_TRAFFIC,
      message: `${record.id}: blocked traffic changed the restored ` +
        `configuration (${shapeOf(local.restoredConfState)} -> ${
          shapeOf(local.confStateAfterBlockedTraffic)})`});
  }
  return violations;
}

function reapplyViolations(record) {
  const {facts} = record;
  const local = record.localRestoreCorrectness;
  const durablyCommitted =
    Number(facts.durableCommit) >= Number(facts.confIndex);
  const notYetApplied =
    Number(facts.durableApplied) < Number(facts.confIndex);
  if (!durablyCommitted || !notYetApplied) {
    return [];
  }
  if (local.recoveredFromOwnLogAlone === true &&
      local.applyConfChangeCalls.includes(String(facts.confIndex))) {
    return [];
  }
  return [{check: CHECK.REAPPLY,
    message: `${record.id}: the entry is durably committed (${
      facts.durableCommit}) and not durably applied (${facts.durableApplied
    }), so the isolated restart must re-apply it from its own log`}];
}

/**
 * Every LOCAL restore check for one boundary row, as a list of violations.
 * Local means: inside the isolated window, before any convergence. The
 * convergence claim is asserted separately and may never satisfy these.
 * @param {Object} record a boundary row
 * @return {Array<{check: string, message: string}>}
 */
function localRestoreViolations(record) {
  if (record.driven !== true) {
    return [{check: 'driven',
      message: `${record.id}: not driven: ${record.reason}`}];
  }
  const local = record.localRestoreCorrectness;
  const violations = [
    ...windowViolations(record),
    ...confStateViolations(record),
    ...reapplyViolations(record),
  ];
  const termAndVote = local.termAndVote;
  if (termAndVote.survivedRestart !== true) {
    violations.push({check: CHECK.TERM_AND_VOTE,
      message: `${record.id}: term and vote must survive the restart (${
        JSON.stringify(termAndVote)})`});
  }
  if ((record.applyRefusalsWholeRun || []).length > 0) {
    violations.push({check: CHECK.REFUSALS,
      message: `${record.id}: the core refused a configuration change and ` +
        `the host carried on: ${JSON.stringify(record.applyRefusalsWholeRun)}`});
  }
  return violations;
}

/**
 * What the RESTORE produced, as a comparable string. A corruption that
 * leaves this identical to the honest run changed the durable record but not
 * what the peer restored to, so there is nothing for a check to see: it is
 * inert in effect, not missed. Rewinding the applied index over an entry
 * whose re-application is idempotent is the honest example.
 * @param {Object} row a boundary row
 * @return {string}
 */
function restoreOutcomeFingerprint(row) {
  const local = row.localRestoreCorrectness || {};
  return JSON.stringify([
    shapeOf(local.restoredConfState),
    local.termAndVote?.afterRestore,
    local.applyConfChangeCalls,
    local.recoveredFromOwnLogAlone,
  ]);
}

export {
  restoreOutcomeFingerprint,
  localRestoreViolations,
};
