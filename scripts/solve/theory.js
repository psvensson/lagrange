import fs from 'node:fs';
import path from 'node:path';

import {
  EVENT_FINDING,
  EVENT_THEORY_OPTION_DECLARED,
  EVENT_THEORY_RESULT,
  EVENT_THEORY_SELECTED,
  EVENT_THEORY_SUPERSEDED,
  EVENT_THEORY_SYSTEM_DECLARED,
  DISCRIMINATION_CONFIRMED,
  DISCRIMINATION_REFUTED,
  DISCRIMINATIONS,
  RUNG_INDEX_WIDEN_SCOPE,
  RUNG_INDEX_MODEL,
  SYSTEM_THEORY_STALL_THRESHOLD,
  CONVERGENCE_GUARDS,
  THEORY_LAYERS,
  THEORY_RESULT_ACTIVE,
  THEORY_RESULT_AVOIDED,
  THEORY_RESULT_FALSIFIED,
  THEORY_RESULT_NEEDS_RERUN,
  THEORY_RESULT_STALE,
  THEORY_RESULT_SUPPORTED,
  THEORY_RESULT_SUPERSEDED,
  THEORY_RESULTS,
  THEORY_SCOPE_FRONTIER,
  THEORY_SCOPE_SYSTEM,
} from './constants.js';
import {buildMechanismCardFromEvidence} from './mechanism-card.js';
import {
  BLOCKER_MOVEMENT_MOVED_BOUNDARY,
  BLOCKER_MOVEMENT_MOVED_OWNER,
  BLOCKER_MOVEMENT_NARROWED,
  blockerUnattributedScenarioFailure,
  selectedTheoryStaleness,
} from './current-blocker.js';
import {modelGuidanceForQuest} from './model-guidance.js';
import {appendEvent, loadQuest, projectState, readLog} from './store.js';
import {
  detectCoupledOscillation,
  couplingReconcileStatus,
  regressionRestoreStatus,
} from './convergence-guards.js';
import {
  extractTheoryLedgerEntries,
  THEORY_LEDGER_FIELDS,
} from './work-theory-ledger.js';
import {analyzeQuestHealth} from './health.js';
import {
  CONTINUATION_BLOCKED_METRIC_PROJECTION,
  CONTINUATION_BLOCKED_REGRESSION,
  continuationErrorMessage,
  continuationIsAllowed,
} from './continuation.js';
import {isFrontierProbeEvent} from './probe-spec.js';

const FLAG_ID = 'id';
const FLAG_THEORY = 'theory';
const FLAG_FRONTIER = 'frontier';
const FLAG_EVIDENCE = 'evidence';
const FLAG_CARD = 'card';
const DEFAULT_LEDGER = path.join('solve', 'theory-ledger.md');
const MODEL_REF_PREFIXES = Object.freeze(['model:', 'statechart:', 'contract:', 'tla:']);
const SELECTABLE_THEORY_STATUSES = Object.freeze([
  THEORY_RESULT_ACTIVE,
  THEORY_RESULT_SUPPORTED,
]);
const BLOCKED_THEORY_STATUSES = Object.freeze([
  THEORY_RESULT_AVOIDED,
  THEORY_RESULT_FALSIFIED,
  THEORY_RESULT_NEEDS_RERUN,
  THEORY_RESULT_STALE,
  THEORY_RESULT_SUPERSEDED,
]);
const GENERATED_ID_WORD_LIMIT = 6;
const DATE_SLICE_END = 10;
const NUM_ONE = 1;
const NUM_TWO = 2;
const THEORY_OUTCOME_PARTIAL = 'partial';
const SCENARIO_OUTCOME_FAILED = 'failed';
const SCENARIO_OUTCOME_IMPROVED = 'improved';
const SCENARIO_OUTCOME_INVALID = 'invalid';
const SCENARIO_OUTCOME_DONE = 'done';

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeDiscrimination(value) {
  const text = normalizeText(value);
  return DISCRIMINATIONS.includes(text) ? text : '';
}

function repeatedFlag(args, key) {
  const value = args[key];
  if (value === undefined) return [];
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) :
    [normalizeText(value)].filter(Boolean);
}

function requireFlag(args, key) {
  const value = normalizeText(args[key]);
  if (!value) throw new Error(`theory: --${key} is required`);
  return value;
}

function slugify(value) {
  const slug = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .split('-')
    .filter(Boolean)
    .slice(0, GENERATED_ID_WORD_LIMIT)
    .join('-');
  return slug || 'quest-theory';
}

