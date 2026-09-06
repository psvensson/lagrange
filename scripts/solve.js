#!/usr/bin/env node
// The v2 Solver CLI: start, note, probe, land, evidence add, board.
//
//   node scripts/solve.js start --id <quest>
//   node scripts/solve.js note --id <quest> --finding "<text>" [--kind theory|altitude-check|decision|ruled-out|evidence] [--status active|supported|falsified|superseded] [--evidence <ref>]
//   node scripts/solve.js note --id <quest> --attempt "<what changed>"
//   node scripts/solve.js note --id <quest> --verification "<summary>" --verifier subagent:<id> --verdict approve|reject
//   node scripts/solve.js note --id <quest> --blocked "<why>" --next-owner judgment|verification|authorization
//   node scripts/solve.js note --id <quest> --exhausted "<why>" | --superseded "<why>" [--by <quest>]
//   node scripts/solve.js probe --id <quest> | --epic <epic>
//   node scripts/solve.js land --id <quest>
//   node scripts/solve.js evidence add <file> --id <quest> [--text "<why>"]
//   node scripts/solve.js board
// Every command accepts --json.

import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {ENTRY_TYPE, QUEST_STATUS} from './solve/schema.js';
import {
  SolveError, board, evidenceAdd, land, note, probe, start,
} from './solve/commands.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_FLAG = '--json';
const FLAG_PREFIX = '--';
const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;
const JSON_INDENT = 2;
const LINE_SEPARATOR = '\n';
const EVIDENCE_ADD = 'add';
const USAGE = 'usage: solve <start|note|probe|land|evidence|board> [--id <quest>] [--json]';
const NOTE_USAGE = 'note needs one of --finding, --attempt, --verification, --blocked, ' +
  '--exhausted, --superseded';
const EVIDENCE_USAGE = 'usage: solve evidence add <file> --id <quest> [--text "<why>"]';
const NEXT_OWNER_FLAG = 'next-owner';
const LEGACY_TAG = ', legacy';
const LIST_SEPARATOR = ', ';
const NO_QUESTS = '(no quests)';
const FIX_EPIC = '(fix)';
const UNSEALED_TAG = ' (unsealed)';
// One note flag per entry shape; the first flag present wins.
const NOTE_SHAPES = Object.freeze([
  {flag: 'finding', build: (flags) => ({type: ENTRY_TYPE.FINDING, text: flags.finding,
    kind: flags.kind, status: flags.status, evidence: flags.evidence})},
  {flag: 'attempt', build: (flags) => ({type: ENTRY_TYPE.ATTEMPT, text: flags.attempt})},
  {flag: 'verification', build: (flags) => ({type: ENTRY_TYPE.VERIFICATION,
    text: flags.verification, verifier: flags.verifier, verdict: flags.verdict})},
  {flag: 'blocked', build: (flags) => ({type: ENTRY_TYPE.TERMINAL, status: QUEST_STATUS.BLOCKED,
    text: flags.blocked, nextOwner: flags[NEXT_OWNER_FLAG]})},
  {flag: 'exhausted', build: (flags) => ({type: ENTRY_TYPE.TERMINAL,
    status: QUEST_STATUS.EXHAUSTED, text: flags.exhausted})},
  {flag: 'superseded', build: (flags) => ({type: ENTRY_TYPE.TERMINAL,
    status: QUEST_STATUS.SUPERSEDED, text: flags.superseded, supersededBy: flags.by})},
]);

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith(FLAG_PREFIX)) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(FLAG_PREFIX.length);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith(FLAG_PREFIX)) {
      flags[name] = true;
    } else {
      flags[name] = next;
      index += 1;
    }
  }
  return {flags, positional};
}

function noteOptions(flags) {
  const shape = NOTE_SHAPES.find((candidate) => typeof flags[candidate.flag] === 'string');
  if (!shape) throw new SolveError(NOTE_USAGE);
  return {id: flags.id, ...shape.build(flags)};
}

function cmdStart(root, {flags}) {
  return start(root, {id: flags.id});
}

