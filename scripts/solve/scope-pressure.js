import {
  EVENT_ATTEMPT,
  EVENT_FINDING,
} from './constants.js';
import {
  changedPathsFromDiffContent,
  inspectChangeArtifact,
  requiresSourceVerification,
} from './change-artifact.js';
import {isRegenerableQuestReport} from './report-retention.js';
import {
  projectAttemptBaseCorrections,
} from './attempt-base-correction-projection.js';
import {
  attemptBaseCorrectionProofProblem,
} from './verification.js';

const BROAD_OWNER_AREA_LIMIT = 2;
const LARGE_DIFF_FILE_LIMIT = 10;
const SPLIT_GROUP_FILE_LIMIT = 20;
const GIT_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const GENERATED_PROJECTION_PATHS = new Set([
  'docs/steering/llm/architecture.md',
  'docs/steering/llm/governance.md',
  'docs/steering/llm/manifest.json',
  'docs/steering/llm/rules-index.md',
  'docs/steering/llm/rules.json',
  'docs/steering/llm/solve-commands.md',
  'docs/steering/llm/style.md',
  'docs/steering/llm/testing.md',
  'docs/steering/llm/tools-index.md',
  'solve/FRONTIER.generated.md',
  'solve/OVERVIEW.generated.md',
]);
const SOLVE_PROOF_TAIL_SEGMENTS = new Set([
  'artifacts',
  'changes',
  'log',
  'oracle',
  'quests',
  'state',
]);
const SOLVE_QUEST_REPORT_PATTERN = /^solve\/report\/[^/]+\.md$/u;
// A sealed path-only registry keeps generic test folders from inventing
// runtime owners. The regression suite checks this list against src/* dirs so
// a new runtime boundary cannot silently lose its proof-tail pairing.
const RUNTIME_DOMAIN_SEGMENTS = new Set([
  'address',
  'admin',
  'boot',
  'bootstrap',
  'cache',
  'cdc',
  'cli',
  'config',
  'constants',
  'control-plane',
  'debug',
  'debug-runtime',
  'diagnostics',
  'function',
  'hlc',
  'index-management',
  'invariants',
  'live-query',
  'logging',
  'message-group',
  'migration',
  'node',
  'partition',
  'policy',
  'query',
  'raft',
  'random',
  'rebalancer',
  'runtime',
  'sea',
  'service',
  'storage',
  'test-helpers',
  'threading',
  'time',
  'topology',
  'transaction',
  'transport',
  'utils',
  'wasm-service',
  'worker',
  'workflow',
]);
const SEMANTIC_ROLE_IMPLEMENTATION = 'implementation';
const SEMANTIC_ROLE_PROOF_TAIL = 'proof-tail';
const SEMANTIC_OWNER_WORKFLOW_SOLVER = 'workflow/solver';
const SEMANTIC_OWNER_WORKFLOW_STEERING = 'workflow/steering';
const PATH_SEGMENT_ARCHITECTURE = 'architecture';
const PATH_SEGMENT_DISTRIBUTED = 'distributed';
const PATH_SEGMENT_DOCS = 'docs';
const PATH_SEGMENT_SCRIPTS = 'scripts';
const PATH_SEGMENT_SOLVE = 'solve';
const PATH_SEGMENT_SRC = 'src';
const PATH_SEGMENT_STEERING = 'steering';
const PATH_SEGMENT_TEST = 'test';
const LIST_SEPARATOR = ', ';
const EMPTY_LIST_LABEL = 'none';
const SEMANTIC_PLAN_HEADER =
  '- Semantic plan (proof tails stay with their owner):';
const SEMANTIC_PLAN_REQUIRED_NOTE =
  '- Proof-tail grouping is guidance only; every path remains required and guard-counted.';
const CONSERVATIVE_PLAN_HEADER =
  '- Conservative guard plan (physical owner areas):';

