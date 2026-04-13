// @ts-nocheck
import fs from 'fs';
import os from 'os';
import path from 'path';
import {spawnSync} from 'child_process';
import {test} from '../../src/test-helpers/tap.js';

const SCRIPT_PATH = path.resolve(
  process.cwd(),
  'scripts/check-unified-system-metadata-gateway.js',
);

function createTempRoot() {
  return fs.mkdtempSync(
    path.join(os.tmpdir(), 'unified-metadata-gateway-audit-'),
  );
}

function writeRuntimeFile(rootDir, relativePath, content) {
  const absolutePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), {recursive: true});
  fs.writeFileSync(absolutePath, content);
}

function runAudit(rootDir) {
  return spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--root', rootDir],
    {
      encoding: 'utf8',
    },
  );
}

test('metadata gateway audit rejects direct runtime system-table writers',
  async (t) => {
    const rootDir = createTempRoot();
    writeRuntimeFile(
      rootDir,
      'src/runtime/bad-writer.js',
      'export async function bad(cdcIntegrationService) {' +
      ' return cdcIntegrationService.updateSystemTableRow("nodes", {}, {}); }',
    );

    const result = runAudit(rootDir);

    t.equal(result.status, 1, 'audit should fail');
    t.match(result.stderr, /direct-system-table-writer/,
      'audit should report direct writer');
  });

test('metadata gateway audit rejects direct runtime system-table SQL reads',
  async (t) => {
    const rootDir = createTempRoot();
    writeRuntimeFile(
      rootDir,
      'src/runtime/bad-reader.js',
      'import {SYSTEM_TABLE_NAME} from "../bootstrap/system-table-schemas-constants.js";' +
      'export async function bad(sqlQueryEngine) {' +
      ' return sqlQueryEngine.executeQuery(`SELECT * FROM ${SYSTEM_TABLE_NAME.NODES}`); }',
    );

    const result = runAudit(rootDir);

    t.equal(result.status, 1, 'audit should fail');
    t.match(result.stderr, /direct-system-table-read/,
      'audit should report direct read');
  });

test('metadata gateway audit rejects unsanctioned cache mutations',
  async (t) => {
    const rootDir = createTempRoot();
    writeRuntimeFile(
      rootDir,
      'src/runtime/bad-cache.js',
      'export function bad(cache, row) { cache.applySystemTableChange("nodes", "UPSERT", row); }',
    );

    const result = runAudit(rootDir);

    t.equal(result.status, 1, 'audit should fail');
    t.match(result.stderr, /direct-cache-mutation/,
      'audit should report direct cache mutation');
  });

test('metadata gateway audit allows sanctioned bootstrap direct writers',
  async (t) => {
    const rootDir = createTempRoot();
    writeRuntimeFile(
      rootDir,
      'src/bootstrap/sanctioned-writer.js',
      'export async function ok(cdcIntegrationService) {' +
      ' return cdcIntegrationService.upsertSystemTableRow("nodes", {}); }',
    );

    const result = runAudit(rootDir);

    t.equal(result.status, 0, 'audit should pass');
    t.match(result.stdout, /ok/, 'audit should report success');
  });

test('metadata gateway audit rejects runtime imports of bootstrap-only helpers',
  async (t) => {
    const rootDir = createTempRoot();
    writeRuntimeFile(
      rootDir,
      'src/runtime/bad-bootstrap-import.js',
      'import {BootstrapSystemTableWriter} from "../bootstrap/system-table-writer.js";' +
      'export function bad() { return BootstrapSystemTableWriter; }',
    );

    const result = runAudit(rootDir);

    t.equal(result.status, 1, 'audit should fail');
    t.match(result.stderr, /bootstrap-only-runtime-import/,
      'audit should report bootstrap-only helper imports in runtime code');
  });

test('metadata gateway audit rejects duplicate pressure admission policies',
  async (t) => {
    const rootDir = createTempRoot();
    writeRuntimeFile(
      rootDir,
      'src/runtime/bad-pressure-policy.js',
      'import {buildPressureAdmissionFailure} from "../control-plane/pressure-governor.js";' +
      'export function bad(decision) { return buildPressureAdmissionFailure(decision, {}); }',
    );

    const result = runAudit(rootDir);

    t.equal(result.status, 1, 'audit should fail');
    t.match(result.stderr, /duplicate-pressure-admission-policy/,
      'audit should report duplicate pressure admission policies');
  });

test('metadata gateway audit rejects direct transport pressure sensors ' +
  'outside the shared pressure governor', async (t) => {
  const rootDir = createTempRoot();
  writeRuntimeFile(
    rootDir,
    'src/runtime/bad-pressure-sensor.js',
    'export function bad(messageRouter) {' +
    ' return messageRouter.getOutboundPressureSummary(); }',
  );

  const result = runAudit(rootDir);

  t.equal(result.status, 1, 'audit should fail');
  t.match(result.stderr, /direct-transport-pressure-sensor/,
    'audit should report direct transport pressure sensors');
});
