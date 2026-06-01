import tap from 'tap';

import {
  validatePackageClassWriteScopeFit,
} from '../../scripts/work-tracker.js';

// F5/R11 — packageClass write-scope fit validator.

tap.test('packageClass write-scope fit (R11)', async (t) => {
  t.test('rederive class with src/ in writeScope is an error', (t) => {
    const meta = {
      status: 'active', lane: 'lightweight-maintenance',
      modelFit: {packageClass: 'system-theory-rederive'},
      writeScope: [
        'work/sprints/active-foo.md',
        'work/theory-ledger.md',
        'src/runtime/foo.ts',
      ],
    };
    const errs = validatePackageClassWriteScopeFit(meta, 'pkg.md');
    t.equal(errs.length, 1, 'one error');
    t.match(errs[0], /rederive-writescope-contains-src/);
    t.match(errs[0], /src\/runtime\/foo\.ts/);
    t.end();
  });

  t.test('arch-gap class with src/ in writeScope is an error', (t) => {
    const meta = {
      status: 'active', lane: 'runtime-owner-boundary',
      modelFit: {packageClass: 'architecture-gap-analysis'},
      writeScope: ['src/api/handler.ts'],
    };
    const errs = validatePackageClassWriteScopeFit(meta, 'pkg.md');
    t.equal(errs.length, 1);
    t.match(errs[0], /rederive-writescope-contains-src/);
    t.match(errs[0], /architecture-gap-analysis/);
    t.end();
  });

  t.test('rederive class with sprint-only writeScope is clean', (t) => {
    const meta = {
      status: 'active', lane: 'system-theory-rederive',
      modelFit: {packageClass: 'system-theory-rederive'},
      writeScope: ['work/sprints/active-foo.md', 'work/theory-ledger.md'],
    };
    t.same(validatePackageClassWriteScopeFit(meta, 'pkg.md'), []);
    t.end();
  });

  t.test('representative-frontier-closure on runtime lane without src/ warns', (t) => {
    const meta = {
      status: 'active', lane: 'runtime-owner-boundary',
      modelFit: {packageClass: 'representative-frontier-closure'},
      writeScope: ['work/sprints/active-foo.md'],
    };
    const errs = validatePackageClassWriteScopeFit(meta, 'pkg.md');
    t.equal(errs.length, 1);
    t.match(errs[0], /runtime-writescope-no-src/);
    t.end();
  });

  t.test('representative-frontier-closure on runtime lane with src/ is clean', (t) => {
    const meta = {
      status: 'active', lane: 'runtime-owner-boundary',
      modelFit: {packageClass: 'representative-frontier-closure'},
      writeScope: ['src/api/handler.ts'],
    };
    t.same(validatePackageClassWriteScopeFit(meta, 'pkg.md'), []);
    t.end();
  });

  t.test('non-pre-impl phase is a no-op', (t) => {
    const meta = {
      status: 'active', lane: 'system-theory-rederive',
      modelFit: {packageClass: 'system-theory-rederive'},
      writeScope: ['src/api/handler.ts'],
    };
    t.same(validatePackageClassWriteScopeFit(meta, 'pkg.md', {phase: 'closure'}), []);
    t.end();
  });
});
