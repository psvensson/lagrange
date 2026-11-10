import assert from 'node:assert/strict';
import {test} from 'node:test';
import {workerSetupScript} from '../../scripts/lab/probe.js';

const TOOLCHAIN = 'Install gate CLI tools';
const DATASET = 'Fetch MovieLens dataset (digest-pinned)';
const INPUT = {nodeMinimum: '22.12.0', repoUrl: 'https://example.invalid/lagrange.git'};
const DATASET_STEP = {name: DATASET, run: 'echo dataset'};

function workflowWith(step) {
  return {env: {WORKFLOW_ONLY: 'workflow'}, jobs: {
    first: {env: {JOB_ONLY: 'job'}, steps: [step, DATASET_STEP]},
    second: {steps: [{name: TOOLCHAIN, run: 'echo later'}]},
  }};
}

test('worker setup takes the first runnable matching step and trims only its end', () => {
  const workflow = {jobs: {
    absent: null,
    noSteps: {},
    first: {steps: [null, {name: TOOLCHAIN, run: 17},
      {name: TOOLCHAIN, run: '  echo first  \n\n'}, DATASET_STEP]},
    second: {steps: [{name: TOOLCHAIN, run: 'echo later'}]},
  }};
  const script = workerSetupScript({...INPUT, workflow});
  assert.ok(script.includes('(\n  echo first\n)'));
  assert.equal(script.includes('echo later'), false);
});

test('the first matching step refuses in key, text, workflow, then job-variable order', () => {
  const step = {'name': TOOLCHAIN, 'env': {}, 'shell': 'sh', 'working-directory': 'elsewhere',
    'run': 'echo ${{ unsupported }} $WORKFLOW_ONLY $JOB_ONLY'};
  const workflow = workflowWith(step);
  const rejected = (reason) => assert.throws(() => workerSetupScript({...INPUT, workflow}),
    {name: 'Error', message: `a worker cannot reproduce the canary step "${TOOLCHAIN}" uses ${reason}`});
  rejected('env');
  delete step.env;
  rejected('shell');
  delete step.shell;
  rejected('working-directory');
  delete step['working-directory'];
  rejected('${{');
  step.run = 'echo $WORKFLOW_ONLY $JOB_ONLY';
  rejected('WORKFLOW_ONLY');
  delete workflow.env;
  rejected('JOB_ONLY');
});
