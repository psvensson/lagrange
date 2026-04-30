#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {SYSTEM_TABLE_NAME} from '../src/bootstrap/system-table-schemas-constants.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_ROOT = '--root';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_NODE_MODULES = 'node_modules';
const LOCAL_STR_GIT = '.git';
const LOCAL_STR_TEST_OUTPUT = 'test-output';
const LOCAL_STR_COVERAGE = 'coverage';
const LOCAL_STR_SRC = 'src';
const LOCAL_STR_JS = '.js';
const LOCAL_STR_1D7VE = '\\$&';
const LOCAL_STR_SYSTEM_TABLE_NAME = 'SYSTEM_TABLE_NAME\\.';
const LOCAL_STR_PIPE = '|';
const LOCAL_STR_I = 'i';
const LOCAL_STR_G0BX8 = '[unified-system-metadata-gateway] ok';

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
const DIRECT_AUTHORITATIVE_READ_PATTERN =
  /executeAuthoritativeSystemTableRead\(/;
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
  'src/control-plane/control-plane-system-table-gateway-',
];
const DIRECT_SQL_ALLOWLIST = [
  'src/bootstrap/',
  'src/cdc/',
  'src/control-plane/control-plane-system-table-gateway.js',
  'src/control-plane/control-plane-system-table-gateway-',
];
const DIRECT_AUTHORITATIVE_READ_ALLOWLIST = [
  'src/cdc/cdc-integration-service.js',
  'src/cdc/cdc-integration-service-',
  'src/control-plane/authoritative-control-plane-view.js',
  'src/control-plane/control-plane-system-table-gateway.js',
  'src/control-plane/control-plane-system-table-gateway-',
];
const DIRECT_CACHE_APPLY_ALLOWLIST = [
  'src/bootstrap/',
  'src/cdc/',
  'src/cdc/cdc-integration-service-',
  'src/cdc/cdc-event-handler.js',
  'src/message-group/cdc-handler.js',
  'src/control-plane/control-plane-system-table-gateway.js',
  'src/control-plane/control-plane-system-table-gateway-',
  'src/cache/system-table-cache.js',
];
const PRESSURE_FAILURE_HELPER_ALLOWLIST = [
  'src/control-plane/pressure-governor.js',
  'src/control-plane/control-plane-system-table-gateway.js',
  'src/control-plane/control-plane-system-table-gateway-',
  'src/control-plane/authoritative-control-plane-view.js',
  'src/cdc/cdc-integration-service.js',
  'src/cdc/cdc-integration-service-',
  'src/query/sql-query-engine.js',
  'src/query/sql-query-engine-',
];
const TRANSPORT_PRESSURE_SENSOR_ALLOWLIST = [
  'src/control-plane/pressure-governor.js',
  'src/control-plane/control-plane-system-table-gateway-',
  'src/transport/message-router.js',
];
const VIOLATION_RULES = Object.freeze([
  {
    type: 'direct-system-table-writer',
    predicate: (relativePath, content) => {
      return DIRECT_WRITER_PATTERN.test(content) &&
        !matchesAllowlist(relativePath, DIRECT_WRITER_ALLOWLIST);
    },
  },
  {
    type: 'direct-system-table-read',
    predicate: (relativePath, content) => {
      return DIRECT_SQL_PATTERN.test(content) &&
        SYSTEM_TABLE_REFERENCE_PATTERN.test(content) &&
        !matchesAllowlist(relativePath, DIRECT_SQL_ALLOWLIST);
    },
  },
  {
    type: 'direct-authoritative-read-bypass',
    predicate: (relativePath, content) => {
      return DIRECT_AUTHORITATIVE_READ_PATTERN.test(content) &&
        !matchesAllowlist(relativePath, DIRECT_AUTHORITATIVE_READ_ALLOWLIST);
    },
  },
  {
    type: 'direct-cache-mutation',
    predicate: (relativePath, content) => {
      return DIRECT_CACHE_APPLY_PATTERN.test(content) &&
        !matchesAllowlist(relativePath, DIRECT_CACHE_APPLY_ALLOWLIST);
    },
  },
  {
    type: 'bootstrap-only-runtime-import',
    predicate: (relativePath, content) => {
      return BOOTSTRAP_ONLY_RUNTIME_IMPORT_PATTERN.test(content) &&
        !relativePath.startsWith('src/bootstrap/');
    },
  },
  {
    type: 'duplicate-pressure-admission-policy',
    predicate: (relativePath, content) => {
      return PRESSURE_FAILURE_HELPER_PATTERN.test(content) &&
        !matchesAllowlist(relativePath, PRESSURE_FAILURE_HELPER_ALLOWLIST);
    },
  },
  {
    type: 'direct-transport-pressure-sensor',
    predicate: (relativePath, content) => {
      return TRANSPORT_PRESSURE_SENSOR_PATTERN.test(content) &&
        !matchesAllowlist(relativePath, TRANSPORT_PRESSURE_SENSOR_ALLOWLIST);
    },
  },
]);

function parseRootFromArgs(argv) {
  for (let index = LOCAL_NUM_ZERO; index < argv.length; index++) {
    if (argv[index] === LOCAL_STR_ROOT && argv[index + LOCAL_NUM_ONE]) {
      return path.resolve(argv[index + LOCAL_NUM_ONE]);
    }
  }
  return DEFAULT_ROOT;
}

function shouldSkipDirectory(name) {
  return name === LOCAL_STR_NODE_MODULES ||
    name === LOCAL_STR_GIT ||
    name === LOCAL_STR_TEST_OUTPUT ||
    name === LOCAL_STR_COVERAGE;
}

function walkFiles(rootDir, relativeDir = LOCAL_STR_SRC) {
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
    if (entry.isFile() && entry.name.endsWith(LOCAL_STR_JS)) {
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
  return value.replace(/[.*+?^${}()|[\]\\]/g, LOCAL_STR_1D7VE);
}

function buildSystemTableReferencePattern() {
  const tableAlternation = Array.from(SYSTEM_TABLES)
    .sort()
    .map((tableName) => escapeRegex(tableName))
    .join('|');
  return new RegExp([
    LOCAL_STR_SYSTEM_TABLE_NAME,
    `['"\`][\\s\\S]{0,400}?\\b(?:FROM|INTO|UPDATE|DELETE\\s+FROM)\\s+` +
      `(?:${tableAlternation})\\b[\\s\\S]{0,400}?['"\`]`,
  ].join(LOCAL_STR_PIPE), LOCAL_STR_I);
}

const SYSTEM_TABLE_REFERENCE_PATTERN = buildSystemTableReferencePattern();

function collectFileViolations(relativePath, content) {
  const violations = [];
  for (const rule of VIOLATION_RULES) {
    if (!rule.predicate(relativePath, content)) {
      continue;
    }

    violations.push({
      type: rule.type,
      path: relativePath,
    });
  }
  return violations;
}

function collectViolations(rootDir) {
  const violations = [];
  for (const relativePath of walkFiles(rootDir)) {
    const absolutePath = path.join(rootDir, relativePath);
    const content = fs.readFileSync(absolutePath, 'utf8');
    violations.push(...collectFileViolations(relativePath, content));
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
  if (violations.length > LOCAL_NUM_ZERO) {
    printViolations(violations);
    process.exitCode = LOCAL_NUM_ONE;
    return;
  }
  console.log(LOCAL_STR_G0BX8);
}

main();