function todayStamp() {
  return new Date().toISOString().slice(0, DATE_SLICE_END).replaceAll('-', '');
}

function nextTheoryId(state, seed) {
  const base = `theory-${todayStamp()}-${slugify(seed)}`;
  if (!state.theories.byId[base]) return base;
  for (let index = NUM_TWO; ; index += NUM_ONE) {
    const candidate = `${base}-${index}`;
    if (!state.theories.byId[candidate]) return candidate;
  }
}

function currentState(root, quest) {
  const log = readLog(root, quest.id);
  return {log, state: projectState(quest, log)};
}

function eventModelGuidance(root, quest) {
  return modelGuidanceForQuest(quest, readLog(root, quest.id));
}

function validateLayer(layer) {
  if (!THEORY_LAYERS.includes(layer)) {
    throw new Error(`theory: --layer must be one of ${THEORY_LAYERS.join(', ')}`);
  }
}

function validateResult(result) {
  if (!THEORY_RESULTS.includes(result)) {
    throw new Error(`theory: --result must be one of ${THEORY_RESULTS.join(', ')}`);
  }
}

function maybeCard(args) {
  const cardPath = normalizeText(args[FLAG_CARD]);
  if (!cardPath) return null;
  return buildMechanismCardFromEvidence(cardPath);
}

function requireTheoryExists(state, theoryId) {
  const theory = state.theories.byId[theoryId];
  if (!theory) throw new Error(`theory: unknown theory "${theoryId}"`);
  return theory;
}

function activeSystemTheoryExists(state) {
  return state.theories.system.some((theory) =>
    theory.archive !== true &&
    SELECTABLE_THEORY_STATUSES.includes(theory.status));
}

function noProgressAttemptCount(log, frontierId) {
  return log.filter((event) =>
    event.type === 'attempt' &&
    event.frontier === frontierId &&
    event.investigative !== true &&
    (event.metricBefore === null ||
      event.metricAfter === null ||
      event.metricAfter >= event.metricBefore)).length;
}

function diagnosticProgressAttemptCount(log, frontierId) {
  return log.filter((event) =>
    event.type === 'attempt' &&
    event.frontier === frontierId &&
    event.metricBefore !== null &&
    event.metricAfter !== null &&
    event.metricAfter >= event.metricBefore &&
    [
      BLOCKER_MOVEMENT_MOVED_OWNER,
      BLOCKER_MOVEMENT_MOVED_BOUNDARY,
      BLOCKER_MOVEMENT_NARROWED,
    ].includes(event.blockerMovement)).length;
}

function modelRefPath(modelRef) {
  for (const prefix of MODEL_REF_PREFIXES) {
    if (modelRef.startsWith(prefix)) return modelRef.slice(prefix.length);
  }
  return '';
}

function validateModelRef(modelRef) {
  const ref = normalizeText(modelRef);
  if (!ref) return null;
  const filePath = modelRefPath(ref);
  if (!filePath) {
    return `modelRef must start with ${MODEL_REF_PREFIXES.join(', ')}`;
  }
  if (!fs.existsSync(filePath)) {
    return `modelRef target does not exist: ${filePath}`;
  }
  return null;
}

function selectedTheory(state, frontierId, explicitTheoryRef) {
  const theoryId = normalizeText(explicitTheoryRef) ||
    state.theories.selectedByFrontier[frontierId] ||
    '';
  return theoryId ? state.theories.byId[theoryId] || null : null;
}

export function resolveAttemptTheoryRef(state, frontierId, explicitTheoryRef) {
  const theory = selectedTheory(state, frontierId, explicitTheoryRef);
  return theory ? theory.id : null;
}

