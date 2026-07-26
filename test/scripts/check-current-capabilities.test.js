import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import tap from 'tap';

import {checkCurrentCapabilities} from
  '../../scripts/check-current-capabilities.js';

const TEMP_PREFIX = 'current-capabilities-';
const FIXTURE_PATHS = Object.freeze([
  'architecture/process-partitioning.md',
  'architecture/process-replication.md',
  'charts/lagrange-node/values.yaml',
  'docs/current-capabilities-and-limitations.md',
  'docs/current-capabilities.json',
  'docs/service-portability-capabilities.json',
]);

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  for (const relativePath of FIXTURE_PATHS) {
    const destination = path.join(root, relativePath);
    await fs.mkdir(path.dirname(destination), {recursive: true});
    await fs.copyFile(path.join(process.cwd(), relativePath), destination);
  }
  return root;
}

tap.test('checked-in current capabilities agree with implementation owners',
  (t) => {
    const result = checkCurrentCapabilities();

    t.equal(result.valid, true, result.problems.join('\n'));
    t.same(result.problems, []);
    t.end();
  });

tap.test('listener default drift fails the capability audit', async (t) => {
  const root = await createFixture();
  const jsonPath = path.join(root, 'docs/current-capabilities.json');
  const capabilities = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
  capabilities.listeners.adminWebSocket.defaultPort = 9999;
  await fs.writeFile(jsonPath, JSON.stringify(capabilities, null, 2) + '\n');

  const result = checkCurrentCapabilities(root);

  t.equal(result.valid, false);
  t.match(result.problems.join('\n'), /admin WebSocket default/u);
});

tap.test('stale generated human page fails the capability audit', async (t) => {
  const root = await createFixture();
  const outputPath =
    path.join(root, 'docs/current-capabilities-and-limitations.md');
  await fs.appendFile(outputPath, '\nstale text\n');

  const result = checkCurrentCapabilities(root);

  t.equal(result.valid, false);
  t.match(result.problems.join('\n'), /is stale/u);
});

tap.test('static gate includes the current capability audit', async (t) => {
  const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));

  t.equal(
    packageJson.scripts['audit:current-capabilities'],
    'node scripts/check-current-capabilities.js',
  );
  t.match(
    packageJson.scripts['test:static'],
    /npm run audit:current-capabilities/u,
  );
});
