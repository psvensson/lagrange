// A write the partition applied is judged applied, with its count, when its
// answer crosses the CDC's bootstrap lane (line-regression-causes stage 4,
// item D). The partition answers its proposer `changes` (its own count field);
// above the partition the engine renders that count as `affectedRows`, the one
// field every consumer reads (src/query/application-database-result.js). The
// bootstrap lane hands the partition's answer to the CDC unrendered, and the
// CDC's insert answer carried an own `affectedRows` property whose value was
// undefined: the classifier read a present non-count, judged the answer
// invalid and the write NOT applied, so the seed's dynamic-config seeding
// reported every inserted definition "skipped" (`seeded: 0, skipped: 72` in
// both GCP seed logs).
//
// Real producers: the CDC integration service in bootstrap mode, the bootstrap
// lane, and a local replica whose raft lane answers what the partition answers
// its proposer, built by the partition's own code (bootstrap-lane-replica.js);
// the dynamic-config seeding owner over a gateway that hands it the CDC's
// answer unchanged, as the control-plane gateway does.
import {test} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {classifyControlPlaneMutationResult} from
  '../../src/control-plane/control-plane-mutation-outcome-classifier.js';
import {CONTROL_PLANE_MUTATION_OUTCOME} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {CONFIG_ERROR_CODE} from '../../src/config/config-constants.js';
import {CONFIG_DEFINITIONS, DynamicConfigService} from
  '../../src/config/dynamic-config-service.js';
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {createBootstrapLaneReplica} from '../test-helpers/bootstrap-lane-replica.js';

const CONFIG_PARTITION_ID = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONFIG];
const DEFINITION_COUNT = Object.keys(CONFIG_DEFINITIONS).length;
const PRESENT_ROW_CHANGES = 0;
const SEED_NODE_ID = 'bootstrap-lane-seed';
const CONFIG_ROW = Object.freeze({config_key: 'witness.key', config_value: '1',
  value_type: 'number', requires_restart: 0, description: 'witness',
  default_value: '1', updated_by: SEED_NODE_ID, updated_at: 1, created_at: 1});

// The window's CDC service over one local config replica. With
// `rowsPresent`, the replica answers an INSERT OR IGNORE of a row that is
// already present: the partition's committed answer with `changes: 0`.
function createWindowCdc({rowsPresent = false} = {}) {
  const replica = createBootstrapLaneReplica({partitionId: CONFIG_PARTITION_ID,
    tableName: SYSTEM_TABLE_NAME.CONFIG});
  if (rowsPresent) {
    const commit = replica.executeQuery;
    replica.executeQuery = async (sql, params) =>
      ({...(await commit(sql, params)), changes: PRESENT_ROW_CHANGES});
  }
  const cdc = new CDCIntegrationService({nodeId: SEED_NODE_ID});
  cdc.initialize();
  cdc.setBootstrapMode(true, new Map([[replica.replicaId, replica]]));
  return {cdc, replica};
}

async function seedThroughWindow(options) {
  const {cdc, replica} = createWindowCdc(options);
  const service = new DynamicConfigService({nodeId: SEED_NODE_ID,
    controlPlaneSystemTableGateway: {
      insertSystemTableRow: (tableName, row, writeOptions) =>
        cdc.insertSystemTableRow(tableName, row, writeOptions),
    }});
  await service.initialize();
  const answer = await service.seedConfiguration('system', {nowMs: 1});
  return {replica, sizes: Object.fromEntries(Object.entries(answer)
    .map(([name, keys]) => [name, keys.length]))};
}

test('a CDC answer for a write the partition applied is judged applied with its count',
  async (t) => {
    const {cdc, replica} = createWindowCdc();
    const answer = await cdc.insertSystemTableRow(SYSTEM_TABLE_NAME.CONFIG, CONFIG_ROW,
      {ignoreExisting: true});
    const effect = classifyControlPlaneMutationResult(answer);
    t.equal(replica.raftWrites.length, 1, 'the write rode the raft lane once');
    t.equal(effect.valid, true, 'the answer is a well-formed mutation answer');
    t.equal(effect.applied, true, 'the applied write is judged applied');
    t.equal(effect.affectedRowsPresent, true, 'the answer carries a count');
    t.equal(effect.affectedRows, 1, 'the count is the partition\'s one changed row');
  });

test('an INSERT OR IGNORE of a present row is judged a proven zero, not a failure',
  async (t) => {
    const {cdc} = createWindowCdc({rowsPresent: true});
    const answer = await cdc.insertSystemTableRow(SYSTEM_TABLE_NAME.CONFIG, CONFIG_ROW,
      {ignoreExisting: true});
    const effect = classifyControlPlaneMutationResult(answer);
    t.equal(effect.valid, true, 'the answer is a well-formed mutation answer');
    t.equal(effect.failed, false, 'nothing failed');
    t.equal(effect.applied, false, 'no row was changed');
    t.equal(effect.zeroAffectedRows, true, 'the count is a proven zero');
  });

test('config seeding on a fresh store counts every inserted definition as seeded',
  async (t) => {
    const {replica, sizes} = await seedThroughWindow();
    t.equal(replica.raftWrites.length, DEFINITION_COUNT, 'one raft write per definition');
    t.same(sizes, {seeded: DEFINITION_COUNT, alreadyPresent: 0, refused: 0, unknown: 0},
      'every definition inserted is counted seeded; nothing else is counted');
  });

test('config seeding over present rows counts them already present', async (t) => {
  const {sizes} = await seedThroughWindow({rowsPresent: true});
  t.same(sizes, {seeded: 0, alreadyPresent: DEFINITION_COUNT, refused: 0, unknown: 0},
    'a definition the store already holds is counted already present');
});

async function seedWithReturnedOutcome(mutationResult) {
  const service = new DynamicConfigService({nodeId: SEED_NODE_ID,
    controlPlaneSystemTableGateway: {
      insertSystemTableRow: async () => mutationResult,
    }});
  await service.initialize();
  try {
    await service.seedConfiguration('system', {nowMs: 1});
    return {error: null, sizes: null};
  } catch (error) {
    return {
      error,
      sizes: Object.fromEntries(Object.entries(error.counts ?? {})
        .map(([name, keys]) => [name, keys.length])),
    };
  }
}

test('config seeding counts non-throwing gateway refusals as refused and throws typed',
  async (t) => {
    const {error, sizes} = await seedWithReturnedOutcome({
      success: false,
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
      deferRetry: true,
    });
    t.ok(error instanceof Error, 'seeding throws when any definition is refused');
    t.equal(error?.code, CONFIG_ERROR_CODE.SEEDING_INCOMPLETE,
      'thrown error carries the typed seeding-incomplete code');
    t.same(sizes, {seeded: 0, alreadyPresent: 0, refused: DEFINITION_COUNT, unknown: 0},
      'every refused definition is counted under refused');
  });

test('config seeding counts unconfirmed writes as unknown and throws typed',
  async (t) => {
    const {error, sizes} = await seedWithReturnedOutcome({
      success: false,
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.UNKNOWN,
      deferRetry: true,
    });
    t.ok(error instanceof Error, 'seeding throws when any definition outcome is unknown');
    t.equal(error?.code, CONFIG_ERROR_CODE.SEEDING_INCOMPLETE,
      'thrown error carries the typed seeding-incomplete code');
    t.same(sizes, {seeded: 0, alreadyPresent: 0, refused: 0, unknown: DEFINITION_COUNT},
      'every unconfirmed definition is counted under unknown');
  });
