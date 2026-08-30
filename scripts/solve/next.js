// `solve next --id <quest>` — a thin, human-readable "what do I do next?"
// renderer. It FOLDS the existing read-models (pending supervised step, the
// last recorded gate stop, the current-blocker card, quest advisories) and
// derives nothing new; every line here is available elsewhere as JSON.
//
// Output contract: a handful of lines, the FIRST always names the action kind
// before its command/action. Templates are never presented as directly executable.

import {loadQuest, readLog, projectState} from './store.js';
import {stepPending} from './step.js';
import {buildCurrentBlocker, blockerLabel} from './current-blocker.js';
import {analyzeQuestHealth} from './health.js';
import {buildAdvisories} from './advisories.js';
import {buildSealFreshnessAdvisory} from './seal-freshness.js';
import {NEXT_ACTION_CODE, typedNextAction} from './next-action.js';
import {auditQuest} from './audit.js';
import {
  checkpointVerificationPreflight,
  checkpointVerificationPreflightLines,
} from './checkpoint-preflight.js';
import {verificationState} from './verification.js';
import {
  LANDING_UNCOVERED_SOURCE_PATHS_CODE,
} from './landing-union-guard.js';
import {
  EVENT_GATE_DECISION,
  OUTCOME_CONTINUE,
  RUNG_INDEX_MODEL,
  STATUS_SOLVED,
  STATUS_EXHAUSTED,
} from './constants.js';

const LOCAL_STR_OWNED_001 = '--summary "<what changed>"';
const LOCAL_STR_OWNED_004 = 'attempt';
const LOCAL_STR_OWNED_005 = 'sha256:<missing>';
const LOCAL_STR_OWNED_006 = 'aggregate';
const LOCAL_STR_OWNED_007 = 'sha256:<unavailable>';
const LOCAL_STR_OWNED_008 = 'pass';
const LOCAL_STR_OWNED_009 = 'both';

const TERMINAL_STATUSES = Object.freeze([STATUS_SOLVED, STATUS_EXHAUSTED]);
const FILE_NOT_FOUND_CODE = 'ENOENT';
const UNKNOWN_METRIC = '?';
const LINE_SEPARATOR = '\n';
const NEXT_SCHEMA_VERSION = 2;
const ADVISORIES_HEADING = '## Advisories';

function continueCommand(questId, suffix = '') {
  return `node scripts/solve.js continue --id ${questId}${suffix}`;
}

function landCommand(questId) {
  return `node scripts/solve.js land --id ${questId}`;
}

// The last event, when it is a recorded non-terminal gate stop (an advisory
// gate-decision means the run continued, so it is not a stop). Anything after
// the stop (an attempt, fresh evidence) supersedes it, hence last-event-only.
function lastEventGateStop(log) {
  const last = log.length > 0 ? log[log.length - 1] : null;
  if (last && last.type === EVENT_GATE_DECISION &&
    last.outcome !== OUTCOME_CONTINUE) {
    return last;
  }
  return null;
}

function pendingModelEvidenceRequired(pending) {
  return Boolean(pending) && pending.rungIndex === RUNG_INDEX_MODEL;
}

function pendingCommitCommand(questId, pending) {
  // Surfacing the model-rung declaration here — before the attempt is spent —
  // prevents the commit from bouncing on the theory gate's "model evidence or
  // modelNotApplicable is required at model rung" and forcing a full rerun.
  const modelSuffix = pendingModelEvidenceRequired(pending) ?
    ' --modelRef <model:ref> (or --modelNotApplicable "<why the model does not apply>")' :
    '';
  return continueCommand(questId, ` ${LOCAL_STR_OWNED_001}${modelSuffix}`);
}

function verifierAction(questId, frontier, scope, fingerprint, terminal) {
  return typedNextAction(
    terminal ? landCommand(questId) : continueCommand(questId),
    {
      code: NEXT_ACTION_CODE.REQUEST_VERIFICATION,
      payload: {questId, frontier, scope, fingerprint},
    },
  );
}

