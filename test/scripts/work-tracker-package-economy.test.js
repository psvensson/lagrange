import tap from 'tap';

import {
  validatePackageEconomy,
} from '../../scripts/work-tracker.js';

// Tier 2 / Package Economy — new active packages must not re-introduce
// validator-unenforced steering boilerplate (RULES.md §package-economy).

const withSection = (heading) =>
  `# Title\n\n## Why\n\nReason.\n\n${heading}\n\nBody.\n\n## Scope\n\nx\n`;

const CLEAN = '# Title\n\n## Why\n\nReason.\n\n## Scope\n\nx\n';

tap.test('package economy boilerplate guard', async (t) => {
  t.test('active package with LLM Tool-First Contract is an error', (t) => {
    const errs = validatePackageEconomy(
      withSection('## LLM Tool-First Contract'),
      'pkg.md',
      {phase: 'entry', status: 'active'},
    );
    t.equal(errs.length, 1, 'one error');
    t.match(errs[0], /redundant-steering-boilerplate/u);
    t.match(errs[0], /LLM Tool-First Contract/u);
    t.end();
  });

  t.test('active package flags every removed section heading', (t) => {
    for (const heading of [
      '## Workflow Acceleration Contract',
      '## Shared Boundary Contract',
      '## Static Drift Ledger',
      '## Residual Closure Inventory',
    ]) {
      const errs = validatePackageEconomy(withSection(heading), 'pkg.md', {
        phase: 'pre-impl',
        status: 'active',
      });
      t.equal(errs.length, 1, `${heading} flagged`);
      t.match(errs[0], new RegExp(heading.replace('## ', ''), 'u'));
    }
    t.end();
  });

  t.test('lists multiple offending sections in one error', (t) => {
    const content =
      '# T\n\n## LLM Tool-First Contract\n\na\n\n' +
      '## Static Drift Ledger\n\nb\n\n## Scope\n\nc\n';
    const errs = validatePackageEconomy(content, 'pkg.md', {
      phase: 'entry',
      status: 'active',
    });
    t.equal(errs.length, 1);
    t.match(errs[0], /LLM Tool-First Contract/u);
    t.match(errs[0], /Static Drift Ledger/u);
    t.end();
  });

  t.test('clean active package passes', (t) => {
    const errs = validatePackageEconomy(CLEAN, 'pkg.md', {
      phase: 'entry',
      status: 'active',
    });
    t.equal(errs.length, 0);
    t.end();
  });

  t.test('todo packages are exempt (no churn on in-flight work)', (t) => {
    const errs = validatePackageEconomy(
      withSection('## LLM Tool-First Contract'),
      'pkg.md',
      {phase: 'entry', status: 'todo'},
    );
    t.equal(errs.length, 0);
    t.end();
  });

  t.test('legacy done packages are exempt', (t) => {
    const errs = validatePackageEconomy(
      withSection('## LLM Tool-First Contract'),
      'pkg.md',
      {phase: 'closure', status: 'done'},
    );
    t.equal(errs.length, 0);
    t.end();
  });

  t.test('non-entry/pre-impl phases are a no-op', (t) => {
    const errs = validatePackageEconomy(
      withSection('## LLM Tool-First Contract'),
      'pkg.md',
      {phase: 'closure', status: 'active'},
    );
    t.equal(errs.length, 0);
    t.end();
  });
});
