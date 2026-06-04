import {
  EVENT_ATTEMPT,
} from './constants.js';
import {inspectChangeArtifact} from './change-artifact.js';

const BROAD_OWNER_AREA_LIMIT = 2;
const LARGE_DIFF_FILE_LIMIT = 10;
const SPLIT_GROUP_FILE_LIMIT = 20;

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
  if (segments[0] === '.kiro') return '.kiro';
  if (segments[0] === 'architecture') return 'architecture';
  if (segments[0] === 'solve') return 'solve';
  return segments[0] || 'unknown';
}

function attemptInspections(root, quest, log) {
  return log.filter((event) => event.type === EVENT_ATTEMPT && event.changeRef)
    .map((event) => ({
      event,
      inspection: inspectChangeArtifact(root, quest, event.changeRef),
    }));
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

export function analyzeScopePressure(root, quest, log) {
  const inspections = attemptInspections(root, quest, log);
  const changedPaths = [...new Set(inspections.flatMap((entry) =>
    entry.inspection.changedPaths || []))].sort();
  const ownerAreas = [...new Set(changedPaths.map(ownerAreaForPath))].sort();
  const categories = [...new Set(inspections.flatMap((entry) =>
    entry.inspection.categories || []))].sort();
  const signals = [];
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
    ownerAreas,
    categories,
    attempts: summarizeAttempts(inspections),
    splitPlan: splitPlanFor(changedPaths),
    recommendedActions: recommendedActions(changedPaths, ownerAreas, categories),
    signals,
  };
}

export function renderScopePressure(scopePressure) {
  const lines = ['## Scope Pressure'];
  lines.push(`- Changed files: ${scopePressure.changedPaths.length}`);
  lines.push(`- Owner areas: ${scopePressure.ownerAreas.join(', ') || 'none'}`);
  lines.push(`- Categories: ${scopePressure.categories.join(', ') || 'none'}`);
  if (scopePressure.recommendedActions?.length > 0) {
    for (const action of scopePressure.recommendedActions) {
      lines.push(`- Action: ${action}`);
    }
  }
  if (scopePressure.splitPlan?.length > 0) {
    lines.push('- Split plan:');
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