function unresolvedReplacementAction(questId, pendingVerification, preflight) {
  const groups = preflight.replacementGroups.filter(
    (group) => !group.satisfiedAfterRequiredApprovals,
  );
  // A group anchored at an unresolvable base is satisfied by a reachable-base
  // covering replacement, so the instruction points there — the step pin
  // resolves to current HEAD for exactly this case. Printing the recorded dead
  // base would demand an attempt that can never be recorded.
  const deadGroups = groups.filter((group) => group.baseUnreachable);
  if (deadGroups.length > 0 && deadGroups.length === groups.length) {
    const coveragePaths = [...new Set(
      deadGroups.flatMap((group) => group.requiredPaths))].sort();
    return typedNextAction(
      continueCommand(questId),
      {
        code: NEXT_ACTION_CODE.REPLACE_REJECTED_ATTEMPT,
        payload: {questId, phase: 'begin', bases: [],
          baseUnreachable: true, requiredPaths: coveragePaths},
      },
    );
  }
  const bases = [...new Set(groups.map((group) => group.baseCommit).filter(Boolean))];
  const paths = [...new Set((groups.length > 0 ?
    groups.flatMap((group) => group.requiredPaths) :
    pendingVerification.inspection.changedPaths))].sort();
  if (bases.length > 1) {
    return typedNextAction(
      continueCommand(questId),
      {
        code: NEXT_ACTION_CODE.REPLACE_REJECTED_ATTEMPT,
        payload: {questId, phase: 'begin', bases, requiredPaths: paths},
      },
    );
  }
  const base = bases.length === 1 ? bases[0] :
    pendingVerification.event.workspaceBaseCommit || '<missing>';
  const pendingDossier = (preflight.pendingApprovals || []).find(
    (dossier) => dossier.fingerprint === pendingVerification.fingerprint);
  const baseUnreachable = Boolean(pendingDossier?.problemCode);
  return typedNextAction(
    continueCommand(questId),
    {
      code: NEXT_ACTION_CODE.REPLACE_REJECTED_ATTEMPT,
      payload: {
        questId,
        phase: 'begin',
        bases: baseUnreachable ? [] : [base],
        baseUnreachable,
        requiredPaths: paths,
      },
    },
  );
}

function pendingVerifierAction(questId, state, pendingVerification, preflight) {
  if (!preflight.readyAfterRequiredApprovals) {
    return unresolvedReplacementAction(questId, pendingVerification, preflight);
  }
  const terminal = TERMINAL_STATUSES.includes(state.questStatus);
  const scope = terminal && preflight.aggregate.bothEligible ?
    LOCAL_STR_OWNED_009 : LOCAL_STR_OWNED_004;
  return verifierAction(
    questId,
    pendingVerification.event.frontier,
    scope,
    pendingVerification.fingerprint || LOCAL_STR_OWNED_005,
    terminal,
  );
}

// A dirty source path outside the recorded attempt union blocks the landing
// before any verification could matter (the verifier would review a
// candidate that omits it), so it outranks the aggregate-approval request.
function uncoveredSourcePathsAction(questId, audit) {
  const uncovered = audit.problems.find((problem) =>
    problem.code === LANDING_UNCOVERED_SOURCE_PATHS_CODE);
  if (!uncovered) return null;
  return typedNextAction(
    landCommand(questId),
    {
      code: NEXT_ACTION_CODE.REPAIR_AUDIT,
      payload: {
        questId,
        problemCode: uncovered.code,
        problem: uncovered.message,
        requiredPaths: uncovered.requiredPaths || [],
      },
    },
  );
}

function typedActionProblemLine(action) {
  const payload = action?.payload;
  if (!payload?.problemCode || !payload?.problem) return null;
  return `problem [${payload.problemCode}]: ${payload.problem}`;
}

function terminalQuestAction(questId, verification, audit) {
  const uncoveredAction = uncoveredSourcePathsAction(questId, audit);
  if (uncoveredAction) return uncoveredAction;
  if (verification.attempts.some((attempt) => attempt.contracted) &&
    !verification.aggregateApproval) {
    // An uncomputable aggregate has no fingerprint a verifier could ever
    // approve — sending the operator to "spawn a verifier for
    // sha256:<unavailable>" is a dead end. Surface the aggregate's own typed
    // actionable problem instead, which names the repair.
    if (!verification.aggregate.ok && verification.aggregate.problem) {
      return typedNextAction(
        landCommand(questId),
        {
          code: NEXT_ACTION_CODE.REPAIR_AUDIT,
          payload: {
            questId,
            problemCode: verification.aggregate.code || null,
            requiredPaths: verification.aggregate.paths || [],
          },
        },
      );
    }
    return typedNextAction(
      landCommand(questId),
      {
        code: NEXT_ACTION_CODE.REQUEST_VERIFICATION,
        payload: {
          questId,
          scope: LOCAL_STR_OWNED_006,
          fingerprint: verification.aggregate.fingerprint || LOCAL_STR_OWNED_007,
        },
      },
    );
  }
  if (audit.status === LOCAL_STR_OWNED_008) {
    return typedNextAction(
      landCommand(questId), {
        code: NEXT_ACTION_CODE.LAND,
        payload: {questId},
      });
  }
  return typedNextAction(
    landCommand(questId),
    {
      code: NEXT_ACTION_CODE.REPAIR_AUDIT,
      payload: {questId},
    },
  );
}

