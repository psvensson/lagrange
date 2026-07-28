import {
  COLUMN,
  SERVICE_PARTITION_ACCESS_COL,
  SERVICE_PARTITION_ACCESS_KIND,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../../src/constants/index.js';
import {SQLQueryEngine} from '../../../src/query/sql-query-engine.js';
import {
  ServicePartitionAccessMetrics,
} from '../../../src/query/service-partition-access-metrics.js';
import {
  buildServiceDataAffinityWeights,
} from '../../../src/rebalancer/service-data-affinity-weights.js';
import {
  isDataAffinityPlacementSuboptimal,
} from '../../../src/rebalancer/placement-owner-decision.js';
import {
  COMPARATIVE_REQUEST_ENRICHMENT_AFFINITY_OWNER_IDS,
  COMPARATIVE_REQUEST_ENRICHMENT_CELLS,
  COMPARATIVE_REQUEST_ENRICHMENT_WITNESS_VERSION,
  comparativeRequestEnrichmentEntityId,
} from './comparative-efficiency-request-enrichment-constants.js';

const PARTITION_COUNT = 8;
const FRESHNESS_WINDOW_MS = 120_000;
const SERVICE_ID = 'comparative-request-enrichment-service';
const NOW_MS = Date.parse('2026-07-28T00:00:00.000Z');
const NODE_IDS = Object.freeze(['node-a', 'node-b']);
const GROUP_IDS = Object.freeze(['group-a', 'group-b']);
const AT_MARGIN_INCUMBENT_WEIGHT = 0.75;
const ABOVE_MARGIN_INCUMBENT_WEIGHT = 0.5;
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const jsonStringify = JSON.stringify;
const objectEntries = Object.entries;
const objectFreeze = Object.freeze;
const reflectOwnKeys = Reflect.ownKeys;
const readLocalityOwnerMethod =
  SQLQueryEngine.prototype.resolveIssuingServiceReadLocality;
const INVALID_CELL =
  'request-enrichment affinity witness requires an exact matrix cell';

function readLocalityPreference(ownerState) {
  return Reflect.apply(
    readLocalityOwnerMethod,
    {systemCache: ownerState},
    [{issuingServiceId: SERVICE_ID}],
  );
}

function partitionId(index) {
  return `request-enrichment-p${index}`;
}

function requestPartitions(cell, sampleId) {
  const entityId = comparativeRequestEnrichmentEntityId(cell, sampleId);
  const first = entityId % PARTITION_COUNT;
  const ids = [];
  for (let offset = 0; offset < cell.fanout; offset += 1) {
    arrayPush(ids, partitionId((first + offset) % PARTITION_COUNT));
  }
  return ids;
}

function attributionSnapshot(cell) {
  const metrics = new ServicePartitionAccessMetrics();
  for (let sampleId = 1; sampleId <= cell.requestCount; sampleId += 1) {
    metrics.record(
      SERVICE_ID,
      requestPartitions(cell, sampleId),
      SERVICE_PARTITION_ACCESS_KIND.READ,
    );
  }
  return metrics.snapshotAndReset()[SERVICE_ID];
}

function topologyRows() {
  const nodes = arrayMap(NODE_IDS, (nodeId, index) => ({
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.LATENCY_GROUP_ID]: GROUP_IDS[index],
  }));
  const partitions = [];
  const services = [];
  for (let index = 0; index < PARTITION_COUNT; index += 1) {
    const id = partitionId(index);
    const nodeId = NODE_IDS[index % NODE_IDS.length];
    arrayPush(partitions, {
      [COLUMN.PARTITION_ID]: id,
      [COLUMN.LEADER_NODE_ID]: nodeId,
    });
    arrayPush(services, {
      [COLUMN.PARTITION_ID]: id,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.NODE_ID]: nodeId,
    });
  }
  return {nodes, partitions, services};
}

function rowBy(rows, key, value) {
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index][key] === value) return rows[index];
  }
  return null;
}

function ownerCache(cell, snapshot, publishedAt) {
  const rows = topologyRows();
  const accessRows = [{
    [SERVICE_PARTITION_ACCESS_COL.SERVICE_ID]: SERVICE_ID,
    [SERVICE_PARTITION_ACCESS_COL.PUBLISHED_AT]: publishedAt,
    [SERVICE_PARTITION_ACCESS_COL.ACCESS_JSON]:
      jsonStringify(snapshot),
  }];
  return {
    get(table, key) {
      if (table === TABLES.NODES) {
        return rowBy(rows.nodes, COLUMN.NODE_ID, key);
      }
      if (table === TABLES.PARTITIONS) {
        return rowBy(rows.partitions, COLUMN.PARTITION_ID, key);
      }
      if (table === TABLES.SERVICE_DEFINITIONS && key === SERVICE_ID) {
        return {read_locality: cell.readLocality};
      }
      return null;
    },
    filter(table, predicate) {
      const values = table === TABLES.SERVICE_PARTITION_ACCESS ?
        accessRows :
        table === TABLES.SERVICES ? rows.services : [];
      return arrayFilter(values, predicate);
    },
  };
}

