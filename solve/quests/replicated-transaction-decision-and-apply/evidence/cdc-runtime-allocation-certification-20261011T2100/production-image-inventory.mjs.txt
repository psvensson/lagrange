import {createHash} from 'node:crypto';
import {access, readdir, readFile, realpath, stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const APP_ROOT = '/app';
const HASH = 'sha256';

async function digestFile(file) {
  return createHash(HASH).update(await readFile(file)).digest('hex');
}

async function contentRecords(directory, prefix, ancestors = new Set()) {
  const actual = await realpath(directory);
  if (ancestors.has(actual)) throw new Error(`directory cycle at ${directory}`);
  const lineage = new Set([...ancestors, actual]);
  const records = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const absolute = path.join(directory, entry.name);
    const relativePath = `${prefix}/${entry.name}`;
    const shape = await stat(absolute);
    if (shape.isDirectory()) {
      records.push(...await contentRecords(absolute, relativePath, lineage));
    } else if (shape.isFile()) {
      records.push({relativePath, content: await readFile(absolute)});
    }
  }
  return records;
}

function fingerprint(records) {
  const sorted = [...records].sort((a, b) => a.relativePath < b.relativePath ? -1 : 1);
  const hash = createHash(HASH);
  hash.update(String(sorted.length), 'utf8');
  hash.update(':', 'utf8');
  let bytes = 0;
  for (const {relativePath, content} of sorted) {
    const name = Buffer.from(relativePath, 'utf8');
    hash.update(String(name.length), 'utf8');
    hash.update(':', 'utf8');
    hash.update(name);
    hash.update(String(content.length), 'utf8');
    hash.update(':', 'utf8');
    hash.update(content);
    bytes += content.length;
  }
  return {algorithm: 'sha256-length-framed-content-v1', digest: hash.digest('hex'),
    files: sorted.length, bytes};
}

function packageRows(records) {
  return records
    .filter(({relativePath}) => relativePath.endsWith('/package.json'))
    .map(({relativePath, content}) => {
      try {
        const manifest = JSON.parse(content);
        return {path: relativePath, name: manifest.name ?? null, version: manifest.version ?? null,
          sha256: createHash(HASH).update(content).digest('hex')};
      } catch (error) {
        return {path: relativePath, parseError: String(error.message),
          sha256: createHash(HASH).update(content).digest('hex')};
      }
    });
}

const [sourceRecords, dependencyRecords] = await Promise.all([
  contentRecords(`${APP_ROOT}/src`, 'src'),
  contentRecords(`${APP_ROOT}/node_modules`, 'node_modules'),
]);
const packageManifest = `${APP_ROOT}/package.json`;
const report = process.report.getReport();
const knownFiles = [
  ['package.json', packageManifest],
  ['node_modules/ws/package.json', `${APP_ROOT}/node_modules/ws/package.json`],
  ['node_modules/ws/lib/receiver.js', `${APP_ROOT}/node_modules/ws/lib/receiver.js`],
  ['node_modules/ws/lib/websocket.js', `${APP_ROOT}/node_modules/ws/lib/websocket.js`],
  ['node_modules/ws/lib/websocket-server.js',
    `${APP_ROOT}/node_modules/ws/lib/websocket-server.js`],
  ['node_modules/better-sqlite3/package.json',
    `${APP_ROOT}/node_modules/better-sqlite3/package.json`],
  ['node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    `${APP_ROOT}/node_modules/better-sqlite3/build/Release/better_sqlite3.node`],
  ['/nodejs/LICENSE', '/nodejs/LICENSE'],
  ['/etc/os-release', '/etc/os-release'],
];
const files = {};
for (const [name, file] of knownFiles) {
  const shape = await stat(file);
  files[name] = {bytes: shape.size, sha256: await digestFile(file)};
}
let packageLockPresent = true;
try {
  await access(`${APP_ROOT}/package-lock.json`);
} catch {
  packageLockPresent = false;
}
const executable = await stat(process.execPath);
const manifest = JSON.parse(await readFile(packageManifest, 'utf8'));
const output = {
  schema: 'cdc-production-runtime-inventory/1',
  image: process.env.CERT_IMAGE_DIGEST,
  application: {name: manifest.name, version: manifest.version},
  runtime: {
    execPath: process.execPath,
    executableBytes: executable.size,
    executableSha256: await digestFile(process.execPath),
    node: process.version,
    versions: process.versions,
    platform: process.platform,
    arch: process.arch,
    endianness: os.endianness(),
    glibcVersionRuntime: report.header.glibcVersionRuntime ?? null,
    glibcVersionCompiler: report.header.glibcVersionCompiler ?? null,
  },
  content: {
    packageLockPresent,
    source: fingerprint(sourceRecords),
    dependencies: fingerprint(dependencyRecords),
    dependencyPackages: packageRows(dependencyRecords),
    files,
  },
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
