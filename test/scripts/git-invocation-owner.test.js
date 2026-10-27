// The git invocation owner (scripts/checks/git-invocation.js) is the one way a
// repository script or test starts `git`. Two halves are pinned here:
//
// 1. Its contract: output past the named bound is the typed
//    GitOutputTooLargeError for every calling style, never a null status, a
//    generic ENOBUFS or a truncated read; a nonzero exit keeps the calling
//    style's own semantics; only a named bound is admitted.
// 2. Its exclusivity: a census of every JavaScript file under scripts/ and
//    test/ that starts `git` anywhere but through the owner. The incident it
//    guards: 55+ unbounded call sites went red together on 2026-10-24 when
//    the tracked-file list passed Node's 1 MiB default, and each had a local
//    bound or none.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  GIT_OUTPUT_BOUND,
  GIT_OUTPUT_TOO_LARGE,
  GitOutputTooLargeError,
  execGit,
  execGitAsync,
  isGitOutputTooLarge,
  spawnGit,
} from '../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {parseSourceFile} from '../../scripts/guideline-check-shared.js';

const root = process.cwd();
const UTF8 = 'utf8';
const OWNER = 'scripts/checks/git-invocation.js';
const CENSUS_ROOTS = Object.freeze(['scripts', 'test']);
const JAVASCRIPT_FILE = /\.(?:m|c)?js$/u;
// Patterns, not string literals: this census must not hold the literal it
// refuses everywhere but the owner.
const GIT_EXECUTABLE = /^git$/u;
const GIT_MENTION = /git/u;
const GIT_COMMAND_LINE = /^git(?:\s|$)/u;
const CHILD_PROCESS_SOURCES = new Set(['child_process', 'node:child_process']);
const CHILD_PROCESS_STARTERS = new Set(
  ['exec', 'execFile', 'execFileSync', 'execSync', 'fork', 'spawn', 'spawnSync']);
const PROMISIFY = 'promisify';
// Where a bare 'git' literal names the executable rather than a tool token
// (the lab capability tables list 'git' as a host package, never as a call).
const EXECUTABLE_POSITIONS = new Set(
  ['CallExpression', 'NewExpression', 'VariableDeclarator', 'AssignmentExpression',
    'AssignmentPattern', 'ReturnStatement']);

function scratchRepository(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'git-invocation-'));
  t.after(() => fs.rmSync(repo, {recursive: true, force: true}));
  const options = {cwd: repo, encoding: UTF8, env: gitProcessEnvironment()};
  execGit(['init', '-q'], options);
  return {repo, options};
}

// One blob one byte past the command bound, stored compressed: the object
// store holds a few KiB, `cat-file -p` prints the whole.
function oversizedBlob(t) {
  const {repo, options} = scratchRepository(t);
  const sha = execGit(['hash-object', '-w', '--stdin'],
    {...options, input: 'x'.repeat(GIT_OUTPUT_BOUND.COMMAND + 1)}).trim();
  return {repo, options, sha};
}

function assertTyped(error, args) {
  assert.ok(error instanceof GitOutputTooLargeError, 'the typed failure');
  assert.ok(isGitOutputTooLarge(error));
  assert.equal(error.code, GIT_OUTPUT_TOO_LARGE);
  assert.equal(error.maxBytes, GIT_OUTPUT_BOUND.COMMAND);
  assert.deepEqual(error.args, args);
  assert.match(error.message,
    new RegExp(`output exceeded the git output bound of ${GIT_OUTPUT_BOUND.COMMAND} bytes`, 'u'));
  return true;
}

test('output past the bound is the typed failure for every calling style', async (t) => {
  const {options, sha} = oversizedBlob(t);
  const args = ['cat-file', '-p', sha];
  assert.throws(() => spawnGit(args, options), (error) => assertTyped(error, args),
    'spawnSync style: never a null status the caller compares to 0');
  assert.throws(() => execGit(args, options), (error) => assertTyped(error, args),
    'execFileSync style: never a generic ENOBUFS');
  await assert.rejects(execGitAsync(args, options), (error) => assertTyped(error, args),
    'execFile style: never a truncated read');
});

test('a named larger bound admits what the command bound refuses', (t) => {
  const {options, sha} = oversizedBlob(t);
  const shown = spawnGit(['cat-file', '-p', sha],
    {...options, bound: GIT_OUTPUT_BOUND.HISTORY_BLOB_BATCH});
  assert.equal(shown.status, 0);
  assert.equal(shown.stdout.length, GIT_OUTPUT_BOUND.COMMAND + 1, 'read whole');
  assert.ok(GIT_OUTPUT_BOUND.HISTORY_BLOB_BATCH > GIT_OUTPUT_BOUND.COMMAND);
});