function ownerAreaForPath(filePath) {
  const segments = String(filePath || '').split('/');
  if (segments[0] === 'src' && segments[1]) return `src/${segments[1]}`;
  if (segments[0] === 'test' && segments[1]) {
    if (segments[1] === 'distributed' && segments[2]) {
      return `test/distributed/${segments[2]}`;
    }
    return `test/${segments[1]}`;
  }
  if (segments[0] === 'scripts' && segments[1]) return `scripts/${segments[1]}`;
  if (segments[0] === 'docs') return 'docs';
  if (segments[0] === 'architecture') return 'architecture';
  if (segments[0] === 'solve') return 'solve';
  return segments[0] || 'unknown';
}

// Operator guidance pairs proofs with the implementation boundary they
// validate. This is deliberately path-only and additive: the conservative
// ownerAreaForPath projection remains the admission authority.
export function semanticScopeForPath(filePath) {
  const normalizedPath = String(filePath || '');
  const segments = normalizedPath.split('/');
  if (segments[0] === PATH_SEGMENT_SRC &&
    RUNTIME_DOMAIN_SEGMENTS.has(segments[1])) {
    return {
      semanticOwner: `runtime/${segments[1]}`,
      role: SEMANTIC_ROLE_IMPLEMENTATION,
    };
  }
  if (segments[0] === PATH_SEGMENT_TEST &&
    segments[1] === PATH_SEGMENT_SOLVE) {
    return {
      semanticOwner: SEMANTIC_OWNER_WORKFLOW_SOLVER,
      role: SEMANTIC_ROLE_PROOF_TAIL,
    };
  }
  if (segments[0] === PATH_SEGMENT_TEST &&
    segments[1] === PATH_SEGMENT_DISTRIBUTED && segments[2]) {
    return {
      semanticOwner: `runtime/${segments[2]}`,
      role: SEMANTIC_ROLE_PROOF_TAIL,
    };
  }
  if (segments[0] === PATH_SEGMENT_TEST &&
    RUNTIME_DOMAIN_SEGMENTS.has(segments[1])) {
    return {
      semanticOwner: `runtime/${segments[1]}`,
      role: SEMANTIC_ROLE_PROOF_TAIL,
    };
  }
  if (segments[0] === PATH_SEGMENT_SCRIPTS &&
    segments[1] === PATH_SEGMENT_SOLVE) {
    return {
      semanticOwner: SEMANTIC_OWNER_WORKFLOW_SOLVER,
      role: SEMANTIC_ROLE_IMPLEMENTATION,
    };
  }
  if (segments[0] === PATH_SEGMENT_DOCS &&
    segments[1] === PATH_SEGMENT_STEERING) {
    return {
      semanticOwner: SEMANTIC_OWNER_WORKFLOW_STEERING,
      role: SEMANTIC_ROLE_PROOF_TAIL,
    };
  }
  if (segments[0] === PATH_SEGMENT_ARCHITECTURE) {
    return {
      semanticOwner: SEMANTIC_OWNER_WORKFLOW_STEERING,
      role: SEMANTIC_ROLE_PROOF_TAIL,
    };
  }
  if (segments[0] === PATH_SEGMENT_SOLVE &&
    (SOLVE_PROOF_TAIL_SEGMENTS.has(segments[1]) ||
      GENERATED_PROJECTION_PATHS.has(normalizedPath) ||
      SOLVE_QUEST_REPORT_PATTERN.test(normalizedPath))) {
    return {
      semanticOwner: SEMANTIC_OWNER_WORKFLOW_SOLVER,
      role: SEMANTIC_ROLE_PROOF_TAIL,
    };
  }
  return {
    semanticOwner: ownerAreaForPath(normalizedPath),
    role: SEMANTIC_ROLE_IMPLEMENTATION,
  };
}

const SCOPE_BASELINE_RESOLUTIONS = Object.freeze([
  'baselined',
  'landed',
  'split',
  'accepted',
]);

function scopePressureClassification(event) {
  return event?.scopePressureClassification ||
    event?.classification?.scopePressure ||
    event?.scopePressure ||
    null;
}

