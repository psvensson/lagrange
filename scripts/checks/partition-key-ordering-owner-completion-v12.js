#!/usr/bin/env node
import fs from 'node:fs';

import {
  routeSplitSnapshotBatch,
} from '../../src/partition/partition-split-routing.js';

const ROUTING_URL = new URL(
  '../../src/partition/partition-split-routing.js',
  import.meta.url,
);
const ARRAY_INDEX = '0';
const PRIMARY_KEY_COLUMN = 'id';
const LEFT_PARTITION_ID = 'left';
const RIGHT_PARTITION_ID = 'right';
const TABLE_NAME = 'snapshot_rows';
const QUESTION_MARK_SQL =
  'INSERT OR REPLACE INTO snapshot_rows (id) VALUES (?)';
const APPEND_CALL_PATTERN = /(?:\barrayPush\s*\(|\.push\s*\()/gu;
const DEFINE_CAPTURE_PATTERN =
  /const\s+objectDefineProperty\s*=\s*Object\.defineProperty\s*;/u;
const APPEND_OWNER_PATTERN =
  /function\s+appendOwnArrayValue\([\s\S]*?objectDefineProperty\(\s*array,\s*array\.length,/u;

function routeFunctionSource(source) {
  const start = source.indexOf('export async function routeSplitSnapshotBatch');
  const end = source.indexOf(
    'function resolveSplitSnapshotBatchRowLimitFromColumnCount',
    start,
  );
  return start >= 0 && end > start ? source.slice(start, end) : '';
}

async function behavioralProblemCount() {
  let problems = 0;
  let inheritedSetterCalls = 0;
  let dispatch = null;

  const rows = [{id: 'a'}];
  const columns = ['id'];
  const metadata = {
    primaryKeyColumn: PRIMARY_KEY_COLUMN,
    splitKey: 'm',
    targetPartitionIds: [LEFT_PARTITION_ID, RIGHT_PARTITION_ID],
  };
  const options = {
    tableName: TABLE_NAME,
    queryExecutor: {
      async executeOnPartition(partitionId, sql, params) {
        dispatch = {partitionId, sql, params};
        return {success: true};
      },
    },
  };

  const priorIndexDescriptor =
    Object.getOwnPropertyDescriptor(Array.prototype, ARRAY_INDEX);
  try {
    Reflect.defineProperty(Array.prototype, ARRAY_INDEX, {
      configurable: true,
      enumerable: false,
      set() {
        inheritedSetterCalls += 1;
      },
    });

    await routeSplitSnapshotBatch(rows, columns, metadata, options);
  } catch (_error) {
    problems += 1;
  } finally {
    if (priorIndexDescriptor) {
      Reflect.defineProperty(
        Array.prototype,
        ARRAY_INDEX,
        priorIndexDescriptor,
      );
    } else {
      Reflect.deleteProperty(Array.prototype, ARRAY_INDEX);
    }
  }

  if (inheritedSetterCalls !== 0) problems += 1;
  if (dispatch?.partitionId !== LEFT_PARTITION_ID) problems += 1;
  if (dispatch?.sql !== QUESTION_MARK_SQL) problems += 1;
  if (!Array.isArray(dispatch?.params) ||
      dispatch.params.length !== 1 ||
      dispatch.params[0] !== 'a') {
    problems += 1;
  }

  const OriginalDefineProperty = Object.defineProperty;
  try {
    Object.defineProperty = () => {
      throw new Error('mutated Object.defineProperty');
    };
    dispatch = null;
    await routeSplitSnapshotBatch(rows, columns, metadata, options);
    if (dispatch?.partitionId !== LEFT_PARTITION_ID ||
        dispatch?.params?.[0] !== 'a') {
      problems += 1;
    }
  } catch (_error) {
    problems += 1;
  } finally {
    Object.defineProperty = OriginalDefineProperty;
  }

  return problems;
}

function structuralProblemCount() {
  const source = fs.readFileSync(ROUTING_URL, 'utf8');
  const routeSource = routeFunctionSource(source);
  let problems = 0;

  if (!routeSource) problems += 1;
  if (!DEFINE_CAPTURE_PATTERN.test(source)) problems += 1;
  if (!APPEND_OWNER_PATTERN.test(source)) problems += 1;
  if (APPEND_CALL_PATTERN.test(routeSource)) problems += 1;

  return problems;
}

const metric = await behavioralProblemCount() + structuralProblemCount();
if (metric !== 0) {
  process.stderr.write(
    'partition-key-ordering-owner-completion-v12: outstanding problems=' +
    String(metric) + '\n',
  );
}
process.stdout.write(String(metric) + '\n');
process.exitCode = metric === 0 ? 0 : 1;