export function stepTheoryGateProblems({
  log,
  state,
  frontierId,
  rungIndex,
  theoryRef,
  modelRef,
  modelNotApplicable,
  scopeTerminal = false,
  phase = 'commit',
}) {
  const problems = [];
  const explicitTheory = normalizeText(theoryRef);
  const selected = selectedTheory(state, frontierId, explicitTheory);
  if (explicitTheory && !selected) {
    problems.push(`unknown selected theory: ${explicitTheory}`);
  }
  if (selected && (
    selected.archive ||
    selected.scope !== THEORY_SCOPE_FRONTIER ||
    selected.frontier !== frontierId
  )) {
    problems.push(`theory ${selected.id} is not selectable for ${frontierId}`);
  }
  if (selected && BLOCKED_THEORY_STATUSES.includes(selected.status)) {
    problems.push(
      `selected theory ${selected.id} is ${selected.status}; ` +
      'select a fresh frontier theory',
    );
  }
  if (rungIndex >= RUNG_INDEX_WIDEN_SCOPE && !selected) {
    problems.push(`frontier theory required at rung ${rungIndex}`);
  }

  const stale = selected ? selectedTheoryStaleness(log, state, frontierId) : null;
  if (selected && stale?.stale && rungIndex >= RUNG_INDEX_WIDEN_SCOPE) {
    problems.push(
      `selected theory ${selected.id} is stale: ${stale.reason}; ` +
      'record or select a fresh frontier theory',
    );
  }

  // Escalation rule 1 & 3:
  const evidenceEvents = log.filter((e) =>
    e.type === 'evidence-ingested' && isFrontierProbeEvent(e));
  const lastEv = evidenceEvents[evidenceEvents.length - 1];
  const prevEv = evidenceEvents[evidenceEvents.length - 2];
  const sameDominantReasonRepeat = evidenceEvents.length >= 2 &&
    Boolean(lastEv.dominantReason) &&
    lastEv.dominantReason === prevEv.dominantReason;
  const sameOwnerBoundaryRepeat = evidenceEvents.length >= 2 &&
    Boolean(lastEv.owner) &&
    lastEv.owner === prevEv.owner &&
    lastEv.boundary === prevEv.boundary;

  const latestEvidence = [...log].reverse().find((e) =>
    e.type === 'evidence-ingested' && isFrontierProbeEvent(e));
  const namesLiveness = latestEvidence &&
    (latestEvidence.owner || latestEvidence.boundary || latestEvidence.waitMode);
  const selectedIsObservationGap = selected &&
    (selected.mechanism === 'observation_gap' || selected.layer === 'observation');
  const localTheoryTooNarrow = namesLiveness && selectedIsObservationGap;

  // rr-D: coupled-invariant oscillation (two disjoint invariant families bouncing green
  // <-> red because one is defined in terms of the other) cannot be settled by another
  // single-frontier patch. Force a whole-system theory so the next move reconciles both
  // families at once (and the model rung, reached on escalation, supplies the
  // discriminator). Keys off recorded regression violations only.
  const coupledOscillation = CONVERGENCE_GUARDS.coupledOscillation &&
    detectCoupledOscillation(log, frontierId).coupled;

  const systemTheoryRequired =
    rungIndex === RUNG_INDEX_MODEL ||
    noProgressAttemptCount(log, frontierId) >= SYSTEM_THEORY_STALL_THRESHOLD ||
    sameDominantReasonRepeat ||
    sameOwnerBoundaryRepeat ||
    localTheoryTooNarrow ||
    coupledOscillation;

  if (systemTheoryRequired && !activeSystemTheoryExists(state)) {
    problems.push(coupledOscillation ?
      'coupled-invariant oscillation: record a system theory that reconciles the ' +
        'coupled invariant families before the next attempt' :
      'system theory required after repeated same-frontier stalls');
  }

  // rr-C: a measured regression leaves a previously-green invariant red. Before starting
  // another attempt, the Solver must restore it or record a finding explaining why it was
  // abandoned — otherwise the loop is free to keep trading one invariant family for
  // another forever. Gated at the 'begin' phase so it directs the NEXT move rather than
  // retroactively invalidating the attempt that exposed the regression.
  if (CONVERGENCE_GUARDS.regressionRestoreGate && phase === 'begin') {
    const restore = regressionRestoreStatus(log, frontierId);
    if (restore.pending) {
      problems.push(
        `restore previously-green invariant(s) ${restore.redLabels.join(', ')} ` +
        'or record a finding explaining why they were abandoned',
      );
    }
  }

  // rr-F: coupled-invariant reconcile. The rr-D gate above is discharged as soon as a
  // system theory *exists*, after which the Solver could patch a single owner again and let
  // the partner family re-break. rr-F closes that hole: at the 'begin' phase it pins the
  // next move to an atomic cross-owner reconcile — leave every coupled family green in one
  // measured run — or an explicit finding that accepts the coupling. It persists across the
  // whole coupling episode (the detector reads all history), so local-fix credit cannot
  // discharge it. Pairs with loop.js's coupledLocalFixBlocked, which denies the credit.
  if (CONVERGENCE_GUARDS.couplingReconcile && phase === 'begin') {
    const reconcile = couplingReconcileStatus(log, frontierId);
    if (reconcile.pending) {
      problems.push(
        'coupled-invariant oscillation unreconciled: reconcile coupled invariant ' +
        `families ${reconcile.redCoupledLabels.join(', ')} in a single atomic ` +
        'cross-owner move (leave them green together in one measured run) or record a ' +
        'finding explaining the accepted coupling — a single-owner local fix does not ' +
        'discharge this',
      );
    }
  }

  // rr-E: scope pressure has crossed the terminal file bound. The blast radius is large
  // enough that the next move must shrink scope (split/land commits) before more edits.
  // The caller computes the bound (it needs change-artifact inspection); gated at 'begin'.
  if (CONVERGENCE_GUARDS.scopeTerminal && phase === 'begin' && scopeTerminal) {
    problems.push(
      'scope pressure terminal: changed-file count exceeds the limit; reduce scope ' +
      '(land or split the current changes) before the next attempt',
    );
  }

  if (diagnosticProgressAttemptCount(log, frontierId) >= NUM_TWO &&
    rungIndex >= RUNG_INDEX_WIDEN_SCOPE) {
    const latestAttempt = [...log].reverse().find((event) =>
      event.type === 'attempt' && event.frontier === frontierId);
    const latestAttemptIndex = log.indexOf(latestAttempt);
    const hasFreshTheorySelection = latestAttemptIndex >= 0 &&
      log.slice(latestAttemptIndex + 1).some((event) =>
        event.type === 'theory-selected' && event.frontier === frontierId);
    if (!hasFreshTheorySelection) {
      problems.push(
        'fresh theory selection required after repeated diagnostic movement ' +
        'without metric movement',
      );
    }
  }

  // Escalation rule 2: If metric is 0 and done=false, require a theory result before more edits
  const latestMetricEvent = [...log].reverse().find((e) =>
    (e.type === 'attempt' && typeof e.metricAfter === 'number') ||
    (e.type === 'evidence-ingested' && isFrontierProbeEvent(e) &&
      typeof e.metric === 'number'),
  );
  if (latestMetricEvent) {
    const metricVal = latestMetricEvent.type === 'attempt' ? latestMetricEvent.metricAfter : latestMetricEvent.metric;
    const isDone = latestMetricEvent.done;
    if (metricVal === 0 && !isDone) {
      const latestMetricEventIndex = log.indexOf(latestMetricEvent);
      const hasTheoryResultAfter = log.slice(latestMetricEventIndex + 1).some((e) => e.type === 'theory-result');
      if (!hasTheoryResultAfter) {
        problems.push('theory result required when metric is 0 but done is false');
      }
    }
  }

  // Escalation rule 4: If selected theory is older than latest evidence, require theory result update
  if (selected && latestEvidence) {
    const selectedEvent = log.find((e) =>
      (e.type === 'theory-system-declared' || e.type === 'theory-option-declared') &&
      e.theory === selected.id,
    );
    const selectedTs = selectedEvent ?
      new Date(selectedEvent.ts).getTime() : new Date(selected.ts).getTime();
    const latestEvidenceTs = new Date(latestEvidence.ts).getTime();
    if (selectedTs < latestEvidenceTs) {
      const latestEvidenceIndex = log.indexOf(latestEvidence);
      const hasResultAfter = log.slice(latestEvidenceIndex + 1).some((e) => e.type === 'theory-result' && e.theory === selected.id);
      if (!hasResultAfter) {
        problems.push(`theory result update required for theory ${selected.id} because it is older than latest evidence`);
      }
    }
  }

  const LIFECYCLE_KEYWORDS = [
    'dispatched_waiting_progress',
    'retry_scheduled',
    'wait_for_operation_progress',
    'visibility',
    'publication',
    'handoff',
    'completion',
  ];
  const hasLifecycleLanguage = (e) => {
    const fields = [
      e.summary,
      e.dominantReason,
      e.verdictReason,
      e.mechanism,
      e.owner,
      e.boundary,
      e.waitMode,
      e.nextAction,
    ].map(String).join(' ').toLowerCase();
    return LIFECYCLE_KEYWORDS.some((kw) => fields.includes(kw));
  };
  const lifecycleEvents = log.filter((e) =>
    e.type === 'evidence-ingested' && isFrontierProbeEvent(e) &&
    hasLifecycleLanguage(e));
  const hasRepeatedLifecycleEvidence = lifecycleEvents.length >= 2;

  const modelProblem = validateModelRef(normalizeText(modelRef));
  if (modelProblem) problems.push(modelProblem);
  const needsModel =
    phase === 'commit' && rungIndex === RUNG_INDEX_MODEL &&
    !normalizeText(modelRef) &&
    !normalizeText(modelNotApplicable);
  if (needsModel) {
    problems.push('model evidence or modelNotApplicable is required at model rung');
  } else if (phase === 'commit' && hasRepeatedLifecycleEvidence && !normalizeText(modelRef)) {
    problems.push('model reference is required when repeated evidence has lifecycle language');
  }
  return problems;
}

