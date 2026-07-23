// Read-only verifier-readiness projection for the real narrow checkpoint gate.
// Synthetic approvals exist only in a copied event array; the shared checkpoint
// evaluator still applies integrity, change-artifact, and exact-verification
// checks before `next` is allowed to spend an independent verifier turn.

import {checkpointGateProblemsForLog} from './audit.js';
import {EVENT_FINDING} from './constants.js';
import {importClosureGaps} from './import-closure.js';
import {suggestVerificationTemplates} from './verification-template-suggest.js';
import {
  canonicalSourceDelta,
  validVerificationFingerprint,
  VERIFICATION_CONTRACT_VERSION,
  VERIFICATION_SCOPE,
  VERIFIER_APPROVAL_FINDING_KIND,
  verificationState,
} from './verification.js';

const MISSING_CHANGE_REF = '(missing changeRef)';
const PREFLIGHT_VERIFIER_EVIDENCE = 'subagent:checkpoint-preflight-simulation';

function attemptPreflightDossier(root, attempt) {
  const changedPaths = [...attempt.inspection.changedPaths].sort();
  const live = canonicalSourceDelta(
    root,
    attempt.event.workspaceBaseCommit,
    changedPaths,
  );
  return {
    changeRef: attempt.event.changeRef || null,
    fingerprint: attempt.fingerprint,
    frontier: attempt.event.frontier || null,
    baseCommit: attempt.event.workspaceBaseCommit || null,
    changedPaths,
    sourcePaths: [...attempt.sourcePaths].sort(),
    currentFingerprint: live.fingerprint,
    currentMatches: live.ok && live.fingerprint === attempt.fingerprint,
  };
}

function syntheticAttemptApproval(attempt) {
  return {
    type: EVENT_FINDING,
    frontier: attempt.event.frontier,
    kind: VERIFIER_APPROVAL_FINDING_KIND,
    claim: 'checkpoint preflight simulated exact approval',
    evidence: PREFLIGHT_VERIFIER_EVIDENCE,
    verification: {
      schemaVersion: attempt.verificationVersion,
      scope: VERIFICATION_SCOPE.ATTEMPT,
      fingerprint: attempt.fingerprint,
    },
  };
}

function candidatePreflightDossier(candidate) {
  if (!candidate?.fingerprint) return null;
  return {
    fingerprint: candidate.fingerprint,
    baseCommit: candidate.baseCommit,
    paths: [...candidate.paths],
    sourcePaths: [...candidate.sourcePaths],
    firstAttemptIndex: candidate.firstAttemptIndex,
    lastAttemptIndex: candidate.lastAttemptIndex,
    currentFingerprint: candidate.fingerprint,
    currentMatches: candidate.ok,
  };
}

function syntheticCandidateApproval(candidate) {
  return {
    type: EVENT_FINDING,
    frontier: candidate.attempts.at(-1)?.event.frontier || null,
    kind: VERIFIER_APPROVAL_FINDING_KIND,
    claim: 'checkpoint preflight simulated landing-candidate approval',
    evidence: PREFLIGHT_VERIFIER_EVIDENCE,
    verification: {
      schemaVersion: VERIFICATION_CONTRACT_VERSION,
      scope: VERIFICATION_SCOPE.CANDIDATE,
      fingerprint: candidate.fingerprint,
      baseCommit: candidate.baseCommit,
      paths: [...candidate.paths],
      sourcePaths: [...candidate.sourcePaths],
      firstAttemptIndex: candidate.firstAttemptIndex,
      lastAttemptIndex: candidate.lastAttemptIndex,
    },
  };
}

function approvedUncheckpointedAttempts(state) {
  const excludedIndexes = new Set([
    ...state.pendingAttempts.map((attempt) => attempt.index),
    ...state.unresolvedRejectedAttempts.map((entry) => entry.attempt.index),
  ]);
  return state.uncheckpointedApprovedAttempts.filter(
    (attempt) => !excludedIndexes.has(attempt.index),
  );
}

function addReplacementRequirement(groups, attempt, paths, reason) {
  const frontier = attempt.event.frontier || null;
  const baseCommit = attempt.event.workspaceBaseCommit || null;
  const key = `${frontier || ''}\0${baseCommit || ''}`;
  const group = groups.get(key) || {
    frontier,
    baseCommit,
    requiredPaths: new Set(),
    reasons: new Set(),
  };
  for (const filePath of paths) group.requiredPaths.add(filePath);
  group.reasons.add(reason);
  groups.set(key, group);
}

