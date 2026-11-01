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

const Q11_SURFACES = Object.freeze([
  Object.freeze({
    id: 'runtime-busy-deadline-and-pressure-telemetry',
    markers: Object.freeze([
      'isCellBusyWithinDeadline',
      'getRuntimePressureTelemetry',
      'request_cell_runtime_memory_pressure_exceeded',
    ]),
    relPath: 'src/runtime/wasi-component-cell-runtime.js',
  }),
  Object.freeze({
    id: 'worker-pre-retention-effect-and-emit-bounds',
    markers: Object.freeze([
      'currentEffectBytes',
      'request_cell_context_budget_exceeded',
      'request_cell_emit_buffer_overflow',
      'maxEmitPayloadBytes',
    ]),
    relPath: 'src/runtime/wasi-component-cell-worker.js',
  }),
  Object.freeze({
    id: 'public-path-certification-contract',
    markers: Object.freeze([
      'PUBLIC_PATH_CERTIFICATION_SCHEMA_VERSION',
      'CERTIFICATION_VERDICT',
      'CERTIFICATION_NON_TERMINAL_REASON',
      'REQUIRED_CERTIFICATION_DIMENSIONS',
      'REQUIRED_REPRESENTATIVENESS_AXES',
      'SEALED_PUBLIC_PATH_CERTIFICATION_BAR',
      'computeCertificationBarDigest',
      'validateCertificationBar',
      'computeWilsonConfidenceInterval',
      'evaluateWorkloadRepresentativeness',
      'evaluateScaleAndFailureCertification',
    ]),
    relPath: 'src/service/public-path-scale-failure-certification.js',
  }),
  Object.freeze({
    id: 'public-path-certification-scenario',
    markers: Object.freeze([
      'public-path-scale-and-failure-certification',
      'evaluateScaleAndFailureCertification',
      'composeReportDetail',
    ]),
    relPath:
      'test/distributed/scenarios/' +
      'public-path-scale-and-failure-certification.js',
  }),
  Object.freeze({
    id: 'public-path-certification-test-suite',
    markers: Object.freeze([
      'CERTIFICATION_BAR_DIGEST_MISMATCH',
      'NON_TERMINAL',
      'neutralOrNegativeFindings',
      'request_cell_concurrent_invocation',
      'request_cell_runtime_memory_pressure_exceeded',
      'request_cell_emit_buffer_overflow',
      'request_cell_context_budget_exceeded',
    ]),
    relPath:
      'test/distributed/harness/__tests__/' +
      'public-path-scale-and-failure-certification.test.js',
  }),
]);

function collectQ11Deficits() {
  const deficits = [];
  for (const surface of Q11_SURFACES) {
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

const deficits = collectQ11Deficits();
if (arrayIncludes(process.argv, METRIC_ARG)) {
  process.stdout.write(`${deficits.length}${LINE_BREAK}`);
  process.exit(ZERO_EXIT);
}
if (deficits.length > 0) {
  process.stderr.write(`${arrayJoin(deficits, LINE_BREAK)}${LINE_BREAK}`);
  process.exit(FAIL_EXIT);
}
process.stdout.write(`0${LINE_BREAK}`);
