#!/usr/bin/env node
// Freshness nudge for steering docs that carry a `last_reviewed:` frontmatter
// date. Two warn-only signals (always exits 0):
//   1. calendar: last_reviewed older than STALE_AFTER_DAYS;
//   2. edited-after-review: the file's last git commit date is NEWER than its
//      last_reviewed date, i.e. the doc changed without its review date moving.
// steering:check must stay a drift gate, not a calendar gate — a stale review
// date is a review cue for a human, never a push failure. Docs without the
// field are skipped; the field is opt-in.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const STEERING_DIR = 'docs/steering';
const STALE_AFTER_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NO_COMMIT_DATE = '';
const EDITED_AFTER_REVIEW_HEADER_SUFFIX =
  'their last review (warn-only):\n';
const EDITED_AFTER_REVIEW_REMEDIATION =
  '  re-review the doc, then bump last_reviewed to the edit date.\n';

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

// Last committed-edit date (YYYY-MM-DD) of a file, or null when git has no
// history for it (new/untracked file, or not a git work tree).
function lastCommitDate(file) {
  try {
    const out = execFileSync(
      'git', ['log', '-1', '--format=%cs', '--', file],
      {encoding: 'utf8'},
    ).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : NO_COMMIT_DATE;
  } catch {
    return NO_COMMIT_DATE;
  }
}

const now = Date.now();
const stale = [];
const editedAfterReview = [];
for (const file of walkMarkdown(STEERING_DIR)) {
  const date = lastReviewed(file);
  if (!date) continue;
  const ageDays = Math.floor((now - Date.parse(date)) / MS_PER_DAY);
  if (ageDays > STALE_AFTER_DAYS) stale.push({file, date, ageDays});
  const edited = lastCommitDate(file);
  if (edited && edited > date) editedAfterReview.push({file, date, edited});
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
if (editedAfterReview.length > 0) {
  editedAfterReview.sort((a, b) => (a.file < b.file ? -1 : 1));
  process.stdout.write(
    `steering freshness: ${editedAfterReview.length} doc(s) edited after ` +
    EDITED_AFTER_REVIEW_HEADER_SUFFIX);
  for (const {file, date, edited} of editedAfterReview) {
    process.stdout.write(
      `  ${file} (last_reviewed ${date}, last commit ${edited})\n`);
  }
  process.stdout.write(
    EDITED_AFTER_REVIEW_REMEDIATION);
}
process.exit(0);
