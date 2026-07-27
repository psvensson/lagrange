// Terminal-landing ladder-row flip.
//
// A quest whose `links.specRef` points into a spec ladder
// (solve/specs/<epic>/tasks.md) gets its row marked SOLVED as part of the
// landing commit itself, replacing the hand-edited "records(...)" bookkeeping
// commit that followed every rung of the 2026-07-26 snapshot epic. Same policy
// as the frontier board: run before buildHandoff so the edit is dirty and
// in-scope for exactly this landing, and never fail the commit — a missed flip
// is a stale row, not a stranded verified quest.
//
// The marker is appended right after the backticked quest id inside its row,
// which works for both ladder tables and checkbox lists without assuming a
// status column. No commit hash is embedded: the flip rides the landing commit,
// which cannot know its own hash; blame or the quest log names it.

import fs from 'node:fs';
import path from 'node:path';

const SPEC_LADDER_REF_PATTERN = /^(solve\/specs\/[^#]+\/tasks\.md)(?:#.*)?$/u;
const SOLVED_MARKER = 'SOLVED';
const TEXT_ENCODING = 'utf8';

export function specLadderPathFromRef(specRef) {
  if (typeof specRef !== 'string') return null;
  const match = SPEC_LADDER_REF_PATTERN.exec(specRef.trim());
  return match ? match[1] : null;
}

// Pure text transform: mark the row carrying `questId` (backticked) with a
// SOLVED suffix directly after the id token. Only row-shaped lines (table
// rows, list items) are eligible, so a prose mention of the id above the
// ladder cannot absorb the stamp; a row already mentioning SOLVED is left
// alone, so the flip is idempotent and never re-stamps a hand-edit.
const ROW_SHAPED_LINE_PATTERN = /^\s*(?:\||[-*] )/u;

export function flipLadderRow(content, questId, date) {
  const token = `\`${questId}\``;
  const lines = String(content).split('\n');
  let changed = false;
  const flipped = lines.map((line) => {
    if (changed || !line.includes(token) ||
      !ROW_SHAPED_LINE_PATTERN.test(line) || line.includes(SOLVED_MARKER)) {
      return line;
    }
    changed = true;
    return line.replace(token, `${token} — ✅ ${SOLVED_MARKER} ${date}`);
  });
  return {content: flipped.join('\n'), changed};
}

export function refreshSpecLadderForCommit(root, quest, {date} = {}) {
  const relative = specLadderPathFromRef(quest?.links?.specRef);
  if (!relative) return null;
  try {
    const absolute = path.join(root, relative);
    const flipped = flipLadderRow(
      fs.readFileSync(absolute, TEXT_ENCODING),
      quest.id,
      date || new Date().toISOString().slice(0, 'YYYY-MM-DD'.length),
    );
    if (!flipped.changed) return null;
    fs.writeFileSync(absolute, flipped.content, TEXT_ENCODING);
    return relative;
  } catch (err) {
    process.stderr.write(
      `spec ladder flip before commit skipped: ${err.message}\n`);
    return null;
  }
}
