#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const stringIncludes = Function.call.bind(String.prototype.includes);

const UTF8 = 'utf8';
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');
const METRIC_ARG = '--metric';
const LINE_BREAK = '\n';
const ZERO_EXIT = 0;
const FAIL_EXIT = 1;

const Q5_SURFACES = Object.freeze([
  Object.freeze({
    id: 'pipeline-v2-entry-and-call-command',
    relPath: 'src/cli/service-pipeline-command.js',
    markers: Object.freeze([
      'world: ir.target',
      'runCall',
      'CALL BINDING $1',
    ]),
  }),
  Object.freeze({
    id: 'component-build-auto-world',
    relPath: 'src/service/service-component-build.js',
    markers: Object.freeze([
      'service-cell-v2',
      'inferServiceWorldFromEntrySource',
    ]),
  }),
  Object.freeze({
    id: 'call-binding-sql-invocation-key-contract',
    relPath: 'src/query/service-lifecycle-sql-contract.js',
    markers: Object.freeze([
      'invocation_key',
      'idempotency_key',
    ]),
  }),
  Object.freeze({
    id: 'call-cell-routing-invocation-errors',
    relPath: 'src/service/call-cell-routing-contract.js',
    markers: Object.freeze([
      'INVOCATION_CONFLICT',
      'INVOCATION_EXPIRED',
      'INVOCATION_AMBIGUOUS',
      'createScopedDirectCallInvocationId',
    ]),
  }),
  Object.freeze({
    id: 'call-cell-invoker-direct-call-replay',
    relPath: 'src/service/call-cell-invoker.js',
    markers: Object.freeze([
      'INVOCATION_CONFLICT',
      'INVOCATION_EXPIRED',
      'INVOCATION_AMBIGUOUS',
      'createScopedDirectCallInvocationId',
    ]),
  }),
  Object.freeze({
    id: 'q5-multi-op-and-direct-call-test-suite',
    relPath: 'test/service/q5-service-cell-v2-default-multi-operation.test.js',
    markers: Object.freeze([
      'service-cell-v2-default-multi-operation',
      'INVOCATION_CONFLICT',
      'INVOCATION_EXPIRED',
      'INVOCATION_AMBIGUOUS',
      'LEGACY_ARTIFACT_ABI_UNSUPPORTED',
    ]),
  }),
]);

function collectQ5Deficits() {
  const deficits = [];
  for (const surface of Q5_SURFACES) {
    const absPath = path.join(REPO_ROOT, surface.relPath);
    if (!fs.existsSync(absPath)) {
      deficits.push(surface.id);
      continue;
    }
    const sourceText = fs.readFileSync(absPath, UTF8);
    const missingMarker = arrayFind(
      surface.markers,
      (marker) => !stringIncludes(sourceText, marker),
    );
    if (missingMarker !== undefined) {
      deficits.push(`${surface.id}:${missingMarker}`);
    }
  }
  return deficits;
}

const deficits = collectQ5Deficits();
if (arrayIncludes(process.argv, METRIC_ARG)) {
  process.stdout.write(`${deficits.length}${LINE_BREAK}`);
  process.exit(ZERO_EXIT);
}
if (deficits.length > 0) {
  process.stderr.write(`${arrayJoin(deficits, LINE_BREAK)}${LINE_BREAK}`);
  process.exit(FAIL_EXIT);
}
process.stdout.write(`0${LINE_BREAK}`);
