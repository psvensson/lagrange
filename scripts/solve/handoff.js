// Scope-safe git handoff — compute the exact pathspec for committing ONE Quest.
//
// The repository convention is that a Quest's commit must contain only that
// Quest's work: its sealed quest file, its append-only log, its regenerated
// report/state, its recorded change artifacts, and the source/test files those
// artifacts actually touched. A mixed working tree (several Quests' edits, plus
// unrelated dirty files) must never be swept into one commit — `audit.js`
// already rejects mis-scoped change artifacts, but nothing computed the safe
// pathspec for the operator. This module does.
//
// Design constraints:
//   - Refuse to hand off a Quest whose audit does not pass. A scope-clean commit
//     of dishonest evidence is still dishonest.
//   - Derive the in-scope set purely from sealed artifacts (the Quest's solve/
//     paths plus the paths named inside its own diffs). Never infer scope from
//     the shape of the dirty tree.
//   - Default to a dry run. Print the exact git commands and explicitly list the
//     out-of-scope dirty files so they are visibly excluded, never silently.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  loadQuest,
  readLog,
  questFilePath,
  logFilePath,
  stateFilePath,
} from './store.js';
import {reportFilePath} from './report.js';
import {auditQuest} from './audit.js';
import {
  expectedChangeDir,
  changedPathsFromDiffContent,
} from './change-artifact.js';

function toRootRelative(root, absolute) {
  return path.relative(root, absolute).replaceAll(path.sep, '/');
}

// The fixed solve/ artifacts a Quest owns by construction, whether or not they
// are currently dirty. The change directory is expressed as a prefix.
function questArtifactPaths(root, questId) {
  return {
    files: [
      questFilePath(root, questId),
      logFilePath(root, questId),
      stateFilePath(root, questId),
      reportFilePath(root, questId),
    ].map((absolute) => toRootRelative(root, absolute)),
    changeDirPrefix: `${toRootRelative(root, expectedChangeDir(root, questId))}/`,
  };
}

// Source/test files named inside this Quest's own change artifacts. These are the
// only non-solve/ paths a Quest legitimately touches.
function diffReferencedPaths(root, questId) {
  const dir = expectedChangeDir(root, questId);
  if (!fs.existsSync(dir)) return [];
  const referenced = new Set();
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.diff')) continue;
    const content = fs.readFileSync(path.join(dir, name), 'utf8');
    for (const filePath of changedPathsFromDiffContent(content)) {
      referenced.add(filePath);
    }
  }
  return [...referenced].sort();
}

// Pure scope decision: a dirty path is in-scope when it is one of the Quest's
// fixed solve/ artifacts, lives under its change directory, or is named by one of
// its diffs. Everything else dirty is explicitly out-of-scope.
export function classifyDirtyPaths(dirtyFiles, scope) {
  const fixed = new Set(scope.files);
  const referenced = new Set(scope.diffReferenced);
  const inScope = [];
  const outOfScope = [];
  for (const file of dirtyFiles) {
    const normalized = file.replaceAll(path.sep, '/');
    const owned = fixed.has(normalized) ||
      normalized.startsWith(scope.changeDirPrefix) ||
      referenced.has(normalized);
    (owned ? inScope : outOfScope).push(normalized);
  }
  return {inScope: inScope.sort(), outOfScope: outOfScope.sort()};
}

function gitDirtyFiles(root) {
  // -uall lists individual untracked files; without it git collapses a wholly
  // untracked directory (e.g. a brand-new quest's solve/ tree) into one entry,
  // which would never match the Quest's per-file scope.
  const output = execFileSync('git', ['status', '--porcelain', '-uall'], {
    cwd: root,
    encoding: 'utf8',
  });
  const files = new Set();
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    // Porcelain v1: XY <path> (or "<orig> -> <path>" for renames).
    const rest = line.slice(3);
    const arrow = rest.indexOf(' -> ');
    files.add(arrow === -1 ? rest : rest.slice(arrow + 4));
  }
  return [...files];
}

export function buildHandoff(root, quest, options = {}) {
  const audit = auditQuest(root, quest);
  const scope = {
    ...questArtifactPaths(root, quest.id),
    diffReferenced: diffReferencedPaths(root, quest.id),
  };
  const dirtyFiles = options.dirtyFiles || gitDirtyFiles(root);
  const {inScope, outOfScope} = classifyDirtyPaths(dirtyFiles, scope);
  const ok = audit.status === 'pass';
  return {
    ok,
    questId: quest.id,
    audit,
    inScope,
    outOfScope,
    summary: quest.statement || quest.id,
  };
}

const COAUTHOR_TRAILER =
  'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>';

function commitMessage(handoff) {
  return `${handoff.questId}: ${handoff.summary}\n\n${COAUTHOR_TRAILER}`;
}

