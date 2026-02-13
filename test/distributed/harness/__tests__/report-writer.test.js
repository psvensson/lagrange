import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, rm, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {
  ReportWriter,
  buildScenarioEntry,
  computeSummary,
  JSON_INDENT,
} from '../report-writer.js';

const JSON_INDENT_EXPECTED = 2;

describe('ReportWriter', () => {
  let tempDir;
  let outputPath;

  beforeEach(() => {
    tempDir = join(tmpdir(), `report-writer-test-${randomUUID()}`);
    outputPath = join(tempDir, 'report.json');
  });

  afterEach(async () => {
    try {
      await rm(tempDir, {recursive: true, force: true});
    } catch (_e) {
      // best-effort cleanup
    }
  });

  describe('addResult', () => {
    it('accumulates scenario results', () => {
      const writer = new ReportWriter(outputPath);
      writer.addResult('scenario-a', {passed: true, duration: 1000});
      writer.addResult('scenario-b', {passed: false, duration: 2000});
      assert.equal(writer.scenarios.length, 2);
      assert.equal(writer.scenarios[0].scenario, 'scenario-a');
      assert.equal(writer.scenarios[1].scenario, 'scenario-b');
    });

    it('includes all required per-scenario fields', () => {
      const writer = new ReportWriter(outputPath);
      writer.addResult('test-scenario', {
        passed: true,
        duration: 5000,
        startedAt: '2024-01-15T10:30:00Z',
        convergenceTiming: {
          settledAfterMs: 8500,
          leaderChanges: 4,
          maxOverTargetMs: 1200,
        },
        error: null,
        stackTrace: null,
      });

      const entry = writer.scenarios[0];
      assert.equal(entry.scenario, 'test-scenario');
      assert.equal(entry.passed, true);
      assert.equal(entry.duration, 5000);
      assert.equal(entry.startedAt, '2024-01-15T10:30:00Z');
      assert.deepEqual(entry.convergenceTiming, {
        settledAfterMs: 8500,
        leaderChanges: 4,
        maxOverTargetMs: 1200,
      });
      assert.equal(entry.error, null);
      assert.equal(entry.stackTrace, null);
    });

    it('includes load metrics with latency and throughput', () => {
      const writer = new ReportWriter(outputPath);
      writer.addResult('load-scenario', {
        passed: true,
        duration: 30000,
        loadMetrics: {
          total: 5000,
          success: 4998,
          failed: 2,
          errors: 0,
          latency: {p50: 12, p95: 45, p99: 120},
          opsPerSec: 166.5,
        },
      });

      const entry = writer.scenarios[0];
      assert.deepEqual(entry.loadMetrics, {
        total: 5000,
        success: 4998,
        failed: 2,
        errors: 0,
        latency: {p50: 12, p95: 45, p99: 120},
        opsPerSec: 166.5,
      });
    });

    it('sets loadMetrics to null when not provided', () => {
      const writer = new ReportWriter(outputPath);
      writer.addResult('no-load', {passed: true, duration: 1000});
      assert.equal(writer.scenarios[0].loadMetrics, null);
    });

    it('captures error and stackTrace for failed scenarios', () => {
      const writer = new ReportWriter(outputPath);
      writer.addResult('failing', {
        passed: false,
        duration: 500,
        error: 'Convergence timeout',
        stackTrace: 'Error: Convergence timeout\n    at ...',
      });

      const entry = writer.scenarios[0];
      assert.equal(entry.passed, false);
      assert.equal(entry.error, 'Convergence timeout');
      assert.ok(entry.stackTrace.includes('Convergence timeout'));
    });
  });

  describe('write', () => {
    it('produces valid JSON with timestamp, summary, and scenarios',
      async () => {
        const writer = new ReportWriter(outputPath);
        writer.addResult('s1', {passed: true, duration: 1000});
        writer.addResult('s2', {passed: false, duration: 2000});

        await writer.write();

        const content = await readFile(outputPath, 'utf8');
        const report = JSON.parse(content);

        assert.ok(report.timestamp);
        assert.ok(report.summary);
        assert.ok(Array.isArray(report.scenarios));
        assert.equal(report.scenarios.length, 2);
      });

    it('computes correct summary totals', async () => {
      const writer = new ReportWriter(outputPath);
      writer.addResult('pass-1', {passed: true, duration: 1000});
      writer.addResult('pass-2', {passed: true, duration: 2000});
      writer.addResult('fail-1', {passed: false, duration: 500});

      await writer.write();

      const content = await readFile(outputPath, 'utf8');
      const report = JSON.parse(content);

      assert.equal(report.summary.total, 3);
      assert.equal(report.summary.passed, 2);
      assert.equal(report.summary.failed, 1);
      assert.equal(report.summary.duration, 3500);
    });

    it('creates parent directories if they do not exist', async () => {
      const nestedPath = join(tempDir, 'a', 'b', 'report.json');
      const writer = new ReportWriter(nestedPath);
      writer.addResult('s1', {passed: true, duration: 100});

      await writer.write();

      const info = await stat(nestedPath);
      assert.ok(info.isFile());
    });

    it('writes empty scenarios array when no results added',
      async () => {
        const writer = new ReportWriter(outputPath);
        await writer.write();

        const content = await readFile(outputPath, 'utf8');
        const report = JSON.parse(content);

        assert.equal(report.summary.total, 0);
        assert.equal(report.summary.passed, 0);
        assert.equal(report.summary.failed, 0);
        assert.equal(report.summary.duration, 0);
        assert.deepEqual(report.scenarios, []);
      });

    it('uses correct JSON indentation', async () => {
      const writer = new ReportWriter(outputPath);
      writer.addResult('s1', {passed: true, duration: 100});
      await writer.write();

      const content = await readFile(outputPath, 'utf8');
      const expected = JSON.stringify(
        JSON.parse(content), null, JSON_INDENT_EXPECTED,
      );
      assert.equal(content, expected);
    });
  });

  describe('buildScenarioEntry', () => {
    it('defaults missing fields to null or zero', () => {
      const entry = buildScenarioEntry('minimal', {});
      assert.equal(entry.scenario, 'minimal');
      assert.equal(entry.passed, false);
      assert.equal(entry.duration, 0);
      assert.equal(entry.startedAt, null);
      assert.equal(entry.convergenceTiming, null);
      assert.equal(entry.error, null);
      assert.equal(entry.stackTrace, null);
      assert.equal(entry.loadMetrics, null);
    });
  });

  describe('computeSummary', () => {
    it('computes correct counts from scenario entries', () => {
      const scenarios = [
        {passed: true, duration: 100},
        {passed: true, duration: 200},
        {passed: false, duration: 50},
      ];
      const summary = computeSummary(scenarios);
      assert.equal(summary.total, 3);
      assert.equal(summary.passed, 2);
      assert.equal(summary.failed, 1);
      assert.equal(summary.duration, 350);
    });

    it('handles empty scenarios array', () => {
      const summary = computeSummary([]);
      assert.equal(summary.total, 0);
      assert.equal(summary.passed, 0);
      assert.equal(summary.failed, 0);
      assert.equal(summary.duration, 0);
    });
  });

  describe('JSON_INDENT constant', () => {
    it('equals 2', () => {
      assert.equal(JSON_INDENT, JSON_INDENT_EXPECTED);
    });
  });
});
