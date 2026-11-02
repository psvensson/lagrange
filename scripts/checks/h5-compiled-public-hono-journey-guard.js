#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringIncludes = Function.call.bind(String.prototype.includes);

const REPO_ROOT = process.cwd();
const METRIC_FLAG = '--metric';
const UTF8_ENCODING = 'utf8';
const NEWLINE = '\n';

const SCAFFOLD_FILE = path.join(REPO_ROOT, 'src/cli/service-wasm-scaffold.js');
const TYPINGS_FILE = path.join(REPO_ROOT, 'src/service/service-typings-generator.js');
const TEST_FILE = path.join(
  REPO_ROOT,
  'test/service/h5-compiled-public-hono-journey.test.js',
);

const REQUIRED_SCAFFOLD_MARKERS = Object.freeze([
  'createHonoServiceProject',
  'c.env.lagrange.call',
]);

const REQUIRED_TYPINGS_MARKERS = Object.freeze([
  'LagrangeRequestClient',
  'LagrangeEnv',
]);

const REQUIRED_TEST_MARKERS = Object.freeze([
  'createHonoServiceProject',
  'WasiComponentCellRuntime',
  'RequestCellHttpAdapter',
  'createRequestCellCallBridge',
  'executePagedShardSlot',
  'validateValueAgainstSchema',
  'normalizeCallSelectorInvocationParameters',
  'loadComponentPayloadThroughStore',
  'MemoryInvocationJournal',
]);

function appendMissingMarkers(filePath, markers, issues) {
  if (!fs.existsSync(filePath)) {
    issues.push(`missing file: ${path.relative(REPO_ROOT, filePath)}`);
    return;
  }
  const source = fs.readFileSync(filePath, UTF8_ENCODING);
  for (const marker of markers) {
    if (!stringIncludes(source, marker)) {
      issues.push(
        `${path.relative(REPO_ROOT, filePath)} missing marker: ${marker}`,
      );
    }
  }
}

function collectMissingMarkers() {
  const issues = [];
  appendMissingMarkers(SCAFFOLD_FILE, REQUIRED_SCAFFOLD_MARKERS, issues);
  appendMissingMarkers(TYPINGS_FILE, REQUIRED_TYPINGS_MARKERS, issues);
  appendMissingMarkers(TEST_FILE, REQUIRED_TEST_MARKERS, issues);
  return issues;
}

const issues = collectMissingMarkers();
if (arrayIncludes(process.argv, METRIC_FLAG)) {
  process.stdout.write(`${issues.length}${NEWLINE}`);
  process.exit(0);
}

if (issues.length > 0) {
  for (const issue of issues) {
    process.stderr.write(`h5-guard: ${issue}${NEWLINE}`);
  }
  process.exit(1);
}

process.stdout.write(`h5-guard: ok${NEWLINE}`);
