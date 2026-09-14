/**
 * Every entry of every frozen vocabulary in src/query/query-constants.js has
 * at least one consumer outside the file: a member access (NAME.KEY), a
 * destructuring (const {KEY} = NAME) or a dynamic access (NAME[...]) in a
 * module that imports the vocabulary. A value nobody consumes is not owned
 * vocabulary, it is dead text a reader mistakes for a contract (R06).
 */
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const VOCABULARY_FILE = 'src/query/query-constants.js';
const SEARCH_ROOTS = Object.freeze(['src', 'test', 'scripts', 'examples']);
const SKIPPED_DIRECTORY_PREFIX = '.';
const NODE_MODULES = 'node_modules';
const JS_SUFFIX = '.js';
const VOCABULARY_PATTERN =
  /^(?:export )?const ([A-Z_]+) = Object\.freeze\(\{([\s\S]*?)\n\}\);/gmu;
const KEY_PATTERN = /^\s+([A-Z_]+):/gmu;

function listJavaScriptFiles(directory, out) {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    if (entry.name === NODE_MODULES ||
        entry.name.startsWith(SKIPPED_DIRECTORY_PREFIX)) continue;
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) listJavaScriptFiles(entryPath, out);
    else if (entryPath.endsWith(JS_SUFFIX)) out.push(entryPath);
  }
  return out;
}

function vocabularies(source) {
  const found = [];
  for (const match of source.matchAll(VOCABULARY_PATTERN)) {
    const keys = [...match[2].matchAll(KEY_PATTERN)].map((key) => key[1]);
    found.push({name: match[1], keys});
  }
  return found;
}

function isConsumed(name, key, consumers) {
  const member = new RegExp(`\\b${name}\\.${key}\\b`, 'u');
  const dynamic = new RegExp(`\\b${name}\\[`, 'u');
  const destructured =
    new RegExp(`\\{[^}]*\\b${key}\\b[^}]*\\}\\s*=\\s*${name}\\b`, 'su');
  return consumers.some((text) =>
    member.test(text) || dynamic.test(text) || destructured.test(text));
}

test('every query-constants entry has a consumer', async () => {
  const source = readFileSync(VOCABULARY_FILE, 'utf8');
  const files = [];
  for (const root of SEARCH_ROOTS) listJavaScriptFiles(root, files);
  const texts = files
    .filter((file) => file !== VOCABULARY_FILE)
    .map((file) => readFileSync(file, 'utf8'));
  const dead = [];
  for (const {name, keys} of vocabularies(source)) {
    const consumers = texts.filter((text) => text.includes(name));
    for (const key of keys) {
      if (!isConsumed(name, key, consumers)) dead.push(`${name}.${key}`);
    }
  }
  assert.deepEqual(dead, [], 'no vocabulary entry without a consumer');
});
