import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PRODUCERS = [
  'check-complexity.js', 'check-cognitive-complexity.js',
  'check-circular-dependencies.js', 'check-duplication.js',
];

export function createMetricFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metric-provenance-'));
  for (const directory of ['src', 'scripts', 'test']) {
    fs.mkdirSync(path.join(root, directory));
  }
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(root, 'node_modules'));
  for (const name of ['package.json', 'package-lock.json',
    'dependency-cruiser.config.cjs', 'dependency-policy.json']) {
    fs.copyFileSync(path.join(ROOT, name), path.join(root, name));
  }
  const scripts = [...PRODUCERS, 'check-file-size-thresholds.js',
    'inventory-ordinal-segments.js', 'checks/impact-proof-cone-constants.js',
    'checks/test-primary-classification-constants.js',
    'checks/test-resource-classification-constants.js',
    'checks/test-subsystem-classification-constants.js', ...fs.readdirSync(path.join(ROOT, 'scripts'))
      .filter((name) => name.startsWith('metric-') && name.endsWith('.js'))];
  for (const name of scripts) {
    fs.mkdirSync(path.dirname(path.join(root, 'scripts', name)), {recursive: true});
    fs.copyFileSync(path.join(ROOT, 'scripts', name), path.join(root, 'scripts', name));
  }
  fs.writeFileSync(path.join(root, 'dependency-policy.json'),
    JSON.stringify({optionalExternals: {}}));
  fs.writeFileSync(path.join(root, 'eslint.config.js'), 'export default [];\n');
  fs.writeFileSync(path.join(root, 'src/subject.js'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(root, 'test/subject.test.js'),
    Array.from({length: 30}, (_, index) => `export const value${index} = ${index};`).join('\n'));
  return root;
}

export function runMetricProducer(root, producer, args = []) {
  const result = spawnSync(process.execPath, [`scripts/${producer}`, ...args], {
    cwd: root, encoding: 'utf8',
  });
  if (![0, 1].includes(result.status)) {
    throw new Error(result.stderr || result.error?.message || 'producer failed');
  }
  return result;
}

export function addComplexTest(root) {
  const file = path.join(root, 'test/subject.test.js');
  const previous = fs.statSync(file);
  const branches = Array.from({length: 13}, (_, index) =>
    `  if (value === ${index}) return ${index};`).join('\n');
  fs.writeFileSync(file, `export function branch(value) {\n${branches}\n  return -1;\n}\n` +
    Array.from({length: 30}, (_, index) => `export const value${index} = ${index};`).join('\n'));
  fs.utimesSync(file, previous.atime, previous.mtime);
}
