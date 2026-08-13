// Workflow friction ranking — what the retrospective should look at first.
//
// meta-ratio answers "is bookkeeping drowning product work?". This answers the next
// question: WHICH part of the workflow is costing the most, ranked by how often it
// fires rather than by what anyone remembers. That distinction is not academic. The
// 2026-07-24 retrospective landed seven real tooling fixes from recollection and
// missed the single largest cost in the window — one violation pair that fired on
// eleven separate correct attempts across two days — while acting on a guard the
// data showed was sustaining ~40% of the time.
//
// Every input is already in the event logs; nothing here measures anything new. Rows
// are ranked by count, and each carries the quests it fired on so a reader can go
// straight to the evidence.
//
// Park kinds are deliberately NOT a column: `exhausted` is ~97% of all parks, so the
// distribution carries no signal. What a reader needs is which quests exhausted and
// why, so parks are reported as a list, not a histogram.

import fs from 'node:fs';
import path from 'node:path';

import {
  EVENT_GUARD_OVERRIDE,
  EVENT_GATE_DECISION,
  EVENT_PARK,
  EVENT_VIOLATION,
  DISPOSITION_ADVISORY,
  OUTCOME_CONTINUE,
  SOLVE_DATA_DIR,
} from './constants.js';

const DEFAULT_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TOP_ROWS = 8;
const REASON_EXCERPT = 100;
const PERCENT_SCALE = 100;
// A single cause above this share of all friction is the one worth fixing first.
const DOMINANT_CAUSE_SHARE = 0.4;

const KIND_VIOLATION = 'violation';
const KIND_OVERRIDE = 'override';
const UNSCOPED = 'unscoped';
const UNSPECIFIED_PARK_KIND = 'unspecified';
const VIOLATION_SET_JOIN = ' + ';
// Row identity is (kind, key). A control character keeps the join unambiguous:
// no violation string or guard code can contain one, so two distinct rows can
// never collide into a single tally.
const ROW_KEY_SEPARATOR = '\u0000';
const LOG_SUFFIX = '.ndjson';
const LOG_DIR = 'log';
const FILE_ENCODING = 'utf8';
const NEWLINE = '\n';
const EMPTY_WINDOW_LINE =
  'No violations or charged guard overrides in the window.';
const TABLE_HEADER = '| count | kind | what fired | quests | wasted |';
const TABLE_RULE = '| --- | --- | --- | --- | --- |';
const UNMEASURED_CELL = '—';
const MS_PER_SECOND = 1000;
const ADVISORY_TAIL = 'one before anything else in the next retrospective.';

// A single violation event carries an array of violation strings that fire together
// (a null metric always trips both "finite numbers" and "invalidSample=true"). Rank
// the PAIR, not each string: they are one defect and splitting them double-counts.
function violationKey(event) {
  const violations = Array.isArray(event.violations) ? event.violations : [];
  if (violations.length === 0) return null;
  return `${event.scope || UNSCOPED}: ` +
    `${[...violations].sort().join(VIOLATION_SET_JOIN)}`;
}

function overrideKey(event) {
  return typeof event.code === 'string' && event.code ? event.code : null;
}

export function tallyFrictionEvents(entries) {
  const rows = new Map();
  const parks = [];
  const advisories = [];
  const operatorStops = [];
  const add = (kind, key, questId, wastedMs) => {
    if (!key) return;
    const id = `${kind}${ROW_KEY_SEPARATOR}${key}`;
    const row = rows.get(id) ||
      {kind, key, count: 0, quests: new Set(), wastedMs: 0, measured: 0};
    row.count += 1;
    row.quests.add(questId);
    if (Number.isFinite(wastedMs)) {
      row.wastedMs += wastedMs;
      row.measured += 1;
    }
    rows.set(id, row);
  };
  for (const {questId, event} of entries) {
    if (event.type === EVENT_VIOLATION) {
      // Only violation rows can carry a cost: they embed the attempt they rejected,
      // so its telemetry says what the voided work actually cost. Guard-override and
      // park events reference no attempt, so those rows stay frequency-only — the
      // ranking must never imply a cost it did not measure.
      add(KIND_VIOLATION, violationKey(event), questId,
        event.attempt?.telemetry?.agentDurationMs);
    }
    if (event.type === EVENT_GUARD_OVERRIDE) {
      // A re-authorization of an already-covered scope is explicitly free; counting
      // it as friction would re-report the thing that exemption exists to stop.
      if (event.scopeReauthorization !== true) {
        add(KIND_OVERRIDE, overrideKey(event), questId);
      }
    }
    if (event.type === EVENT_PARK) {
      parks.push({
        questId,
        kind: event.kind || UNSPECIFIED_PARK_KIND,
        reason: typeof event.reason === 'string' ? event.reason : '',
      });
    }
    if (event.type === EVENT_GATE_DECISION &&
      event.disposition === DISPOSITION_ADVISORY &&
      event.outcome === OUTCOME_CONTINUE && !event.override) {
      advisories.push({questId, code: event.code || event.status || UNSCOPED});
    }
    if (event.type === EVENT_GATE_DECISION && event.outcome !== OUTCOME_CONTINUE &&
      event.disposition !== DISPOSITION_ADVISORY) {
      operatorStops.push({questId, code: event.code || event.status || UNSCOPED});
    }
  }
  const ranked = [...rows.values()]
    .map((row) => ({...row, quests: [...row.quests].sort()}))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return {
    rows: ranked,
    parks,
    operatorStops,
    advisories,
  };
}

