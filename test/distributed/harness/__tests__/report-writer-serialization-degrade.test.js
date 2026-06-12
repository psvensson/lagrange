/**
 * CL-026 amendment: the report writer is the gate's classification input —
 * a scenario entry that cannot serialize must degrade to a bounded entry
 * (scenario, passed, error preserved; dropped fields replaced with their
 * measured sizes), never abort the report write into NO_REPORT.
 */

import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ReportWriter} from '../report-writer.js';

const UTF8_ENCODING = 'utf8';
const POISONED_SCENARIO = 'rolling-restart';
const HEALTHY_SCENARIO = 'node-join-under-load';
const POISONED_ERROR = 'Convergence timeout after 120000ms';

describe('report-writer serialization degrade', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'report-writer-degrade-'));
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  it(
    'degrades an unserializable scenario entry instead of losing the report',
    async () => {
      const reportPath = join(tempDir, 'degrade-report.json');
      const writer = new ReportWriter(reportPath);
      const circularDiagnostics = {attempts: []};
      circularDiagnostics.self = circularDiagnostics;
      writer.addResult(POISONED_SCENARIO, {
        passed: false,
        duration: 455000,
        error: POISONED_ERROR,
        details: {diagnostics: circularDiagnostics},
      });
      writer.addResult(HEALTHY_SCENARIO, {
        passed: true,
        duration: 1000,
      });

      const written = await writer.write();
      const persisted = JSON.parse(await readFile(reportPath, UTF8_ENCODING));

      assert.equal(
        persisted.scenarios.length,
        2,
        'both scenarios must survive into the persisted report',
      );
      const poisoned = persisted.scenarios.find(
        (entry) => entry.scenario === POISONED_SCENARIO,
      );
      assert.equal(
        poisoned.error,
        POISONED_ERROR,
        'the degraded entry must preserve WHAT failed',
      );
      assert.equal(poisoned.passed, false);
      assert.ok(
        poisoned.reportWriteDegraded,
        'the degraded entry must record that it was degraded',
      );
      assert.ok(
        Object.keys(poisoned.reportWriteDegraded.droppedFieldSizes).length > 0,
        'dropped fields must be attributed with measured sizes',
      );
      const healthy = persisted.scenarios.find(
        (entry) => entry.scenario === HEALTHY_SCENARIO,
      );
      assert.equal(
        healthy.reportWriteDegraded,
        undefined,
        'serializable sibling entries must keep their full shape',
      );
      assert.equal(
        written.scenarios.length,
        2,
        'the returned report must match what was persisted',
      );
    },
  );

  it(
    'attributes INSIDE unserializable dropped fields and keeps ' +
      'classification + unexpectedNodeExits (CL-030/CL-031)',
    async () => {
      const reportPath = join(tempDir, 'degrade-attribution-report.json');
      const writer = new ReportWriter(reportPath);
      const circularDiagnostics = {
        attempts: [],
        hugeMember: {timeline: 'x'.repeat(9 * 1024 * 1024)},
      };
      circularDiagnostics.self = circularDiagnostics;
      writer.addResult(POISONED_SCENARIO, {
        passed: false,
        duration: 455000,
        error: POISONED_ERROR,
        classification: 'unexpected_node_exit',
        unexpectedNodeExits: [{nodeId: 'seed-1', exitCode: 139}],
        details: {diagnostics: circularDiagnostics},
      });
      await writer.write();
      const persisted = JSON.parse(await readFile(reportPath, UTF8_ENCODING));
      const poisoned = persisted.scenarios[0];
      assert.equal(
        poisoned.classification,
        'unexpected_node_exit',
        'classification must survive degradation (gate input)',
      );
      assert.equal(
        poisoned.unexpectedNodeExits[0].nodeId,
        'seed-1',
        'exit evidence must survive degradation',
      );
      const detailsAttribution =
        poisoned.reportWriteDegraded.droppedFieldSizes.details;
      assert.equal(typeof detailsAttribution, 'object',
        'an unserializable field must descend into member attribution');
      const diagnosticsAttribution =
        detailsAttribution.members.diagnostics;
      assert.equal(typeof diagnosticsAttribution, 'object');
      assert.ok(
        diagnosticsAttribution.members.hugeMember.totalBytes >
          8 * 1024 * 1024,
        'the growing member inside the unserializable field is NAMED ' +
          'with its size (red on attribution revert)',
      );
    },
  );

  it('writes a fully-intact report when nothing is oversized', async () => {
    const reportPath = join(tempDir, 'healthy-report.json');
    const writer = new ReportWriter(reportPath);
    writer.addResult(HEALTHY_SCENARIO, {
      passed: true,
      duration: 1000,
      details: {diagnostics: {fine: true}},
    });
    await writer.write();
    const persisted = JSON.parse(await readFile(reportPath, UTF8_ENCODING));
    assert.equal(persisted.scenarios[0].reportWriteDegraded, undefined);
    assert.equal(persisted.scenarios[0].details.diagnostics.fine, true);
  });
});