function cmdNote(root, {flags}) {
  return note(root, noteOptions(flags));
}

function cmdProbe(root, {flags}) {
  return probe(root, {id: flags.id, epic: typeof flags.epic === 'string' ? flags.epic : null});
}

function cmdLand(root, {flags}) {
  return land(root, {id: flags.id, log: (text) => process.stderr.write(text)});
}

function cmdEvidence(root, {flags, positional}) {
  if (positional[0] !== EVIDENCE_ADD || !positional[1]) throw new SolveError(EVIDENCE_USAGE);
  return evidenceAdd(root, {id: flags.id, file: positional[1], text: flags.text,
    tmpdir: os.tmpdir()});
}

function cmdBoard(root) {
  return board(root);
}

const COMMANDS = {
  'start': cmdStart,
  'note': cmdNote,
  'probe': cmdProbe,
  'land': cmdLand,
  'evidence': cmdEvidence,
  'board': cmdBoard,
};

function renderProbe(result) {
  const lines = [];
  if (result.epic) {
    lines.push(`epic ${result.epic}: ${result.status}`);
    if (result.probe) {
      lines.push(`  probe: metric ${result.probe.metric} target ${result.probe.target} ` +
        `done=${result.probe.done} (${result.probe.reason})`);
    }
    return lines.join(LINE_SEPARATOR);
  }
  lines.push(`quest ${result.id}: ${result.status}` +
    (result.blocked ? ` (next owner ${result.blocked.nextOwner}: ${result.blocked.text})` : ''));
  lines.push(`  probe: metric ${result.probe.metric} target ${result.probe.target} ` +
    `done=${result.probe.done} measuring=${result.probe.measuring} (${result.probe.reason})`);
  lines.push(`  seal-time metric ${result.sealMetric}; delta ${result.delta}; attempts ` +
    `${result.attempts} (${result.attemptsSinceAltitudeCheck} since the last altitude check)`);
  for (const line of result.recent) lines.push(`  ${line}`);
  return lines.join(LINE_SEPARATOR);
}

function renderBoard(result) {
  const lines = [`epics open: ${result.epics.length} of ${result.counts.epics}`];
  for (const epic of result.epics) {
    lines.push(`  ${epic.id} [${epic.proof}${epic.legacy ? LEGACY_TAG : ''}] ` +
      `${epic.quests.length ? epic.quests.join(LIST_SEPARATOR) : NO_QUESTS}`);
  }
  lines.push(`quests open: ${result.quests.length} of ${result.counts.quests}`);
  for (const quest of result.quests) {
    lines.push(`  ${quest.id} ${quest.status}${quest.nextOwner ? ` -> ${quest.nextOwner}` : ''} ` +
      `epic=${quest.epic || FIX_EPIC} attempts=${quest.attempts}${quest.sealed ? '' : UNSEALED_TAG}`);
  }
  return lines.join(LINE_SEPARATOR);
}

const RENDERERS = {probe: renderProbe, board: renderBoard};

function render(command, result) {
  const renderer = RENDERERS[command];
  return renderer ? renderer(result) : JSON.stringify(result, null, JSON_INDENT);
}

function main(argv, root = REPO_ROOT) {
  const [command, ...rest] = argv;
  const handler = COMMANDS[command];
  if (!handler) {
    process.stderr.write(`${USAGE}${LINE_SEPARATOR}`);
    return EXIT_USAGE;
  }
  const parsed = parseArgs(rest);
  try {
    const result = handler(root, parsed);
    const output = parsed.flags[JSON_FLAG.slice(FLAG_PREFIX.length)] ?
      JSON.stringify(result, null, JSON_INDENT) : render(command, result);
    process.stdout.write(`${output}${LINE_SEPARATOR}`);
    return EXIT_OK;
  } catch (error) {
    if (error instanceof SolveError) {
      process.stderr.write(`${error.message}${LINE_SEPARATOR}`);
      return EXIT_REFUSED;
    }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

export {COMMANDS, main, parseArgs};
