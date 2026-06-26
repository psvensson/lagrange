#!/usr/bin/env node
// lookup-rule — make the generated rule corpus reachable.
//
// `docs/steering/llm/rules.json` is ~137KB / 260 rules — it truncates on a
// single Read, so an agent pointed at it cannot load it. This tool answers the
// two questions that blob is cited for ("what does rule X say / where is it
// sourced?") without loading the whole corpus, and maintains a compact
// `rules-index.md` (one line per rule, loadable in one Read) that points back
// here.
//
// Usage:
//   node scripts/lookup-rule.js --id ARCH-0001
//   node scripts/lookup-rule.js --tag cdc
//   node scripts/lookup-rule.js --domain testing --strength must_not
//   node scripts/lookup-rule.js owner cache            # free-text substring
//   node scripts/lookup-rule.js --write-index          # regenerate the index
//   node scripts/lookup-rule.js --check-index          # CI drift guard
//
// The index is a pure projection of rules.json; --check-index fails non-zero if
// the committed index has drifted, so it can never silently go stale.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const RULES_JSON_PATH = path.join(ROOT, 'docs/steering/llm/rules.json');
const INDEX_MD_PATH = path.join(ROOT, 'docs/steering/llm/rules-index.md');
const INDEX_SUMMARY_CHARS = 90;
const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_DRIFT = 2;

export function loadRules() {
  const raw = fs.readFileSync(RULES_JSON_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed.rules || [];
}

function parseArgs(argv) {
  const flags = {terms: []};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--write-index') flags.writeIndex = true;
    else if (token === '--check-index') flags.checkIndex = true;
    else if (token === '--json') flags.json = true;
    else if (token.startsWith('--')) {
      flags[token.slice(2)] = argv[i + 1];
      i += 1;
    } else flags.terms.push(token.toLowerCase());
  }
  return flags;
}

export function matchesRule(rule, flags) {
  if (flags.id && rule.id !== flags.id) return false;
  if (flags.domain && rule.domain !== flags.domain) return false;
  if (flags.strength && rule.strength !== flags.strength) return false;
  if (flags.tag && !(rule.tags || []).includes(flags.tag)) return false;
  if (flags.terms.length > 0) {
    const hay = `${rule.id} ${rule.rule}`.toLowerCase();
    if (!flags.terms.every((term) => hay.includes(term))) return false;
  }
  return true;
}

function renderRule(rule) {
  const sources = (rule.sources || [])
    .map((s) => `${s.file}:${s.line}${s.section ? ` (${s.section})` : ''}`)
    .join('\n    ');
  const aliasLine = rule.canonical_of ?
    `\n  alias-of: ${rule.canonical_of}` :
    (rule.aliases && rule.aliases.length > 0 ?
      `\n  aliases: ${rule.aliases.join(', ')}` : '');
  return `${rule.id}  [${rule.strength} · ${rule.domain}` +
    `${rule.tags && rule.tags.length ? ` · ${rule.tags.join(',')}` : ''}]` +
    `${aliasLine}\n  ${rule.rule}\n  sources:\n    ${sources}`;
}

function summarize(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > INDEX_SUMMARY_CHARS ?
    `${flat.slice(0, INDEX_SUMMARY_CHARS - 1)}…` : flat;
}

export function renderIndex(rules) {
  const lines = [
    '# Rule index (generated — do not edit)',
    '',
    'One line per rule in `rules.json`. To read a rule in full with its source',
    'citations: `npm run rule -- --id <ID>` (or `--tag`, `--domain`,',
    '`--strength`, or free-text terms). Regenerate with',
    '`node scripts/lookup-rule.js --write-index`.',
    '',
    `Total rules: ${rules.length}`,
    '',
    '| id | strength | domain | summary |',
    '| --- | --- | --- | --- |',
  ];
  for (const rule of rules) {
    lines.push(
      `| ${rule.id} | ${rule.strength} | ${rule.domain} | ` +
      `${summarize(rule.rule).replace(/\|/g, '\\|')} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const rules = loadRules();

  if (flags.writeIndex) {
    fs.writeFileSync(INDEX_MD_PATH, renderIndex(rules));
    process.stdout.write(`wrote ${INDEX_MD_PATH} (${rules.length} rules)\n`);
    return EXIT_OK;
  }
  if (flags.checkIndex) {
    const expected = renderIndex(rules);
    const actual = fs.existsSync(INDEX_MD_PATH) ?
      fs.readFileSync(INDEX_MD_PATH, 'utf8') : '';
    if (expected !== actual) {
      process.stderr.write(
        'rules-index.md is stale — run `node scripts/lookup-rule.js ' +
        '--write-index` (or `npm run steering:llm:pack`).\n');
      return EXIT_DRIFT;
    }
    process.stdout.write('rules-index.md is up to date.\n');
    return EXIT_OK;
  }

  const matches = rules.filter((rule) => matchesRule(rule, flags));
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(matches, null, 2)}\n`);
    return matches.length > 0 ? EXIT_OK : EXIT_FAILURE;
  }
  if (matches.length === 0) {
    process.stderr.write('no matching rule.\n');
    return EXIT_FAILURE;
  }
  process.stdout.write(`${matches.map(renderRule).join('\n\n')}\n`);
  return EXIT_OK;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