function replacementRequirementGroups(root, state) {
  const groups = new Map();
  for (const {attempt} of state.unresolvedRejectedAttempts) {
    addReplacementRequirement(
      groups,
      attempt,
      attempt.sourcePaths,
      `rejected ${attempt.event.changeRef || MISSING_CHANGE_REF} requires a ` +
        'same-frontier, same-base source-path superset',
    );
  }
  for (const attempt of approvedUncheckpointedAttempts(state)) {
    const dossier = attemptPreflightDossier(root, attempt);
    if (dossier.currentMatches) continue;
    addReplacementRequirement(
      groups,
      attempt,
      attempt.inspection.changedPaths,
      `approved ${attempt.event.changeRef || MISSING_CHANGE_REF} drifted; ` +
        'replacement must cover its complete path set',
    );
  }
  return new Map([...groups].map(([key, group]) => [key, {
    frontier: group.frontier,
    baseCommit: group.baseCommit,
    requiredPaths: [...group.requiredPaths].sort(),
    reasons: [...group.reasons].sort(),
  }]));
}

function applicablePreflightTemplates(root, pendingAttempts) {
  const templates = new Map();
  for (const attempt of pendingAttempts) {
    for (const suggestion of suggestVerificationTemplates(
      root,
      attempt.inspection.content || '',
    )) {
      templates.set(suggestion.template, suggestion);
    }
  }
  return [...templates.values()].sort((left, right) =>
    left.template.localeCompare(right.template));
}

// Answer the exact pre-delegation question: if every pending fingerprint were
// approved now, would the REAL narrow checkpoint gate accept the copied log and
// current bytes? Full terminal/product audit concerns deliberately remain out of
// this projection.
export function checkpointVerificationPreflight(root, quest, log, options = {}) {
  const state = options.state || verificationState(root, quest, log, options);
  const pendingWithFingerprints = state.pendingAttempts.filter(
    (attempt) => validVerificationFingerprint(attempt.fingerprint),
  );
  const pendingApprovals = pendingWithFingerprints.map(
    (attempt) => attemptPreflightDossier(root, attempt),
  );
  const candidate = candidatePreflightDossier(state.candidate);
  const needsCandidateApproval = candidate && !state.candidateApproval;
  const syntheticLog = [
    ...log,
    ...pendingWithFingerprints.map(syntheticAttemptApproval),
    ...(needsCandidateApproval ? [syntheticCandidateApproval(state.candidate)] : []),
  ];
  const simulatedState = verificationState(root, quest, syntheticLog, options);
  const problems = checkpointGateProblemsForLog(root, quest, syntheticLog);
  const currentGroups = replacementRequirementGroups(root, state);
  const remainingGroupKeys = new Set(
    replacementRequirementGroups(root, simulatedState).keys(),
  );
  const replacementGroups = [...currentGroups].map(([key, group]) => ({
    ...group,
    satisfiedAfterRequiredApprovals: !remainingGroupKeys.has(key),
  }));
  const aggregate = state.aggregate;
  const singlePendingFingerprint = pendingApprovals.length === 1 ?
    pendingApprovals[0].fingerprint : null;
  // Advisory only: closure gaps inform the pre-delegation decision without
  // flipping readiness — the exact-fingerprint gate stays the sole authority.
  const importClosure = candidate ?
    importClosureGaps(root, state.candidate) :
    {omittedChangedPaths: [], importGaps: []};
  return {
    readyAfterRequiredApprovals:
      pendingApprovals.length === state.pendingAttempts.length &&
      problems.length === 0,
    pendingApprovals,
    candidate: {
      dossier: candidate,
      approvalRequired: Boolean(needsCandidateApproval),
      approved: Boolean(state.candidateApproval),
    },
    approvedUncheckpointedReceipts:
      approvedUncheckpointedAttempts(state).map(
        (attempt) => attemptPreflightDossier(root, attempt),
      ),
    replacementGroups,
    importClosure,
    applicableTemplates: applicablePreflightTemplates(root, [
      ...pendingWithFingerprints,
      ...(state.candidate?.attempts || []),
    ]),
    aggregate: {
      fingerprint: aggregate.fingerprint,
      baseCommit: aggregate.baseCommit,
      paths: aggregate.paths || [],
      bothEligible: Boolean(
        (singlePendingFingerprint || candidate?.fingerprint) &&
        aggregate.ok &&
        (singlePendingFingerprint || candidate?.fingerprint) === aggregate.fingerprint &&
        (!candidate || JSON.stringify(candidate.paths) ===
          JSON.stringify(aggregate.paths || [])),
      ),
    },
    problems,
  };
}