export function theoryResultForAttempt(progressed, violations) {
  if (violations.length > 0) return THEORY_RESULT_NEEDS_RERUN;
  return progressed ? THEORY_RESULT_SUPPORTED : THEORY_RESULT_FALSIFIED;
}

export function appendTheoryResultForAttempt(root, quest, event, progressed, violations) {
  if (!event.theoryRef) return null;
  const invalid = event.invalidSample === true ||
    event.metricAfter === null ||
    violations.length > 0;
  const discrimination = !invalid ? (event.discrimination || null) : null;
  const scenarioOutcome = event.done === true ?
    SCENARIO_OUTCOME_DONE :
    invalid ? SCENARIO_OUTCOME_INVALID :
      progressed ? SCENARIO_OUTCOME_IMPROVED :
        SCENARIO_OUTCOME_FAILED;
  const movement = event.blockerMovement || null;
  // Falsification requires evidence that engaged the theory's boundary: a failed
  // scenario run whose blocker attribution is vacuous (verdict present, but
  // owner/boundary/reason all unknown) says only that SOMETHING still fails, not
  // that it fails at the theorized seam — record 'avoided' so the theory stays
  // honestly untested instead of falsely refuted. Verdict-less pure-metric
  // evidence keeps falsifying: there, flatness is the declared negative result.
  const unattributed = blockerUnattributedScenarioFailure(event.blockerAfter);
  const theoryOutcome =
    invalid ? THEORY_RESULT_NEEDS_RERUN :
      discrimination === DISCRIMINATION_CONFIRMED ? THEORY_RESULT_SUPPORTED :
        discrimination === DISCRIMINATION_REFUTED ? THEORY_RESULT_FALSIFIED :
          progressed ? THEORY_RESULT_SUPPORTED :
            [
              BLOCKER_MOVEMENT_MOVED_OWNER,
              BLOCKER_MOVEMENT_MOVED_BOUNDARY,
              BLOCKER_MOVEMENT_NARROWED,
            ].includes(movement) ?
              THEORY_OUTCOME_PARTIAL :
              unattributed ? THEORY_RESULT_AVOIDED : THEORY_RESULT_FALSIFIED;
  const result = theoryOutcome === THEORY_OUTCOME_PARTIAL ?
    THEORY_RESULT_SUPPORTED :
    theoryOutcome;
  return appendEvent(root, quest.id, {
    type: EVENT_THEORY_RESULT,
    theory: event.theoryRef,
    frontier: event.frontier,
    result,
    scenarioOutcome,
    theoryOutcome,
    discrimination,
    blockerMovement: movement,
    diagnosticMovement: event.diagnosticMovement || null,
    evidence: event.evidence || null,
    validation: event.modelRef || null,
  });
}

