// Read-only verifier-readiness projection for the real narrow checkpoint gate.
// Synthetic approvals exist only in a copied event array; the shared checkpoint
// evaluator still applies integrity, change-artifact, and exact-verification
// checks before `next` is allowed to spend an independent verifier turn.

import {auditQuest, checkpointGateProblemsForLog} from './audit.js';
import {EVENT_FINDING} from './constants.js';
import {importClosureGaps} from './import-closure.js';
import {suggestVerificationTemplates} from './verification-template-suggest.js';
import {
  BASE_UNREACHABLE_CODE,
  canonicalSourceDelta,
  probeBaseReproducibility,
  validVerificationFingerprint,
  VERIFICATION_CONTRACT_VERSION,
  VERIFICATION_SCOPE,
  VERIFIER_APPROVAL_FINDING_KIND,
  terminalVerificationProblems,
  verificationState,
} from './verification.js';
import {parseCommitChangeRef} from './change-artifact.js';
import {canonicalCommitDelta} from './content-addressed-change-artifact.js';

const MISSING_CHANGE_REF = '(missing changeRef)';
const PREFLIGHT_VERIFIER_EVIDENCE = 'subagent:checkpoint-preflight-simulation';
const PREFLIGHT_AGGREGATE_APPROVAL_CLAIM =
  'terminal preflight simulated aggregate approval';