test('only a named bound is admitted, and a caller maxBuffer never wins', (t) => {
  const {options, sha} = oversizedBlob(t);
  assert.throws(() => spawnGit(['--version'], {bound: 1024}),
    {code: 'git-output-bound-unnamed'});
  assert.throws(() => spawnGit(['cat-file', '-p', sha], {...options, maxBuffer: Infinity}),
    (error) => isGitOutputTooLarge(error), 'the owner bound replaces a local one');
});

test('a nonzero exit keeps each calling style\'s own semantics', async (t) => {
  const {options} = scratchRepository(t);
  const args = ['rev-parse', '--verify', '--quiet', 'refs/heads/absent'];
  const spawned = spawnGit(args, options);
  assert.equal(spawned.status, 1, 'spawnSync style returns the status');
  assert.throws(() => execGit(args, options), (error) =>
    error.status === 1 && !isGitOutputTooLarge(error), 'execFileSync style throws');
  await assert.rejects(execGitAsync(args, options), (error) =>
    error.code === 1 && !isGitOutputTooLarge(error), 'execFile style rejects');
  assert.match(execGit(['--version'], {encoding: UTF8}), /^git version /u);
});

// --- exclusivity census --------------------------------------------------------

function censusFiles() {
  const listed = execGit(['ls-files', '-z', '--cached', '--others', '--exclude-standard',
    '--', ...CENSUS_ROOTS], {cwd: root, encoding: UTF8, env: gitProcessEnvironment()});
  return [...new Set(listed.split('\0'))].filter((file) =>
    JAVASCRIPT_FILE.test(file) && file !== OWNER && fs.existsSync(path.join(root, file)))
    .sort();
}

function visit(node, parent, visitor) {
  if (!node || typeof node.type !== 'string') return;
  visitor(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    if (Array.isArray(value)) {
      for (const child of value) visit(child, node, visitor);
    } else if (value && typeof value.type === 'string') {
      visit(value, node, visitor);
    }
  }
}

function isGitLiteral(node) {
  return node?.type === 'Literal' && typeof node.value === 'string' &&
    GIT_EXECUTABLE.test(node.value);
}

function isGitCommandLine(node) {
  if (node?.type === 'Literal') {
    return typeof node.value === 'string' && GIT_COMMAND_LINE.test(node.value);
  }
  return node?.type === 'TemplateLiteral' &&
    GIT_COMMAND_LINE.test(node.quasis[0].value.cooked);
}

function objectLiteralOf(init) {
  if (init?.type === 'ObjectExpression') return init;
  if (init?.type === 'CallExpression' && init.arguments[0]?.type === 'ObjectExpression') {
    return init.arguments[0];
  }
  return null;
}

function isChildProcessSource(source) {
  return CHILD_PROCESS_SOURCES.has(source?.value);
}

// `import {execFile} from 'node:child_process'` and namespace/default imports.
function collectStaticImport(node, bindings) {
  if (node.type !== 'ImportDeclaration' || !isChildProcessSource(node.source)) return;
  for (const specifier of node.specifiers) {
    if (specifier.type !== 'ImportSpecifier') {
      bindings.namespaces.add(specifier.local.name);
    } else if (CHILD_PROCESS_STARTERS.has(specifier.imported.name)) {
      bindings.starters.add(specifier.local.name);
    }
  }
}

// `const {spawnSync} = await import('node:child_process')`.
function collectDynamicImport(node, init, bindings) {
  if (node.id.type !== 'ObjectPattern' || init?.type !== 'ImportExpression' ||
      !isChildProcessSource(init.source)) return;
  for (const property of node.id.properties) {
    if (CHILD_PROCESS_STARTERS.has(property.key?.name)) {
      bindings.starters.add(property.value.name);
    }
  }
}

// `const run = promisify(execFile)`.
function collectPromisified(node, init, bindings) {
  if (node.id.type !== 'Identifier' || init?.type !== 'CallExpression' ||
      init.callee.name !== PROMISIFY) return;
  if (bindings.starters.has(init.arguments[0]?.name)) bindings.starters.add(node.id.name);
}

// `const text = {GIT: 'git'}`: `text.GIT` names the git executable.
function collectGitMembers(node, init, bindings) {
  if (node.id.type !== 'Identifier') return;
  for (const property of objectLiteralOf(init)?.properties || []) {
    if (property.type === 'Property' && isGitLiteral(property.value)) {
      bindings.gitMembers.add(`${node.id.name}.${property.key.name ?? property.key.value}`);
    }
  }
}

