import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {validateRoadmapAuthority}
  from '../../scripts/check-roadmap-authority.js';

const TEMP_PREFIX = 'roadmap-authority-';
const HUMAN_ROADMAP = [
  '---',
  'audience: human',
  'documentClass: planning',
  '---',
  '',
  '# Lagrange Roadmap',
  '',
  '## Recently completed — 0.1 Internal Coherence',
  '',
  'Stable foundations.',
  '',
  '## Now — 0.2 Stable Core',
  '',
  'A credible release.',
  '',
].join('\n');
const FEATURE_MAP = [
  '---',
  'audience: agent',
  'documentClass: steering',
  '---',
  '',
  '# AGPL Feature Map',
  '',
  '## Phase 0.1 — Internal Coherence',
  '',
  '| Id | Item |',
  '| --- | --- |',
  '| RM-0.1-core | Core |',
  '',
  '## Phase 0.2 — Stable Core',
  '',
  '| Id | Item |',
  '| --- | --- |',
  '| `RM-0.2-release` | Release |',
  '',
].join('\n');
const PRODUCT_ROADMAP = [
  '---',
  'audience: development',
  'documentClass: planning',
  '---',
  '',
  '# Cross-edition Product Roadmap',
  '',
].join('\n');
const HISTORICAL_ROADMAP_TASK = [
  '# Historical task',
  '',
  '- [x] Rebaseline `roadmap.md` so the rewrite sprint is the current Phase 0.1',
  '      representative track.',
  '',
].join('\n');

async function writeFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(absolutePath), {recursive: true});
  await fs.writeFile(absolutePath, content, 'utf8');
}

const ROUTER = [
  '---',
  'audience: agent',
  '---',
  '',
  '# Owner router',
  '',
  '| Key | Authority | Consult when |',
  '| --- | --- | --- |',
  '| `publication` | [`solver-runbook.md`](../development/solver-runbook.md) | landing |',
  '',
  '## Conditional material',
  '',
  '| Work | Read |',
  '| --- | --- |',
  '| roadmap scope or a `roadmapRow` | ' +
    '[`agpl-feature-map.md`](../development/agpl-feature-map.md) |',
  '| proposing or changing roadmap policy | ' +
    '[`roadmap-policy.md`](../development/roadmap-policy.md) |',
  '',
].join('\n');

async function writeQuest(root, id, links) {
  await writeFile(
    root,
    `solve/quests/${id}/quest.json`,
    `${JSON.stringify({id, legacy: {links}}, null, 2)}\n`,
  );
}

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  await writeFile(root, 'roadmap.md', HUMAN_ROADMAP);
  await writeFile(root, 'docs/development/agpl-feature-map.md', FEATURE_MAP);
  await writeFile(root, 'docs/steering/router.md', ROUTER);
  await writeFile(
    root,
    'docs/development/roadmap-policy.md',
    '# Roadmap Policy\n\n' +
      'The canonical AGPL feature sequence and scope map lives at\n' +
      '[`agpl-feature-map.md`](agpl-feature-map.md).\n',
  );
  await writeFile(
    root,
    'edition-matrix.md',
    '# Editions\n\nAGPL feature map (agent steering)\n',
  );
  await writeFile(
    root,
    'scripts/solve/schema.js',
    '\'_Scope authority (docs/development/agpl-feature-map.md).\'\n',
  );
  await writeFile(
    root,
    'docs/development/product-roadmap.md',
    PRODUCT_ROADMAP,
  );
  await writeQuest(root, 'valid', {
    roadmapRow: 'RM-0.2-release',
    planDoc: 'solve/specs/release.md',
  });
  await writeQuest(root, 'readiness-scale-contract-portfolio-complete', {
    roadmapRow: 'RM-0.2-release',
    planDoc: 'roadmap.md',
  });
  await writeFile(
    root,
    'solve/epics/core.md',
    '---\nroadmapRow: RM-0.1-core\n---\n\n# Core\n',
  );
  await writeFile(
    root,
    'solve/specs/core-topology-control-plane-rewrite/tasks.md',
    HISTORICAL_ROADMAP_TASK,
  );
  return root;
}

test('roadmap authority accepts the audience split and resolved rows', async (t) => {
  const root = await createFixture();
  const result = validateRoadmapAuthority(root);

  t.equal(result.ok, true, result.errors.join('\n'));
  t.equal(result.featureRowCount, 2);
});

