/**
 * The probe body for formation-production-interaction-attribution-authority.
 *
 * It prints the number of UNMET acceptance clauses. Each clause is a semantic
 * claim about who may assign a formation owner, never a count of work.
 *
 * @module scripts/checks/attribution-authority-probe
 */
import {spawnSync} from 'node:child_process';
import process from 'node:process';

const EXPLAIN_FLAG = '--explain';
const JSON_FLAG = '--json';
const NODE_BIN = process.execPath;
const TEST_RUNNER = 'scripts/run-test-files.js';
const CENSUS_SCRIPT = 'scripts/checks/attribution-provenance-census.js';
const INTERACTION_WITNESS =
  'test/raft/liferaft-formation-attribution-interaction.test.js';
const SEMANTICS_WITNESS =
  'test/diagnostics/formation-attribution-semantics.test.js';
const CENSUS_WITNESS =
  'test/simulation/formation-attribution-provenance.test.js';
const UTF8 = 'utf8';
const INHERIT_NONE = 'pipe';
const EXIT_OK = 0;
const ZERO = 0;
const JSON_INDENT = 2;
const NEWLINE = '\n';
const CENSUS_UNAVAILABLE = 'the provenance census did not produce a reading';

// Captured at module load so a replaced prototype method cannot decide what
// the probe reports.
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringSplit = Function.call.bind(String.prototype.split);

/**
 * Every clause carries the acceptance item it discharges, so the printed
 * explanation says which requirement a red clause belongs to.
 */
const CENSUS_CLAUSE = Object.freeze([
  Object.freeze({
    field: 'productionSemanticUnowned',
    id: 'production_semantic_unowned',
    item: 'productionSemanticUnowned = 0',
  }),
  Object.freeze({
    field: 'ambiguousSemanticOwner',
    id: 'ambiguous_semantic_owner',
    item: 'ambiguousSemanticOwner = 0',
  }),
  Object.freeze({
    field: 'peerRepresentationOwnerAssignments',
    id: 'peer_representation_owner_assignments',
    item: 'peerRepresentationOwnerAssignments = 0',
  }),
  Object.freeze({
    field: 'genericExecutionOwnerAssignments',
    id: 'generic_execution_owner_assignments',
    item: 'genericExecutionOwnerAssignments = 0',
  }),
  Object.freeze({
    field: 'overlapDurationUs',
    id: 'overlap_duration_us',
    item: 'overlapDurationUs = 0',
  }),
  Object.freeze({
    field: 'partitionDeltaUs',
    id: 'partition_delta_us',
    item: 'partitionDeltaUs = 0',
  }),
  // Not in the owner's enumerated list, and deliberately added: F3 stops
  // rather than labelling an unexplained segment harmless, so an unclassified
  // segment must keep this probe red.
  Object.freeze({
    field: 'unknownSegments',
    id: 'unknown_segments',
    item: 'every measured segment is classified (unknown = 0)',
  }),
]);

const WITNESS_CLAUSE = Object.freeze([
  Object.freeze({
    files: Object.freeze([INTERACTION_WITNESS]),
    id: 'interaction_mapping_reverts_red',
    item: 'protocol mapping revert RED; apply mapping revert RED',
  }),
  Object.freeze({
    files: Object.freeze([SEMANTICS_WITNESS]),
    id: 'semantic_boundary_witnesses_green',
    item: 'bootstrap->Raft handoff witness green; ' +
      'transport->Raft handoff witness green',
  }),
  Object.freeze({
    files: Object.freeze([CENSUS_WITNESS]),
    id: 'census_witnesses_green',
    item: 'the provenance census classifies by proof, not by filename',
  }),
]);

function runNode(args) {
  return spawnSync(NODE_BIN, args, {encoding: UTF8, stdio: INHERIT_NONE});
}

function evaluateWitnessClause(clause) {
  const result = runNode([TEST_RUNNER, ...clause.files]);
  const met = result.status === EXIT_OK;
  return {
    id: clause.id,
    item: clause.item,
    met,
    detail: met ? clause.files[ZERO] : `${clause.files[ZERO]}: ${result.stdout}`,
  };
}

// The census prints one JSON line last. Production logging shares stdout, so
// the reading is the final line and never the whole stream.
function readCensus() {
  const result = runNode([CENSUS_SCRIPT, JSON_FLAG]);
  if (result.status !== EXIT_OK) return null;
  const lines = arrayFilter(stringSplit(result.stdout, NEWLINE),
    (line) => line.length > ZERO);
  if (lines.length === ZERO) return null;
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

function evaluateCensusClause(clause, census) {
  if (census === null) {
    return {id: clause.id, item: clause.item, met: false,
      detail: CENSUS_UNAVAILABLE};
  }
  const value = census[clause.field];
  return {
    id: clause.id,
    item: clause.item,
    met: value === ZERO,
    detail: `${clause.field}=${value}`,
  };
}

/**
 * Run the probe. Never returns.
 * @return {Promise<void>}
 */
async function runAttributionAuthorityProbe() {
  const explain = arrayIncludes(process.argv, EXPLAIN_FLAG);
  const census = readCensus();
  const clauses = [
    ...arrayMap(WITNESS_CLAUSE, evaluateWitnessClause),
    ...arrayMap(CENSUS_CLAUSE, (clause) =>
      evaluateCensusClause(clause, census)),
  ];
  const unmet = arrayFilter(clauses, (clause) => !clause.met);
  if (explain) {
    process.stdout.write(
      `${JSON.stringify({census, clauses}, null, JSON_INDENT)}${NEWLINE}`);
  }
  process.stdout.write(`${unmet.length}${NEWLINE}`);
  process.exit(unmet.length === ZERO ? EXIT_OK : 1);
}

export {runAttributionAuthorityProbe};
