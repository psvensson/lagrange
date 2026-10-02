#!/usr/bin/env node
import fs from 'node:fs';

import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {
  compareRoutingKeys,
  compareSplitKey,
  resolveSplitTargetPartitionId,
} from '../../src/partition/split-key-comparator.js';

const UTF8 = 'utf8';
const bufferCompare = Buffer.compare.bind(Buffer);
const bufferFrom = Buffer.from.bind(Buffer);
const COMPARATOR_URL = new URL(
  '../../src/partition/split-key-comparator.js',
  import.meta.url,
);
const MERGE_CORE_URL = new URL(
  '../../src/partition/partition-split-merge-manager-core-methods.js',
  import.meta.url,
);
const MERGE_EVALUATION_URL = new URL(
  '../../src/partition/partition-split-merge-manager-evaluation-methods.js',
  import.meta.url,
);
const LEFT = -1;
const EQUAL = 0;
const RIGHT = 1;
const RIGHT_NUMERIC_KEY = 1000;
const STORED_NUMERIC_BOUNDARY = '500.0';
const EXPECTED_NUMBER_STRING_MISMATCH =
  PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch('number', 'string');
const CANONICAL_RESULTS = new Set([LEFT, EQUAL, RIGHT]);
const TEXT_CASES = Object.freeze([
  Object.freeze(['Z', 'a']),
  Object.freeze(['a', 'A']),
  Object.freeze(['z', '~']),
  Object.freeze(['0', 'A']),
  Object.freeze(['\uE000', '\u{10000}']),
]);

const RAW_NUMERIC_SUBTRACTION_PATTERN =
  /function\s+compareNumbers\([^)]*\)[\s\S]*?\bleft\s*-\s*right/u;
const CANONICAL_NUMERIC_PATTERN =
  /function\s+compareNumbers\([^)]*\)[\s\S]*?left\s*===\s*right[\s\S]*?COMPARISON_RESULT\.EQUAL[\s\S]*?left\s*<\s*right[\s\S]*?COMPARISON_RESULT\.LEFT[\s\S]*?COMPARISON_RESULT\.RIGHT/u;
const FALSY_TABLE_ID_NORMALIZATION_PATTERN =
  /partition\.table_id\s*\|\|\s*partition\.tableId\s*\|\|\s*null/u;
const TABLE_ID_OWN_DATA_PATTERN =
  /getPartitionTableId\(partition\)[\s\S]*?readOwnDataValue\(\s*partition,\s*LOCAL_STR_TABLE_ID_SNAKE,?\s*\)[\s\S]*?readOwnDataValue\(\s*partition,\s*LOCAL_STR_TABLE_ID_CAMEL,?\s*\)/u;
const SORT_OWNER_PATTERN =
  /sortEvaluationPartitions\(partitions\)[\s\S]*?compareRoutingKeys\(\s*this\.getPartitionStartKey\(left\),\s*this\.getPartitionStartKey\(right\),\s*\)/u;
const ADJACENCY_OWNER_PATTERN =
  /compareRoutingKeys\(\s*this\.getPartitionEndKey\(leftPartition\),\s*this\.getPartitionStartKey\(rightPartition\),\s*\)\s*!==\s*0/u;

function sign(value) {
  if (value < 0) return LEFT;
  if (value > 0) return RIGHT;
  return EQUAL;
}

function sqliteBinaryTextCompare(left, right) {
  return bufferCompare(bufferFrom(left, UTF8), bufferFrom(right, UTF8));
}

function canonicalNumericProblemCount() {
  let problems = 0;
  const pairs = [
    [Number.MAX_VALUE, -Number.MAX_VALUE, RIGHT],
    [-Number.MAX_VALUE, Number.MAX_VALUE, LEFT],
    [RIGHT_NUMERIC_KEY, 500, RIGHT],
    [500, RIGHT_NUMERIC_KEY, LEFT],
    [-0, 0, EQUAL],
  ];
  for (const [left, right, expected] of pairs) {
    for (const result of [
      compareRoutingKeys(left, right),
      compareSplitKey(left, right),
    ]) {
      if (result !== expected ||
          !Number.isFinite(result) ||
          !CANONICAL_RESULTS.has(result)) {
        problems += 1;
      }
    }
  }
  if (compareRoutingKeys(
    Number.MAX_VALUE,
    '-1.7976931348623157e+308',
  ) !== RIGHT) {
    problems += 1;
  }
  if (compareRoutingKeys(
    '-1.7976931348623157e+308',
    Number.MAX_VALUE,
  ) !== LEFT) {
    problems += 1;
  }
  return problems;
}

