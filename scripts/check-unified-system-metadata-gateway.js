#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {SYSTEM_TABLE_NAME} from '../src/bootstrap/system-table-schemas-constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, '..');
const SYSTEM_TABLES = new Set([
  ...Object.values(SYSTEM_TABLE_NAME),
  'code',
  'config',
  'contexts',
  'tables',
]);

const DIRECT_WRITER_PATTERN =
  /cdcIntegrationService\.(insertSystemTableRow|updateSystemTableRow|upsertSystemTableRow|deleteSystemTableRow)\(/;
const DIRECT_SQL_PATTERN = /sqlQueryEngine\.executeQuery\(/;
const DIRECT_CACHE_APPLY_PATTERN = /\.applySystemTableChange\(/;
const BOOTSTRAP_ONLY_RUNTIME_IMPORT_PATTERN =
  /bootstrap\/(?:system-table-writer|bootstrap-cache-hydration-applier|bootstrap-topology-snapshot|join-schema-version-resolver)\.js/;
const PRESSURE_FAILURE_HELPER_PATTERN = /buildPressureAdmissionFailure\(/;
const TRANSPORT_PRESSURE_SENSOR_PATTERN = /getOutboundPressureSummary\(/;

const DIRECT_WRITER_ALLOWLIST = [
  'src/bootstrap/',
  'src/cdc/',
  'src/control-plane/control-plane-system-table-gateway.js',
];
const DIRECT_SQL_ALLOWLIST = [
  'src/bootstrap/',
  'src/cdc/',
  'src/control-plane/control-plane-system-table-gateway.js',
];
const DIRECT_CACHE_APPLY_ALLOWLIST = [
  'src/bootstrap/',
  'src/cdc/',
  'src/cdc/cdc-event-handler.js',
  'src/message-group/cdc-handler.js',
  'src/control-plane/control-plane-system-table-gateway.js',
  'src/cache/system-table-cache.js',
];
const PRESSURE_FAILURE_HELPER_ALLOWLIST = [
  'src/control-plane/pressure-governor.js',
  'src/control-plane/control-plane-system-table-gateway.js',
  'src/control-plane/authoritative-control-plane-view.js',
  'src/cdc/cdc-integration-service.js',
  'src/query/sql-query-engine.js',
];
const TRANSPORT_PRESSURE_SENSOR_ALLOWLIST = [
  'src/control-plane/pressure-governor.js',
  'src/transport/message-router.js',
];

function parseRootFromArgs(argv) {
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--root' && argv[index + 1]) {
      return path.resolve(argv[index + 1]);
    }
  }
  return DEFAULT_ROOT;
}

function shouldSkipDirectory(name) {
  return name === 'node_modules' ||
    name === '.git' ||
    name === 'test-output' ||
    name === 'coverage';
}

function walkFiles(rootDir, relativeDir = 'src') {
  const absoluteDir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }
  const entries = fs.readdirSync(absoluteDir, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name)) {
        continue;
      }
      files.push(...walkFiles(rootDir, relativePath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(relativePath);
    }
  }
  return files;
}

function matchesAllowlist(relativePath, allowlist) {
  return allowlist.some((allowedPath) => {
    return relativePath === allowedPath || relativePath.startsWith(allowedPath);
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSystemTableReferencePattern() {
  const tableAlternation = Array.from(SYSTEM_TABLES)
    .sort()
    .map((tableName) => escapeRegex(tableName))
    .join('|');
  return new RegExp([
    'SYSTEM_TABLE_NAME\\.',
    `['"\`][\\s\\S]{0,400}?\\b(?:FROM|INTO|UPDATE|DELETE\\s+FROM)\\s+` +
      `(?:${tableAlternation})\\b[\\s\\S]{0,400}?['"\`]`,
  ].join('|'), 'i');
}

const SYSTEM_TABLE_REFERENCE_PATTERN = buildSystemTableReferencePattern();

function collectViolations(rootDir) {
  const violations = [];
  for (const relativePath of walkFiles(rootDir)) {
    const absolutePath = path.join(rootDir, relativePath);
    const content = fs.readFileSync(absolutePath, 'utf8');

    if (DIRECT_WRITER_PATTERN.test(content) &&
        !matchesAllowlist(relativePath, DIRECT_WRITER_ALLOWLIST)) {
      violations.push({
        type: 'direct-system-table-writer',
        path: relativePath,
      });
    }

    if (DIRECT_SQL_PATTERN.test(content) &&
        SYSTEM_TABLE_REFERENCE_PATTERN.test(content) &&
        !matchesAllowlist(relativePath, DIRECT_SQL_ALLOWLIST)) {
      violations.push({
        type: 'direct-system-table-read',
        path: relativePath,
      });
    }

    if (DIRECT_CACHE_APPLY_PATTERN.test(content) &&
        !matchesAllowlist(relativePath, DIRECT_CACHE_APPLY_ALLOWLIST)) {
      violations.push({
        type: 'direct-cache-mutation',
        path: relativePath,
      });
    }

    if (BOOTSTRAP_ONLY_RUNTIME_IMPORT_PATTERN.test(content) &&
        !relativePath.startsWith('src/bootstrap/')) {
      violations.push({
        type: 'bootstrap-only-runtime-import',
        path: relativePath,
      });
    }

    if (PRESSURE_FAILURE_HELPER_PATTERN.test(content) &&
        !matchesAllowlist(relativePath, PRESSURE_FAILURE_HELPER_ALLOWLIST)) {
      violations.push({
        type: 'duplicate-pressure-admission-policy',
        path: relativePath,
      });
    }

    if (TRANSPORT_PRESSURE_SENSOR_PATTERN.test(content) &&
        !matchesAllowlist(relativePath, TRANSPORT_PRESSURE_SENSOR_ALLOWLIST)) {
      violations.push({
        type: 'direct-transport-pressure-sensor',
        path: relativePath,
      });
    }
  }
  return violations;
}

function printViolations(violations) {
  for (const violation of violations) {
    console.error(
      `[unified-system-metadata-gateway] ${violation.type}: ${violation.path}`,
    );
  }
}

function main() {
  const rootDir = parseRootFromArgs(process.argv.slice(2));
  const violations = collectViolations(rootDir);
  if (violations.length > 0) {
    printViolations(violations);
    process.exitCode = 1;
    return;
  }
  console.log('[unified-system-metadata-gateway] ok');
}

main();
