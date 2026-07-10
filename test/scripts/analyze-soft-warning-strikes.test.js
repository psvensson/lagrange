import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it, after} from 'node:test';

import {
  analyzeSoftWarningStrikes,
  detectStrikes,
  extractScenarioRuns,
  groupRunsByScenario,
} from '../../scripts/analyze-soft-warning-strikes.js';

const directory = mkdtempSync(path.join(tmpdir(), 'soft-warning-strikes-'));
after(() => rmSync(directory, {recursive: true, force: true}));

function reportFixture({timestamp, scenario, softBreachCodes = [], verificationCodes = []}) {
  return {
    timestamp,
    scenarios: [{
      scenario,
      passed: true,
      invariantBreaches: {
        softBreaches: softBreachCodes.map((code) => ({
          invariantId: code,
          reasonCode: code,
          severity: 'warning',
        })),
      },
      details: {
        verification: {
          softWarnings: verificationCodes.map((code) => ({
            code,
            message: `${code} (soft warning)`,
          })),
        },
      },
    }],
  };
}

function writeReport(name, report) {
  const file = path.join(directory, name);
  writeFileSync(file, JSON.stringify(report, null, 2));
  return file;
}

describe('analyze-soft-warning-strikes', () => {
  it('extracts coded soft warnings from both report locations', () => {
    const runs = extractScenarioRuns(reportFixture({
      timestamp: '2026-07-10T10:00:00.000Z',
      scenario: 'rolling-restart',
      softBreachCodes: ['stale_epoch_row'],
      verificationCodes: ['insufficient_evidence'],
    }), {file: 'a.report.json'});

    assert.equal(runs.length, 1);
    assert.deepEqual([...runs[0].codes].sort(),
      ['insufficient_evidence', 'stale_epoch_row']);
  });

  it('flags a code present in the two most recent consecutive runs', () => {
    const runs = [
      {scenario: 's', timestamp: '2026-07-01T00:00:00Z',
        codes: new Set(['flake_a']), file: 'r1'},
      {scenario: 's', timestamp: '2026-07-02T00:00:00Z',
        codes: new Set(['flake_a', 'flake_b']), file: 'r2'},
      {scenario: 's', timestamp: '2026-07-03T00:00:00Z',
        codes: new Set(['flake_a']), file: 'r3'},
    ];
    const strikes = detectStrikes(groupRunsByScenario(runs));
    assert.deepEqual(strikes.map((s) => s.code), ['flake_a'],
      'flake_b appeared once in the window and does not strike');
    assert.equal(strikes[0].scenario, 's');
    assert.deepEqual(strikes[0].runs.map((r) => r.timestamp),
      ['2026-07-02T00:00:00Z', '2026-07-03T00:00:00Z']);
  });

  it('does not strike when the code skips a run or only one run exists', () => {
    const skipped = detectStrikes(groupRunsByScenario([
      {scenario: 's', timestamp: '2026-07-01T00:00:00Z',
        codes: new Set(['flake_a']), file: 'r1'},
      {scenario: 's', timestamp: '2026-07-02T00:00:00Z',
        codes: new Set([]), file: 'r2'},
      {scenario: 's', timestamp: '2026-07-03T00:00:00Z',
        codes: new Set(['flake_a']), file: 'r3'},
    ]));
    assert.deepEqual(skipped, [], 'non-consecutive appearances do not strike');

    const single = detectStrikes(groupRunsByScenario([
      {scenario: 's', timestamp: '2026-07-01T00:00:00Z',
        codes: new Set(['flake_a']), file: 'r1'},
    ]));
    assert.deepEqual(single, [], 'a single run can never strike');
  });

  it('scopes strikes per scenario id', () => {
    const strikes = detectStrikes(groupRunsByScenario([
      {scenario: 'a', timestamp: '2026-07-01T00:00:00Z',
        codes: new Set(['flake']), file: 'r1'},
      {scenario: 'b', timestamp: '2026-07-02T00:00:00Z',
        codes: new Set(['flake']), file: 'r2'},
    ]));
    assert.deepEqual(strikes, [],
      'the same code across DIFFERENT scenarios is not a strike');
  });

  it('dedupes -latest copies against timestamped originals', () => {
    const runs = [
      {scenario: 's', timestamp: '2026-07-01T00:00:00Z',
        codes: new Set(['flake']), file: 'r1'},
      {scenario: 's', timestamp: '2026-07-02T00:00:00Z',
        codes: new Set(['flake']), file: 's-2026-07-02.report.json'},
      {scenario: 's', timestamp: '2026-07-02T00:00:00Z',
        codes: new Set(['flake']), file: 's-latest.report.json'},
    ];
    const grouped = groupRunsByScenario(runs);
    assert.equal(grouped.get('s').length, 2,
      'the latest copy collapses into its timestamped original');
  });

  it('end-to-end over report files exits with strikes and honors --scenario', () => {
    const files = [
      writeReport('s-1.report.json', reportFixture({
        timestamp: '2026-07-09T00:00:00.000Z',
        scenario: 'rolling-restart',
        verificationCodes: ['insufficient_evidence'],
      })),
      writeReport('s-2.report.json', reportFixture({
        timestamp: '2026-07-10T00:00:00.000Z',
        scenario: 'rolling-restart',
        verificationCodes: ['insufficient_evidence'],
      })),
    ];
    const result = analyzeSoftWarningStrikes(files);
    assert.equal(result.strikes.length, 1);
    assert.equal(result.strikes[0].code, 'insufficient_evidence');
    assert.equal(result.strikes[0].scenario, 'rolling-restart');

    const other = analyzeSoftWarningStrikes(files, {scenario: 'other'});
    assert.deepEqual(other.strikes, []);
  });
});