// Module bindings that start a child process (named, namespace, default,
// dynamic and promisified imports of child_process), and `name.KEY` members
// of object constants whose value is the git executable.
function bindingsOf(ast) {
  const bindings = {starters: new Set(), namespaces: new Set(), gitMembers: new Set()};
  visit(ast, null, (node) => {
    collectStaticImport(node, bindings);
    if (node.type !== 'VariableDeclarator') return;
    const init = node.init?.type === 'AwaitExpression' ? node.init.argument : node.init;
    collectDynamicImport(node, init, bindings);
    collectPromisified(node, init, bindings);
    collectGitMembers(node, init, bindings);
  });
  return bindings;
}

function startsChildProcess(callee, bindings) {
  if (callee.type === 'Identifier') return bindings.starters.has(callee.name);
  return callee.type === 'MemberExpression' && callee.object.type === 'Identifier' &&
    bindings.namespaces.has(callee.object.name) &&
    CHILD_PROCESS_STARTERS.has(callee.property.name);
}

function namesGitMember(node, bindings) {
  return node?.type === 'MemberExpression' && node.object.type === 'Identifier' &&
    bindings.gitMembers.has(`${node.object.name}.${node.property.name}`);
}

function gitInvocationsOutsideOwner(file, source) {
  const ast = parseSourceFile(source);
  const bindings = bindingsOf(ast);
  const found = [];
  const at = (node, what) => found.push(`${file}:${node.loc.start.line}: ${what}`);
  visit(ast, null, (node, parent) => {
    if (isGitLiteral(node) && EXECUTABLE_POSITIONS.has(parent?.type) &&
        !(parent.type === 'VariableDeclarator' && parent.id === node)) {
      at(node, `the git executable named outside the owner (${parent.type})`);
    }
    if ((node.type === 'CallExpression' || node.type === 'NewExpression') &&
        startsChildProcess(node.callee, bindings)) {
      const [command] = node.arguments;
      if (isGitCommandLine(command) || namesGitMember(command, bindings)) {
        at(node, 'a child process starts git outside the owner');
      }
    }
  });
  return found;
}

test('nothing under scripts/ or test/ starts git except through the owner', () => {
  const files = censusFiles();
  assert.ok(files.length > 1000, `the census reads the real tree (${files.length} files)`);
  const offences = [];
  const unparsed = [];
  let scanned = 0;
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), UTF8);
    // Every offence spells "git" in the source; a file without it cannot hold one.
    if (!GIT_MENTION.test(source)) continue;
    scanned += 1;
    try {
      offences.push(...gitInvocationsOutsideOwner(file, source));
    } catch (error) {
      unparsed.push(`${file}: ${error.message}`);
    }
  }
  assert.ok(scanned > 0, 'the census scanned files that mention git');
  assert.deepEqual(unparsed, [], 'an unparsed file is withheld analysis, never a pass');
  assert.deepEqual(offences, [],
    `start git through ${OWNER} (spawnGit, execGit, execGitAsync); its bound and ` +
    'overflow failure are the only ones');
});

test('the census detector sees every way a file can start git', () => {
  const offending = [
    ['literal', 'import {execFileSync} from \'node:child_process\';\n' +
      'execFileSync(\'git\', [\'ls-files\']);'],
    ['constant', 'const GIT_BINARY = \'git\';'],
    ['generic runner', 'run(\'git\', [\'status\']);'],
    ['shell line', 'import {execSync} from \'child_process\';\nexecSync(`git ls-files`);'],
    ['namespace', 'import cp from \'node:child_process\';\ncp.spawnSync(\'git\', []);'],
    ['promisified member', 'import {execFile} from \'node:child_process\';\n' +
      'import {promisify} from \'node:util\';\nconst run = promisify(execFile);\n' +
      'const text = Object.freeze({GIT: \'git\'});\nawait run(text.GIT, []);'],
    ['dynamic import', 'const {spawnSync} = await import(\'node:child_process\');\n' +
      'spawnSync(\'git\', []);'],
  ];
  for (const [label, source] of offending) {
    assert.ok(gitInvocationsOutsideOwner(label, source).length > 0, `${label} is caught`);
  }
  const clean = [
    'import {execGit} from \'./checks/git-invocation.js\';\nexecGit([\'ls-files\']);',
    'const TOOLS = [\'git\', \'docker\'];\nconst tool = {token: \'git\'};',
    'throw new Error(`git ${args.join(\' \')} failed`);',
  ];
  for (const source of clean) {
    assert.deepEqual(gitInvocationsOutsideOwner('clean', source), [], source);
  }
});
