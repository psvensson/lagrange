#!/usr/bin/env node

// Behavioral contract vectors, evaluated by an independent Python decoder.
// This proves the Q1a representation, not current public ingress or recovery.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringTrim = Function.call.bind(String.prototype.trim);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REFERENCE = path.join(REPO_ROOT, 'test/partition/portability-observation-reference.py');
const VECTORS = path.join(REPO_ROOT, 'test/partition/portability-observation-v1.vectors.json');
const PYTHON = 'python3';
const ENCODING = 'utf8';
const METRIC_FLAG = '--metric';
const METRIC_TARGET = 0;
const MISSING_REFERENCE = 1;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const LINE_BREAK = '\n';
const PASS_MESSAGE = 'Q1a independent observation vectors and negative controls pass\n';

function decodeWithReference(vectors) {
  const result = spawnSync(PYTHON, [REFERENCE], {
    cwd: REPO_ROOT, encoding: ENCODING, input: JSON.stringify(vectors),
    maxBuffer: MAX_OUTPUT_BYTES,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) return null;
  const metric = Number(stringTrim(String(result.stdout)));
  return Number.isSafeInteger(metric) && metric >= METRIC_TARGET ? metric : null;
}

function mutationControls(vectors) {
  const controls = [
    (copy) => copy.accepted.pop(),
    (copy) => copy.accepted.push({...copy.accepted[0]}),
    (copy) => {
      copy.accepted[0].value.logIndex = '00';
    },
    (copy) => {
      copy.accepted[0].value.kind = 'available';
    },
    (copy) => {
      copy.comparisons[0].order = -copy.comparisons[0].order;
    },
    (copy) => {
      copy.epochs[0].expected = 9007199254740992;
    },
    (copy) => {
      copy.accepted[0].value.failureCode = 'SQLITE_ERROR';
    },
    (copy) => {
      copy.accepted[2].value.changes = '1';
    },
    (copy) => {
      copy.accepted[0].value.lastInsertRowid = '1';
    },
    (copy) => {
      copy.accepted[10].value.entryKey = 'txop:transaction-1:partition-1:00';
    },
    (copy) => {
      copy.identities[1].equal = true;
    },
    (copy) => {
      for (const [index, item] of copy.accepted.entries()) {
        copy.accepted[index] = {...copy.accepted[0], id: item.id};
      }
    },
  ];
  return controls.reduce((failed, mutate) => {
    const copy = structuredClone(vectors);
    mutate(copy);
    return failed + (decodeWithReference(copy) === 0 ? 1 : 0);
  }, 0);
}

function measure() {
  if (!fs.existsSync(REFERENCE) || !fs.existsSync(VECTORS)) return MISSING_REFERENCE;
  let vectors;
  try {
    vectors = JSON.parse(fs.readFileSync(VECTORS, ENCODING));
  } catch (_error) {
    return MISSING_REFERENCE;
  }
  const base = decodeWithReference(vectors);
  if (base === null) return MISSING_REFERENCE;
  return base + (base === 0 ? mutationControls(vectors) : 0);
}

const metric = measure();
if (arrayIncludes(process.argv, METRIC_FLAG)) {
  process.stdout.write(`${metric}${LINE_BREAK}`);
} else if (metric > METRIC_TARGET) {
  process.stderr.write(`Q1a representation deficits: ${metric}${LINE_BREAK}`);
  process.exitCode = 1;
} else {
  process.stdout.write(PASS_MESSAGE);
}
