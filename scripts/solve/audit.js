import fs from 'node:fs';
import path from 'node:path';

import {
  EVENT_ATTEMPT,
  EVENT_NON_MEASUREMENT,
  EVENT_EVIDENCE_INGESTED,
  EVENT_FINDING,
  EVENT_QUEST,
  EVENT_QUEST_UPGRADED,
  EVENT_SOLVED,
  EVENT_THEORY_OPTION_DECLARED,
  EVENT_THEORY_RESULT,
  EVENT_THEORY_SELECTED,
  EVENT_THEORY_SUPERSEDED,
  EVENT_THEORY_SYSTEM_DECLARED,
  STATUS_EXHAUSTED,
  STATUS_SOLVED,
  THEORY_RESULT_ACTIVE,
  THEORY_RESULT_AVOIDED,
  THEORY_RESULT_FALSIFIED,
  THEORY_RESULT_NEEDS_RERUN,
  THEORY_RESULT_STALE,
  THEORY_RESULT_SUPPORTED,
  THEORY_RESULT_SUPERSEDED,
} from './constants.js';
import {
  terminalIntegrityProblems,
} from './integrity.js';
import {detectUnrecordedEvidence} from './evidence-detection.js';
import {eventEvidenceFingerprint} from './evidence-identity.js';
import {
  inspectChangeArtifact,
  requiresModelEvidence,
} from './change-artifact.js';
import {loadQuest, projectState, readLog} from './store.js';
import {questClass, closureKind, isDecisionClosure} from './closure-kind.js';
import {analyzeQuestHealth} from './health.js';
import {
  CONTINUATION_BLOCKED_MEASUREMENT,
  CONTINUATION_BLOCKED_METRIC_PROJECTION,
  CONTINUATION_BLOCKED_REGRESSION,
  CONTINUATION_BLOCKED_SCOPE,
  CONTINUATION_BLOCKED_UNRECORDED_EVIDENCE,
  continuationIsAllowed,
} from './continuation.js';
import {isFrontierProbeEvent} from './probe-spec.js';
import {
  checkpointVerificationProblems,
  terminalVerificationProblems,
  verificationState,
} from './verification.js';

const BLOCKED_THEORY_STATUSES = Object.freeze([
  THEORY_RESULT_AVOIDED,
  THEORY_RESULT_FALSIFIED,
  THEORY_RESULT_NEEDS_RERUN,
  THEORY_RESULT_STALE,
  THEORY_RESULT_SUPERSEDED,
]);

const SELECTABLE_THEORY_STATUSES = Object.freeze([
  THEORY_RESULT_ACTIVE,
  THEORY_RESULT_SUPPORTED,
]);

function problem(message, event = null) {
  return {
    message,
    ts: event?.ts || null,
    frontier: event?.frontier || null,
  };
}

function strictAuditStartIndex(log) {
  const index = log.findIndex((event) =>
    event.type === EVENT_QUEST_UPGRADED && event.strictAudit === true);
  return index < 0 ? 0 : index + 1;
}

function auditChangeRefs(root, quest, log, startIndex) {
  const problems = [];
  for (const [index, event] of log.entries()) {
    if (![EVENT_ATTEMPT, EVENT_NON_MEASUREMENT].includes(event.type)) continue;
    if (index >= startIndex) {
      const inspection = inspectChangeArtifact(root, quest, event.changeRef);
      for (const changeProblem of inspection.problems) {
        problems.push(problem(changeProblem, event));
      }
    }
  }
  return problems;
}

function auditEvidenceIdentity(log, startIndex) {
  return log
    .filter((event, index) =>
      index >= startIndex &&
      (event.type === EVENT_ATTEMPT ||
        event.type === EVENT_NON_MEASUREMENT ||
        event.type === EVENT_EVIDENCE_INGESTED ||
        event.type === EVENT_SOLVED ||
        event.type === EVENT_QUEST) &&
      event.evidence &&
      !eventEvidenceFingerprint(event))
    .map((event) => problem(
      `evidence event is missing fingerprint identity: ${event.evidence}`,
      event,
    ));
}

function auditIntegrityViolations(root, quest, log) {
  return terminalIntegrityProblems(root, quest, log)
    .map((item) => problem(item.message, item.event));
}

