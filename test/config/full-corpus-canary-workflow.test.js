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
const DECIDE_STEP_NAME = 'Decide whether the corpus is still unproved';
const DECISION_OWNER = 'scripts/checks/canary-corpus-needed.js';
const SCOPE_STEP_NAME = 'Read the gate run\'s proof scope';
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

// The corpus is a fact about an immutable commit, so the canary asks one owner
// whether this sha still owes it, and runs only then. The decision must live
// in the witnessed script, not in workflow prose: a gate that refused before
// writing its scope artifact once cost a full 74-minute re-proof of a corpus
// the push gate had already proved for that exact sha.
test('the canary asks the decision owner and runs the corpus only when it is owed', () => {
  const workflow = parse(fs.readFileSync(path.join(process.cwd(), WORKFLOW_PATH), UTF8));
  const decide = workflow.jobs.decide;
  const steps = decide.steps.map((step) => step.name);
  const decideStep = decide.steps[steps.indexOf(DECIDE_STEP_NAME)];
  assert.ok(decideStep, 'the decision step exists');
  assert.match(decideStep.run, /node scripts\/checks\/canary-corpus-needed\.js/u,
    'the decision comes from its owner, not from grepping an artifact inline');
  assert.match(decideStep.run, /--sha /u);
  assert.match(decideStep.run, /--scope /u);
  assert.match(decideStep.run, /--remote /u,
    'the durable receipt is looked up against the repository remote');
  assert.match(decideStep.run, />> "\$GITHUB_OUTPUT"/u,
    'only the needed= line reaches the step output');
  assert.equal(decide.outputs.needed, '${{ steps.decide.outputs.needed }}');
  // An empty answer - a failed, crashed or timed-out decide job - must leave
  // the corpus owed, exactly as the owner's own fail-open does; a SKIPPED
  // decide (not main, not a dispatch) must still not start it.
  const corpusCondition = String(workflow.jobs.corpus.if);
  assert.match(corpusCondition, /needs\.decide\.outputs\.needed != 'false'/u,
    'only an explicit false skips the corpus');
  assert.match(corpusCondition, /needs\.decide\.result != 'skipped'/u,
    'a skipped decision never starts the corpus');
  assert.match(corpusCondition, /!cancelled\(\)/u,
    'a failed decision reaches the corpus, but a cancelled run does not ' +
    'launch a 300-minute job on a superseded head');
  assert.doesNotMatch(corpusCondition, /(?<!!)always\(\)/u,
    'always() would run even on cancellation');
  assert.match(decideStep.run, /--force/u,
    'a hand dispatch re-proves rather than reusing a receipt');
  // actions/checkout deletes the contents of a destination that is not
  // already a git repository, so the scope artifact must not be downloaded
  // into the workspace before it (verifier round 1): the checkout comes
  // first and the artifact lands under runner.temp.
  const scopeIndex = steps.indexOf(SCOPE_STEP_NAME);
  const checkoutIndex = steps.findIndex((name) => /Checkout/u.test(String(name)));
  assert.ok(checkoutIndex >= 0 && scopeIndex > checkoutIndex,
    'the checkout runs before the artifact download');
  assert.match(String(decide.steps[scopeIndex].with.path), /runner\.temp/u,
    'the artifact lands outside anything the checkout wipes');
  assert.match(decideStep.run, /runner\.temp/u,
    'and the decision reads it from there');
  assert.ok(fs.existsSync(path.join(process.cwd(), DECISION_OWNER)),
    'the owner the workflow names exists');
});
