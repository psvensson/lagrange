/**
 * Spike guest for the draft call-cell world: Bayesian-style top-N over a
 * typed batch, bounded emit, and a reduce export — plain JavaScript that
 * ComponentizeJS compiles against wit/world.wit.
 */
import {emit, callBounded} from 'lagrange:cell/call-context';

function columnValue(row, name) {
  for (const column of row.columns) {
    if (column.name === name) return column.val;
  }
  return {tag: 'null-value'};
}

export function run(batch, argumentsJson) {
  const {topN} = JSON.parse(argumentsJson);
  const scored = [];
  let nullLabels = 0;
  for (const row of batch) {
    const id = columnValue(row, 'id');
    const score = columnValue(row, 'score');
    if (columnValue(row, 'label').tag === 'null-value') nullLabels += 1;
    if (id.tag !== 'integer' || score.tag !== 'real') continue;
    scored.push({id: String(id.val), score: score.val});
  }
  scored.sort((a, b) => b.score - a.score);
  const kept = scored.slice(0, topN);
  const denied = [];
  for (const candidate of scored) {
    try {
      emit(candidate.id, JSON.stringify(candidate));
    } catch (error) {
      denied.push({id: candidate.id, code: error.payload ?? String(error)});
    }
  }
  let nestedDenial = null;
  try {
    callBounded('run', argumentsJson);
  } catch (error) {
    nestedDenial = error.payload ?? String(error);
  }
  return JSON.stringify({kept, denied, nullLabels, nestedDenial});
}

export function reduce(partials, argumentsJson) {
  const {topN} = JSON.parse(argumentsJson);
  const merged = partials.map(([key, partial]) => ({
    key,
    ...JSON.parse(partial),
  }));
  merged.sort((a, b) => b.score - a.score);
  return JSON.stringify(merged.slice(0, topN));
}