function latestScopeBaselineIndex(log) {
  for (let index = log.length - 1; index >= 0; index -= 1) {
    const event = log[index];
    if (event.type !== EVENT_FINDING) continue;
    const classification = scopePressureClassification(event);
    const resolution = String(
      classification?.resolution ||
      classification?.action ||
      classification?.status ||
      '',
    );
    if (SCOPE_BASELINE_RESOLUTIONS.includes(resolution)) return index;
  }
  return -1;
}

function attemptInspections(root, quest, log, options = {}) {
  const baselineIndex = options.ignoreBaselines ? -1 : latestScopeBaselineIndex(log);
  const attempts = log
    .map((event, index) => ({event, index}))
    .filter(({event, index}) =>
      event.type === EVENT_ATTEMPT &&
      event.changeRef &&
      index > baselineIndex)
    .map(({event, index}) => {
      const inspection = inspectChangeArtifact(root, quest, event.changeRef);
      return {
        index,
        event,
        inspection,
        sourcePaths:
          inspection.changedPaths.filter(requiresSourceVerification),
        fingerprint:
          typeof event.changeRefIdentity?.sha256 === 'string' ?
            `sha256:${event.changeRefIdentity.sha256}` :
            null,
        candidateContract: event.verificationContractVersion === 2,
      };
    });
  return projectAttemptBaseCorrections(attempts, log, {
    validateProof: (correction, attempt) =>
      attemptBaseCorrectionProofProblem(
        root,
        quest,
        correction,
        attempt,
      ),
  }).attempts;
}

function effectiveChangeBytes(inspections) {
  const coveredPathsByBase = new Map();
  let bytes = 0;
  let largestSnapshotBytes = 0;
  for (let index = inspections.length - 1; index >= 0; index -= 1) {
    const entry = inspections[index];
    const baseCommit = entry.event?.workspaceBaseCommit;
    const paths = entry.inspection.changedPaths || [];
    const payloadBytes = entry.inspection.payloadBytes || 0;
    largestSnapshotBytes = Math.max(largestSnapshotBytes, payloadBytes);
    if (!GIT_COMMIT_PATTERN.test(String(baseCommit || '')) ||
        paths.length === 0) {
      bytes += payloadBytes;
      continue;
    }
    const covered = coveredPathsByBase.get(baseCommit) || new Set();
    if (!paths.every((filePath) => covered.has(filePath))) {
      bytes += payloadBytes;
    }
    for (const filePath of paths) covered.add(filePath);
    coveredPathsByBase.set(baseCommit, covered);
  }
  return Math.max(bytes, largestSnapshotBytes);
}

function isGeneratedProjection(root, filePath) {
  return GENERATED_PROJECTION_PATHS.has(filePath) ||
    isRegenerableQuestReport(root, filePath);
}

function authoredPayloadBytes(root, inspection) {
  const content = String(inspection.content || '');
  if (!content.startsWith('diff --git ')) return inspection.payloadBytes || 0;
  return content.split(/(?=^diff --git )/mu).reduce((total, section) => {
    const paths = changedPathsFromDiffContent(section);
    return paths.length > 0 && paths.every((filePath) =>
      isGeneratedProjection(root, filePath)) ? total :
      total + Buffer.byteLength(section);
  }, 0);
}

function admissionInspection(root, entry) {
  return {
    ...entry,
    inspection: {
      ...entry.inspection,
      changedPaths: (entry.inspection.changedPaths || [])
        .filter((filePath) => !isGeneratedProjection(root, filePath)),
      payloadBytes: authoredPayloadBytes(root, entry.inspection),
    },
  };
}

function summarizeAttempts(inspections) {
  return inspections.map((entry) => {
    const paths = entry.inspection.changedPaths || [];
    const ownerAreas = [...new Set(paths.map(ownerAreaForPath))].sort();
    return {
      ts: entry.event.ts || null,
      frontier: entry.event.frontier || null,
      changeRef: entry.event.changeRef || null,
      fileCount: paths.length,
      ownerAreas,
      categories: entry.inspection.categories || [],
      changedPaths: paths,
      changeBytes: entry.inspection.payloadBytes || 0,
    };
  });
}

