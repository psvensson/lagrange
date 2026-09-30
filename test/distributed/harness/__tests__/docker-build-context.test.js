import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from '../../../../src/test-helpers/tap.js';
import {
  DOCKERFILE_CONTEXT_CONSTRUCT,
  DockerfileContextUnsupportedError,
  buildImageContext,
} from '../docker-build-context.js';

// Parity falsifier for the distributed harness image build: every source the
// repository Dockerfile COPYs from the build context must reach the explicit
// file list dockerode tars (a context-only list once dropped the
// vendor/raft-rs-wasm/ COPY source added in 8418f10b6, and every live
// harness build failed with "COPY failed ... file does not exist").
//
// The Dockerfile is read here with its own minimal reading, independent of
// the builder's parser: COPY lines without --from=, last token = target.

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url);
const REPOSITORY_DOCKERFILE = new URL('Dockerfile', REPOSITORY_ROOT);
const DOCKERFILE_NAME = 'Dockerfile';
const TEMP_PREFIX = 'docker-build-context-';
const PLACEHOLDER_FILE = 'placeholder.txt';
const PLACEHOLDER_TEXT = 'x';
const UTF8 = 'utf8';
const COPY_LINE = /^\s*COPY\s+(.+)$/iu;
const FLAG_PREFIX = '--';
const FROM_FLAG_PREFIX = '--from=';
const DIRECTORY_SUFFIX = '/';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringReplace = Function.call.bind(String.prototype.replace);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

function copySources(dockerfileText) {
  const sources = [];
  for (const line of stringSplit(dockerfileText, '\n')) {
    const match = COPY_LINE.exec(line);
    if (!match) {
      continue;
    }
    const tokens = arrayFilter(stringSplit(stringTrim(match[1]), /\s+/u),
      (token) => token.length > 0);
    if (arraySome(tokens, (token) => stringStartsWith(token, FROM_FLAG_PREFIX))) {
      continue;
    }
    const operands = arrayFilter(tokens,
      (token) => !stringStartsWith(token, FLAG_PREFIX));
    sources.push(...operands.slice(0, -1));
  }
  return sources;
}

function materialize(contextPath, source) {
  const target = path.join(contextPath, source);
  if (stringEndsWith(source, DIRECTORY_SUFFIX)) {
    mkdirSync(path.join(target, 'nested'), {recursive: true});
    writeFileSync(path.join(target, 'nested', PLACEHOLDER_FILE),
      PLACEHOLDER_TEXT);
    return;
  }
  mkdirSync(path.dirname(target), {recursive: true});
  writeFileSync(target, PLACEHOLDER_TEXT);
}

function normalizedSource(source) {
  return stringReplace(path.posix.normalize(source), /\/+$/u, '');
}

function coveredBy(entries, source) {
  const normalized = normalizedSource(source);
  return arraySome(entries, (entry) => entry === normalized ||
    stringStartsWith(entry, `${normalized}${DIRECTORY_SUFFIX}`));
}

test('docker build context carries every COPY source of the repository ' +
  'Dockerfile', (t) => {
  const dockerfileText = readFileSync(REPOSITORY_DOCKERFILE, UTF8);
  const sources = copySources(dockerfileText);
  assert.ok(sources.length > 0, 'the Dockerfile COPYs from the context');
  const contextPath = mkdtempSync(path.join(tmpdir(), TEMP_PREFIX));
  t.teardown(() => rmSync(contextPath, {force: true, recursive: true}));
  writeFileSync(path.join(contextPath, DOCKERFILE_NAME), dockerfileText);
  for (const source of sources) {
    materialize(contextPath, source);
  }

  const {context, src} = buildImageContext(contextPath, DOCKERFILE_NAME);

  assert.equal(context, contextPath);
  const uncovered = arrayFilter(sources, (source) => !coveredBy(src, source));
  assert.deepEqual(uncovered, [],
    `COPY sources missing from the build context: ${uncovered.join(', ')}`);
  assert.ok(arrayIncludes(src, DOCKERFILE_NAME));
  t.end();
});

test('docker build context follows a Dockerfile it has never seen and ' +
  'ignores other build stages', (t) => {
  const contextPath = mkdtempSync(path.join(tmpdir(), TEMP_PREFIX));
  t.teardown(() => rmSync(contextPath, {force: true, recursive: true}));
  writeFileSync(path.join(contextPath, DOCKERFILE_NAME), [
    'FROM node:22-slim AS builder',
    'COPY package.json package-lock.json ./',
    'FROM scratch',
    'COPY --from=builder /app/node_modules ./node_modules',
    'COPY --chown=1000:1000 assets/ ./assets/',
    'copy tools/run.js ./tools/',
    '',
  ].join('\n'));
  for (const source of ['package.json', 'package-lock.json', 'assets/',
    'tools/run.js', 'unrelated/']) {
    materialize(contextPath, source);
  }

  const {src} = buildImageContext(contextPath, DOCKERFILE_NAME);

  assert.deepEqual(src, [
    DOCKERFILE_NAME,
    'assets/nested/placeholder.txt',
    'package-lock.json',
    'package.json',
    'tools/run.js',
  ]);
  assert.deepEqual(
    arrayMap(src, (entry) => stringIncludes(entry, 'node_modules')),
    arrayMap(src, () => false));
  t.end();
});

