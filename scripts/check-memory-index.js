#!/usr/bin/env node
// Charter check for the external auto-memory hot index (MEMORY.md): the index
// must stay a pointer list — its own header mandates one line per memory,
// ≤~160 chars, narrative in topic files (see docs/steering/memory-boundary.md).
// Warn-only (always exits 0): memory lives under ~/.claude, outside the repo,
// so this can never gate CI. It is wired as a SessionStart hook nudge (the
// warning lands in session context at boot) and as `npm run check:memory-index`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_LINE_CHARS = 160;
const MAX_INDEX_LINES = 60;
const TOP_OFFENDERS_SHOWN = 5;

const projectSlug = process.cwd().replace(/[^a-zA-Z0-9]/g, '-');
const indexPath = path.join(
  os.homedir(), '.claude', 'projects', projectSlug, 'memory', 'MEMORY.md');

if (!fs.existsSync(indexPath)) process.exit(0);

const lines = fs.readFileSync(indexPath, 'utf8').split('\n');
const overlong = lines
  .map((text, i) => ({line: i + 1, chars: text.length}))
  .filter((l) => l.chars > MAX_LINE_CHARS);
const totalLines = lines.filter((l) => l.trim() !== '').length;

const problems = [];
if (overlong.length > 0) {
  const top = overlong
    .sort((a, b) => b.chars - a.chars)
    .slice(0, TOP_OFFENDERS_SHOWN)
    .map((l) => `line ${l.line} (${l.chars} chars)`)
    .join(', ');
  problems.push(
    `${overlong.length} line(s) over ${MAX_LINE_CHARS} chars — worst: ${top}`);
}
if (totalLines > MAX_INDEX_LINES) {
  problems.push(
    `${totalLines} non-empty lines (charter budget ~${MAX_INDEX_LINES})`);
}

if (problems.length > 0) {
  process.stdout.write(
    'memory index charter check (warn-only): MEMORY.md has outgrown its ' +
    'pointer-list charter.\n');
  for (const p of problems) process.stdout.write(`  - ${p}\n`);
  process.stdout.write(
    '  move narrative into the topic .md files (or MEMORY-ARCHIVE.md) and ' +
    'keep index lines as one-line pointers.\n');
}
process.exit(0);
