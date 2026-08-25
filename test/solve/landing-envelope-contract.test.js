import tap from 'tap';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {
  generatedDependencyReceipt,
} from '../../scripts/solve/generated-dependencies.js';
import {
  landingRequirementsLintProblems,
  landingRequirementsReceipt,
} from '../../scripts/solve/landing-requirements.js';
import {loadVerifierVerdict} from '../../scripts/solve/verifier-verdict.js';

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function git(root, args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
}

function generatedFixture() {
  const root = tmp('generated-dependency-');
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
  fs.mkdirSync(path.join(root, 'test', 'shards'), {recursive: true});
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(root, 'test', 'example.test.js'), 'before\n');
  const generators = [
    ['generate-test-primary-classes.js', 'primary-classes.json'],
    ['generate-test-resource-classes.js', 'resource-classes.json'],
    ['generate-test-subsystem-classes.js', 'subsystem-classes.json'],
  ];
  for (const [script, output] of generators) {
    fs.writeFileSync(path.join(root, 'scripts', script), [
      'import fs from \'node:fs\';',
      'const value = fs.readFileSync(\'test/example.test.js\', \'utf8\').trim();',
      `fs.writeFileSync('test/shards/${output}', value + '\\n');`,
      '',
    ].join('\n'));
    execFileSync(process.execPath, [path.join(root, 'scripts', script)], {cwd: root});
  }
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  return {root, generators};
}

tap.test('generated dependencies are checked in ordered exact-candidate isolation', (t) => {
  const {root, generators} = generatedFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const baseCommit = git(root, ['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(root, 'test', 'example.test.js'), 'after\n');
  for (const [script] of generators) {
    execFileSync(process.execPath, [path.join(root, 'scripts', script)], {cwd: root});
  }
  const paths = ['test/example.test.js', 'test/shards/primary-classes.json',
    'test/shards/resource-classes.json', 'test/shards/subsystem-classes.json'];
  const content = execFileSync('git', [
    'diff', '--binary', '--full-index', '--no-ext-diff', baseCommit, '--', ...paths,
  ], {cwd: root, encoding: 'utf8'});
  const receipt = generatedDependencyReceipt(root, {
    baseCommit, content, paths, sourcePaths: paths,
  });
  t.equal(receipt.entries.length, 1);
  t.same(receipt.entries[0].outputs.map((entry) => entry.path), paths.slice(1));
  t.same(receipt.entries[0].steps.map((entry) => entry.output), paths.slice(1),
    'primary, resource, subsystem ordering is part of the receipt');

  const staleContent = execFileSync('git', [
    'diff', '--binary', '--full-index', '--no-ext-diff', baseCommit,
    '--', 'test/example.test.js',
  ], {cwd: root, encoding: 'utf8'});
  t.throws(() => generatedDependencyReceipt(root, {
    baseCommit, content: staleContent, paths: ['test/example.test.js'],
    sourcePaths: ['test/example.test.js'],
  }), /generated dependency is stale.*primary-classes\.json/iu);

  const filterDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'filter');
  const iteratorDescriptor = Object.getOwnPropertyDescriptor(
    Array.prototype, Symbol.iterator);
  const pushDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'push');
  const someDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'some');
  const testDescriptor = Object.getOwnPropertyDescriptor(RegExp.prototype, 'test');
  Reflect.defineProperty(Array.prototype, 'filter', {
    configurable: true, value: () => [], writable: true,
  });
  Reflect.defineProperty(Array.prototype, 'some', {
    configurable: true, value: () => false, writable: true,
  });
  Reflect.defineProperty(RegExp.prototype, 'test', {
    configurable: true, value: () => false, writable: true,
  });
  Reflect.defineProperty(Array.prototype, Symbol.iterator, {
    configurable: true,
    value() {
      if (this[0]?.id === 'test-classification-manifests') {
        return {next: () => ({done: true})};
      }
      return Reflect.apply(iteratorDescriptor.value, this, []);
    },
    writable: true,
  });
  Reflect.defineProperty(Array.prototype, 'push', {
    configurable: true,
    value(...items) {
      const item = items[0];
      if (item?.id === 'test-classification-manifests' || item?.sha256) {
        return this.length;
      }
      return Reflect.apply(pushDescriptor.value, this, items);
    },
    writable: true,
  });
  let adversarialReceipt;
  try {
    adversarialReceipt = generatedDependencyReceipt(root, {
      baseCommit, content, paths, sourcePaths: paths,
    });
  } finally {
    Reflect.defineProperty(Array.prototype, 'filter', filterDescriptor);
    Reflect.defineProperty(Array.prototype, Symbol.iterator, iteratorDescriptor);
    Reflect.defineProperty(Array.prototype, 'push', pushDescriptor);
    Reflect.defineProperty(Array.prototype, 'some', someDescriptor);
    Reflect.defineProperty(RegExp.prototype, 'test', testDescriptor);
  }
  t.equal(adversarialReceipt.entries.length, 1,
    'post-import prototype mutation cannot suppress a generated dependency');
  t.end();
});

