// The full-corpus canary is where the whole corpus and the convergence-probe
// class are OBSERVED after a push: the probes are bounded-time convergence,
// statistical and hardware-relative (decision 6fcb63299), never a gate. The
// change-proof planner leaves the class out by name; this pins the one place
// that runs it, and that the run can never fail the workflow.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {parse} from 'yaml';

const WORKFLOW_PATH = '.github/workflows/full-corpus-canary.yml';
const CORPUS_STEP_NAME = 'Whole behavioural corpus';
const PROBE_STEP_NAME = 'Convergence probes (observed, never gating)';
const PROBE_COMMAND = 'npm run test:convergence-probes';
const ALWAYS = 'always()';
const UTF8 = 'utf8';

function canarySteps() {
  const workflow = parse(fs.readFileSync(path.join(process.cwd(), WORKFLOW_PATH), UTF8));
  const jobs = Object.values(workflow.jobs);
  const steps = jobs.flatMap((job) => job.steps || []);
  return steps;
}

test('the canary observes the convergence-probe class in a non-gating step', () => {
  const steps = canarySteps();
  const names = steps.map((step) => step.name);
  const corpusIndex = names.indexOf(CORPUS_STEP_NAME);
  const probeIndex = names.indexOf(PROBE_STEP_NAME);
  assert.ok(corpusIndex >= 0, 'the corpus step exists');
  assert.ok(probeIndex > corpusIndex, 'the probes run after the corpus, never instead of it');
  const probeStep = steps[probeIndex];
  assert.equal(probeStep.run.trim(), PROBE_COMMAND);
  assert.equal(probeStep['continue-on-error'], true,
    'a red probe never fails the canary: it is observed, not gating');
  assert.equal(String(probeStep.if).trim(), ALWAYS,
    'the probes are observed even when the corpus step was red');
  const corpusStep = steps[corpusIndex];
  assert.equal(corpusStep['continue-on-error'], undefined,
    'the corpus step itself stays a real signal');
});
