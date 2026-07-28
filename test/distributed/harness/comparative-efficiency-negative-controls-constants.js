export const COMPARATIVE_NEGATIVE_CONTROL_SCENARIO =
  'comparative-efficiency-negative-controls';
export const COMPARATIVE_NEGATIVE_CONTROL_REASON =
  'candidate_architecture_not_engaged';
export const COMPARATIVE_NEGATIVE_CONTROL_IDS = Object.freeze([
  'small-simple',
  'uniform-access',
  'no-reuse',
  'update-heavy',
  'alternative-favored',
]);
export const COMPARATIVE_NEGATIVE_CONTROL_WORKLOADS = Object.freeze([
  Object.freeze({
    controlId: 'small-simple',
    accessDistribution: 'constant',
    randomSeed: null,
    alternativeSql: 'SELECT 1 AS small_simple',
    oracleName: 'stdout_first_line_equals_1',
    oracleKind: 'first_line_equals',
    oracleExpected: Object.freeze(['1']),
  }),
  Object.freeze({
    controlId: 'uniform-access',
    accessDistribution: 'uniform_pseudorandom',
    randomSeed: 0.4242,
    alternativeSql:
      'SELECT setseed(0.4242); ' +
      'WITH picks AS MATERIALIZED (' +
        'SELECT sample_id, floor(random() * 128 + 1)::integer AS id ' +
        'FROM generate_series(1, 128) AS sample(sample_id)' +
      ') SELECT count(*) FROM picks JOIN control_items USING (id)',
    oracleName: 'uniform_random_128_lookups_complete',
    oracleKind: 'line_equals',
    oracleExpected: Object.freeze(['128']),
  }),
  Object.freeze({
    controlId: 'no-reuse',
    accessDistribution: 'unique_insert',
    randomSeed: null,
    alternativeSql:
      'INSERT INTO control_events (control_id, payload) VALUES ' +
      '(\'no-reuse-live\', 1) RETURNING payload',
    oracleName: 'unique_insert_returns_payload_1',
    oracleKind: 'first_line_equals',
    oracleExpected: Object.freeze(['1']),
  }),
  Object.freeze({
    controlId: 'update-heavy',
    accessDistribution: 'full_range_update',
    randomSeed: null,
    alternativeSql:
      'UPDATE control_items SET version = version + 1 ' +
      'WHERE id BETWEEN 1 AND 128; ' +
      'SELECT sum(version) FROM control_items',
    oracleName: 'all_128_rows_invalidated_once',
    oracleKind: 'line_equals',
    oracleExpected: Object.freeze(['128']),
  }),
  Object.freeze({
    controlId: 'alternative-favored',
    accessDistribution: 'indexed_point_lookup',
    randomSeed: null,
    alternativeSql:
      'SET enable_seqscan = off; ' +
      'EXPLAIN (FORMAT JSON) ' +
      'SELECT payload FROM control_items WHERE id = 64; ' +
      'SELECT payload FROM control_items WHERE id = 64',
    oracleName: 'postgresql_index_scan_returns_64',
    oracleKind: 'contains_text_and_line',
    oracleExpected: Object.freeze(['Index Scan', '64']),
  }),
]);