function appendPreflightAttemptLines(lines, label, attempts) {
  for (const attempt of attempts) {
    lines.push(
      `${label}: ${attempt.changeRef || MISSING_CHANGE_REF} ` +
      `${attempt.fingerprint || 'sha256:<missing>'} base ${attempt.baseCommit || '<missing>'} ` +
      `current ${attempt.currentFingerprint || '<unavailable>'} ` +
      `(${attempt.currentMatches ? 'matches' : 'does not match'})`,
      `  paths: ${attempt.changedPaths.join(', ') || '(none)'}`,
    );
  }
}

function appendReplacementGroupLines(lines, replacementGroups) {
  for (const group of replacementGroups) {
    lines.push(
      `replacement obligation: frontier ${group.frontier || '<missing>'} base ` +
      `${group.baseCommit || '<missing>'} ` +
      `(${group.satisfiedAfterRequiredApprovals ? 'covered by pending approvals' : 'unresolved'})`,
      `  required paths: ${group.requiredPaths.join(', ') || '(none)'}`,
      `  reasons: ${group.reasons.join('; ')}`,
    );
  }
}

function appendAggregatePreflightLines(lines, aggregate) {
  lines.push(
    `aggregate context: ${aggregate.fingerprint || '<unavailable>'} ` +
    `base ${aggregate.baseCommit || '<missing>'} ` +
    `(both eligible: ${aggregate.bothEligible ? 'yes' : 'no'})`,
    `  aggregate paths: ${aggregate.paths.join(', ') || '(none)'}`,
  );
}

function appendImportClosureLines(lines, importClosure) {
  if (!importClosure || importClosure.importGaps.length === 0) return;
  for (const gap of importClosure.importGaps) {
    lines.push(
      `import-closure gap: candidate ${gap.importer} imports ` +
      `${gap.imported}, which changed against the base but is NOT in the ` +
      'candidate — verifiers reject omitted owners; include it (or record ' +
      'why it is out of scope) BEFORE spending a verifier turn',
    );
  }
  lines.push(
    'changed outside candidate: ' +
    importClosure.omittedChangedPaths.join(', '),
  );
}

function appendTemplateAndProblemLines(lines, preflight) {
  if (preflight.applicableTemplates.length > 0) {
    lines.push(`applicable templates: ${preflight.applicableTemplates
      .map((entry) => entry.template).join(', ')}`);
  }
  for (const item of preflight.problems) lines.push(`preflight problem: ${item.message}`);
}

export function checkpointVerificationPreflightLines(preflight) {
  const lines = [
    `verification preflight: ${preflight.readyAfterRequiredApprovals ?
      'checkpoint-landable after required approvals' :
      'NOT checkpoint-landable after required approvals'}`,
  ];
  appendPreflightAttemptLines(lines, 'pending exact approval', preflight.pendingApprovals);
  if (preflight.candidate?.dossier) {
    const candidate = preflight.candidate.dossier;
    lines.push(
      `landing candidate: ${candidate.fingerprint} base ${candidate.baseCommit} ` +
      `(${preflight.candidate.approved ? 'approved' : 'approval required'})`,
      `  paths: ${candidate.paths.join(', ') || '(none)'}`,
    );
  }
  appendPreflightAttemptLines(
    lines,
    'approved uncheckpointed receipt',
    preflight.approvedUncheckpointedReceipts,
  );
  appendReplacementGroupLines(lines, preflight.replacementGroups);
  appendImportClosureLines(lines, preflight.importClosure);
  appendAggregatePreflightLines(lines, preflight.aggregate);
  appendTemplateAndProblemLines(lines, preflight);
  return lines;
}