function cmdSystem(root, args) {
  const quest = loadQuest(root, requireFlag(args, FLAG_ID));
  const {state} = currentState(root, quest);
  const seed = normalizeText(args.mechanism) || normalizeText(args.problem) ||
    quest.id;
  const theory = normalizeText(args[FLAG_THEORY]) || nextTheoryId(state, seed);
  const stamped = appendEvent(root, quest.id, {
    type: EVENT_THEORY_SYSTEM_DECLARED,
    theory,
    scope: THEORY_SCOPE_SYSTEM,
    status: THEORY_RESULT_ACTIVE,
    problem: requireFlag(args, 'problem'),
    evidence: requireFlag(args, FLAG_EVIDENCE),
    successCondition: requireFlag(args, 'success'),
    stableFacts: repeatedFlag(args, 'stable-fact'),
    changedFacts: repeatedFlag(args, 'changed-fact'),
    mechanism: requireFlag(args, 'mechanism'),
    decidingOwner: requireFlag(args, 'owner'),
    missingTransitionOrObservation: requireFlag(args, 'missing-edge'),
    discriminator: requireFlag(args, 'discriminator'),
    modelGuidance: eventModelGuidance(root, quest),
    card: maybeCard(args),
  });
  return `recorded system theory ${stamped.theory}`;
}