function splitPlanFor(changedPaths) {
  const groups = new Map();
  for (const filePath of changedPaths) {
    const ownerArea = ownerAreaForPath(filePath);
    if (!groups.has(ownerArea)) groups.set(ownerArea, []);
    groups.get(ownerArea).push(filePath);
  }
  return [...groups.entries()].map(([ownerArea, paths]) => ({
    ownerArea,
    fileCount: paths.length,
    changedPaths: paths.sort(),
    recommended: paths.length <= SPLIT_GROUP_FILE_LIMIT,
  })).sort((a, b) => b.fileCount - a.fileCount ||
    a.ownerArea.localeCompare(b.ownerArea));
}

function semanticScopeFor(changedPaths) {
  const pathRoles = changedPaths.map((filePath) => ({
    path: filePath,
    ...semanticScopeForPath(filePath),
  })).sort((left, right) => left.path.localeCompare(right.path));
  const groups = new Map();
  for (const entry of pathRoles) {
    const group = groups.get(entry.semanticOwner) || {
      semanticOwner: entry.semanticOwner,
      fileCount: 0,
      implementationCount: 0,
      proofTailCount: 0,
      changedPaths: [],
    };
    group.fileCount += 1;
    if (entry.role === SEMANTIC_ROLE_PROOF_TAIL) group.proofTailCount += 1;
    else group.implementationCount += 1;
    group.changedPaths.push(entry.path);
    groups.set(entry.semanticOwner, group);
  }
  const semanticSplitPlan = [...groups.values()]
    .map((group) => ({
      ...group,
      changedPaths: group.changedPaths.sort(),
    }))
    .sort((left, right) => right.fileCount - left.fileCount ||
      left.semanticOwner.localeCompare(right.semanticOwner));
  return {
    semanticOwnerAreas: [...groups.keys()].sort(),
    implementationPaths: pathRoles
      .filter((entry) => entry.role === SEMANTIC_ROLE_IMPLEMENTATION)
      .map((entry) => entry.path),
    proofTailPaths: pathRoles
      .filter((entry) => entry.role === SEMANTIC_ROLE_PROOF_TAIL)
      .map((entry) => entry.path),
    pathRoles,
    semanticSplitPlan,
  };
}

function recommendedActions(changedPaths, ownerAreas, categories) {
  const actions = [];
  if (changedPaths.length > LARGE_DIFF_FILE_LIMIT) {
    actions.push(
      `split by owner area before the next attempt (${changedPaths.length} files)`,
    );
  }
  if (ownerAreas.length > BROAD_OWNER_AREA_LIMIT) {
    actions.push(
      `land or separate ${ownerAreas.length} owner areas: ${ownerAreas.join(', ')}`,
    );
  }
  if (categories.includes('runtime') && categories.includes('workflow')) {
    actions.push('separate runtime changes from quest workflow changes');
  }
  return actions;
}

