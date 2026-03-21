import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..', '..');

const HOT_RUNTIME_FILES = Object.freeze([
  'src/bootstrap/bootstrap-api.js',
  'src/message-group/message-group-service.js',
  'src/query/sql-query-engine.js',
  'src/query/table-creation-service.js',
  'src/rebalancer/rebalance-coordinator.js',
  'src/rebalancer/unified-rebalancer.js',
  'src/rebalancer/node-storage-budget-service.js',
  'src/rebalancer/storage-capacity-migration.js',
]);

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('control-plane gateway mutation guardrails', () => {
  it('hot runtime owners do not construct gateways directly', () => {
    const violations = HOT_RUNTIME_FILES
      .filter((filePath) => {
        const source = readSource(filePath);
        return /new\s+ControlPlaneSystemTableGateway\s*\(/.test(source);
      });

    assert.deepEqual(
      violations,
      [],
      'Direct gateway construction is forbidden in hot runtime owners',
    );
  });

  it('hot runtime owners do not mutate gateway dependencies after construction', () => {
    const violations = [];

    for (const filePath of HOT_RUNTIME_FILES) {
      const source = readSource(filePath);
      if (/controlPlaneSystemTableGateway[\s\S]{0,120}\.set(SqlQueryEngine|CdcIntegrationService|SystemTableCache|MessageRouter)\s*\(/.test(source)) {
        violations.push(filePath);
      }
    }

    assert.deepEqual(
      violations,
      [],
      'Late gateway dependency mutation is forbidden in hot runtime owners',
    );
  });
});