function gitCommands(handoff) {
  if (handoff.inScope.length === 0) return [];
  return [
    ['git', 'add', '--', ...handoff.inScope],
    ['git', 'commit', '--only', '-m', commitMessage(handoff), '--',
      ...handoff.inScope],
    ['git', 'push'],
  ];
}

export function renderHandoff(handoff) {
  const lines = ['# Quest handoff', '', `- quest: ${handoff.questId}`,
    `- audit: ${handoff.audit.status}`];
  if (!handoff.ok) {
    lines.push('', 'REFUSED: audit must pass before handoff. Resolve audit problems:');
    for (const item of handoff.audit.problems) {
      lines.push(`- ${item.message}${item.frontier ? ` [${item.frontier}]` : ''}`);
    }
    lines.push('');
    return lines.join('\n');
  }
  lines.push('', '## In scope (will be committed)');
  if (handoff.inScope.length === 0) {
    lines.push('_(no dirty in-scope files — nothing to commit)_');
  } else {
    for (const file of handoff.inScope) lines.push(`- ${file}`);
  }
  lines.push('', '## Out of scope (excluded, NOT committed)');
  if (handoff.outOfScope.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const file of handoff.outOfScope) lines.push(`- ${file}`);
  }
  lines.push('', '## Commands');
  const commands = gitCommands(handoff);
  if (commands.length === 0) {
    lines.push('_(nothing to do)_');
  } else {
    for (const command of commands) {
      lines.push(`  ${command.map((part) => (/\s/u.test(part) ? `"${part}"` : part)).join(' ')}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function executeCommit(root, handoff) {
  for (const command of gitCommands(handoff)) {
    execFileSync(command[0], command.slice(1), {cwd: root, stdio: 'inherit'});
  }
}

// Is `root` inside a real git work tree? Auto-commit must be a no-op in throwaway
// tmpdirs (e.g. the unit-test fixtures) and anywhere git is unavailable, so we never
// surface a hard failure for an environment that simply isn't a repository.
function insideWorkTree(root) {
  try {
    const out = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() === 'true';
  } catch {
    return false;
  }
}

// Auto commit (and optionally push) a Quest's in-scope work as it progresses, so the
// Solver routinely persists its own scope-clean changes instead of accumulating an
// unrecoverable dirty tree. This is the programmatic counterpart of `handoff --commit`
// and obeys the same scope and honesty rules:
//   - never runs outside a git work tree (returns {skipped:'not-a-git-work-tree'});
//   - refuses when the Quest's audit does not pass (a scope-clean commit of dishonest
//     evidence is still dishonest);
//   - commits only the Quest's in-scope pathspec, never the dirty-tree shape;
//   - skips cleanly when there is nothing in scope to commit;
//   - pushes by default but treats a push failure as non-fatal — the commit is never
//     lost — and can be suppressed with {push:false} (the --no-push / SOLVER_NO_PUSH
//     escape hatch for offline or CI use).
export function autoCommitQuest(root, questId, options = {}) {
  if (!insideWorkTree(root)) {
    return {committed: false, skipped: 'not-a-git-work-tree'};
  }
  const push = options.push !== false && process.env.SOLVER_NO_PUSH !== '1';
  const quest = loadQuest(root, questId);
  const handoff = buildHandoff(root, quest);
  if (!handoff.ok) {
    return {committed: false, skipped: 'audit-failed', audit: handoff.audit};
  }
  if (handoff.inScope.length === 0) {
    return {committed: false, skipped: 'nothing-in-scope'};
  }
  execFileSync('git', ['add', '--', ...handoff.inScope], {cwd: root, stdio: 'ignore'});
  execFileSync('git', ['commit', '--only', '-m', commitMessage(handoff), '--',
    ...handoff.inScope], {cwd: root, stdio: 'ignore'});
  const result = {
    committed: true,
    paths: handoff.inScope,
    pushed: false,
    questId,
  };
  if (push) {
    try {
      execFileSync('git', ['push'], {cwd: root, stdio: 'ignore'});
      result.pushed = true;
    } catch (err) {
      result.pushError = err.message;
    }
  }
  return result;
}

export function runHandoffCommand(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('handoff: --id <questId> is required');
  const quest = loadQuest(root, id);
  // readLog is cheap and keeps a clear failure if the quest log is missing.
  readLog(root, id);
  const handoff = buildHandoff(root, quest);
  const rendered = renderHandoff(handoff);
  if (args.commit && handoff.ok && handoff.inScope.length > 0) {
    executeCommit(root, handoff);
    return `${rendered}\n(committed ${handoff.inScope.length} path(s))\n`;
  }
  if (args.commit && !handoff.ok) {
    return `${rendered}\n(not committed: audit failed)\n`;
  }
  return `${rendered}\n(dry run — pass --commit to execute)\n`;
}
