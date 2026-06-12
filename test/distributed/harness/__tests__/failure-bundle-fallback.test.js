import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {writeFailureBundlesForReport} from '../failure-bundle.js';

const UTF8_ENCODING = 'utf8';
const FALLBACK_ARTIFACT_TYPE = 'scenario-failure-bundle-fallback';
const POISONED_SCENARIO_NAME = 'rolling-restart';
const HEALTHY_SCENARIO_NAME = 'node-join-under-load';
const POISONED_SCENARIO_ERROR = 'Published active-node sets disagree';
const HEALTHY_SCENARIO_ERROR = 'load readiness timeout';
const REPORT_FILENAME = 'fallback-report.json';

function buildPoisonedScenarioEntry() {
  const publicationConvergence = {
    publicationEpoch: 7,
    publicationStatus: 'PUBLISHED',
  };
  // A self-reference makes every JSON.stringify of any bundle embedding
  // this object throw — the deterministic stand-in for the production
  // failure mode (RangeError: Invalid string length on long runs).
  publicationConvergence.self = publicationConvergence;
  return {
    scenario: POISONED_SCENARIO_NAME,
    passed: false,
    duration: 100,
    error: POISONED_SCENARIO_ERROR,
    details: {
      diagnostics: {
        controlPlaneDiagnostics: {publicationConvergence},
      },
    },
  };
}

function buildHealthyFailingScenarioEntry() {
  return {
    scenario: HEALTHY_SCENARIO_NAME,
    passed: false,
    duration: 100,
    error: HEALTHY_SCENARIO_ERROR,
    details: {diagnostics: {}},
  };
}

describe('failure-bundle fallback isolation', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'failure-bundle-fallback-'));
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  it(
    'degrades an unserializable scenario bundle to a fallback artifact ' +
    'without losing the report or the sibling scenario bundle',
    async () => {
      const poisonedEntry = buildPoisonedScenarioEntry();
      const healthyEntry = buildHealthyFailingScenarioEntry();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: [poisonedEntry, healthyEntry],
        reportOutputPath: join(tempDir, REPORT_FILENAME),
        outputDir: tempDir,
        reportSummary: {total: 2, passed: 0, failed: 2},
        standardSummary: null,
        benchmarkRegressionGate: null,
        workspaceRoot: tempDir,
      });

      assert.equal(
        scenarioBundles.length,
        2,
        'both failing scenarios must produce a bundle entry',
      );

      const poisonedBundle = scenarioBundles.find(
        (bundle) => bundle.scenario === POISONED_SCENARIO_NAME,
      );
      assert.ok(poisonedBundle, 'poisoned scenario must still be recorded');
      assert.ok(
        poisonedBundle.links.bundleWriteError,
        'fallback links must carry the bundle write error',
      );
      const fallbackJson = JSON.parse(
        await readFile(
          resolve(tempDir, poisonedBundle.links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      assert.equal(fallbackJson.artifactType, FALLBACK_ARTIFACT_TYPE);
      assert.equal(fallbackJson.scenario, POISONED_SCENARIO_NAME);
      assert.equal(
        fallbackJson.scenarioError,
        POISONED_SCENARIO_ERROR,
        'the fallback must preserve WHAT failed in the scenario',
      );
      assert.ok(
        fallbackJson.bundleWriteError.length > 0,
        'the fallback must record why the full bundle was lost',
      );
      assert.ok(
        poisonedEntry.failureBundle,
        'the scenario entry must still reference its (fallback) bundle',
      );

      const healthyBundle = scenarioBundles.find(
        (bundle) => bundle.scenario === HEALTHY_SCENARIO_NAME,
      );
      assert.ok(healthyBundle, 'sibling scenario must keep its bundle');
      assert.ok(
        healthyBundle.links.triageJsonPath,
        'sibling scenario must get the FULL bundle, not the fallback',
      );
      const healthyJson = JSON.parse(
        await readFile(
          resolve(tempDir, healthyBundle.links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      assert.notEqual(
        healthyJson.artifactType,
        FALLBACK_ARTIFACT_TYPE,
        'sibling scenario bundle must be the full artifact',
      );
    },
  );
});
