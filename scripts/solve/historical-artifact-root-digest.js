import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const WATCHED_ROOTS = Object.freeze([
  'solve/changes',
  'solve/log',
  'solve/report',
  'solve/artifacts',
]);
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const NUL_SEPARATOR = '\0';

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(file));
    else if (entry.isFile()) files.push(file);
  }
  return files.sort();
}

export function historicalArtifactRootDigest(root = process.cwd()) {
  const digest = createHash(HASH_ALGORITHM);
  for (const relativeRoot of WATCHED_ROOTS) {
    for (const file of walk(path.join(root, relativeRoot))) {
      digest.update(path.relative(root, file));
      digest.update(NUL_SEPARATOR);
      digest.update(fs.readFileSync(file));
      digest.update(NUL_SEPARATOR);
    }
  }
  return digest.digest(HASH_ENCODING);
}
