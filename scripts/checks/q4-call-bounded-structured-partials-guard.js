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

const Q4_SURFACES = Object.freeze([
  Object.freeze({
    id: 'partial-codec-owner',
    relPath: 'src/service/call-canonical-partial-codec.js',
    markers: Object.freeze([
      'PARTIAL_CODEC_ERROR_CODE',
      'encodeCanonicalPartialValue',
      'decodeCanonicalPartialValue',
      'encodeCanonicalPartialEnvelope',
      'decodeCanonicalPartialEnvelope',
      'encodeCanonicalGroupKey',
      'decodeCanonicalGroupKey',
    ]),
  }),
  Object.freeze({
    id: 'routing-contract-structured-partials',
    relPath: 'src/service/call-cell-routing-contract.js',
    markers: Object.freeze([
      'decodeCanonicalPartialWire',
      'decodeCanonicalGroupKey',
      'emissionOrdinal',
      'deliveryId',
    ]),
  }),
  Object.freeze({
    id: 'reduce-coordinator-delivery-fencing-and-ordering',
    relPath: 'src/runtime/call-cell-reduce-coordinator.js',
    markers: Object.freeze([
      'DELIVERY_CONFLICT',
      'STALE_DELIVERY',
      'compareOrderedContributions',
      'deliveryId',
    ]),
  }),
  Object.freeze({
    id: 'invoker-structured-partial-forwarding',
    relPath: 'src/service/call-cell-invoker.js',
    markers: Object.freeze([
      'encodeCanonicalPartialValue',
      'encodeCanonicalGroupKey',
      'shardId',
    ]),
  }),
  Object.freeze({
    id: 'q4-structured-partials-test-suite',
    relPath: 'test/service/q4-call-bounded-structured-partials.test.js',
    markers: Object.freeze([
      'call-bounded-structured-partials',
      'DELIVERY_CONFLICT',
      'weightedAverage',
    ]),
  }),
]);

function collectQ4Deficits() {
  const deficits = [];
  for (const surface of Q4_SURFACES) {
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

const deficits = collectQ4Deficits();
if (arrayIncludes(process.argv, METRIC_ARG)) {
  process.stdout.write(`${deficits.length}${LINE_BREAK}`);
  process.exit(ZERO_EXIT);
}
if (deficits.length > 0) {
  process.stderr.write(`${arrayJoin(deficits, LINE_BREAK)}${LINE_BREAK}`);
  process.exit(FAIL_EXIT);
}
process.stdout.write(`0${LINE_BREAK}`);
