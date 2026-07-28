export const COMPARATIVE_CHANGE_RATE_CROSSOVER_SCENARIO =
  'comparative-efficiency-change-rate-crossover';
export const COMPARATIVE_CHANGE_RATE_CROSSOVER_REASON =
  'candidate_capacity_adapter_not_engaged';
export const COMPARATIVE_CHANGE_RATE_CROSSOVER_DISPOSITION =
  'non_measuring_crossover_not_evaluable';
const COMPARATIVE_CHANGE_RATE_CROSSOVER_REQUEST_COUNT = 128;
export const COMPARATIVE_CHANGE_RATE_CROSSOVER_ORACLE =
  'row_count_sum_and_diversity_exact';
export const COMPARATIVE_CHANGE_RATE_CROSSOVER_POLICY_OWNER_IDS =
  Object.freeze({
    mutationSchedule: 'primary_key_prefix_update',
    workloadDiversity: 'request_diversity_group',
    accessSkew: 'deterministic_request_id',
    recomputation: 'postgresql_not_materialized_cte',
    materialization: 'postgresql_materialized_cte',
  });
export const COMPARATIVE_CHANGE_RATE_CROSSOVER_AXES = Object.freeze([
  Object.freeze({
    id: 'dataset_size',
    values: Object.freeze(['128', '1024']),
  }),
  Object.freeze({
    id: 'mutation_rate',
    values: Object.freeze(['one_per_sixteen', 'one_per_two']),
  }),
  Object.freeze({
    id: 'workload_diversity',
    values: Object.freeze(['one_group', 'eight_groups']),
  }),
  Object.freeze({
    id: 'skew',
    values: Object.freeze(['uniform', 'hotspot_80_20']),
  }),
  Object.freeze({
    id: 'recomputation_materialization_policy',
    values: Object.freeze(['recompute_on_read', 'materialize_once']),
  }),
]);

const SIZE_AXIS_INDEX = 0;
const MUTATION_AXIS_INDEX = 1;
const DIVERSITY_AXIS_INDEX = 2;
const SKEW_AXIS_INDEX = 3;
const POLICY_AXIS_INDEX = 4;
const LOW_MUTATION_RATE = 'one_per_sixteen';
const LOW_MUTATION_DIVISOR = 16;
const HIGH_MUTATION_DIVISOR = 2;
const LOW_DIVERSITY = 'one_group';
const LOW_DIVERSITY_COUNT = 1;
const HIGH_DIVERSITY_COUNT = 8;
const HOTSPOT_SKEW = 'hotspot_80_20';
const HOTSPOT_RATIO = 0.8;
const HOT_KEY_RATIO = 0.2;
const ENTITY_KEY_MULTIPLIER = 17;
const ITEM_VALUE_MULTIPLIER = 10;
const MUTATION_INCREMENT = 100_000;
const MATERIALIZE_POLICY = 'materialize_once';
const SQL_MATERIALIZED = 'MATERIALIZED';
const SQL_NOT_MATERIALIZED = 'NOT MATERIALIZED';
const SQL_CREATE =
  'CREATE TEMP TABLE change_rate_items (' +
  'id INTEGER PRIMARY KEY, value BIGINT NOT NULL); ';
const SQL_INSERT = 'INSERT INTO change_rate_items (id, value) ';
const SQL_REQUESTS = 'WITH requests AS MATERIALIZED (';
const SQL_DIVERSITY_ALIAS = 'AS diversity_group ';
const SQL_REQUEST_ALIAS = 'AS request(sample_id)';
const SQL_RESOLVED_SELECT =
  'SELECT requests.diversity_group, items.value ';
const SQL_RESOLVED_FROM =
  'FROM requests JOIN change_rate_items AS items ';
const SQL_RESOLVED_JOIN = 'ON items.id = requests.item_id';
const SQL_RESULT_COUNT = ') SELECT count(*)::text || \'|\' || ';
const SQL_RESULT_SUM =
  'sum(value + diversity_group)::text || \'|\' || ';
const SQL_RESULT_DIVERSITY =
  'count(DISTINCT diversity_group)::text FROM resolved';
const arrayPush = Function.call.bind(Array.prototype.push);
const mathCeil = Math.ceil;
const mathFloor = Math.floor;

function axisValues(index) {
  return COMPARATIVE_CHANGE_RATE_CROSSOVER_AXES[index].values;
}