function nextAction({questId, state, pending, gateStop, blocker,
  verification, verificationPreflight, audit}) {
  const pendingVerification = verification.pendingAttempts[0];
  if (pendingVerification) {
    return pendingVerifierAction(
      questId, state, pendingVerification, verificationPreflight);
  }
  if (verification.unresolvedRejectedAttempts.length > 0 ||
    verification.unresolvedCandidateRejection) {
    const phase = pending ? 'commit' : 'begin';
    return typedNextAction(pending ?
      pendingCommitCommand(questId, pending) :
      continueCommand(questId), {
      code: NEXT_ACTION_CODE.REPLACE_REJECTED_ATTEMPT,
      payload: {questId, phase},
    });
  }
  if (TERMINAL_STATUSES.includes(state.questStatus)) {
    return terminalQuestAction(questId, verification, audit);
  }
  if ((verification.uncheckpointedApprovedAttempts.length > 0 ||
    verification.candidateApproval) &&
    verification.attemptProblems.length === 0) {
    return typedNextAction(continueCommand(questId), {
      code: NEXT_ACTION_CODE.CHECKPOINT,
      payload: {questId},
    });
  }
  if (pending) {
    return typedNextAction(pendingCommitCommand(questId, pending), {
      code: NEXT_ACTION_CODE.RECORD_ATTEMPT,
      payload: {questId},
    });
  }
  if (gateStop) {
    if (gateStop.nextCommand) {
      return typedNextAction(continueCommand(questId), {
        code: NEXT_ACTION_CODE.OPERATOR_ACTION,
        payload: {
          questId,
          stopCode: gateStop.code || gateStop.outcome,
          problem: (gateStop.problems || [])[0] || null,
        },
      });
    }
    const problem = (gateStop.problems || [])[0] || 'operator judgment required';
    return typedNextAction(continueCommand(questId), {
      code: NEXT_ACTION_CODE.OPERATOR_ACTION,
      payload: {questId, stopCode: gateStop.code || gateStop.outcome, problem},
    });
  }
  if (blocker.nextAction === `continue supervised step for ${blocker.frontier}`) {
    return typedNextAction(continueCommand(questId), {
      code: NEXT_ACTION_CODE.BEGIN_STEP,
      payload: {questId, frontier: blocker.frontier},
    });
  }
  return typedNextAction(continueCommand(questId), {
    code: NEXT_ACTION_CODE.OPERATOR_ACTION,
    payload: {questId, frontier: blocker.frontier},
  });
}

export function buildNextProjection(root, questId) {
  let quest;
  try {
    quest = loadQuest(root, questId);
  } catch (error) {
    if (error && error.code === FILE_NOT_FOUND_CODE) {
      throw new Error(`quest not found: ${questId}`);
    }
    throw error;
  }
  const log = readLog(root, questId);
  const state = projectState(quest, log);
  const pending = stepPending(root, questId);
  const blocker = buildCurrentBlocker({quest, log, state});
  const gateStop = lastEventGateStop(log);
  const health = analyzeQuestHealth(root, quest, {state});
  const advisories = buildAdvisories(quest, health, log);
  const sealFreshness = buildSealFreshnessAdvisory(quest, log, {root});
  if (sealFreshness) advisories.push(sealFreshness);
  const verification = verificationState(root, quest, log);
  const verificationPreflight = checkpointVerificationPreflight(
    root, quest, log, {state: verification});
  const audit = auditQuest(root, quest);

  const terminal = TERMINAL_STATUSES.includes(state.questStatus);
  return {
    schemaVersion: NEXT_SCHEMA_VERSION,
    quest: {id: questId, status: state.questStatus},
    action: nextAction({
      questId, state, pending, gateStop, blocker, verification,
      verificationPreflight, audit,
    }),
    pendingStep: pending ? {
      frontier: pending.frontier,
      rungIndex: pending.rungIndex ?? null,
      modelEvidenceRequiredAtCommit: pendingModelEvidenceRequired(pending),
      beforeMetric: pending.before?.metric ?? null,
      advancedAbortAvailable: true,
    } : null,
    lastStop: gateStop ? {
      code: gateStop.code || gateStop.outcome,
      outcome: gateStop.outcome,
      disposition: gateStop.disposition,
      problem: (gateStop.problems || [])[0] || null,
    } : null,
    blocker: terminal ? null : blocker,
    verification: {
      sourceAttemptCount: verification.attempts.length,
      pendingAttemptCount: verification.pendingAttempts.length,
      aggregateFingerprint: verification.aggregate.fingerprint,
      aggregateApproved: Boolean(verification.aggregateApproval),
      candidateFingerprint: verification.candidate?.fingerprint || null,
      candidateApproved: Boolean(verification.candidateApproval),
      checkpointPreflight: verificationPreflight,
    },
    advisories: advisories.map(({command: _advancedCommand, ...advisory}) =>
      advisory),
  };
}

