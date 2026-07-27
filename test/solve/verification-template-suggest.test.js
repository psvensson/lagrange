import tap from 'tap';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  loadTemplateCategories,
  suggestVerificationTemplates,
} from '../../scripts/solve/verification-template-suggest.js';

// The suggest heuristic reads the committed templates' front-matter, so the
// repo root is the fixture — the mapping must stay data-driven from the docs.
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function diffFor(changedPath, addedLine) {
  return [
    `diff --git a/${changedPath} b/${changedPath}`,
    `--- a/${changedPath}`,
    `+++ b/${changedPath}`,
    '@@ -1 +1 @@',
    '-const x = 1;',
    `+${addedLine}`,
    '',
  ].join('\n');
}

tap.test('verification-template-suggest', async (t) => {
  t.test('reads category tags from the template front-matter', (t) => {
    const byCategory = loadTemplateCategories(REPO_ROOT);
    t.ok(byCategory.size >= 8, 'all eight categories are tagged');
    t.equal(byCategory.get('admission-gating'),
      'docs/steering/verification-templates/admission-gating.md');
    t.equal(byCategory.get('harness-fidelity'),
      'docs/steering/verification-templates/harness-fidelity.md');
    t.end();
  });

  t.test('maps admission keywords in changed lines to admission-gating', (t) => {
    const suggestions = suggestVerificationTemplates(REPO_ROOT,
      diffFor('src/rebalancer/placement.js',
        'if (!checkProvisioningAdmission(state)) return HOLD;'));
    t.ok(suggestions.some((s) => s.category === 'admission-gating'),
      'admission-gating suggested');
    t.ok(suggestions.every((s) => s.template.startsWith(
      'docs/steering/verification-templates/')), 'paths point at templates');
    t.end();
  });

  t.test('maps retry keywords in the changed path to retry-loops', (t) => {
    const suggestions = suggestVerificationTemplates(REPO_ROOT,
      diffFor('src/control-plane/publication-retry-driver.js',
        'const value = 1;'));
    t.ok(suggestions.some((s) => s.category === 'retry-loops'));
    t.end();
  });

  t.test('any src/diagnostics/ path change suggests adversarial-js-intrinsics',
    (t) => {
      const suggestions = suggestVerificationTemplates(REPO_ROOT,
        diffFor('src/diagnostics/opportunity-calculator.js',
          'const value = 1;'));
      t.ok(suggestions.some((s) => s.category === 'adversarial-js-intrinsics'));
      t.end();
    });

  t.test('intrinsics keywords in changed lines suggest adversarial-js-intrinsics',
    (t) => {
      const suggestions = suggestVerificationTemplates(REPO_ROOT,
        diffFor('src/distributed/harness/report-guard.js',
          'if (!Object.hasOwn(record, key)) return null;'));
      t.ok(suggestions.some((s) => s.category === 'adversarial-js-intrinsics'));
      t.end();
    });

  t.test('any test/ path change suggests harness-fidelity', (t) => {
    const suggestions = suggestVerificationTemplates(REPO_ROOT,
      diffFor('test/distributed/scenarios/foo.js', 'const value = 1;'));
    t.ok(suggestions.some((s) => s.category === 'harness-fidelity'));
    t.end();
  });

  t.test('unchanged context lines never trigger a suggestion', (t) => {
    const diff = [
      'diff --git a/src/util/format.js b/src/util/format.js',
      '--- a/src/util/format.js',
      '+++ b/src/util/format.js',
      '@@ -1,3 +1,3 @@',
      ' // the admission gate retry sweep lock transport formation harness',
      '-const label = 1;',
      '+const label = 2;',
      '',
    ].join('\n');
    t.same(suggestVerificationTemplates(REPO_ROOT, diff), []);
    t.end();
  });

  t.test('a keyword-free diff yields no suggestions', (t) => {
    t.same(suggestVerificationTemplates(REPO_ROOT,
      diffFor('src/util/format.js', 'const label = 2;')), []);
    t.end();
  });
});
