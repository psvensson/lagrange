#!/usr/bin/env node

// Generates docs/steering/generated/solve-commands.md: a COMPLETE, always-current
// reference for every `scripts/solve.js` subcommand. Ground truth is the COMMANDS
// dispatch map parsed straight out of scripts/solve.js, so a newly registered
// subcommand can never silently go undocumented. Descriptions/usage come from the
// curated sidecar docs/steering/solve-commands.json.
//
// Run via `npm run steering:generate`; `steering:check` then fails if the committed
// index drifts from the actual CLI — in EITHER direction:
//   - a registered command with no sidecar entry renders as `(undocumented)`;
//   - a sidecar entry for a command that is no longer registered renders under
//     `Documented but not registered`.
// Both change the file, so the git-diff guard catches them. (As with every
// generated pack, the guard only fires once the file is committed, since
// `git diff` ignores untracked files.)
//
// solve.js cannot be imported here: it calls main() unconditionally at module load,
// so importing it would execute the CLI. We parse its source text instead.

import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

import {parseSourceFile, walkAst} from './guideline-check-shared.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, '..');
const SOLVE_JS_PATH = join(REPO_ROOT, 'scripts/solve.js');
const SOLVE_MODULES_DIR = join(REPO_ROOT, 'scripts/solve');
const SIDECAR_PATH = join(REPO_ROOT, 'docs/steering/solve-commands.json');
const OUTPUT_PATH = join(REPO_ROOT, 'docs/steering/generated/solve-commands.md');

const NEWLINE = '\n';
const UNDOCUMENTED = '(undocumented — add an entry to `docs/steering/solve-commands.json`)';
const SOURCE_FILE_EXTENSION = '.js';
const TEXT_ENCODING = 'utf8';
const ARGUMENTS_IDENTIFIER = 'args';
const IDENTIFIER_NODE = 'Identifier';
const LITERAL_NODE = 'Literal';
const MEMBER_EXPRESSION_NODE = 'MemberExpression';
const VARIABLE_DECLARATION_NODE = 'VariableDeclaration';
const CONST_DECLARATION = 'const';
const REGEXP_ESCAPE_REPLACEMENT = '\\$&';
const SOLVE_SOURCE_TREE_LOCATION = 'in scripts/solve.js or scripts/solve/*.js';
const STALE_FLAG_FAILURE_HEADER =
  'gen-solve-commands-index: stale sidecar usage flags:\n  - ';
const FAILURE_LIST_SEPARATOR = '\n  - ';
const STALE_FLAG_REMEDIATION =
  '\n  Fix the row in docs/steering/solve-commands.json (or add the flag ' +
  'to that entry\'s flagCheckExempt array if it is a passthrough flag).';

// Pull the registered subcommand names out of the `const COMMANDS = { ... }`
// dispatch map. Each entry maps a (quoted) name to a `cmd*` handler; matching on
// the handler avoids picking up anything else inside the object literal. Order is
// preserved as declared, which is the canonical dispatch order.
function registeredCommands(source) {
  const open = source.indexOf('const COMMANDS = {');
  if (open === -1) throw new Error('gen-solve-commands-index: COMMANDS map not found in solve.js');
  const close = source.indexOf('};', open);
  if (close === -1) throw new Error('gen-solve-commands-index: COMMANDS map not terminated');
  const block = source.slice(open, close);
  const names = [];
  const entry = /['"]([\w-]+)['"]\s*:\s*cmd\w+/gu;
  let match;
  while ((match = entry.exec(block)) !== null) names.push(match[1]);
  if (names.length === 0) throw new Error('gen-solve-commands-index: no commands parsed from COMMANDS map');
  return names;
}

function loadSidecar() {
  return JSON.parse(readFileSync(SIDECAR_PATH, TEXT_ENCODING));
}

// Concatenated handler source: solve.js plus every module under scripts/solve/.
// Handlers are spread across these files, so flag existence is checked against
// the whole tree (lenient by design — a flag that appears NOWHERE is certainly
// a stale sidecar row; per-handler precision would risk false positives).
function loadSolveSourceTree() {
  const chunks = [readFileSync(SOLVE_JS_PATH, TEXT_ENCODING)];
  for (const name of readdirSync(SOLVE_MODULES_DIR)) {
    if (name.endsWith(SOURCE_FILE_EXTENSION)) {
      chunks.push(readFileSync(join(SOLVE_MODULES_DIR, name), TEXT_ENCODING));
    }
  }
  return chunks;
}

// Extract `--flag` tokens from a sidecar usage row. `<...>` placeholder and
// `[...]`-free-text spans can legitimately mention pseudo-flags (e.g. probe's
// "[probe-specific args...]"), so placeholders are stripped before scanning;
// real optional flags like `[--max 20]` survive because the token itself is
// outside any `<...>` span.
function usageFlags(usage) {
  const withoutPlaceholders = String(usage || '').replace(/<[^>]*>/gu, ' ');
  const flags = new Set();
  const flagPattern = /--([A-Za-z][A-Za-z0-9-]*)/gu;
  let match;
  while ((match = flagPattern.exec(withoutPlaceholders)) !== null) {
    flags.add(match[1]);
  }
  return [...flags];
}

function escapeRegExp(value) {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/gu,
    REGEXP_ESCAPE_REPLACEMENT,
  );
}