// --from-rejection pre-fill. After a verifier rejection the defect is already
// stated in the finding, so re-authoring the full option form from blank is
// pure re-typing (25 theory-ceremony events on one quest in the 2026-07-25..27
// window). Pre-filled values are DEFAULTS only — every explicitly passed flag
// wins, `--layer` stays operator-authored (that judgment is what the theory
// gate exists to force), and passing the flag is itself the operator's
// confirmation that this option answers that rejection.
const REJECTION_PREFILL_FLAG = 'from-rejection';
const VERIFIER_REJECTION_FINDING_KIND = 'verifier-rejection';
const REJECTION_CLAIM_EXCERPT = 140;

function latestVerifierRejection(log, ref) {
  const rejections = log.filter((event) =>
    event.type === EVENT_FINDING &&
    event.kind === VERIFIER_REJECTION_FINDING_KIND);
  const wantsLatest = ref === true || normalizeText(ref) === '' ||
    normalizeText(ref) === 'latest';
  if (wantsLatest) return rejections[rejections.length - 1] || null;
  const needle = normalizeText(ref);
  return [...rejections].reverse().find((event) =>
    String(event.ts) === needle || String(event.evidence) === needle ||
    String(event.claim || '').includes(needle)) || null;
}

function rejectionPrefill(finding) {
  const claim = normalizeText(finding.claim) ||
    'the recorded verifier rejection';
  const excerpt = claim.length > REJECTION_CLAIM_EXCERPT ?
    `${claim.slice(0, REJECTION_CLAIM_EXCERPT)}…` : claim;
  return {
    'mechanism': `verifier rejection: ${excerpt}`,
    'intervention':
      `correct the candidate so the rejecting check passes: ${excerpt}`,
    'expected-movement':
      'the corrected candidate is re-verified and approved on the same frontier',
    'negative-result':
      'the rejection cause was misdiagnosed; re-read the finding before ' +
      'another attempt',
    'discriminator':
      'the check named in the rejection passes on the corrected candidate',
    'promotion':
      'an independent verifier approves the corrected candidate fingerprint',
    'rejection': 'the same finding fires again on the corrected candidate',
  };
}

function applyRejectionPrefill(args, log) {
  if (args[REJECTION_PREFILL_FLAG] === undefined) return;
  const finding = latestVerifierRejection(log, args[REJECTION_PREFILL_FLAG]);
  if (!finding) {
    throw new Error(
      'theory: --from-rejection matched no verifier-rejection finding');
  }
  for (const [key, value] of Object.entries(rejectionPrefill(finding))) {
    if (args[key] === undefined) args[key] = value;
  }
}

function cmdOption(root, args) {
  const quest = loadQuest(root, requireFlag(args, FLAG_ID));
  const {log, state} = currentState(root, quest);
  const frontier = requireFlag(args, FLAG_FRONTIER);
  if (!quest.frontiers.some((item) => item.id === frontier)) {
    throw new Error(`theory: unknown frontier "${frontier}"`);
  }
  applyRejectionPrefill(args, log);
  const layer = requireFlag(args, 'layer');
  validateLayer(layer);
  const seed = normalizeText(args.mechanism) || normalizeText(args.intervention) ||
    frontier;
  const theory = normalizeText(args[FLAG_THEORY]) || nextTheoryId(state, seed);
  const stamped = appendEvent(root, quest.id, {
    type: EVENT_THEORY_OPTION_DECLARED,
    theory,
    scope: THEORY_SCOPE_FRONTIER,
    frontier,
    status: THEORY_RESULT_ACTIVE,
    layer,
    mechanism: requireFlag(args, 'mechanism'),
    owner: normalizeText(args.owner) || null,
    boundary: normalizeText(args.boundary) || null,
    callerRole: normalizeText(args['caller-role']) || null,
    missingTransition: normalizeText(args['missing-transition']) || null,
    ownedFixPath: normalizeText(args['owned-fix-path']) || null,
    tailConsumers: repeatedFlag(args, 'tail-consumer'),
    intervention: requireFlag(args, 'intervention'),
    expectedMovement: requireFlag(args, 'expected-movement'),
    negativeResultMeans: requireFlag(args, 'negative-result'),
    discriminator: requireFlag(args, 'discriminator'),
    modelGuidance: eventModelGuidance(root, quest),
    promotionRule: requireFlag(args, 'promotion'),
    rejectionRule: requireFlag(args, 'rejection'),
    evidence: normalizeText(args[FLAG_EVIDENCE]) || null,
    card: maybeCard(args),
  });
  return `recorded frontier theory ${stamped.theory} for ${frontier}`;
}

