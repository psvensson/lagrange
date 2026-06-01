import fs from 'node:fs';
import path from 'node:path';

import {
  EVENT_ATTEMPT,
  EVENT_EVIDENCE_INGESTED,
  EVENT_QUEST,
  EVENT_QUEST_UPGRADED,
  EVENT_SOLVED,
  EVENT_THEORY_OPTION_DECLARED,
  EVENT_THEORY_RESULT,
  EVENT_THEORY_SELECTED,
  EVENT_THEORY_SUPERSEDED,
  EVENT_THEORY_SYSTEM_DECLARED,
  THEORY_RESULT_ACTIVE,
  THEORY_RESULT_AVOIDED,
  THEORY_RESULT_FALSIFIED,
  THEORY_RESULT_NEEDS_RERUN,
  THEORY_RESULT_STALE,
  THEORY_RESULT_SUPPORTED,
  THEORY_RESULT_SUPERSEDED,
} from './constants.js';
import {detectUnrecordedEvidence} from './evidence.js';
import {eventEvidenceFingerprint} from './evidence-identity.js';
import {inspectChangeArtifact} from './change-artifact.js';
import {loadQuest, projectState, readLog} from './store.js';

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
    if (index < startIndex || event.type !== EVENT_ATTEMPT) continue;
    const inspection = inspectChangeArtifact(root, quest, event.changeRef);
    for (const changeProblem of inspection.problems) {
      problems.push(problem(changeProblem, event));
    }
  }
  return problems;
}

function auditEvidenceIdentity(log, startIndex) {
  return log
    .filter((event, index) =>
      index >= startIndex &&
      (event.type === EVENT_ATTEMPT ||
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
    (event.type === EVENT_EVIDENCE_INGESTED && typeof event.metric === 'number')));
  if (latestMetricIndex < 0) return [];
  const event = log[latestMetricIndex];
  const metric = event.type === EVENT_ATTEMPT ? event.metricAfter : event.metric;
  if (metric !== 0 || event.done === true) return [];
  const hasLaterTheoryResult = log.slice(latestMetricIndex + 1)
    .some((item) => item.type === EVENT_THEORY_RESULT);
  if (hasLaterTheoryResult) return [];
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

export function auditQuest(root, quest) {
  const log = readLog(root, quest.id);
  const state = projectState(quest, log);
  const startIndex = strictAuditStartIndex(log);
  const problems = [
    ...auditChangeRefs(root, quest, log, startIndex),
    ...auditEvidenceIdentity(log, startIndex),
    ...auditTheoryUse(log, startIndex),
    ...auditMetricZeroNeedsTheoryResult(log, startIndex),
    ...auditReportOrdering(root, quest, log),
  ];
  const unrecorded = detectUnrecordedEvidence(root, quest.id);
  if (unrecorded) {
    problems.push(problem(
      `fresh probe evidence is not recorded: ${unrecorded.evidence}`,
    ));
  }
  return {
    questId: quest.id,
    status: problems.length === 0 ? 'pass' : 'fail',
    problemCount: problems.length,
    strictAuditStartedAt: startIndex > 0 ? log[startIndex - 1]?.ts || null : null,
    problems,
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
  return `${lines.join('\n')}\n`;
}