tap.test('sealed landing evidence declares identity before it exists and binds bytes at review',
  (t) => {
    const root = tmp('landing-requirement-');
    t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
    const quest = {landingRequirements: {
      schemaVersion: 1,
      reviewReady: [{id: 'live-ab', kind: 'artifact', path: 'live-ab.json'}],
      landReady: {independentVerification: true},
    }};
    t.throws(() => landingRequirementsReceipt(root, quest),
      /required evidence is missing/iu,
      'the sealed Quest need not predict a future artifact hash');
    fs.writeFileSync(path.join(root, 'live-ab.json'), '{"rounds":2}\n');
    const receipt = landingRequirementsReceipt(root, quest).reviewReady[0];
    const sha256 = crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(root, 'live-ab.json'))).digest('hex');
    t.equal(receipt.sha256, `sha256:${sha256}`);
    t.equal(receipt.size > 0, true);

    const trimDescriptor = Object.getOwnPropertyDescriptor(String.prototype, 'trim');
    Reflect.defineProperty(String.prototype, 'trim', {
      configurable: true, value: () => 'accepted', writable: true,
    });
    let trimPollutionError = null;
    try {
      landingRequirementsReceipt(root, {landingRequirements: {
        schemaVersion: 1,
        reviewReady: [{id: '   ', kind: 'artifact', path: 'live-ab.json'}],
        landReady: {independentVerification: true},
      }});
    } catch (error) {
      trimPollutionError = error;
    } finally {
      Reflect.defineProperty(String.prototype, 'trim', trimDescriptor);
    }
    t.match(trimPollutionError?.message, /reviewReady entries require/iu,
      'post-import trim mutation cannot seal a whitespace-only evidence id');

    const iteratorDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype, Symbol.iterator);
    Reflect.defineProperty(Array.prototype, Symbol.iterator, {
      configurable: true,
      value() {
        if (this[0]?.id === '   ') return {next: () => ({done: true})};
        return Reflect.apply(iteratorDescriptor.value, this, []);
      },
      writable: true,
    });
    let lintProblems;
    try {
      lintProblems = landingRequirementsLintProblems({
        schemaVersion: 1,
        reviewReady: [{id: '   ', kind: 'artifact', path: 'live-ab.json'}],
        landReady: {independentVerification: true},
      });
    } finally {
      Reflect.defineProperty(Array.prototype, Symbol.iterator, iteratorDescriptor);
    }
    t.equal(lintProblems.length, 1,
      'lint and enforcement share traversal immune to iterator mutation');
    t.end();
  });