function cmdSelect(root, args) {
  const quest = loadQuest(root, requireFlag(args, FLAG_ID));
  const {state} = currentState(root, quest);
  const frontier = requireFlag(args, FLAG_FRONTIER);
  const theoryId = requireFlag(args, FLAG_THEORY);
  const theory = requireTheoryExists(state, theoryId);
  if (theory.archive || theory.scope !== THEORY_SCOPE_FRONTIER ||
    theory.frontier !== frontier) {
    throw new Error(`theory: ${theoryId} is not selectable for ${frontier}`);
  }
  if (!SELECTABLE_THEORY_STATUSES.includes(theory.status)) {
    throw new Error(`theory: ${theoryId} has non-selectable status ${theory.status}`);
  }
  const health = analyzeQuestHealth(root, quest, {state});
  const hardBlocks = [
    CONTINUATION_BLOCKED_METRIC_PROJECTION,
    CONTINUATION_BLOCKED_REGRESSION,
  ];
  if (!continuationIsAllowed(health.continuation) &&
    hardBlocks.includes(health.continuation.status)) {
    throw new Error(`theory select blocked: ${
      continuationErrorMessage(health.continuation)}`);
  }
  appendEvent(root, quest.id, {
    type: EVENT_THEORY_SELECTED,
    frontier,
    theory: theoryId,
    evidence: normalizeText(args[FLAG_EVIDENCE]) || null,
  });
  return `selected ${theoryId} for ${frontier}`;
}

function cmdRecord(root, args) {
  const quest = loadQuest(root, requireFlag(args, FLAG_ID));
  const {state} = currentState(root, quest);
  const theoryId = requireFlag(args, FLAG_THEORY);
  requireTheoryExists(state, theoryId);
  const result = requireFlag(args, 'result');
  validateResult(result);
  appendEvent(root, quest.id, {
    type: EVENT_THEORY_RESULT,
    theory: theoryId,
    frontier: normalizeText(args[FLAG_FRONTIER]) || null,
    result,
    scenarioOutcome: normalizeText(args['scenario-outcome']) || null,
    theoryOutcome: normalizeText(args['theory-outcome']) || null,
    blockerMovement: normalizeText(args['blocker-movement']) || null,
    diagnosticMovement: normalizeText(args['diagnostic-movement']) || null,
    evidence: requireFlag(args, FLAG_EVIDENCE),
    validation: normalizeText(args.validation) || null,
  });
  return `recorded ${result} for ${theoryId}`;
}

function cmdSupersede(root, args) {
  const quest = loadQuest(root, requireFlag(args, FLAG_ID));
  const {state} = currentState(root, quest);
  const theoryId = requireFlag(args, FLAG_THEORY);
  requireTheoryExists(state, theoryId);
  appendEvent(root, quest.id, {
    type: EVENT_THEORY_SUPERSEDED,
    theory: theoryId,
    by: requireFlag(args, 'by'),
    evidence: requireFlag(args, FLAG_EVIDENCE),
  });
  return `superseded ${theoryId}`;
}

