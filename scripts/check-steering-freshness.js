#!/usr/bin/env node
// Freshness nudge for steering docs that carry a `last_reviewed:` frontmatter
// date. Warn-only (always exits 0): steering:check must stay a drift gate, not
// a calendar gate — a stale review date is a review cue for a human, never a
// push failure. Docs without the field are skipped; the field is opt-in.

import fs from 'node:fs';
import path from 'node:path';

const STEERING_DIR = 'docs/steering';
const STALE_AFTER_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function* walkMarkdown(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkMarkdown(full);
    else if (entry.isFile() && entry.name.endsWith('.md')) yield full;
  }
}

function lastReviewed(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const match = text.slice(0, end).match(/^last_reviewed:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
  return match ? match[1] : null;
}

const now = Date.now();
const stale = [];
for (const file of walkMarkdown(STEERING_DIR)) {
  const date = lastReviewed(file);
  if (!date) continue;
  const ageDays = Math.floor((now - Date.parse(date)) / MS_PER_DAY);
  if (ageDays > STALE_AFTER_DAYS) stale.push({file, date, ageDays});
}

if (stale.length > 0) {
  stale.sort((a, b) => b.ageDays - a.ageDays);
  process.stdout.write(
    `steering freshness: ${stale.length} doc(s) past the ` +
    `${STALE_AFTER_DAYS}-day review window (warn-only):\n`);
  for (const {file, date, ageDays} of stale) {
    process.stdout.write(`  ${file} (last_reviewed ${date}, ${ageDays}d ago)\n`);
  }
  process.stdout.write(
    '  review the doc, then bump its last_reviewed frontmatter date.\n');
}
process.exit(0);