tap.test('verdict ingestion refuses links, excess fields, and missing evidence', (t) => {
  const root = tmp('verdict-boundary-');
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const review = {id: 'review-0123456789abcdef01234567', manifest: {
    requiredReviewTemplates: [{category: 'harness-fidelity'}],
  }};
  const value = {
    schemaVersion: 'solver-verifier-verdict/1',
    reviewId: review.id,
    verifierId: 'verifier-one',
    verdict: 'approve',
    completedTemplateItems: [{category: 'harness-fidelity',
      evidencePaths: ['evidence.txt']}],
    findings: [],
    externalReceiptRef: 'subagent:verifier-one',
  };
  fs.writeFileSync(path.join(root, 'evidence.txt'), 'checked\n');
  fs.writeFileSync(path.join(root, 'verdict.json'), JSON.stringify(value));
  const accepted = loadVerifierVerdict(root, 'verdict.json', review);
  t.equal(accepted.verdict, 'approve');
  t.match(accepted.completedTemplateItems[0].evidence[0].sha256,
    /^sha256:[0-9a-f]{64}$/u);
  t.equal(accepted.completedTemplateItems[0].evidence[0].size, 8);
  fs.writeFileSync(path.join(root, 'verdict.json'),
    JSON.stringify({...value, fingerprint: `sha256:${'a'.repeat(64)}`}));
  t.throws(() => loadVerifierVerdict(root, 'verdict.json', review),
    /failed solver-verifier-verdict\/1 validation/iu,
    'review-owned fingerprint cannot be injected by the verdict');
  fs.rmSync(path.join(root, 'verdict.json'));
  fs.symlinkSync('evidence.txt', path.join(root, 'verdict.json'));
  t.throws(() => loadVerifierVerdict(root, 'verdict.json', review),
    /bounded regular file/iu);
  t.end();
});

tap.test('verdict ingestion rejects duplicate keys, empty evidence, and polluted arrays',
  (t) => {
    const root = tmp('verdict-adversarial-');
    t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
    const review = {id: 'review-0123456789abcdef01234567', manifest: {
      requiredReviewTemplates: [{category: 'harness-fidelity'}],
    }};
    fs.writeFileSync(path.join(root, 'evidence.txt'), 'checked\n');
    const prefix = '{"schemaVersion":"solver-verifier-verdict/1",' +
      `"reviewId":"${review.id}","verifierId":"one",`;
    fs.writeFileSync(path.join(root, 'verdict.json'), prefix +
      '"verdict":"reject","verdict":"approve",' +
      '"completedTemplateItems":[],"findings":[],' +
      '"externalReceiptRef":"receipt"}');
    t.throws(() => loadVerifierVerdict(root, 'verdict.json', review),
      /valid JSON/iu);

    fs.writeFileSync(path.join(root, 'evidence.txt'), '');
    fs.writeFileSync(path.join(root, 'verdict.json'), JSON.stringify({
      schemaVersion: 'solver-verifier-verdict/1', reviewId: review.id,
      verifierId: 'one', verdict: 'approve',
      completedTemplateItems: [{category: 'harness-fidelity',
        evidencePaths: ['evidence.txt']}], findings: [],
      externalReceiptRef: 'receipt',
    }));
    const nativeEvery = Object.getOwnPropertyDescriptor(Array.prototype, 'every');
    const nativeTest = Object.getOwnPropertyDescriptor(RegExp.prototype, 'test');
    Reflect.defineProperty(Array.prototype, 'every', {
      configurable: true,
      value: () => true,
      writable: true,
    });
    Reflect.defineProperty(RegExp.prototype, 'test', {
      configurable: true,
      value: () => true,
      writable: true,
    });
    let emptyEvidenceError = null;
    let invalidVerifierError = null;
    try {
      try {
        loadVerifierVerdict(root, 'verdict.json', review);
      } catch (error) {
        emptyEvidenceError = error;
      }
      fs.writeFileSync(path.join(root, 'evidence.txt'), 'checked\n');
      const invalidVerifier = JSON.parse(fs.readFileSync(
        path.join(root, 'verdict.json'), 'utf8'));
      invalidVerifier.verifierId = '!invalid';
      fs.writeFileSync(path.join(root, 'verdict.json'),
        JSON.stringify(invalidVerifier));
      try {
        loadVerifierVerdict(root, 'verdict.json', review);
      } catch (error) {
        invalidVerifierError = error;
      }
    } finally {
      Reflect.defineProperty(Array.prototype, 'every', nativeEvery);
      Reflect.defineProperty(RegExp.prototype, 'test', nativeTest);
    }
    t.match(emptyEvidenceError?.message, /non-empty bounded regular file/iu);
    t.match(invalidVerifierError?.message,
      /failed solver-verifier-verdict\/1 validation/iu,
      'post-import RegExp mutation cannot admit an invalid verifier id');
    t.end();
  });