function computedArgumentConstantKnown(source, flag) {
  const syntaxTree = parseSourceFile(source);
  const declaredConstants = new Set();
  for (const statement of syntaxTree.body) {
    if (statement.type !== VARIABLE_DECLARATION_NODE ||
        statement.kind !== CONST_DECLARATION) {
      continue;
    }
    for (const declaration of statement.declarations) {
      if (declaration.id?.type === IDENTIFIER_NODE &&
          declaration.init?.type === LITERAL_NODE &&
          declaration.init.value === flag) {
        declaredConstants.add(declaration.id.name);
      }
    }
  }
  if (declaredConstants.size === 0) return false;

  let found = false;
  walkAst(syntaxTree, (node) => {
    if (node.type === MEMBER_EXPRESSION_NODE &&
        node.computed === true &&
        node.object?.type === IDENTIFIER_NODE &&
        node.object.name === ARGUMENTS_IDENTIFIER &&
        node.property?.type === IDENTIFIER_NODE &&
        declaredConstants.has(node.property.name)) {
      found = true;
    }
  });
  return found;
}

// A flag is "known" when the solve source tree references it in any of the
// shapes its parseArgs produces: `args.<flag>` / `args['<flag>']` /
// `args["<flag>"]`, or the literal `--<flag>` (help text, string dispatch).
export function flagKnownToSource(source, flag) {
  const chunks = Array.isArray(source) ? source : [source];
  const escaped = escapeRegExp(flag);
  const pattern = new RegExp(
    `args\\.${escaped}\\b|args\\[['"]${escaped}['"]\\]|--${escaped}(?![A-Za-z0-9-])`,
    'u',
  );
  return chunks.some((chunk) =>
    pattern.test(chunk) || computedArgumentConstantKnown(chunk, flag));
}

// Verify every `--flag` in every sidecar usage row against the actual solve
// source tree. Command-name coverage is already checked both directions by the
// render step; this closes the remaining gap (rows documenting flags no handler
// reads). A sidecar entry may declare `flagCheckExempt: ["flag", ...]` for
// passthrough flags that are intentionally not read by solve.js itself.
function validateSidecarUsageFlags(commands, sidecar, solveSource) {
  const staleFlags = [];
  for (const name of commands) {
    const doc = sidecar[name];
    if (!doc || typeof doc.usage !== 'string') continue;
    const exempt = new Set(doc.flagCheckExempt || []);
    for (const flag of usageFlags(doc.usage)) {
      if (exempt.has(flag)) continue;
      if (!flagKnownToSource(solveSource, flag)) {
        staleFlags.push(
          `sidecar row "${name}" documents --${flag}, which appears nowhere ` +
          SOLVE_SOURCE_TREE_LOCATION,
        );
      }
    }
  }
  if (staleFlags.length > 0) {
    throw new Error(
      STALE_FLAG_FAILURE_HEADER +
      staleFlags.join(FAILURE_LIST_SEPARATOR) +
      STALE_FLAG_REMEDIATION,
    );
  }
}

function render(commands, sidecar) {
  let documented = 0;
  const lines = [
    '<!-- GENERATED by scripts/gen-solve-commands-index.js via `npm run steering:generate`. Do not hand-edit. -->',
    '<!-- Add or correct entries in docs/steering/solve-commands.json (the curated sidecar). -->',
    '---',
    'scope: reference',
    'status: generated',
    'always_load: false',
    'source_of_truth: scripts/solve.js + docs/steering/solve-commands.json',
    '---',
    '',
    '# Solver CLI — Command Reference',
    '',
    'Complete, always-current reference for every `node scripts/solve.js`',
    'subcommand. Ground truth is the dispatch map in',
    '[`scripts/solve.js`](../../../scripts/solve.js); descriptions live in the',
    'curated sidecar [`../solve-commands.json`](../solve-commands.json). See',
    'the [`owner router`](../router.md) for the authority behind each ' +
    'guardrail command map.',
    '',
    '| Command | Purpose | Usage |',
    '| --- | --- | --- |',
  ];
  for (const name of commands) {
    const doc = sidecar[name];
    if (doc && typeof doc.summary === 'string') {
      documented += 1;
      const usage = doc.usage ? `\`${doc.usage}\`` : '';
      lines.push(`| \`${name}\` | ${doc.summary} | ${usage} |`);
    } else {
      lines.push(`| \`${name}\` | ${UNDOCUMENTED} | \`node scripts/solve.js ${name} ...\` |`);
    }
  }
  const orphans = Object.keys(sidecar)
    .filter((key) => !key.startsWith('_'))
    .filter((key) => !commands.includes(key));
  if (orphans.length > 0) {
    lines.push(
      '',
      '## Documented but not registered',
      '',
      'These sidecar entries name commands that are NOT in the `solve.js` dispatch',
      'map — remove them from `docs/steering/solve-commands.json` or restore the',
      'command:',
      '',
    );
    for (const key of orphans) lines.push(`- \`${key}\``);
  }
  lines.push(
    '',
    '---',
    '',
    `${commands.length} subcommands registered; ${documented} documented, ` +
      `${commands.length - documented} undocumented. ` +
      'Improve coverage in `docs/steering/solve-commands.json`.',
    '',
  );
  return lines.join(NEWLINE);
}

function main() {
  const source = readFileSync(SOLVE_JS_PATH, 'utf8');
  const commands = registeredCommands(source);
  const sidecar = loadSidecar();
  validateSidecarUsageFlags(commands, sidecar, loadSolveSourceTree());
  const output = render(commands, sidecar);
  writeFileSync(OUTPUT_PATH, output);
  process.stdout.write(`Wrote ${OUTPUT_PATH}${NEWLINE}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