export function buildNextLines(root, questId) {
  const projection = buildNextProjection(root, questId);
  const {action, pendingStep, lastStop, blocker, advisories, verification} = projection;
  const lines = [
    `Next [${action.type}]: ${action.value || 'nothing to execute'}`,
    `quest: ${projection.quest.id} (${projection.quest.status})`,
  ];
  if (pendingStep) {
    lines.push(`pending step: ${pendingStep.frontier} pinned at metric ` +
      `${pendingStep.beforeMetric ?? UNKNOWN_METRIC} — commit with continue and ` +
      `${LOCAL_STR_OWNED_001}, or use advanced diagnostics to abort`);
    if (pendingStep.modelEvidenceRequiredAtCommit) {
      lines.push('model rung: commit requires --modelRef <model:ref> or ' +
        '--modelNotApplicable "<why the architecture model does not apply>"');
    }
  }
  if (lastStop) {
    lines.push(`last stop: ${lastStop.code} ` +
      `(${lastStop.disposition})${lastStop.problem ? ` — ${lastStop.problem}` : ''}`);
  }
  const typedProblemLine = typedActionProblemLine(action);
  if (typedProblemLine) lines.push(typedProblemLine);
  // A terminal quest has no current blocker by definition; printing the stale
  // (often "unknown") blocker card next to "quest is SOLVED" is contradictory.
  if (blocker) {
    lines.push(`blocker: ${blockerLabel(blocker)} — ${blocker.movementSummary}`);
  }
  if (verification.sourceAttemptCount > 0) {
    lines.push(...checkpointVerificationPreflightLines(
      verification.checkpointPreflight));
  }
  if (advisories.length > 0) {
    lines.push(ADVISORIES_HEADING);
    for (const advisory of advisories) {
      lines.push(`- ${advisory.kind}: ${advisory.message}`);
    }
  }
  return lines;
}

export function buildNextSummaryLines(root, questId) {
  const projection = buildNextProjection(root, questId);
  const {action, lastStop, blocker, verification} = projection;
  const lines = [
    `Next [${action.type}/${action.code}]: ${action.value || 'nothing to execute'}`,
    `quest: ${projection.quest.id} (${projection.quest.status})`,
  ];
  const preflightProblem = verification.checkpointPreflight.problems?.[0];
  const typedProblemLine = typedActionProblemLine(action);
  if (typedProblemLine) {
    lines.push(typedProblemLine);
  } else if (lastStop) {
    lines.push(`problem [${lastStop.code}]: ${lastStop.problem || lastStop.disposition}`);
  } else if (preflightProblem) {
    lines.push(`problem [verification-preflight]: ${preflightProblem.message}`);
  } else if (blocker) {
    lines.push(`problem [${blocker.movement}]: ${blockerLabel(blocker)}`);
  }
  return lines;
}

export function runNextCommand(root, questId, options = {}) {
  if (options.json === true) {
    return `${JSON.stringify(buildNextProjection(root, questId), null, 2)}${LINE_SEPARATOR}`;
  }
  const lines = options.verbose === true ?
    buildNextLines(root, questId) : buildNextSummaryLines(root, questId);
  return `${lines.join(LINE_SEPARATOR)}${LINE_SEPARATOR}`;
}
