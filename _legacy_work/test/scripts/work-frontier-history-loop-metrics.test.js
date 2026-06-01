import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  detectCompositionalSignals,
  computeLoopMetrics,
  findAlternatingPairBoundaries,
  packageIsRederive,
  parsePackageFile,
  filterAndSummarizeHistory,
} from '../../scripts/work-frontier-history.js';

function makePkg(dir, name, meta) {
  fs.writeFileSync(path.join(dir, name),
    `# t\n\n<!-- work-package\n${JSON.stringify(meta, null, 2)}\n-->\n`);
}

tap.test('frontier-history loop metrics & post-rederive signal', async (t) => {
  t.test('pair-alternation-post-rederive fires when alternation resumes', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-rederive-'));
    // Three pre-rederive alternating closures.
    const before = [
      ['done-20260520-a.md', 'transition_gap'],
      ['done-20260521-b.md', 'scheduling_gap'],
      ['done-20260522-c.md', 'transition_gap'],
    ];
    for (const [n, m] of before) {
      makePkg(dir, n, {
        schema: 'work-package-v1', status: 'done', opened: `2026-05-${n.slice(11, 13)}`,
        lane: 'runtime-owner-boundary', owner: 'o', boundary: 'b',
        artifact: `test/${n}.json`,
        mechanismCard: {failureMechanism: m, expectedMovement: 'x', negativeResultMeans: 'y'},
      });
    }
    // Rederive closes.
    makePkg(dir, 'done-20260523-rederive.md', {
      schema: 'work-package-v1', status: 'done', opened: '2026-05-23',
      lane: 'system-theory-rederive', systemTheoryRevision: true,
      owner: 'o', boundary: 'b',
      artifact: 'test/rederive.json',
      mechanismCard: {failureMechanism: 'coupled_invariants', expectedMovement: 'x', negativeResultMeans: 'y'},
    });
    // Three more alternating closures AFTER the rederive.
    const after = [
      ['done-20260524-d.md', 'scheduling_gap'],
      ['done-20260525-e.md', 'transition_gap'],
      ['done-20260526-f.md', 'scheduling_gap'],
    ];
    for (const [n, m] of after) {
      makePkg(dir, n, {
        schema: 'work-package-v1', status: 'done', opened: `2026-05-${n.slice(11, 13)}`,
        lane: 'runtime-owner-boundary', owner: 'o', boundary: 'b',
        artifact: `test/${n}.json`,
        mechanismCard: {failureMechanism: m, expectedMovement: 'x', negativeResultMeans: 'y'},
      });
    }
    const parsed = fs.readdirSync(dir)
      .map((f) => parsePackageFile(path.join(dir, f)))
      .filter(Boolean);
    const history = filterAndSummarizeHistory(parsed, 'o', 'b', 20);
    const signals = detectCompositionalSignals(history);
    t.ok(signals.some((s) => s.pattern === 'pair-alternation-post-rederive'),
      'post-rederive signal fires');
    const metrics = computeLoopMetrics(history);
    t.equal(metrics.loopHealth, 'exhausted');
    t.equal(metrics.lastRederivePackage, 'done-20260523-rederive.md');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('healthy when no rederive and no signals', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'healthy-'));
    makePkg(dir, 'done-20260520-a.md', {
      schema: 'work-package-v1', status: 'done', opened: '2026-05-20',
      lane: 'runtime-owner-boundary', owner: 'o', boundary: 'b',
      artifact: 'test/a.json',
      mechanismCard: {failureMechanism: 'observation_gap', expectedMovement: 'x', negativeResultMeans: 'y'},
    });
    const parsed = fs.readdirSync(dir).map((f) => parsePackageFile(path.join(dir, f))).filter(Boolean);
    const history = filterAndSummarizeHistory(parsed, 'o', 'b', 20);
    const metrics = computeLoopMetrics(history);
    t.equal(metrics.loopHealth, 'healthy');
    t.equal(metrics.lastRederivePackage, 'none');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('rederive-in-progress when an active rederive exists', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inprog-'));
    makePkg(dir, 'active-20260529-rederive.md', {
      schema: 'work-package-v1', status: 'active', opened: '2026-05-29',
      lane: 'system-theory-rederive', systemTheoryRevision: true,
      owner: 'o', boundary: 'b',
      artifact: 'test/r.json',
      mechanismCard: {failureMechanism: 'coupled_invariants', expectedMovement: 'x', negativeResultMeans: 'y'},
    });
    const parsed = fs.readdirSync(dir).map((f) => parsePackageFile(path.join(dir, f))).filter(Boolean);
    const history = filterAndSummarizeHistory(parsed, 'o', 'b', 20);
    const metrics = computeLoopMetrics(history);
    t.equal(metrics.loopHealth, 'rederive-in-progress');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});

tap.test('findAlternatingPairBoundaries identifies the partner boundary', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-bnd-'));
  makePkg(dir, 'done-20260520-a.md', {
    schema: 'work-package-v1', status: 'done', opened: '2026-05-20',
    lane: 'runtime-owner-boundary', owner: 'owner_a', boundary: 'boundary_x',
    artifact: 'test/a.json',
    mechanismCard: {failureMechanism: 'transition_gap', expectedMovement: 'x', negativeResultMeans: 'y'},
  });
  makePkg(dir, 'done-20260521-b.md', {
    schema: 'work-package-v1', status: 'done', opened: '2026-05-21',
    lane: 'runtime-owner-boundary', owner: 'owner_b', boundary: 'boundary_y',
    artifact: 'test/b.json',
    mechanismCard: {failureMechanism: 'scheduling_gap', expectedMovement: 'x', negativeResultMeans: 'y'},
  });
  const parsed = fs.readdirSync(dir).map((f) => parsePackageFile(path.join(dir, f))).filter(Boolean);
  const partners = findAlternatingPairBoundaries(parsed, 'owner_a', 'boundary_x');
  t.ok(partners.some((p) => p.owner === 'owner_b' && p.boundary === 'boundary_y'),
    'identifies pair partner');
  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

tap.test('packageIsRederive detects by lane or slug', async (t) => {
  t.ok(packageIsRederive({lane: 'system-theory-rederive'}));
  t.ok(packageIsRederive({package: 'active-20260529-foo-system-theory-rederive.md'}));
  t.notOk(packageIsRederive({lane: 'runtime-owner-boundary', package: 'foo.md'}));
  t.end();
});
