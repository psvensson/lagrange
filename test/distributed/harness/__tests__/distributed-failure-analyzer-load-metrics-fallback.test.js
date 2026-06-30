import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const UTF8_ENCODING = 'utf8';
const REPORT_FILENAME = 'run.report.json';
const BUNDLE_FILENAME = 'failure-bundle.json';
const SCENARIO_NAME = 'rolling-restart';
const REASON_NODE_ADMISSION_BLOCKED = 'nodeAdmissionBlocked';
const REASON_RETRYABLE_CONTROL_PLANE_PRESSURE =
  'retryableControlPlanePressure';

describe('distributed failure analyzer load-metrics fallback', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'distributed-analyzer-load-'));
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  it('follows failure-bundle load metrics when report metrics are absent',
    async () => {
      const bundlePath = join(tempDir, BUNDLE_FILENAME);
      const reportPath = join(tempDir, REPORT_FILENAME);
      await writeFile(
        bundlePath,
        JSON.stringify({
          scenario: SCENARIO_NAME,
          summary: {
            rootCauseClass: 'load',
            dominantReason: REASON_NODE_ADMISSION_BLOCKED,
          },
          diagnostics: {
            failure: {
              rootCauseClass: 'load',
              dominantReason: REASON_NODE_ADMISSION_BLOCKED,
              reasonCounts: {
                [REASON_NODE_ADMISSION_BLOCKED]: 639,
              },
            },
          },
          topFailures: {
            loadMetrics: null,
          },
          logs: {
            playbackEventSummary: {
              load: {
                completedAtMs: 30248,
                lastMetrics: {
                  total: 846,
                  success: 846,
                  failed: 0,
                  errors: 0,
                  attemptErrors: 59,
                  opsPerSec: 5.64,
                  targetOperations: 900,
                  dispatchedOperations: 863,
                  undispatchedOperations: 37,
                  waitReasons: {
                    nodeSlotUnavailable: 0,
                    [REASON_NODE_ADMISSION_BLOCKED]: 639,
                    [REASON_RETRYABLE_CONTROL_PLANE_PRESSURE]: 49,
                  },
                  perNode: {},
                },
              },
            },
          },
        }, null, 2),
        UTF8_ENCODING,
      );
      await writeFile(
        reportPath,
        JSON.stringify({
          summary: {total: 1, passed: 0, failed: 1},
          scenarios: [{
            scenario: SCENARIO_NAME,
            passed: false,
            error: 'Admin API query failed on lane default',
            loadMetrics: null,
            failureBundle: {jsonPath: bundlePath},
            details: {
              diagnostics: {
                failure: {
                  rootCauseClass: 'load',
                  dominantReason: 'nodeSlotUnavailable',
                  reasonCounts: {nodeSlotUnavailable: 1},
                },
              },
            },
          }],
        }, null, 2),
        UTF8_ENCODING,
      );

      const {stdout} = await execFileAsync('bash', [
        'scripts/summarize-distributed-failure-report.sh',
        '--report',
        reportPath,
      ]);

      assert.match(stdout, /source=playback/);
      assert.match(stdout, /completeness=playback_completed/);
      assert.match(stdout, /loadEvidenceClass=product_load_lane_pressure/);
      assert.match(stdout, /dominantWaitReason=nodeAdmissionBlocked/);
      assert.match(stdout, /total=846/);
      assert.match(stdout, /nodeAdmissionBlocked: 639/);
      assert.match(stdout, /retryableControlPlanePressure: 49/);
    },
  );
});