function renderList(state) {
  const lines = ['# Quest Theories', ''];
  for (const theory of [...state.theories.system, ...state.theories.frontier]) {
    const frontier = theory.frontier ? ` frontier=${theory.frontier}` : '';
    const layer = theory.layer ? ` layer=${theory.layer}` : '';
    const archive = theory.archive ? ' archive=true' : '';
    const modelGate = theory.modelGuidance ?
      ` modelGate="${theory.modelGuidance.command}"` :
      '';
    lines.push(
      `- ${theory.id}: scope=${theory.scope}${frontier}${layer} ` +
      `status=${theory.status} mechanism=${theory.mechanism || 'unknown'}` +
      `${modelGate}${archive}`,
    );
  }
  lines.push('', '## Selected');
  const selected = Object.entries(state.theories.selectedByFrontier);
  if (selected.length === 0) {
    lines.push('- none');
  } else {
    for (const [frontier, theory] of selected) {
      lines.push(`- ${frontier}: ${theory}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function cmdList(root, args) {
  const quest = loadQuest(root, requireFlag(args, FLAG_ID));
  const {state} = currentState(root, quest);
  if (args.json) return JSON.stringify(state.theories, null, 2);
  return renderList(state);
}

function cmdCard(_root, args) {
  const card = buildMechanismCardFromEvidence(requireFlag(args, FLAG_EVIDENCE));
  if (args.json) return JSON.stringify(card, null, 2);
  return [
    '# Mechanism Card',
    '',
    `- failureMechanism: ${card.failureMechanism}`,
    `- stableFacts: ${card.stableFacts.join('; ')}`,
    `- changedFacts: ${card.changedFacts.join('; ')}`,
    `- rejectedAlternatives: ${card.rejectedAlternatives.join(', ')}`,
    `- missingTransitionOrObservation: ${card.missingTransitionOrObservation}`,
    `- smallestFalsifyingProbe: ${card.smallestFalsifyingProbe}`,
    `- expectedMovement: ${card.expectedMovement}`,
    `- negativeResultMeans: ${card.negativeResultMeans}`,
  ].join('\n');
}

function ledgerField(entry, field) {
  return normalizeText(entry.fields?.[field]);
}

function entryMatches(entry, owner, boundary) {
  const ownerBoundary = ledgerField(entry, THEORY_LEDGER_FIELDS.OWNER_BOUNDARY)
    .toLowerCase();
  return (!owner || ownerBoundary.includes(owner.toLowerCase())) &&
    (!boundary || ownerBoundary.includes(boundary.toLowerCase()));
}

function cmdImportLedger(root, args) {
  const quest = loadQuest(root, requireFlag(args, FLAG_ID));
  const ledgerPath = normalizeText(args.ledger) || DEFAULT_LEDGER;
  const owner = normalizeText(args.owner);
  const boundary = normalizeText(args.boundary);
  const {state} = currentState(root, quest);
  const entries = extractTheoryLedgerEntries(fs.readFileSync(ledgerPath, 'utf8'))
    .filter((entry) => entryMatches(entry, owner, boundary))
    .filter((entry) => !state.theories.byId[entry.id]);
  for (const entry of entries) {
    appendEvent(root, quest.id, {
      type: EVENT_THEORY_SYSTEM_DECLARED,
      theory: entry.id,
      scope: THEORY_SCOPE_SYSTEM,
      status: ledgerField(entry, THEORY_LEDGER_FIELDS.STATUS) || THEORY_RESULT_ACTIVE,
      problem: ledgerField(entry, THEORY_LEDGER_FIELDS.HYPOTHESIS),
      evidence: ledgerField(entry, THEORY_LEDGER_FIELDS.ARTIFACT_RESULT),
      mechanism: 'archive',
      discriminator: ledgerField(entry, THEORY_LEDGER_FIELDS.PROBE),
      expectedMovement:
        ledgerField(entry, THEORY_LEDGER_FIELDS.REPRESENTATIVE_MOVEMENT),
      archive: true,
    });
  }
  return `imported ${entries.length} archived theor${entries.length === 1 ? 'y' : 'ies'}`;
}

const COMMANDS = Object.freeze({
  'system': cmdSystem,
  'option': cmdOption,
  'select': cmdSelect,
  'record': cmdRecord,
  'supersede': cmdSupersede,
  'list': cmdList,
  'card': cmdCard,
  'import-ledger': cmdImportLedger,
});

export function runTheoryCommand(root, args) {
  const command = args._[0];
  const handler = COMMANDS[command];
  if (!handler) {
    throw new Error(
      `theory: expected one of ${Object.keys(COMMANDS).join('|')}`);
  }
  return handler(root, args);
}

export function theoryCommitArgs(args = {}) {
  return {
    theoryRef: normalizeText(args.theoryRef) || normalizeText(args[FLAG_THEORY]) ||
      undefined,
    expectedMovement: normalizeText(args.expectedMovement) || undefined,
    negativeResultMeans: normalizeText(args.negativeResultMeans) || undefined,
    modelRef: normalizeText(args.modelRef) || undefined,
    modelNotApplicable: normalizeText(args.modelNotApplicable) || undefined,
    discrimination: normalizeDiscrimination(args.discrimination) || undefined,
  };
}