function summarizeScopePressure(root, inspections) {
  const changedPaths = [...new Set(inspections.flatMap((entry) =>
    entry.inspection.changedPaths || []))].sort();
  const ownerAreas = [...new Set(changedPaths.map(ownerAreaForPath))].sort();
  const semanticScope = semanticScopeFor(changedPaths);
  const categories = [...new Set(inspections.flatMap((entry) =>
    entry.inspection.categories || []))].sort();
  const signals = [];
  const changedBytes = effectiveChangeBytes(inspections);
  const admissionInspections = inspections.map((entry) =>
    admissionInspection(root, entry));
  const admissionChangedPaths = [...new Set(admissionInspections.flatMap((entry) =>
    entry.inspection.changedPaths || []))].sort();
  const admissionOwnerAreas = [...new Set(
    admissionChangedPaths.map(ownerAreaForPath))].sort();
  const admissionSemanticScope = semanticScopeFor(admissionChangedPaths);
  const admissionChangedBytes = effectiveChangeBytes(admissionInspections);
  if (ownerAreas.length > BROAD_OWNER_AREA_LIMIT) {
    signals.push({
      type: 'broad-source-scope',
      severity: 'medium',
      ownerAreas,
    });
  }
  if (changedPaths.length > LARGE_DIFF_FILE_LIMIT) {
    signals.push({
      type: 'large-diff-stack',
      severity: 'medium',
      fileCount: changedPaths.length,
    });
  }
  if (categories.includes('runtime') && categories.includes('workflow')) {
    signals.push({
      type: 'mixed-runtime-and-workflow',
      severity: 'high',
    });
  }
  if (categories.includes('runtime') &&
    ownerAreas.some((area) => area.startsWith('test/distributed'))) {
    signals.push({
      type: 'mixed-runtime-and-harness',
      severity: 'medium',
    });
  }
  return {
    changedPaths,
    changedBytes,
    ownerAreas,
    ...semanticScope,
    categories,
    attempts: summarizeAttempts(inspections),
    admission: {
      changedPaths: admissionChangedPaths,
      changedBytes: admissionChangedBytes,
      ownerAreas: admissionOwnerAreas,
      ...admissionSemanticScope,
    },
    splitPlan: splitPlanFor(changedPaths),
    recommendedActions: recommendedActions(changedPaths, ownerAreas, categories),
    signals,
  };
}

export function analyzeScopePressure(root, quest, log, options = {}) {
  return summarizeScopePressure(root, attemptInspections(root, quest, log, options));
}

export function analyzeScopePressureCandidate(
  root,
  quest,
  log,
  inspection,
  options = {},
) {
  const inspections = attemptInspections(
    root,
    quest,
    log,
    {ignoreBaselines: true},
  );
  inspections.push({
    event: {workspaceBaseCommit: options.workspaceBaseCommit || null},
    inspection,
  });
  return summarizeScopePressure(root, inspections);
}

export function renderScopePressure(scopePressure) {
  const lines = ['## Scope Pressure'];
  lines.push(`- Changed files: ${scopePressure.changedPaths.length}`);
  lines.push(`- Change bytes: ${scopePressure.changedBytes || 0}`);
  lines.push(`- Owner areas: ${
    scopePressure.ownerAreas.join(LIST_SEPARATOR) || EMPTY_LIST_LABEL}`);
  lines.push(`- Semantic owners: ${
    scopePressure.semanticOwnerAreas.join(LIST_SEPARATOR) || EMPTY_LIST_LABEL}`);
  lines.push(`- Implementation files: ${scopePressure.implementationPaths.length}`);
  lines.push(`- Proof-tail files: ${scopePressure.proofTailPaths.length}`);
  lines.push(`- Categories: ${
    scopePressure.categories.join(LIST_SEPARATOR) || EMPTY_LIST_LABEL}`);
  if (scopePressure.recommendedActions?.length > 0) {
    for (const action of scopePressure.recommendedActions) {
      lines.push(`- Action: ${action}`);
    }
  }
  if (scopePressure.semanticSplitPlan?.length > 0) {
    lines.push(SEMANTIC_PLAN_HEADER);
    lines.push(SEMANTIC_PLAN_REQUIRED_NOTE);
    for (const group of scopePressure.semanticSplitPlan) {
      lines.push(
        `  - ${group.semanticOwner}: ${group.fileCount} file(s) ` +
        `(${group.implementationCount} implementation, ` +
        `${group.proofTailCount} proof-tail)`,
      );
    }
  }
  if (scopePressure.splitPlan?.length > 0) {
    lines.push(CONSERVATIVE_PLAN_HEADER);
    for (const group of scopePressure.splitPlan) {
      lines.push(
        `  - ${group.ownerArea}: ${group.fileCount} file(s)` +
        `${group.recommended ? '' : ' (split further)'}`,
      );
    }
  }
  if (scopePressure.signals.length === 0) {
    lines.push('- Signals: none');
  } else {
    for (const signal of scopePressure.signals) {
      lines.push(`- Signal: ${signal.type} severity=${signal.severity}`);
    }
  }
  return lines;
}