function auditTheoryUse(log, startIndex) {
  const problems = [];
  const theoryStatus = new Map();
  const selectedByFrontier = new Map();
  for (const [index, event] of log.entries()) {
    if (event.type === EVENT_THEORY_SYSTEM_DECLARED ||
      event.type === EVENT_THEORY_OPTION_DECLARED) {
      theoryStatus.set(event.theory, event.status || THEORY_RESULT_ACTIVE);
    } else if (event.type === EVENT_THEORY_RESULT) {
      theoryStatus.set(event.theory, event.result);
    } else if (event.type === EVENT_THEORY_SUPERSEDED) {
      theoryStatus.set(event.theory, THEORY_RESULT_SUPERSEDED);
    } else if (event.type === EVENT_THEORY_SELECTED) {
      selectedByFrontier.set(event.frontier, event.theory);
      const status = theoryStatus.get(event.theory);
      if (index >= startIndex && status &&
        !SELECTABLE_THEORY_STATUSES.includes(status)) {
        problems.push(problem(
          `selected theory ${event.theory} is ${status}; select an active or supported theory`,
          event,
        ));
      }
    } else if (event.type === EVENT_ATTEMPT) {
      const theory = event.theoryRef || selectedByFrontier.get(event.frontier);
      if (!theory) continue;
      const status = theoryStatus.get(theory);
      if (index >= startIndex && BLOCKED_THEORY_STATUSES.includes(status)) {
        problems.push(problem(
          `attempt used blocked theory ${theory} with status ${status}`,
          event,
        ));
      }
    }
  }
  return problems;
}

function auditMetricZeroNeedsTheoryResult(log, startIndex) {
  const latestMetricIndex = log.findLastIndex((event, index) =>
    index >= startIndex &&
    ((event.type === EVENT_ATTEMPT && typeof event.metricAfter === 'number') ||
    (event.type === EVENT_EVIDENCE_INGESTED &&
      isFrontierProbeEvent(event) &&
      typeof event.metric === 'number')));
  if (latestMetricIndex < 0) return [];
  const event = log[latestMetricIndex];
  const metric = event.type === EVENT_ATTEMPT ? event.metricAfter : event.metric;
  if (metric !== 0 || event.done === true) return [];
  const laterEvents = log.slice(latestMetricIndex + 1);
  const hasLaterTheoryResult = laterEvents
    .some((item) => item.type === EVENT_THEORY_RESULT);
  if (hasLaterTheoryResult) return [];
  const hasLaterSolvedEvent = laterEvents.some((item) =>
    (item.type === EVENT_SOLVED &&
      (!event.frontier || item.frontier === event.frontier)) ||
    (item.type === EVENT_QUEST && item.status === STATUS_SOLVED));
  if (hasLaterSolvedEvent) return [];
  return [problem('metric is zero but done is false without a later theory result', event)];
}

function auditReportOrdering(root, quest, log) {
  const reportPath = path.join(root, 'solve', 'report', `${quest.id}.md`);
  if (!fs.existsSync(reportPath) || log.length === 0) return [];
  const reportMtime = fs.statSync(reportPath).mtimeMs;
  const latestLogTs = new Date(log[log.length - 1].ts).getTime();
  if (Number.isFinite(latestLogTs) && reportMtime + 1 < latestLogTs) {
    return [problem('Quest report is older than the append-only log')];
  }
  return [];
}

function auditSourceChangeVerification(root, quest, log, startIndex) {
  return verificationState(root, quest, log, {startIndex}).attemptProblems;
}

function isModelEvidenceFinding(event, frontier) {
  if (event.type === EVENT_EVIDENCE_INGESTED && event.frontier === frontier) {
    if (!isFrontierProbeEvent(event)) return false;
    return isModelEvidenceRef(event.evidence);
  }
  return event.type === EVENT_FINDING &&
    event.frontier === frontier &&
    isModelEvidenceRef(event.evidence) &&
    /model|alloy|tla|trace|decision|statechart|contract|evidence|report/iu
      .test(String(event.claim || ''));
}

function isModelEvidenceRef(evidence) {
  const value = String(evidence || '');
  return /^(model|statechart|contract|tla):/u.test(value) ||
    /^test-output\/reports\/.*\.model\.report\.json$/u.test(value) ||
    /^models\//u.test(value) ||
    /^architecture\/models\//u.test(value) ||
    /^architecture\/contracts\//u.test(value);
}

function auditModelEvidence(root, quest, log, startIndex) {
  const problems = [];
  for (const [index, event] of log.entries()) {
    if (index < startIndex || event.type !== EVENT_ATTEMPT) continue;
    const inspection = inspectChangeArtifact(root, quest, event.changeRef);
    if (!inspection.changedPaths.some(requiresModelEvidence)) continue;
    const hasInlineModelEvidence = Boolean(event.modelRef);
    const hasLaterModelEvidence = log
      .slice(index + 1)
      .some((item) => isModelEvidenceFinding(item, event.frontier));
    if (!hasInlineModelEvidence && !hasLaterModelEvidence) {
      problems.push(problem(
        'model and architecture model changes require modelRef or later ' +
          'model evidence finding on the same frontier',
        event,
      ));
    }
  }
  return problems;
}