function attemptPreflightDossier(root, attempt) {
  const changedPaths = [...attempt.inspection.changedPaths].sort();
  // A measurement-only (commit:) changeRef is pinned by sha: its identity
  // cannot drift, so compare against the committed tree-to-tree delta rather
  // than the (always-empty-for-committed-work) base→working-tree delta.
  const commitRef = parseCommitChangeRef(attempt.event.changeRef);
  const live = commitRef ?
    canonicalCommitDelta(root, commitRef.base, commitRef.head, changedPaths) :
    canonicalSourceDelta(
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
    // Why the live delta could not be taken, when it could not. Without this a
    // consumer sees only `currentMatches: false` and infers drift — telling the
    // operator the source moved when the only broken thing is a commit name.
    problemCode: live.ok ? null : (live.code || null),
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

function syntheticAggregateApproval(state) {
  const latest = [...state.attempts].reverse()
    .find((attempt) => attempt.contracted);
  if (!latest || !state.aggregate?.ok ||
    !validVerificationFingerprint(state.aggregate.fingerprint) ||
    state.aggregateApproval) return null;
  return {
    type: EVENT_FINDING,
    frontier: latest.event.frontier,
    kind: VERIFIER_APPROVAL_FINDING_KIND,
    claim: PREFLIGHT_AGGREGATE_APPROVAL_CLAIM,
    evidence: PREFLIGHT_VERIFIER_EVIDENCE,
    verification: {
      schemaVersion: VERIFICATION_CONTRACT_VERSION,
      scope: VERIFICATION_SCOPE.AGGREGATE,
      fingerprint: state.aggregate.fingerprint,
    },
  };
}

function problemIdentity(item) {
  return JSON.stringify([
    item?.message || null,
    item?.ts || null,
    item?.frontier || null,
  ]);
}

// Multiset subtraction is deliberate. Two identical audit problems are two
// obligations; resolving one approval must not erase both. Exact tuple identity
// also prevents an unrelated message containing the approval text from matching.
export function subtractAuditProblemMultiset(source, removable) {
  const counts = new Map();
  for (const item of removable) {
    const key = problemIdentity(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return source.filter((item) => {
    const key = problemIdentity(item);
    const count = counts.get(key) || 0;
    if (count === 0) return true;
    counts.set(key, count - 1);
    return false;
  });
}

// Terminal verifier readiness is distinct from checkpoint readiness. Determine
// only what valid exact approvals can remove from terminal verification, then
// subtract that exact multiset from the REAL audit. Running the full audit over
// synthetic findings would let those findings affect unrelated theory rules.
export function terminalAuditVerificationPreflight(
  root,
  quest,
  log,
  options = {},
) {
  const state = options.state || verificationState(root, quest, log, options);
  const audit = options.audit || auditQuest(root, quest);
  const pendingApprovals = state.pendingAttempts
    .filter((attempt) => validVerificationFingerprint(attempt.fingerprint))
    .map(syntheticAttemptApproval);
  const aggregateApproval = syntheticAggregateApproval(state);
  const syntheticLog = [
    ...log,
    ...pendingApprovals,
    ...(aggregateApproval ? [aggregateApproval] : []),
  ];
  const before = terminalVerificationProblems(root, quest, log, options);
  const after = terminalVerificationProblems(root, quest, syntheticLog, options);
  const resolvedVerificationProblems = subtractAuditProblemMultiset(before, after);
  const problems = subtractAuditProblemMultiset(
    audit.problems,
    resolvedVerificationProblems,
  );
  // Keep the residual verification obligations separate from unrelated audit
  // defects. Callers can preserve their precise replacement guidance for the
  // former while still refusing to delegate candidates with integrity,
  // evidence, theory, or other terminal audit failures.
  const nonVerificationProblems = subtractAuditProblemMultiset(problems, after);
  return {
    readyAfterRequiredApprovals: problems.length === 0,
    pendingAttemptApprovalCount: pendingApprovals.length,
    aggregateApprovalRequired: Boolean(aggregateApproval),
    resolvedVerificationProblems,
    verificationProblems: after,
    nonVerificationProblems,
    problems,
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
  for (const entry of state.unresolvedRejectedAttempts) {
    const {attempt} = entry;
    // A rejection whose base still resolves demands the strict same-base form;
    // one whose base is gone demands the live-base coverage form. Printing the
    // same-base instruction for a dead base would demand the impossible.
    addReplacementRequirement(
      groups,
      attempt,
      attempt.sourcePaths,
      entry.baseUnreachable ?
        `rejected ${attempt.event.changeRef || MISSING_CHANGE_REF} has a ` +
          `${BASE_UNREACHABLE_CODE} recorded base; requires a same-frontier ` +
          'source-path superset at a reachable base plus its own exact approval' :
        `rejected ${attempt.event.changeRef || MISSING_CHANGE_REF} requires a ` +
          'same-frontier, same-base source-path superset',
    );
    if (entry.baseUnreachable) {
      groups.get(`${attempt.event.frontier || ''}\0` +
        `${attempt.event.workspaceBaseCommit || ''}`).baseUnreachable = true;
    }
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
    baseUnreachable: Boolean(group.baseUnreachable),
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
    // Terminated-receipt visibility: dead-base attempts stay reported even
    // after their obligations resolve through coverage, so the dossier never
    // reads clean-by-omission. Reproducibility is opt-in (`checkpoint --dry-run
    // --probe-reproducibility`) because the scan is expensive; when measured it
    // reports the candidate count and never a substitute base.
    baseUnreachableAttempts: (state.baseUnreachableAttempts || []).map((entry) => ({
      changeRef: entry.attempt.event.changeRef || null,
      fingerprint: entry.attempt.fingerprint,
      baseCommit: entry.baseCommit,
      code: entry.code,
      liveReceiptVerifiable: entry.liveReceiptVerifiable,
      countsAsVerification: entry.countsAsVerification,
      ...(options.probeReproducibility ? probeBaseReproducibility(
        root, entry.attempt.event, entry.attempt.inspection.changedPaths) : {}),
    })),
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
  for (const entry of preflight.baseUnreachableAttempts || []) {
    lines.push(
      `${BASE_UNREACHABLE_CODE}: ${entry.changeRef || MISSING_CHANGE_REF} ` +
      `base ${entry.baseCommit} — live receipt not verifiable, never counted ` +
      'as verification' +
      (entry.reproducible === true ?
        `; recorded bytes reproduce from ${entry.candidatesFound} of ` +
        `${entry.commitsScanned} scanned commits (no single base identifiable)` :
        entry.reproducible === false ?
          `; recorded bytes reproduce from none of ${entry.commitsScanned} ` +
          // A bounded negative is not a complete negative; saying "none" over a
          // truncated scan would overstate the search.
          `scanned commits${entry.scanTruncated ? ' (scan truncated)' : ''}` : ''),
    );
  }
  appendReplacementGroupLines(lines, preflight.replacementGroups);
  appendImportClosureLines(lines, preflight.importClosure);
  appendAggregatePreflightLines(lines, preflight.aggregate);
  appendTemplateAndProblemLines(lines, preflight);
  return lines;
}
