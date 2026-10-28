import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {runScenarios} from '../../run.js';
import {computeSourceFingerprint} from '../../../../src/diagnostics/source-fingerprint.js';
import {
  LAGRANGE_SCENARIO_A_FORMATION_REQUIREMENT,
} from '../oltp-scenario-a-lagrange-proof-plan.js';
import {
  buildLagrangeScenarioALiveAdmission,
} from '../oltp-scenario-a-lagrange-live-admission.js';
import {
  run as runVisibility,
} from '../../scenarios/scenario-a-visibility-lagrange.js';
import {
  clearEvents,
  events,
} from '../__fixtures__/scenario-with-prestart.js';

const SCENARIO_PATH = new URL('../../scenarios/scenario-a-visibility-lagrange.js',
  import.meta.url).pathname;
const ADMITTED_SCENARIO_PATH = new URL('../__fixtures__/scenario-with-prestart.js',
  import.meta.url).pathname;
const CONFIG = {size: 1};
const OPTIONS = {output: '/tmp/scenario-a-prestart-admission-report.json', verbose: false};
const SOURCE_FINGERPRINT = await computeSourceFingerprint('src');

async function withAdmissionFile(contents, callback) {
  const previous = process.env.LAGRANGE_SCENARIO_A_ADMISSION_PATH;
  const directory = await mkdtemp(path.join(tmpdir(), 'scenario-a-prestart-'));
  try {
    const file = path.join(directory, 'admission.json');
    await writeFile(file, contents, 'utf8');
    process.env.LAGRANGE_SCENARIO_A_ADMISSION_PATH = file;
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.LAGRANGE_SCENARIO_A_ADMISSION_PATH;
    else process.env.LAGRANGE_SCENARIO_A_ADMISSION_PATH = previous;
    await rm(directory, {recursive: true});
  }
}

function makeAdmission(proofCaseId, srcFingerprint) {
  return buildLagrangeScenarioALiveAdmission({
    proofCaseId,
    formationCertification: {
      ...LAGRANGE_SCENARIO_A_FORMATION_REQUIREMENT,
      status: 'passed',
      coreHeadSha: 'a'.repeat(40),
      srcFingerprint,
      artifactSha256: 'b'.repeat(64),
    },
  });
}

async function assertBeforeCluster(contents, message) {
  return withAdmissionFile(contents, async () => {
    let clusterCreations = 0;
    const result = await runScenarios(CONFIG, [{
      name: 'scenario-a-visibility-lagrange',
      path: SCENARIO_PATH,
    }], {
      ...OPTIONS,
      clusterFactory() {
        clusterCreations += 1;
        throw new Error('unauthorized cluster construction');
      },
    });
    assert.equal(result.hasFailures, true);
    assert.equal(clusterCreations, 0);
    assert.match(result.report.scenarios[0].error, message);
  });
}

test('Scenario A rejects missing admission before cluster construction', async () => {
  const previous = process.env.LAGRANGE_SCENARIO_A_ADMISSION_PATH;
  delete process.env.LAGRANGE_SCENARIO_A_ADMISSION_PATH;
  try {
    let clusterCreations = 0;
    const result = await runScenarios(CONFIG, [{
      name: 'scenario-a-visibility-lagrange',
      path: SCENARIO_PATH,
    }], {
      ...OPTIONS,
      clusterFactory() {
        clusterCreations += 1;
        throw new Error('unauthorized cluster construction');
      },
    });
    assert.equal(result.hasFailures, true);
    assert.equal(clusterCreations, 0);
    assert.match(result.report.scenarios[0].error,
      /requires LAGRANGE_SCENARIO_A_ADMISSION_PATH/u);
  } finally {
    if (previous === undefined) delete process.env.LAGRANGE_SCENARIO_A_ADMISSION_PATH;
    else process.env.LAGRANGE_SCENARIO_A_ADMISSION_PATH = previous;
  }
});

test('Scenario A rejects malformed admission before cluster construction', async () => {
  await assertBeforeCluster('{malformed', /JSON|position|property name/u);
});

test('Scenario A rejects wrong proof case before cluster construction', async () => {
  const wrongCase = makeAdmission('payment', SOURCE_FINGERPRINT);
  await assertBeforeCluster(JSON.stringify(wrongCase), /requires visibility-bound admission/u);
});

test('Scenario A rejects runtime-source mismatch before cluster construction', async () => {
  const wrongFingerprint = SOURCE_FINGERPRINT === 'f'.repeat(16) ? 'e'.repeat(16) :
    'f'.repeat(16);
  const admission = makeAdmission('visibility', wrongFingerprint);
  await assertBeforeCluster(JSON.stringify(admission), /source fingerprint does not match/u);
});

test('Scenario A rejects a forged preStart token before public-PG activity', async () => {
  const admission = makeAdmission('visibility', SOURCE_FINGERPRINT);
  await withAdmissionFile(JSON.stringify(admission), async () => {
    const untouchedCluster = {
      getNodes() {
        throw new Error('cluster must remain untouched');
      },
    };
    await assert.rejects(
      runVisibility(untouchedCluster, {
        admissionSha256: admission.admissionSha256,
        runtimePreflightSha256: 'not-the-token',
      }),
      /runtime changed after pre-start check/u,
    );
  });
});

test('the runner consumes preStart before constructing and starting its cluster', async () => {
  clearEvents();
  const cluster = {
    setScenarioName() {},
    async start() {
      events.push('start');
    },
    async stop() {
      events.push('stop');
    },
    getNodes() {
      return [{id: 'seed'}];
    },
    getLogCollector() {
      return {getBuffer: () => [], writeOutput: async () => {}};
    },
    getLogAnalyzer() {
      return {
        runAnalyticalQueries: async () => ({}),
        analyze: () => ({summary: null}),
        writeAnalysis: async () => {},
      };
    },
  };
  const result = await runScenarios(CONFIG, [{
    name: 'scenario-with-prestart',
    path: ADMITTED_SCENARIO_PATH,
  }], {
    ...OPTIONS,
    clusterFactory() {
      events.push('construct');
      return cluster;
    },
  });
  assert.equal(result.hasFailures, false);
  assert.equal(result.report.scenarios[0].passed, true);
  assert.deepEqual(events.slice(0, 4), ['preStart', 'construct', 'start', 'run']);
});