function closureStrengthWarnings(quest, log) {
  const solved = log.some((event) =>
    event.type === EVENT_QUEST && event.status === STATUS_SOLVED);
  if (!solved) return [];
  if (questClass(quest) === 'product' && isDecisionClosure(quest, log)) {
    return [
      `product quest closed on a ${closureKind(quest, log)} (oracle) probe; ` +
      'product goals should be MEASURED against a real artifact, not asserted',
    ];
  }
  return closureFidelityWarnings(quest, log);
}

// Within MEASURED closures there are fidelity tiers: test-output/reports/
// mixes deterministic guard-runner reports, live gate reports, and
// model-checker reports. A green DT with red-on-revert proves the test binds
// to the CODE, not that the fix binds to the LIVE mechanism — runs 25/26 of
// the affinity demo both refuted quests whose DT evidence was green. This
// warning surfaces the tier so live-visible classes state their live
// validation explicitly.
function closureFidelityWarnings(quest, log) {
  if (questClass(quest) !== 'product') return [];
  const evidencePath = [...log].reverse().find((event) =>
    event.type === EVENT_QUEST && event.status === STATUS_SOLVED)?.evidence;
  if (typeof evidencePath !== 'string' || !evidencePath.endsWith('.json')) {
    return [];
  }
  if (evidencePath.endsWith('.model.report.json')) {
    return [
      'product quest closed on MODEL-CHECKER evidence; state why live/DT ' +
      'validation is not required for this class',
    ];
  }
  let fidelity = null;
  try {
    fidelity = JSON.parse(fs.readFileSync(evidencePath, 'utf8'))?.fidelity ??
      null;
  } catch {
    return [];
  }
  if (fidelity === 'live') return [];
  return [
    `product quest closed on '${fidelity || 'unstamped'}' fidelity ` +
    'evidence; a green deterministic guard proves test-code binding, not ' +
    'live binding — for live-visible classes record a live-validation ' +
    'finding (which run, which observable) before relying on the closure',
  ];
}

// Link hygiene (warning only — links are declarative, never gated). A product
// quest with NO planning link (roadmapRow, specRef, or any closesCL) is invisible
// to `solve trace`/`frontier`/`overview`, so the planning graph cannot show what
// it advances. Process/meta quests legitimately have no roadmap row, so they are
// exempt. This is the anti-decay nudge for the links backfill, not a gate.
function linkHygieneWarnings(quest) {
  if (questClass(quest) !== 'product') return [];
  const links = quest.links || {};
  const closes = Array.isArray(links.closesCL) ? links.closesCL : [];
  if (links.roadmapRow || links.specRef || links.planDoc || links.parentQuest ||
    closes.length > 0) return [];
  return [
    'product quest has no planning link (links.roadmapRow / specRef / planDoc / ' +
    'parentQuest / closesCL all empty); it will not appear in planning joins',
  ];
}

function isTheoryApprovalFinding(event, frontier) {
  return event.type === EVENT_FINDING &&
    event.frontier === frontier &&
    typeof event.evidence === 'string' &&
    event.evidence.startsWith('subagent:') &&
    /approv|resolv|confirm|sign-?off|accept|promote/iu
      .test(String(event.claim || ''));
}

// R6: a theory may only be promoted/resolved by a MEASURED post-patch evidence
// report, never by an approval finding alone. Flags any frontier whose latest
// selected theory is followed by a subagent approval finding but no later measured
// evidence-ingested event confirming it against a real run.
function auditUnmeasuredTheoryPromotion(log, startIndex) {
  const selections = new Map();
  log.forEach((event, index) => {
    if (index < startIndex) return;
    if (event.type === EVENT_THEORY_SELECTED && event.frontier) {
      selections.set(event.frontier, {index, event});
    }
  });
  const problems = [];
  for (const [frontier, sel] of selections) {
    const later = log.slice(sel.index + 1);
    const hasApproval = later.some((e) => isTheoryApprovalFinding(e, frontier));
    if (!hasApproval) continue;
    const hasMeasuredEvidence = later.some((e) =>
      e.type === EVENT_EVIDENCE_INGESTED &&
      e.frontier === frontier &&
      isFrontierProbeEvent(e) &&
      typeof e.metric === 'number');
    if (!hasMeasuredEvidence) {
      problems.push(problem(
        'selected theory was approved by a finding but never confirmed by a ' +
          'measured post-patch evidence report',
        sel.event,
      ));
    }
  }
  return problems;
}

