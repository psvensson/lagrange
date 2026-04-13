// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPgbenchScript,
  parsePgbenchOutput,
} from '../pgbench-runner.js';

const SAMPLE_OUTPUT = [
  'number of transactions actually processed: 1250',
  'number of failed transactions: 3',
  'latency average = 18.332 ms',
  'latency stddev = 3.019 ms',
  'tps = 68.181818 (without initial connection time)',
].join('\n');

describe('pgbench-runner', () => {
  it('parsePgbenchOutput extracts numeric metrics from stdout', () => {
    const parsed = parsePgbenchOutput(SAMPLE_OUTPUT);

    assert.equal(parsed.transactionsProcessed, 1250);
    assert.equal(parsed.failedTransactions, 3);
    assert.equal(parsed.latencyAverageMs, 18.332);
    assert.equal(parsed.latencyStddevMs, 3.019);
    assert.equal(parsed.tps, 68.181818);
  });

  it('parsePgbenchOutput falls back to zeros when fields are missing', () => {
    const parsed = parsePgbenchOutput('no benchmark stats here');

    assert.equal(parsed.transactionsProcessed, 0);
    assert.equal(parsed.failedTransactions, 0);
    assert.equal(parsed.latencyAverageMs, 0);
    assert.equal(parsed.latencyStddevMs, 0);
    assert.equal(parsed.tps, 0);
  });

  it('buildPgbenchScript emits newline-terminated script text', () => {
    const script = buildPgbenchScript([
      '\\set payload random(1, 1000)',
      'INSERT INTO benchmark_events (payload) VALUES (:payload);',
    ]);

    assert.ok(
      script.endsWith('\n'),
      'script should end with newline for predictable shell write',
    );
    assert.ok(
      script.includes('INSERT INTO benchmark_events'),
      'script should contain provided statements',
    );
  });
});
