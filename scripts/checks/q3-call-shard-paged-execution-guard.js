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

const Q3_SURFACES = Object.freeze([
  Object.freeze({
    id: 'paged-execution-owner',
    relPath: 'src/service/call-shard-paged-execution.js',
    markers: Object.freeze([
      'PAGED_EXECUTION_ERROR_CODE',
      'createShardReadViewManager',
      'buildKeysetPageCursor',
      'validateKeysetPageCursor',
      'buildKeysetPageQuery',
      'createPagedShardProgressTracker',
      'executePagedShardSlot',
    ]),
  }),
  Object.freeze({
    id: 'authoring-accumulator-lifecycle',
    relPath: 'src/authoring/distributed-operation.js',
    markers: Object.freeze([
      'stateSchema',
      'init',
      'step',
      'finish',
      'pageKey',
    ]),
  }),
  Object.freeze({
    id: 'source-and-entry-accumulator-contract',
    relPath: 'src/service/service-entry-generator.js',
    markers: Object.freeze([
      '__lagrangePagedStep',
      'stateSchema',
      'operation.init',
      'operation.step',
      'operation.finish',
    ]),
  }),
  Object.freeze({
    id: 'local-handler-and-invoker-paged-wiring',
    relPath: 'src/node/runtime-service-call-cell-handler.js',
    markers: Object.freeze([
      'executeLocalShardPageRead',
      'readViewId',
      'pageCursor',
    ]),
  }),
  Object.freeze({
    id: 'q3-paged-execution-test-suite',
    relPath: 'test/service/q3-call-shard-paged-execution.test.js',
    markers: Object.freeze([
      'call-shard-paged-execution',
      'READ_VIEW_UNAVAILABLE',
      'wholeAttemptDiscard',
      'orderSensitiveDigest',
    ]),
  }),
]);

function collectQ3Deficits() {
  const deficits = [];
  for (const surface of Q3_SURFACES) {
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

const deficits = collectQ3Deficits();
if (arrayIncludes(process.argv, METRIC_ARG)) {
  process.stdout.write(`${deficits.length}${LINE_BREAK}`);
  process.exit(ZERO_EXIT);
}
if (deficits.length > 0) {
  process.stderr.write(`${arrayJoin(deficits, LINE_BREAK)}${LINE_BREAK}`);
  process.exit(FAIL_EXIT);
}
process.stdout.write(`0${LINE_BREAK}`);