function normalizedPartitionReads(snapshot) {
  const reads = {};
  const entries = objectEntries(snapshot);
  for (let index = 0; index < entries.length; index += 1) {
    const [id, counts] = entries[index];
    reads[id] = counts[SERVICE_PARTITION_ACCESS_KIND.READ];
  }
  return reads;
}

function placementPolicy(nodeWeights) {
  return {
    placementConstraints: {preferDataAffinity: true},
    dataAffinity: {nodeWeights, groupWeights: {}},
  };
}

function hysteresisWitness() {
  const incumbents = [{node_id: NODE_IDS[0]}];
  const ready = arrayMap(NODE_IDS, (nodeId) => ({node_id: nodeId}));
  return {
    atMarginTriggers: isDataAffinityPlacementSuboptimal(
      placementPolicy({
        'node-a': AT_MARGIN_INCUMBENT_WEIGHT,
        'node-b': 1,
      }),
      incumbents,
      ready,
    ),
    aboveMarginTriggers: isDataAffinityPlacementSuboptimal(
      placementPolicy({
        'node-a': ABOVE_MARGIN_INCUMBENT_WEIGHT,
        'node-b': 1,
      }),
      incumbents,
      ready,
    ),
  };
}

function freezeWitness(value) {
  if (!value || typeof value !== 'object') return value;
  const keys = reflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    freezeWitness(value[keys[index]]);
  }
  return objectFreeze(value);
}

function computeComparativeRequestEnrichmentAffinityWitness(cell) {
  const snapshot = attributionSnapshot(cell);
  const freshCache = ownerCache(cell, snapshot, NOW_MS);
  const staleCache = ownerCache(
    cell,
    snapshot,
    NOW_MS - FRESHNESS_WINDOW_MS - 1,
  );
  const freshWeights = buildServiceDataAffinityWeights({
    systemTableCache: freshCache,
    serviceId: SERVICE_ID,
    nowMs: NOW_MS,
    maxAgeMs: FRESHNESS_WINDOW_MS,
  });
  const staleWeights = buildServiceDataAffinityWeights({
    systemTableCache: staleCache,
    serviceId: SERVICE_ID,
    nowMs: NOW_MS,
    maxAgeMs: FRESHNESS_WINDOW_MS,
  });
  const preferSameLatencyGroup = readLocalityPreference(freshCache);
  const healthyReplicas = [{node_id: NODE_IDS[0]}];
  const readyNodes = arrayMap(NODE_IDS, (nodeId) => ({node_id: nodeId}));
  return {
    version: COMPARATIVE_REQUEST_ENRICHMENT_WITNESS_VERSION,
    attribution: {
      serviceId: SERVICE_ID,
      successfulRequests: cell.requestCount,
      partitionReads: normalizedPartitionReads(snapshot),
    },
    routing: {
      readLocality: cell.readLocality,
      preferSameLatencyGroup,
      owner: COMPARATIVE_REQUEST_ENRICHMENT_AFFINITY_OWNER_IDS.routing,
    },
    placement: {
      nodeWeights: freshWeights.nodeWeights,
      groupWeights: freshWeights.groupWeights,
      suboptimal: isDataAffinityPlacementSuboptimal(
        placementPolicy(freshWeights.nodeWeights),
        healthyReplicas,
        readyNodes,
      ),
      owner: COMPARATIVE_REQUEST_ENRICHMENT_AFFINITY_OWNER_IDS.placement,
    },
    decay: {
      maxAgeMs: FRESHNESS_WINDOW_MS,
      staleNodeWeights: staleWeights.nodeWeights,
      staleGroupWeights: staleWeights.groupWeights,
      owner: COMPARATIVE_REQUEST_ENRICHMENT_AFFINITY_OWNER_IDS.decay,
    },
    hysteresis: {
      ...hysteresisWitness(),
      owner: COMPARATIVE_REQUEST_ENRICHMENT_AFFINITY_OWNER_IDS.hysteresis,
    },
  };
}

const ownerWitnesses = [];
for (let index = 0;
  index < COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length;
  index += 1) {
  arrayPush(
    ownerWitnesses,
    freezeWitness(
      computeComparativeRequestEnrichmentAffinityWitness(
        COMPARATIVE_REQUEST_ENRICHMENT_CELLS[index],
      ),
    ),
  );
}
objectFreeze(ownerWitnesses);

export function buildComparativeRequestEnrichmentAffinityWitness(cell) {
  for (let index = 0;
    index < COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length;
    index += 1) {
    if (cell === COMPARATIVE_REQUEST_ENRICHMENT_CELLS[index]) {
      return ownerWitnesses[index];
    }
  }
  throw new TypeError(INVALID_CELL);
}
