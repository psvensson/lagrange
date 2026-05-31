import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {runCli} from '../../scripts/work-package-new.js';

describe('work-package-new metadata output', () => {
  it('omits lifecycle and commit-scope mirrors for new packages', async () => {
    const output = await runCli([
      '--title',
      'Derived Metadata Package',
      '--slug',
      'derived-metadata-package',
      '--opened',
      '2026-05-31',
      '--lane',
      'lightweight-maintenance',
      '--owner',
      'workflow_tooling_owner',
      '--boundary',
      'metadata_derivation',
      '--dominant-reason',
      'admin_reduction',
      '--next-action',
      'prove derived metadata',
      '--write-scope',
      'scripts/work-package-new.js',
      '--proof',
      'regression: node --test test/scripts/work-package-new.test.js',
    ]);
    const match = /<!-- work-package\s*([\s\S]*?)\s*-->/u.exec(output);
    assert.ok(match, 'expected package metadata comment');
    const metadata = JSON.parse(match[1]);

    assert.equal(metadata.status, undefined);
    assert.equal(metadata.intent.opened, undefined);
    assert.equal(metadata.scope.commitScope, undefined);
    assert.deepEqual(metadata.scope.writeScope, ['scripts/work-package-new.js']);
  });

  it('preserves explicit commit scope only when requested', async () => {
    const output = await runCli([
      '--title',
      'Explicit Scope Package',
      '--slug',
      'explicit-scope-package',
      '--opened',
      '2026-05-31',
      '--lane',
      'lightweight-maintenance',
      '--owner',
      'workflow_tooling_owner',
      '--boundary',
      'metadata_derivation',
      '--dominant-reason',
      'admin_reduction',
      '--next-action',
      'prove explicit scope',
      '--write-scope',
      'scripts/work-package-new.js',
      '--commit-scope',
      'scripts/work-package-new.js',
      '--proof',
      'regression: node --test test/scripts/work-package-new.test.js',
    ]);
    const match = /<!-- work-package\s*([\s\S]*?)\s*-->/u.exec(output);
    assert.ok(match, 'expected package metadata comment');
    const metadata = JSON.parse(match[1]);

    assert.deepEqual(metadata.scope.commitScope, ['scripts/work-package-new.js']);
  });
});
