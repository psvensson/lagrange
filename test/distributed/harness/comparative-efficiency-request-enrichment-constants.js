export const COMPARATIVE_REQUEST_ENRICHMENT_SCENARIO =
  'comparative-efficiency-request-enrichment';
export const COMPARATIVE_REQUEST_ENRICHMENT_REASON =
  'candidate_capacity_adapter_not_engaged';
export const COMPARATIVE_REQUEST_ENRICHMENT_DISPOSITION =
  'non_measuring_candidate_capacity_absent';
export const COMPARATIVE_REQUEST_ENRICHMENT_REQUEST_COUNT = 128;
export const COMPARATIVE_REQUEST_ENRICHMENT_ORACLE =
  'row_count_and_sum_exact';
export const COMPARATIVE_REQUEST_ENRICHMENT_WITNESS_VERSION =
  'comparative-request-enrichment-affinity-owner-witness-v1';
export const COMPARATIVE_REQUEST_ENRICHMENT_AFFINITY_OWNER_IDS =
  Object.freeze({
    attribution: 'ServicePartitionAccessMetrics',
    routing: 'SQLQueryEngine.resolveIssuingServiceReadLocality',
    placement: 'placement_owner',
    decay: 'buildServiceDataAffinityWeights',
    hysteresis: 'isDataAffinityPlacementSuboptimal',
    readLocalityAny: 'any',
    readLocalitySameGroup: 'same_group',
  });
export const COMPARATIVE_REQUEST_ENRICHMENT_AXES = Object.freeze([
  Object.freeze({
    id: 'dataset_size',
    values: Object.freeze(['128', '1024']),
  }),
  Object.freeze({
    id: 'fanout',
    values: Object.freeze(['1', '8']),
  }),
  Object.freeze({
    id: 'read_locality',
    values: Object.freeze(['any', 'same_group']),
  }),
  Object.freeze({
    id: 'skew',
    values: Object.freeze(['uniform', 'hotspot_80_20']),
  }),
]);

const SIZE_AXIS_INDEX = 0;
const FANOUT_AXIS_INDEX = 1;
const LOCALITY_AXIS_INDEX = 2;
const SKEW_AXIS_INDEX = 3;
const HOTSPOT_SKEW = 'hotspot_80_20';
const HOTSPOT_RATIO = 0.8;
const ENTITY_KEY_MULTIPLIER = 17;
const ENRICHMENT_VALUE_MULTIPLIER = 100;
const SQL_WITH_REQUEST_KEYS = 'WITH request_keys AS MATERIALIZED (';
const SQL_SELECT_RESULT =
  ') SELECT count(*), sum(request_enrichments.value) ';
const SQL_JOIN_ENRICHMENTS =
  'FROM request_keys JOIN request_enrichments ';
const SQL_JOIN_CONDITION =
  'ON request_enrichments.entity_id = request_keys.entity_id ';
const arrayPush = Function.call.bind(Array.prototype.push);
const mathFloor = Math.floor;
const cells = [];
for (let sizeIndex = 0;
  sizeIndex <
    COMPARATIVE_REQUEST_ENRICHMENT_AXES[SIZE_AXIS_INDEX].values.length;
  sizeIndex += 1) {
  for (let fanoutIndex = 0;
    fanoutIndex <
      COMPARATIVE_REQUEST_ENRICHMENT_AXES[FANOUT_AXIS_INDEX].values.length;
    fanoutIndex += 1) {
    for (let localityIndex = 0;
      localityIndex <
        COMPARATIVE_REQUEST_ENRICHMENT_AXES[LOCALITY_AXIS_INDEX].values.length;
      localityIndex += 1) {
      for (let skewIndex = 0;
        skewIndex <
          COMPARATIVE_REQUEST_ENRICHMENT_AXES[SKEW_AXIS_INDEX].values.length;
        skewIndex += 1) {
        arrayPush(cells, Object.freeze({
          datasetSize: Number(
            COMPARATIVE_REQUEST_ENRICHMENT_AXES[SIZE_AXIS_INDEX]
              .values[sizeIndex],
          ),
          fanout: Number(
            COMPARATIVE_REQUEST_ENRICHMENT_AXES[FANOUT_AXIS_INDEX]
              .values[fanoutIndex],
          ),
          readLocality:
            COMPARATIVE_REQUEST_ENRICHMENT_AXES[LOCALITY_AXIS_INDEX]
              .values[localityIndex],
          skew: COMPARATIVE_REQUEST_ENRICHMENT_AXES[SKEW_AXIS_INDEX]
            .values[skewIndex],
          requestCount: COMPARATIVE_REQUEST_ENRICHMENT_REQUEST_COUNT,
        }));
      }
    }
  }
}

export const COMPARATIVE_REQUEST_ENRICHMENT_CELLS =
  Object.freeze(cells);

export function comparativeRequestEnrichmentEntityId(cell, sampleId) {
  if (
    cell.skew === HOTSPOT_SKEW &&
    sampleId <= mathFloor(cell.requestCount * HOTSPOT_RATIO)
  ) {
    return 1;
  }
  return ((sampleId * ENTITY_KEY_MULTIPLIER) % cell.datasetSize) + 1;
}

export function comparativeRequestEnrichmentExpectedResult(cell) {
  let valueSum = 0;
  for (let sampleId = 1; sampleId <= cell.requestCount; sampleId += 1) {
    const entityId = comparativeRequestEnrichmentEntityId(cell, sampleId);
    for (let ordinal = 1; ordinal <= cell.fanout; ordinal += 1) {
      valueSum += (entityId * ENRICHMENT_VALUE_MULTIPLIER) + ordinal;
    }
  }
  return `${cell.requestCount * cell.fanout}|${valueSum}`;
}

export function comparativeRequestEnrichmentSql(cell) {
  const hotspotCount = mathFloor(cell.requestCount * HOTSPOT_RATIO);
  const entityExpression = cell.skew === HOTSPOT_SKEW ?
    `CASE WHEN sample_id <= ${hotspotCount} THEN 1 ` +
      `ELSE ((sample_id * ${ENTITY_KEY_MULTIPLIER}) % ` +
      `${cell.datasetSize}) + 1 END` :
    `((sample_id * ${ENTITY_KEY_MULTIPLIER}) % ${cell.datasetSize}) + 1`;
  return (
    `/* read_locality=${cell.readLocality};skew=${cell.skew} */ ` +
    SQL_WITH_REQUEST_KEYS +
      `SELECT sample_id, ${entityExpression} AS entity_id ` +
      `FROM generate_series(1, ${cell.requestCount}) AS request(sample_id)` +
    SQL_SELECT_RESULT +
    SQL_JOIN_ENRICHMENTS +
      SQL_JOIN_CONDITION +
    `WHERE request_enrichments.ordinal <= ${cell.fanout}`
  );
}
