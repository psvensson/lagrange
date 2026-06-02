import {
  EVENT_ATTEMPT,
} from './constants.js';
import {inspectChangeArtifact} from './change-artifact.js';

const BROAD_OWNER_AREA_LIMIT = 2;
const LARGE_DIFF_FILE_LIMIT = 10;

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
    signals,
  };
}

export function renderScopePressure(scopePressure) {
  const lines = ['## Scope Pressure'];
  lines.push(`- Changed files: ${scopePressure.changedPaths.length}`);
  lines.push(`- Owner areas: ${scopePressure.ownerAreas.join(', ') || 'none'}`);
  lines.push(`- Categories: ${scopePressure.categories.join(', ') || 'none'}`);
  if (scopePressure.signals.length === 0) {
    lines.push('- Signals: none');
  } else {
    for (const signal of scopePressure.signals) {
      lines.push(`- Signal: ${signal.type} severity=${signal.severity}`);
    }
  }
  return lines;
}
