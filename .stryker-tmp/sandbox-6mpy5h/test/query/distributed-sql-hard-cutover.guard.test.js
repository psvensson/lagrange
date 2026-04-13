// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';

const QUERY_EXECUTOR_PATH = path.resolve(
  process.cwd(),
  'src/query/query-executor.js',
);
const SQL_QUERY_ENGINE_PATH = path.resolve(
  process.cwd(),
  'src/query/sql-query-engine.js',
);

test('distributed SQL hard cutover guard - legacy fail-open toggle is removed',
  async (t) => {
    const queryExecutorSource = fs.readFileSync(QUERY_EXECUTOR_PATH, 'utf8');
    const sqlEngineSource = fs.readFileSync(SQL_QUERY_ENGINE_PATH, 'utf8');

    t.notMatch(queryExecutorSource, /\bfailOpen\b/);
    t.notMatch(sqlEngineSource, /\bfailOpen\b/);
  });

test('distributed SQL hard cutover guard - ad-hoc join partition injection is removed',
  async (t) => {
    const queryExecutorSource = fs.readFileSync(QUERY_EXECUTOR_PATH, 'utf8');
    const sqlEngineSource = fs.readFileSync(SQL_QUERY_ENGINE_PATH, 'utf8');

    t.notMatch(queryExecutorSource, /options\.joinPartitions/);
    t.notMatch(sqlEngineSource, /joinPartitions\s*:/);
  });
