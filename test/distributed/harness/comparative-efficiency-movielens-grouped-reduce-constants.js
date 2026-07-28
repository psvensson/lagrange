export const COMPARATIVE_MOVIELENS_GROUPED_REDUCE_SCENARIO =
  'comparative-efficiency-movielens-grouped-reduce';
export const COMPARATIVE_MOVIELENS_GROUPED_REDUCE_REASON =
  'candidate_capacity_adapter_not_engaged';
export const COMPARATIVE_MOVIELENS_GROUPED_REDUCE_DISPOSITION =
  'non_measuring_public_semantics_only';
export const COMPARATIVE_MOVIELENS_GROUPED_REDUCE_PUBLIC_METHOD = 'POST';
export const COMPARATIVE_MOVIELENS_GROUPED_REDUCE_PUBLIC_PATH =
  '/benchmarks/movielens/grouped-reduce';
export const COMPARATIVE_MOVIELENS_GROUPED_REDUCE_RUNTIME =
  'wasm_component';
export const COMPARATIVE_MOVIELENS_GROUPED_REDUCE_TOP_N = 10;
export const COMPARATIVE_MOVIELENS_GROUPED_REDUCE_AXES = Object.freeze([
  Object.freeze({
    id: 'dataset_size',
    values: Object.freeze(['10000', '100000']),
  }),
  Object.freeze({
    id: 'skew',
    values: Object.freeze(['observed', 'movie_hotspot_80_20']),
  }),
  Object.freeze({
    id: 'topology',
    values: Object.freeze(['single_replica', 'replicated']),
  }),
]);

const DATASET_SIZE_AXIS = 0;
const SKEW_AXIS = 1;
const TOPOLOGY_AXIS = 2;
const REPLICATED = 'replicated';
const REPLICATED_FACTOR = 3;
const arrayPush = Function.call.bind(Array.prototype.push);
const cells = [];
for (let sizeIndex = 0;
  sizeIndex <
    COMPARATIVE_MOVIELENS_GROUPED_REDUCE_AXES[
      DATASET_SIZE_AXIS
    ].values.length;
  sizeIndex += 1) {
  for (let skewIndex = 0;
    skewIndex <
      COMPARATIVE_MOVIELENS_GROUPED_REDUCE_AXES[SKEW_AXIS].values.length;
    skewIndex += 1) {
    for (let topologyIndex = 0;
      topologyIndex <
        COMPARATIVE_MOVIELENS_GROUPED_REDUCE_AXES[
          TOPOLOGY_AXIS
        ].values.length;
      topologyIndex += 1) {
      const topology =
        COMPARATIVE_MOVIELENS_GROUPED_REDUCE_AXES[
          TOPOLOGY_AXIS
        ].values[topologyIndex];
      arrayPush(cells, Object.freeze({
        datasetSize: Number(
          COMPARATIVE_MOVIELENS_GROUPED_REDUCE_AXES[
            DATASET_SIZE_AXIS
          ].values[sizeIndex],
        ),
        replicationFactor: topology === REPLICATED ? REPLICATED_FACTOR : 1,
        skew:
          COMPARATIVE_MOVIELENS_GROUPED_REDUCE_AXES[
            SKEW_AXIS
          ].values[skewIndex],
        topology,
      }));
    }
  }
}

export const COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS =
  Object.freeze(cells);
