#!/usr/bin/env node
import fs from 'node:fs';
import {
  routeSplitSnapshotBatch,
  resolveSplitSnapshotBatchRowLimit,
} from '../../src/partition/partition-split-routing.js';

const MAX_BIND_VARIABLES = 32_766;
const MAX_ROUTE_ROWS = 64;
const TABLE_NAME = 'users';
const LEFT_ID = 'users-left';
const RIGHT_ID = 'users-right';
const ROUTING_SOURCE = new URL(
  '../../src/partition/partition-split-routing.js',
  import.meta.url,
);
const SERVICE_SHARED_SOURCE = new URL(
  '../../src/partition/partition-service-shared.js',
  import.meta.url,
);
const PARTITION_CONSTANTS_SOURCE = new URL(
  '../../src/partition/partition-constants.js',
  import.meta.url,
);
const PARTITION_CONSTANTS_SOURCE = new URL(
  '../../src/partition/partition-constants.js',
  import.meta.url,
);

function metadata() {
  return {
    primaryKeyColumn: 'id',
    splitKey: 'm',
    targetPartitionIds: [LEFT_ID, RIGHT_ID],
  };
}

async function mapConstructorProblemCount() {
  const OriginalMap = globalThis.Map;
  const dispatched = [];
  class PoisonMap extends OriginalMap {
    constructor() {
      super();
      OriginalMap.prototype.set.call(this, LEFT_ID, [{id: 'poison'}]);
    }
  }
  try {
    globalThis.Map = PoisonMap;
    await routeSplitSnapshotBatch(
      [{id: 'a'}],
      ['id'],
      metadata(),
      {
        tableName: TABLE_NAME,
        queryExecutor: {
          async executeOnPartition(partitionId, _sql, params) {
            dispatched.push({partitionId, params});
            return {success: true};
          },
        },
      },
    );
  } catch (_error) {
    return 1;
  } finally {
    globalThis.Map = OriginalMap;
  }
  return dispatched.length === 1 &&
    dispatched[0].partitionId === LEFT_ID &&
    dispatched[0].params.length === 1 &&
    dispatched[0].params[0] === 'a' ?
    0 :
    1;
}

async function dimensionProblemCount() {
  let problems = 0;
  const dispatch = async () => ({success: true});
  const tooManyColumns = Array.from(
    {length: MAX_BIND_VARIABLES + 1},
    (_value, index) => `column_${index}`,
  );
  const tooManyRows = Array.from(
    {length: MAX_ROUTE_ROWS + 1},
    (_value, index) => ({id: `a_${index}`}),
  );

  for (const [rows, columns] of [
    [[{id: 'a'}], []],
    [[{id: 'a'}], tooManyColumns],
    [tooManyRows, ['id']],
  ]) {
    try {
      await routeSplitSnapshotBatch(
        rows,
        columns,
        metadata(),
        {tableName: TABLE_NAME, queryExecutor:{executeOnPartition:dispatch}},
      );
      problems += 1;
    } catch {
      // Expected fail-closed boundary.
    }
  }

  try {
    resolveSplitSnapshotBatchRowLimit([], 1);
    problems += 1;
  } catch {
    // Empty column set must fail closed.
  }
  try {
    resolveSplitSnapshotBatchRowLimit(tooManyColumns, 1);
    problems += 1;
  } catch {
    // Over-wide column set must fail closed.
  }

  const maxRows = resolveSplitSnapshotBatchRowLimit(
    ['id'],
    MAX_ROUTE_ROWS,
  );
  if (maxRows !== MAX_ROUTE_ROWS) problems += 1;
  if (resolveSplitSnapshotBatchRowLimit(
    Array.from({length: 512}, (_value, index) => `c_${index}`),
    MAX_ROUTE_ROWS,
  ) !== 63) problems += 1;
  return problems;
}

function ownerProblemCount() {
  const routing = fs.readFileSync(ROUTING_SOURCE, 'utf8');
  const shared = fs.readFileSync(SERVICE_SHARED_SOURCE, 'utf8');
  const constants = fs.readFileSync(PARTITION_CONSTANTS_SOURCE, 'utf8');
  let problems = 0;

  if (!constants.includes(
    'const PARTITION_SPLIT_SNAPSHOT_LIMIT = Object.freeze({',
  ) ||
      !constants.includes('MAX_BIND_VARIABLES: 32_766,') ||
      !constants.includes('MAX_ROWS_PER_CALL: 64,') ||
      !constants.includes('PARTITION_SPLIT_SNAPSHOT_LIMIT,')) {
    problems += 1;
  }

  if (!routing.includes('PARTITION_SPLIT_SNAPSHOT_LIMIT') ||
      !routing.includes(
        'PARTITION_SPLIT_SNAPSHOT_LIMIT.MAX_BIND_VARIABLES',
      ) ||
      !routing.includes(
        'PARTITION_SPLIT_SNAPSHOT_LIMIT.MAX_ROWS_PER_CALL',
      )) {
    problems += 1;
  }

  if (!shared.includes('PARTITION_SPLIT_SNAPSHOT_LIMIT') ||
      !shared.includes(
        'PARTITION_SPLIT_SNAPSHOT_LIMIT.MAX_ROWS_PER_CALL',
      )) {
    problems += 1;
  }

  if (/SPLIT_SNAPSHOT_MAX_BIND_VARIABLES\s*=\s*32_766\s*;/u.test(routing) ||
      /SPLIT_SNAPSHOT_MAX_ROWS_PER_CALL\s*=\s*64\s*;/u.test(routing) ||
      /SPLIT_SNAPSHOT_BACKFILL_YIELD_EVERY_ROWS\s*=\s*64\s*;/u.test(shared)) {
    problems += 1;
  }

  return problems;
}

const metric =
  await mapConstructorProblemCount() +
  await dimensionProblemCount() +
  ownerProblemCount();

if (metric !== 0) {
  process.stderr.write(
    'partition-key-ordering-owner-completion-v11: outstanding problems=' +
    String(metric) + '\n',
  );
}
process.stdout.write(String(metric) + '\n');
process.exitCode = metric === 0 ? 0 : 1;
