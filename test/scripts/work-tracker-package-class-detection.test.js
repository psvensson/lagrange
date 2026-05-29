import tap from 'tap';

import {
  metadataIsSystemTheoryRevision,
  metadataIsArchitectureGapAnalysis,
} from '../../scripts/work-tracker.js';

// F0 — Vocabulary split. The detection helpers prefer
// modelFit.packageClass over the legacy lane / slug fallbacks.

tap.test('packageClass detection (F0 vocabulary split)', async (t) => {
  t.test('detects rederive via modelFit.packageClass', (t) => {
    const meta = {
      lane: 'runtime-owner-boundary',
      modelFit: {packageClass: 'system-theory-rederive'},
    };
    t.ok(metadataIsSystemTheoryRevision(meta, 'pkg.md'));
    t.notOk(metadataIsArchitectureGapAnalysis(meta, 'pkg.md'));
    t.end();
  });

  t.test('detects rederive via alias packageClass', (t) => {
    for (const klass of ['system-theory-revision', 'theory-rederive', 'whole-system-theory']) {
      const meta = {lane: 'lightweight-maintenance', modelFit: {packageClass: klass}};
      t.ok(metadataIsSystemTheoryRevision(meta, 'pkg.md'), `should detect ${klass}`);
    }
    t.end();
  });

  t.test('detects architecture-gap via modelFit.packageClass', (t) => {
    for (const klass of [
      'architecture-gap-analysis',
      'architecture-gap analysis package',
      'architecture-gap runtime owner package',
    ]) {
      const meta = {lane: 'runtime-owner-boundary', modelFit: {packageClass: klass}};
      t.ok(metadataIsArchitectureGapAnalysis(meta, 'pkg.md'), `should detect ${klass}`);
      t.notOk(metadataIsSystemTheoryRevision(meta, 'pkg.md'), 'arch-gap is not rederive');
    }
    t.end();
  });

  t.test('falls back to legacy lane for pre-F0 packages', (t) => {
    const meta = {lane: 'system-theory-rederive'};
    t.ok(metadataIsSystemTheoryRevision(meta, 'pkg.md'));
    t.end();
  });

  t.test('falls back to slug regex when neither packageClass nor lane is set', (t) => {
    const meta = {lane: 'lightweight-maintenance'};
    t.ok(metadataIsSystemTheoryRevision(meta, 'active-20260529-foo-system-theory-rederive.md'));
    t.end();
  });

  t.test('packageClass=representative-frontier-closure is neither rederive nor arch-gap', (t) => {
    const meta = {
      lane: 'runtime-owner-boundary',
      modelFit: {packageClass: 'representative-frontier-closure'},
    };
    t.notOk(metadataIsSystemTheoryRevision(meta, 'pkg.md'));
    t.notOk(metadataIsArchitectureGapAnalysis(meta, 'pkg.md'));
    t.end();
  });
});