function logFiles(root) {
  const dir = path.join(root, SOLVE_DATA_DIR, LOG_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(LOG_SUFFIX))
    .map((name) => ({questId: name.slice(0, -LOG_SUFFIX.length),
      file: path.join(dir, name)}));
}

// `now` is injected so the window is a pure function of its inputs — the caller
// supplies the clock, exactly as the probes do.
export function readFrictionWindow(root, {days, now}) {
  const cutoff = now - (days * MS_PER_DAY);
  const entries = [];
  for (const {questId, file} of logFiles(root)) {
    for (const line of fs.readFileSync(file, FILE_ENCODING).split(NEWLINE)) {
      if (!line.trim()) continue;
      let event = null;
      try {
        event = JSON.parse(line);
      } catch {
        continue; // A malformed line is not friction data; the audit path owns it.
      }
      const ts = Date.parse(event?.ts || '');
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      entries.push({questId, event});
    }
  }
  return entries;
}

export function buildMetaFriction(root, {days = DEFAULT_WINDOW_DAYS, now} = {}) {
  const entries = readFrictionWindow(root, {days, now: now ?? Date.now()});
  const {rows, parks, operatorStops, advisories} = tallyFrictionEvents(entries);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return {days, total, rows, parks, operatorStops, advisories};
}

function excerpt(text) {
  const clean = text.replace(/\s+/gu, ' ').trim();
  return clean.length > REASON_EXCERPT ?
    `${clean.slice(0, REASON_EXCERPT)}…` : clean;
}

// Measured wall-clock this row threw away, and how much of it is actually measured.
// An unmeasured row renders "—", never 0: a blank cost and a zero cost mean opposite
// things, and only violation rows can carry a cost at all (they embed the attempt
// they rejected — override and park events reference none).
function wastedColumn(row) {
  if (!row.measured) return UNMEASURED_CELL;
  const seconds = Math.round(row.wastedMs / MS_PER_SECOND);
  const partial = row.measured < row.count ?
    ` (${row.measured}/${row.count})` : '';
  return `${seconds}s${partial}`;
}

export function renderMetaFriction(friction) {
  const {days, total, rows, parks, operatorStops = [],
    advisories = []} = friction;
  const lines = [
    `# Workflow friction — last ${days} day(s), ${total} recorded event(s)`,
    `Operator stops: ${operatorStops.length}; automatic advisories: ${advisories.length}`,
    '',
  ];
  if (rows.length === 0) {
    lines.push(EMPTY_WINDOW_LINE, '');
  } else {
    lines.push(TABLE_HEADER, TABLE_RULE);
    for (const row of rows.slice(0, TOP_ROWS)) {
      lines.push(`| ${row.count} | ${row.kind} | ${excerpt(row.key)} | ` +
        `${row.quests.length} | ${wastedColumn(row)} |`);
    }
    lines.push('');
    if (rows.length > TOP_ROWS) {
      lines.push(`> ${rows.length - TOP_ROWS} further row(s) not shown ` +
        `(showing the top ${TOP_ROWS} by count).`, '');
    }
    const top = rows[0];
    if (total > 0 && top.count / total > DOMINANT_CAUSE_SHARE) {
      const share = Math.round((top.count / total) * PERCENT_SCALE);
      lines.push(
        `> "${excerpt(top.key)}" is ${share}% of ` +
        `all recorded friction, across ${top.quests.length} quest(s). Fix this ` +
        ADVISORY_TAIL, '');
    }
  }
  if (parks.length > 0) {
    lines.push(`## Parks (${parks.length})`, '');
    for (const park of parks) {
      lines.push(`- **${park.questId}** (${park.kind}) — ${excerpt(park.reason)}`);
    }
    lines.push('');
  }
  return lines.join(NEWLINE);
}

export function runMetaFrictionCommand(root, args = {}) {
  const days = Number(args.days) > 0 ? Number(args.days) : DEFAULT_WINDOW_DAYS;
  return renderMetaFriction(buildMetaFriction(root, {days}));
}
