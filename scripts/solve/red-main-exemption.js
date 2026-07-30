#!/usr/bin/env node

// Known-attributed-red exemptions for the red-main push guard.
//
// Parallel-session architecture epic, item 7 follow-up: the red-main guard
// refuses main pushes while the latest completed CI run on main is red. When
// a specific red run is KNOWN and attributed (a fix is in flight), unrelated
// main pushes should not all need LAGRANGE_PUSH_ON_RED. An exemption records
// the exact failing run's headSha in the shared git common dir — beside the
// session registry and evidence lock, so every worktree resolves it — and
// the pre-push guard exempts a push only while the current red head matches
// an acknowledged one.
//
// The exemption is keyed on the CI run's headSha, not on a conclusion word:
// a new red run at a different head is a NEW signal and blocks again. This
// keeps the guard's purpose (never ignore an unattributed red) intact.
//
// CLI:
//   node scripts/solve/red-main-exemption.js ack <headSha> [--reason <text>]
//   node scripts/solve/red-main-exemption.js clear [headSha]
//   node scripts/solve/red-main-exemption.js list
//   node scripts/solve/red-main-exemption.js is-exempt <headSha>   (exit 0/1)

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const EXEMPTION_DIR_SEGMENTS = ['lagrange-sessions', 'red-main-exemptions'];
const TEXT_ENCODING = 'utf8';
const JSON_EXTENSION = '.json';
const GIT_BINARY = 'git';
const GIT_COMMON_DIR_ARGUMENTS = Object.freeze(['rev-parse', '--git-common-dir']);
const REASON_FLAG = '--reason';
const EXIT_USAGE = 2;
const EXIT_NOT_EXEMPT = 1;
const SHA_PATTERN = /^[0-9a-f]{7,40}$/u;

function gitCommonDir(root) {
  return path.resolve(
    root, execFileSync(GIT_BINARY, GIT_COMMON_DIR_ARGUMENTS,
      {cwd: root, encoding: TEXT_ENCODING}).trim());
}

export function exemptionDir(root) {
  return path.join(gitCommonDir(root), ...EXEMPTION_DIR_SEGMENTS);
}

function exemptionPath(root, headSha) {
  return path.join(exemptionDir(root), `${headSha}${JSON_EXTENSION}`);
}

function assertSha(headSha) {
  if (!SHA_PATTERN.test(headSha)) {
    process.stderr.write(
      `red-main-exemption: '${headSha}' is not a commit sha\n`);
    process.exit(EXIT_USAGE);
  }
}

function ack(root, headSha, reason) {
  assertSha(headSha);
  fs.mkdirSync(exemptionDir(root), {recursive: true});
  const payload = {
    headSha,
    reason: reason ?? null,
    acknowledgedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    exemptionPath(root, headSha), `${JSON.stringify(payload, null, 2)}\n`);
  process.stdout.write(
    `red-main-exemption: acknowledged red CI head ${headSha}` +
    `${reason ? ` (${reason})` : ''}\n`);
  return 0;
}

function clear(root, headSha) {
  if (headSha) {
    assertSha(headSha);
    fs.rmSync(exemptionPath(root, headSha), {force: true});
    process.stdout.write(`red-main-exemption: cleared ${headSha}\n`);
    return 0;
  }
  fs.rmSync(exemptionDir(root), {recursive: true, force: true});
  process.stdout.write('red-main-exemption: cleared all exemptions\n');
  return 0;
}

function list(root) {
  let entries = [];
  try {
    entries = fs.readdirSync(exemptionDir(root))
      .filter((name) => name.endsWith(JSON_EXTENSION));
  } catch {
    entries = [];
  }
  if (entries.length === 0) {
    process.stdout.write('red-main-exemption: no acknowledged red heads\n');
    return 0;
  }
  for (const name of entries) {
    try {
      const payload = JSON.parse(
        fs.readFileSync(path.join(exemptionDir(root), name), TEXT_ENCODING));
      process.stdout.write(
        `${payload.headSha}  ${payload.acknowledgedAt}  ` +
        `${payload.reason ?? '(no reason)'}\n`);
    } catch {
      process.stdout.write(`${name}  (unparsable — cleared on next clear)\n`);
    }
  }
  return 0;
}

export function isExempt(root, headSha) {
  if (!SHA_PATTERN.test(headSha)) {
    return false;
  }
  return fs.existsSync(exemptionPath(root, headSha));
}

function main(argv, root = process.cwd()) {
  const [verb, first, ...rest] = argv.slice(2);
  if (verb === 'ack' && first) {
    const reasonIndex = rest.indexOf(REASON_FLAG);
    const reason = reasonIndex >= 0 ? rest[reasonIndex + 1] : null;
    return ack(root, first, reason);
  }
  if (verb === 'clear') {
    return clear(root, first ?? null);
  }
  if (verb === 'list') {
    return list(root);
  }
  if (verb === 'is-exempt' && first) {
    return isExempt(root, first) ? 0 : EXIT_NOT_EXEMPT;
  }
  process.stderr.write(
    'usage: red-main-exemption.js ack <headSha> [--reason <text>] | ' +
    'clear [headSha] | list | is-exempt <headSha>\n');
  return EXIT_USAGE;
}

// Only run the CLI when invoked directly: importing isExempt must not
// clobber the importer's exit code with a usage error (same guard as
// session-worktree.js and check-file-size-thresholds.js).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}