test('docker build context refuses an unreadable Dockerfile', (t) => {
  const contextPath = mkdtempSync(path.join(tmpdir(), TEMP_PREFIX));
  t.teardown(() => rmSync(contextPath, {force: true, recursive: true}));

  assert.throws(() => buildImageContext(contextPath, DOCKERFILE_NAME),
    /Dockerfile/u);
  t.end();
});

// Fail-closed grammar: the builder supports exactly the constructs the
// repository Dockerfile uses; anything it cannot map to explicit context
// entries is a typed refusal naming the construct and the line, never a
// silently wrong (e.g. near-empty) context.
function buildFrom(t, dockerfileLines, sources = []) {
  const contextPath = mkdtempSync(path.join(tmpdir(), TEMP_PREFIX));
  t.teardown(() => rmSync(contextPath, {force: true, recursive: true}));
  writeFileSync(path.join(contextPath, DOCKERFILE_NAME),
    dockerfileLines.join('\n'));
  for (const source of sources) {
    materialize(contextPath, source);
  }
  return () => buildImageContext(contextPath, DOCKERFILE_NAME);
}

const REFUSALS = [
  ['a whole-context "." source', ['FROM node:22', 'COPY . ./'],
    DOCKERFILE_CONTEXT_CONSTRUCT.WHOLE_CONTEXT, 2],
  ['a whole-context "./" source', ['FROM node:22', '', 'COPY ./ /app/'],
    DOCKERFILE_CONTEXT_CONSTRUCT.WHOLE_CONTEXT, 3],
  ['a wildcard source', ['FROM node:22', 'COPY package*.json ./'],
    DOCKERFILE_CONTEXT_CONSTRUCT.WILDCARD, 2],
  ['a JSON-form COPY with a leading flag',
    ['FROM node:22', 'COPY --chown=1:1 ["a", "./"]'],
    DOCKERFILE_CONTEXT_CONSTRUCT.JSON_FORM, 2],
  ['a JSON-form COPY', ['FROM node:22', 'COPY ["a", "./"]'],
    DOCKERFILE_CONTEXT_CONSTRUCT.JSON_FORM, 2],
  ['an ADD with a local source', ['FROM node:22', 'ADD vendor/x.tar ./'],
    DOCKERFILE_CONTEXT_CONSTRUCT.ADD_LOCAL, 2],
  ['a source escaping the context', ['FROM node:22', 'COPY ../x ./'],
    DOCKERFILE_CONTEXT_CONSTRUCT.OUTSIDE_CONTEXT, 2],
  ['a heredoc COPY', ['FROM node:22', 'COPY <<EOF /app/x', 'y', 'EOF'],
    DOCKERFILE_CONTEXT_CONSTRUCT.HEREDOC, 2],
];

for (const [label, lines, construct, line] of REFUSALS) {
  test(`docker build context refuses ${label}`, (t) => {
    const build = buildFrom(t, lines);
    assert.throws(build, (error) => {
      assert.ok(error instanceof DockerfileContextUnsupportedError,
        String(error));
      assert.equal(error.construct, construct);
      assert.equal(error.line, line);
      assert.ok(stringIncludes(error.message, `line ${line}`), error.message);
      return true;
    });
    t.end();
  });
}

test('docker build context ignores an ADD from a remote URL (no context ' +
  'read)', (t) => {
  const build = buildFrom(t,
    ['FROM node:22', 'ADD https://example.com/x.tar /opt/', 'COPY a.txt ./'],
    ['a.txt']);
  assert.deepEqual(build().src, [DOCKERFILE_NAME, 'a.txt']);
  t.end();
});

test('docker build context strips comments before joining continuations, ' +
  'as Docker does', (t) => {
  const build = buildFrom(t, [
    'FROM node:22',
    '# a comment that ends in a backslash \\',
    'COPY tools/ ./tools/',
    'COPY a.txt \\',
    '# a comment inside the continuation',
    '  b.txt ./',
  ], ['tools/', 'a.txt', 'b.txt']);
  assert.deepEqual(build().src, [DOCKERFILE_NAME, 'a.txt', 'b.txt',
    'tools/nested/placeholder.txt']);
  t.end();
});

test('every COPY source of the repository Dockerfile resolves to files ' +
  'that exist in the real repository', (t) => {
  const repositoryRoot = fileURLToPath(REPOSITORY_ROOT);
  const sources = copySources(readFileSync(REPOSITORY_DOCKERFILE, UTF8));
  const {src} = buildImageContext(repositoryRoot, DOCKERFILE_NAME);
  const unresolved = arrayFilter(sources, (source) => {
    const normalized = normalizedSource(source);
    const covering = arrayFilter(src, (entry) => entry === normalized ||
      stringStartsWith(entry, `${normalized}${DIRECTORY_SUFFIX}`));
    return !arraySome(covering, (entry) => {
      const absolute = path.join(repositoryRoot, entry);
      return existsSync(absolute) && statSync(absolute).isFile();
    });
  });
  assert.deepEqual(unresolved, [],
    `COPY sources with no existing file in the repository: ${
      unresolved.join(', ')}`);
  t.end();
});