test('roadmap authority rejects duplicate and unresolved row identities',
  async (t) => {
    const root = await createFixture();
    await writeFile(
      root,
      'docs/development/agpl-feature-map.md',
      `${FEATURE_MAP}\n| RM-0.2-release | Duplicate |\n` +
      '| RM-0.2-Bad_Slug | Malformed |\n',
    );
    await writeQuest(root, 'unresolved', {
      roadmapRow: 'RM-9.9-missing',
      planDoc: 'solve/specs/missing.md',
    });
    await writeQuest(root, 'non-string', {
      roadmapRow: 42,
      planDoc: 'solve/specs/non-string.md',
    });
    await writeFile(
      root,
      'solve/epics/missing.md',
      '---\nroadmapRow: RM-8.8-missing\n---\n\n# Missing\n',
    );
    const result = validateRoadmapAuthority(root);
    const errors = result.errors.join('\n');

    t.equal(result.ok, false);
    t.match(errors, /duplicate roadmap row RM-0\.2-release/u);
    t.match(errors, /malformed roadmap row RM-0\.2-Bad_Slug/u);
    t.match(errors, /unresolved roadmapRow RM-9\.9-missing/u);
    t.match(errors, /unresolved roadmapRow 42/u);
    t.match(errors, /unresolved roadmapRow RM-8\.8-missing/u);
  });

test('roadmap authority rejects new links to the human roadmap', async (t) => {
  const root = await createFixture();
  await writeQuest(root, 'new-human-link', {
    roadmapRow: 'RM-0.2-release',
    planDoc: 'roadmap.md',
  });
  const result = validateRoadmapAuthority(root);

  t.equal(result.ok, false);
  t.match(result.errors.join('\n'), /new planDoc must not target roadmap\.md/u);
});

test('roadmap authority rejects machine vocabulary and phase drift in human copy',
  async (t) => {
    const root = await createFixture();
    await writeFile(
      root,
      'roadmap.md',
      HUMAN_ROADMAP.replace(
        '## Now — 0.2 Stable Core',
        '## Agent Quest details\n\nRM-0.2-release',
      ),
    );
    const result = validateRoadmapAuthority(root);
    const errors = result.errors.join('\n');

    t.equal(result.ok, false);
    t.match(errors, /machine roadmap row identity/u);
    t.match(errors, /agent workflow vocabulary/u);
    t.match(errors, /milestone phases/u);
  });

test('roadmap authority rejects unrouted roadmap material and old root path',
  async (t) => {
    const root = await createFixture();
    await writeFile(
      root,
      'docs/steering/router.md',
      ROUTER.replace('../development/agpl-feature-map.md', 'agpl-feature-map.md')
        .replace('## Conditional material', '## Always loaded'),
    );
    await writeFile(root, 'product-roadmap.md', '# Old location\n');
    const result = validateRoadmapAuthority(root);
    const errors = result.errors.join('\n');

    t.equal(result.ok, false);
    t.match(errors, /router\.md: no conditional material section/u);
    t.match(errors, /retired root path must remain absent/u);
  });

test('roadmap authority rejects a roadmap authority the router does not reach',
  async (t) => {
    const root = await createFixture();
    await writeFile(
      root,
      'docs/steering/router.md',
      ROUTER.replace(
        '| roadmap scope or a `roadmapRow` | ' +
          '[`agpl-feature-map.md`](../development/agpl-feature-map.md) |\n',
        '',
      ),
    );
    const result = validateRoadmapAuthority(root);
    const errors = result.errors.join('\n');

    t.equal(result.ok, false);
    t.match(
      errors,
      /docs\/development\/agpl-feature-map\.md must stay reachable as conditional/u,
    );
  });

test('roadmap authority rejects stale planning scope and weak consumer mentions',
  async (t) => {
    const root = await createFixture();
    await writeFile(
      root,
      'solve/specs/stale-scope.md',
      '# Stale scope\n\nImplement this when backed by `roadmap.md`.\n',
    );
    await writeFile(
      root,
      'solve/specs/core-topology-control-plane-rewrite/tasks.md',
      `${HISTORICAL_ROADMAP_TASK}\nNew work backed by \`roadmap.md\`.\n`,
    );
    const result = validateRoadmapAuthority(root);
    const errors = result.errors.join('\n');

    t.equal(result.ok, false);
    t.match(errors, /planning authority must use docs\/development\/agpl-feature-map/u);
    t.match(
      errors,
      /core-topology-control-plane-rewrite\/tasks\.md: planning authority/u,
    );
  });

test('roadmap authority rejects feature and product audience drift', async (t) => {
  const root = await createFixture();
  await writeFile(
    root,
    'docs/development/agpl-feature-map.md',
    FEATURE_MAP.replace('audience: agent', 'audience: human'),
  );
  await writeFile(
    root,
    'docs/development/product-roadmap.md',
    PRODUCT_ROADMAP.replace('audience: development', 'audience: human'),
  );
  const result = validateRoadmapAuthority(root);
  const errors = result.errors.join('\n');

  t.equal(result.ok, false);
  t.match(
    errors,
    /agpl-feature-map\.md: expected audience: agent, found human/u,
  );
  t.match(
    errors,
    /product-roadmap\.md: expected audience: development, found human/u,
  );
});
