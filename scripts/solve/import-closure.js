// Static import-closure completeness for a landing candidate. Independent
// verifiers repeatedly reject candidates whose files import a changed owner
// that was left out of the candidate's path set — each omission discovered one
// full verification cycle at a time. This projection finds those gaps
// deterministically before a verifier turn is spent: a source file changed
// relative to the candidate's base but absent from the candidate is suspect,
// and one that a candidate file directly imports is a near-certain rejection.
// Advisory by design: it never blocks the gate, it informs the pre-delegation
// decision in `next` and `checkpoint --dry-run`.

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {parseSourceFile, walkAst} from '../guideline-check-shared.js';
import {requiresSourceVerification} from './change-artifact.js';

const IMPORT_DECLARATION = 'ImportDeclaration';
const JS_EXTENSION = '.js';

function gitLines(root, args) {
  const out = execFileSync('git', args, {cwd: root, encoding: 'utf8'});
  return out.split('\n').filter(Boolean);
}

// Every tracked path changed between baseCommit and the working tree, plus
// untracked (not ignored) files — i.e. everything the candidate's byte
// comparison surface could differ on — filtered to source-verification scope.
export function changedSourcePathsSinceBase(root, baseCommit) {
  const changed = gitLines(root, ['diff', '--name-only', baseCommit]);
  const untracked = gitLines(root,
    ['ls-files', '--others', '--exclude-standard']);
  return [...new Set([...changed, ...untracked])]
    .filter(requiresSourceVerification)
    .sort();
}

function relativeImportSpecifiers(root, importer) {
  const absolute = path.join(root, importer);
  let source;
  try {
    source = fs.readFileSync(absolute, 'utf8');
  } catch {
    return [];
  }
  let ast;
  try {
    ast = parseSourceFile(source);
  } catch {
    return [];
  }
  const specifiers = [];
  walkAst(ast, (node) => {
    if (node.type !== IMPORT_DECLARATION) return;
    const specifier = node.source?.value;
    if (typeof specifier === 'string' && specifier.startsWith('.')) {
      specifiers.push(specifier);
    }
  });
  return specifiers;
}

function resolveRepoRelative(importer, specifier) {
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(importer), specifier));
  return resolved.endsWith(JS_EXTENSION) ? resolved : `${resolved}${JS_EXTENSION}`;
}

// Compute the candidate's closure gaps. `candidate` needs `baseCommit` and
// `paths`; both come from the landing candidate built by verificationState.
// Options: `changedPaths` injects the changed-file list (tests, callers that
// already ran git).
export function importClosureGaps(root, candidate, options = {}) {
  const empty = {omittedChangedPaths: [], importGaps: []};
  const candidatePaths = [...(candidate?.paths || [])];
  if (!candidate?.baseCommit || candidatePaths.length === 0) return empty;
  let changed;
  try {
    changed = options.changedPaths ||
      changedSourcePathsSinceBase(root, candidate.baseCommit);
  } catch {
    // An unreadable base (e.g. shallow history) yields no projection rather
    // than a false gap; the exact-fingerprint gate still guards correctness.
    return empty;
  }
  const candidateSet = new Set(candidatePaths);
  const omitted = changed.filter((filePath) => !candidateSet.has(filePath));
  if (omitted.length === 0) return empty;
  const omittedSet = new Set(omitted);
  const gaps = new Map();
  for (const importer of candidatePaths) {
    if (!importer.endsWith(JS_EXTENSION)) continue;
    for (const specifier of relativeImportSpecifiers(root, importer)) {
      const imported = resolveRepoRelative(importer, specifier);
      if (!omittedSet.has(imported)) continue;
      gaps.set(`${importer}\0${imported}`, {importer, imported});
    }
  }
  return {
    omittedChangedPaths: omitted,
    importGaps: [...gaps.values()].sort((left, right) =>
      `${left.importer}\0${left.imported}`.localeCompare(
        `${right.importer}\0${right.imported}`)),
  };
}
