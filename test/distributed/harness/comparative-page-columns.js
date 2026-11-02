// Column sets shared by the comparative benchmark pages: one name per advertised
// per-target claim, matching the coverage manifest's target claim keys.
import {SCENARIO_B_SHAPES, TARGET_ID} from './comparative-coverage-manifest.js';
import {column} from './comparative-landing-tables.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);

const SCENARIO_A_COLUMNS = Object.freeze([column('scenarioA', 'Scenario A')]);
const SMOKE_COLUMNS = Object.freeze([column('scenarioA/smoke', 'Scenario A smoke')]);
const SCENARIO_B_COLUMNS = Object.freeze(arrayMap(SCENARIO_B_SHAPES,
  (shape) => column(`scenarioB/${shape}`, `Scenario B ${shape}`)));
const SCENARIO_C_COLUMNS = Object.freeze([
  column('scenarioC/fresh-0ms', 'Scenario C 0 ms'),
  column('scenarioC/fresh-100ms', 'Scenario C 100 ms'),
  column('scenarioC/fresh-1000ms', 'Scenario C 1000 ms'),
  column('scenarioC/rule-backfill', 'Rule backfill'),
  column('scenarioC/cache-restart-recovery', 'Restart recovery'),
]);
const OVERVIEW_COLUMNS = Object.freeze([
  column('scenarioA', 'Scenario A'),
  column('scenarioB/one-remote-stage', 'Scenario B'),
  column('scenarioC/fresh-0ms', 'Scenario C'),
]);
const ALL_TARGET_IDS = Object.freeze(arrayFilter(Object.values(TARGET_ID),
  (id) => id !== TARGET_ID.LAGRANGE_4));

const SCENARIO_LINKS = Object.freeze([
  {href: 'tidb-reference-scenarios.md', label: 'Scenario A/B/C definitions'},
  {href: 'tidb-reference-semantic-gate.md', label: 'Scenario A semantic evidence gate'},
  {href: 'tidb-reference-paired-owner.md', label: 'Paired measurement owner'},
  {href: 'README.md', label: 'Comparative benchmark overview'},
]);

export {
  ALL_TARGET_IDS,
  OVERVIEW_COLUMNS,
  SCENARIO_A_COLUMNS,
  SCENARIO_B_COLUMNS,
  SCENARIO_C_COLUMNS,
  SCENARIO_LINKS,
  SMOKE_COLUMNS,
};