function textOrderProblemCount() {
  let problems = 0;
  for (const [left, right] of TEXT_CASES) {
    if (compareRoutingKeys(left, right) !==
        sign(sqliteBinaryTextCompare(left, right))) {
      problems += 1;
    }
  }
  if (compareRoutingKeys(
    RIGHT_NUMERIC_KEY,
    STORED_NUMERIC_BOUNDARY,
  ) !== RIGHT) {
    problems += 1;
  }
  try {
    compareRoutingKeys(RIGHT_NUMERIC_KEY, 'abc');
    problems += 1;
  } catch (error) {
    if (error?.message !== EXPECTED_NUMBER_STRING_MISMATCH) {
      problems += 1;
    }
  }
  return problems;
}

function isolatedObjectIntrinsicProblemCount() {
  let problems = 0;
  const originalDescriptor = Object.getOwnPropertyDescriptor;
  const originalHasOwn = Object.hasOwn;
  try {
    Object.getOwnPropertyDescriptor = () => {
      throw new Error('mutated descriptor lookup');
    };
    if (resolveSplitTargetPartitionId(
      20,
      {splitKey: 10, targetPartitionIds: ['left', 'right']},
    ) !== 'right') {
      problems += 1;
    }
  } finally {
    Object.getOwnPropertyDescriptor = originalDescriptor;
  }

  try {
    Object.hasOwn = () => false;
    if (resolveSplitTargetPartitionId(
      20,
      {splitKey: 10, targetPartitionIds: ['left', 'right']},
    ) !== 'right') {
      problems += 1;
    }
  } finally {
    Object.hasOwn = originalHasOwn;
  }
  return problems;
}

function prototypePollutionProblemCount() {
  let problems = 0;
  const objectSplitKey = Object.getOwnPropertyDescriptor(
    Object.prototype,
    'splitKey',
  );
  const objectTargetIds = Object.getOwnPropertyDescriptor(
    Object.prototype,
    'targetPartitionIds',
  );
  const arrayZero = Object.getOwnPropertyDescriptor(Array.prototype, '0');
  const arrayOne = Object.getOwnPropertyDescriptor(Array.prototype, '1');
  try {
    Reflect.defineProperty(Object.prototype, 'splitKey', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: 10,
    });
    Reflect.defineProperty(Object.prototype, 'targetPartitionIds', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: ['polluted-left', 'polluted-right'],
    });
    try {
      resolveSplitTargetPartitionId(20, {});
      problems += 1;
    } catch (_error) {
      // Inherited metadata is not routing authority.
    }

    Reflect.defineProperty(Array.prototype, '0', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: 'polluted-left',
    });
    Reflect.defineProperty(Array.prototype, '1', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: 'polluted-right',
    });
    const sparseIds = new Array(2);
    if (resolveSplitTargetPartitionId(
      20,
      {splitKey: 10, targetPartitionIds: sparseIds},
    ) !== undefined) {
      problems += 1;
    }
  } finally {
    for (const [prototype, key, descriptor] of [
      [Object.prototype, 'splitKey', objectSplitKey],
      [Object.prototype, 'targetPartitionIds', objectTargetIds],
      [Array.prototype, '0', arrayZero],
      [Array.prototype, '1', arrayOne],
    ]) {
      if (descriptor) {
        Reflect.defineProperty(prototype, key, descriptor);
      } else {
        Reflect.deleteProperty(prototype, key);
      }
    }
  }
  return problems;
}

function structuralProblemCount() {
  const comparatorSource = fs.readFileSync(COMPARATOR_URL, UTF8);
  const mergeCoreSource = fs.readFileSync(MERGE_CORE_URL, UTF8);
  const mergeEvaluationSource = fs.readFileSync(MERGE_EVALUATION_URL, UTF8);
  let problems = 0;
  if (RAW_NUMERIC_SUBTRACTION_PATTERN.test(comparatorSource)) problems += 1;
  if (!CANONICAL_NUMERIC_PATTERN.test(comparatorSource)) problems += 1;
  if (FALSY_TABLE_ID_NORMALIZATION_PATTERN.test(mergeCoreSource)) problems += 1;
  if (!TABLE_ID_OWN_DATA_PATTERN.test(mergeCoreSource)) problems += 1;
  if (!SORT_OWNER_PATTERN.test(mergeCoreSource)) problems += 1;
  if (!ADJACENCY_OWNER_PATTERN.test(mergeEvaluationSource)) problems += 1;
  return problems;
}

const metric =
  canonicalNumericProblemCount() +
  textOrderProblemCount() +
  isolatedObjectIntrinsicProblemCount() +
  prototypePollutionProblemCount() +
  structuralProblemCount();

if (metric !== 0) {
  process.stderr.write(
    'partition-key-ordering-owner-completion-v5: outstanding problems=' +
    String(metric) + '\n',
  );
}
process.stdout.write(String(metric) + '\n');
process.exitCode = metric === 0 ? 0 : 1;