const cells = [];
for (let sizeIndex = 0;
  sizeIndex < axisValues(SIZE_AXIS_INDEX).length;
  sizeIndex += 1) {
  for (let mutationIndex = 0;
    mutationIndex < axisValues(MUTATION_AXIS_INDEX).length;
    mutationIndex += 1) {
    for (let diversityIndex = 0;
      diversityIndex < axisValues(DIVERSITY_AXIS_INDEX).length;
      diversityIndex += 1) {
      for (let skewIndex = 0;
        skewIndex < axisValues(SKEW_AXIS_INDEX).length;
        skewIndex += 1) {
        for (let policyIndex = 0;
          policyIndex < axisValues(POLICY_AXIS_INDEX).length;
          policyIndex += 1) {
          const mutationRate =
            axisValues(MUTATION_AXIS_INDEX)[mutationIndex];
          const workloadDiversity =
            axisValues(DIVERSITY_AXIS_INDEX)[diversityIndex];
          arrayPush(cells, Object.freeze({
            datasetSize: Number(axisValues(SIZE_AXIS_INDEX)[sizeIndex]),
            mutationRate,
            mutationDivisor: mutationRate === LOW_MUTATION_RATE ?
              LOW_MUTATION_DIVISOR :
              HIGH_MUTATION_DIVISOR,
            workloadDiversity,
            diversityCount: workloadDiversity === LOW_DIVERSITY ?
              LOW_DIVERSITY_COUNT :
              HIGH_DIVERSITY_COUNT,
            skew: axisValues(SKEW_AXIS_INDEX)[skewIndex],
            policy: axisValues(POLICY_AXIS_INDEX)[policyIndex],
            requestCount: COMPARATIVE_CHANGE_RATE_CROSSOVER_REQUEST_COUNT,
          }));
        }
      }
    }
  }
}

export const COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS =
  Object.freeze(cells);

export function comparativeChangeRateCrossoverMutationCount(cell) {
  return mathCeil(cell.datasetSize / cell.mutationDivisor);
}

function comparativeChangeRateCrossoverEntityId(cell, sampleId) {
  if (cell.skew !== HOTSPOT_SKEW) {
    return ((sampleId * ENTITY_KEY_MULTIPLIER) % cell.datasetSize) + 1;
  }
  const hotRequestCount = mathFloor(cell.requestCount * HOTSPOT_RATIO);
  const hotKeyCount = mathFloor(cell.datasetSize * HOT_KEY_RATIO);
  if (sampleId <= hotRequestCount) {
    return ((sampleId * ENTITY_KEY_MULTIPLIER) % hotKeyCount) + 1;
  }
  const coldKeyCount = cell.datasetSize - hotKeyCount;
  return hotKeyCount +
    ((sampleId * ENTITY_KEY_MULTIPLIER) % coldKeyCount) + 1;
}

function diversityGroup(cell, sampleId) {
  return ((sampleId - 1) % cell.diversityCount) + 1;
}

function itemValue(cell, entityId) {
  const base = entityId * ITEM_VALUE_MULTIPLIER;
  return entityId <= comparativeChangeRateCrossoverMutationCount(cell) ?
    base + MUTATION_INCREMENT :
    base;
}

export function comparativeChangeRateCrossoverExpectedResult(cell) {
  let valueSum = 0;
  for (let sampleId = 1; sampleId <= cell.requestCount; sampleId += 1) {
    const entityId =
      comparativeChangeRateCrossoverEntityId(cell, sampleId);
    valueSum += itemValue(cell, entityId) +
      diversityGroup(cell, sampleId);
  }
  return `${cell.requestCount}|${valueSum}|${cell.diversityCount}`;
}

function requestEntityExpression(cell) {
  if (cell.skew !== HOTSPOT_SKEW) {
    return `((sample_id * ${ENTITY_KEY_MULTIPLIER}) % ` +
      `${cell.datasetSize}) + 1`;
  }
  const hotRequestCount = mathFloor(cell.requestCount * HOTSPOT_RATIO);
  const hotKeyCount = mathFloor(cell.datasetSize * HOT_KEY_RATIO);
  const coldKeyCount = cell.datasetSize - hotKeyCount;
  return `CASE WHEN sample_id <= ${hotRequestCount} THEN ` +
    `((sample_id * ${ENTITY_KEY_MULTIPLIER}) % ${hotKeyCount}) + 1 ` +
    `ELSE ${hotKeyCount} + ` +
    `((sample_id * ${ENTITY_KEY_MULTIPLIER}) % ${coldKeyCount}) + 1 END`;
}

export function comparativeChangeRateCrossoverSql(cell) {
  const policy = cell.policy === MATERIALIZE_POLICY ?
    SQL_MATERIALIZED :
    SQL_NOT_MATERIALIZED;
  return (
    SQL_CREATE +
    SQL_INSERT +
      `SELECT item_id, item_id * ${ITEM_VALUE_MULTIPLIER} ` +
      `FROM generate_series(1, ${cell.datasetSize}) AS item(item_id); ` +
    `UPDATE change_rate_items SET value = value + ${MUTATION_INCREMENT} ` +
      `WHERE id <= ${comparativeChangeRateCrossoverMutationCount(cell)}; ` +
    SQL_REQUESTS +
      `SELECT sample_id, ${requestEntityExpression(cell)} AS item_id, ` +
        `((sample_id - 1) % ${cell.diversityCount}) + 1 ` +
        SQL_DIVERSITY_ALIAS +
      `FROM generate_series(1, ${cell.requestCount}) ` +
        SQL_REQUEST_ALIAS +
    `), resolved AS ${policy} (` +
      SQL_RESOLVED_SELECT +
      SQL_RESOLVED_FROM +
        SQL_RESOLVED_JOIN +
    SQL_RESULT_COUNT +
      SQL_RESULT_SUM +
      SQL_RESULT_DIVERSITY
  );
}