function auditContinuation(root, quest) {
  const health = analyzeQuestHealth(root, quest);
  if (continuationIsAllowed(health.continuation)) return [];
  const hardCodes = [
    CONTINUATION_BLOCKED_UNRECORDED_EVIDENCE,
    CONTINUATION_BLOCKED_METRIC_PROJECTION,
    CONTINUATION_BLOCKED_REGRESSION,
    CONTINUATION_BLOCKED_SCOPE,
    CONTINUATION_BLOCKED_MEASUREMENT,
  ];
  if (!hardCodes.includes(health.continuation.status)) return [];
  return health.continuation.problems.map((message) => problem(
    `continuation blocked: ${message}`,
  ));
}

const COMMIT_GATE_TERMINAL_STATUSES = Object.freeze([
  STATUS_SOLVED,
  STATUS_EXHAUSTED,
]);

export function commitGate(root, quest) {
  const log = readLog(root, quest.id);
  const finished = log.some((event) =>
    event.type === EVENT_QUEST &&
    COMMIT_GATE_TERMINAL_STATUSES.includes(event.status));
  const problems = [];
  if (!finished) {
    problems.push(problem(
      'quest has not finished (no SOLVED or EXHAUSTED terminal recorded)',
    ));
  }
  const fullAudit = auditQuest(root, quest);
  problems.push(...fullAudit.problems);
  return {
    questId: quest.id,
    ready: problems.length === 0,
    status: problems.length === 0 ? 'pass' : 'fail',
    problems,
  };
}

// A checkpoint is intentionally narrower than terminal handoff: it proves exact
// attempt artifact integrity and content-bound approval, but does not require
// terminal state or aggregate approval.
export function checkpointGate(root, quest) {
  const log = readLog(root, quest.id);
  const startIndex = strictAuditStartIndex(log);
  const problems = [
    ...auditIntegrityViolations(root, quest, log),
    ...auditChangeRefs(root, quest, log, startIndex),
    ...checkpointVerificationProblems(root, quest, log, {startIndex}),
  ];
  return {
    questId: quest.id,
    ready: problems.length === 0,
    status: problems.length === 0 ? 'pass' : 'fail',
    problems,
  };
}

export function auditQuest(root, quest) {
  const log = readLog(root, quest.id);
  const state = projectState(quest, log);
  const startIndex = strictAuditStartIndex(log);
  const terminal = log.some((event) => event.type === EVENT_QUEST &&
    COMMIT_GATE_TERMINAL_STATUSES.includes(event.status));
  const verificationProblems = terminal ?
    terminalVerificationProblems(root, quest, log, {startIndex}) :
    auditSourceChangeVerification(root, quest, log, startIndex);
  const problems = [
    ...auditIntegrityViolations(root, quest, log),
    ...auditChangeRefs(root, quest, log, startIndex),
    ...auditEvidenceIdentity(log, startIndex),
    ...auditTheoryUse(log, startIndex),
    ...verificationProblems,
    ...auditModelEvidence(root, quest, log, startIndex),
    ...auditMetricZeroNeedsTheoryResult(log, startIndex),
    ...auditUnmeasuredTheoryPromotion(log, startIndex),
    ...auditReportOrdering(root, quest, log),
    ...auditContinuation(root, quest),
  ];
  const unrecorded = detectUnrecordedEvidence(root, quest.id);
  if (unrecorded) {
    problems.push(problem(
      `fresh probe evidence is not recorded: ${unrecorded.evidence}`,
    ));
  }
  const warnings = [
    ...closureStrengthWarnings(quest, log),
    ...linkHygieneWarnings(quest),
  ];
  return {
    questId: quest.id,
    status: problems.length === 0 ? 'pass' : 'fail',
    problemCount: problems.length,
    strictAuditStartedAt: startIndex > 0 ? log[startIndex - 1]?.ts || null : null,
    problems,
    warnings,
    state,
  };
}

export function runAuditCommand(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('audit: --id <questId> is required');
  const result = auditQuest(root, loadQuest(root, id));
  if (args.json) return JSON.stringify(result, null, 2);
  const lines = [
    '# Quest Audit',
    '',
    `- quest: ${result.questId}`,
    `- status: ${result.status}`,
    `- problems: ${result.problemCount}`,
  ];
  if (result.strictAuditStartedAt) {
    lines.push(`- strict audit baseline: ${result.strictAuditStartedAt}`);
  }
  if (result.problems.length > 0) {
    lines.push('', '## Problems');
    for (const item of result.problems) {
      const frontier = item.frontier ? ` [${item.frontier}]` : '';
      lines.push(`- ${item.message}${frontier}`);
    }
  }
  if (result.warnings && result.warnings.length > 0) {
    lines.push('', '## Warnings');
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
