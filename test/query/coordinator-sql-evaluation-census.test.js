/**
 * Witness test for the coordinator SQL evaluation census guard
 * (design coordinator-sqlite-merge §2.1, §4, §5.1 WP6; receipt
 * `js-sql-evaluator-census-zero`).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, test} from 'node:test';

import {
  CLASSIFIED_OWNER_INVENTORY,
  DELETED_DUPLICATE_SQL_RENDERER_MODULES,
  DELETED_JS_SQL_EVALUATOR_MODULES,
  PROHIBITED_JS_EVALUATOR_SIGNATURES,
  auditClassifiedOwnerInventory,
  auditCoordinatorSqlEvaluationCensus,
  auditDeletedModulesAbsent,
  auditProhibitedEvaluatorSignatures,
} from '../../scripts/checks/check-coordinator-sql-evaluation-census.js';

describe('WP6 static coordinator SQL evaluation census guard (js-sql-evaluator-census-zero)', () => {
  test('the 5 deleted JS SQL evaluator modules and 2 duplicate SQL renderer modules remain absent', () => {
    assert.equal(DELETED_JS_SQL_EVALUATOR_MODULES.length, 5);
    assert.equal(DELETED_DUPLICATE_SQL_RENDERER_MODULES.length, 2);
    const result = auditDeletedModulesAbsent();
    assert.equal(result.absent, true, `surviving files: ${result.survivingFiles.join(', ')}`);
    assert.deepEqual(result.survivingFiles, []);
  });

  test('no prohibited JS SQL evaluator signature exists in src/query or src/live-query', () => {
    const result = auditProhibitedEvaluatorSignatures();
    assert.equal(
      result.zeroProhibitedSignatures,
      true,
      `prohibited signatures found: ${JSON.stringify(result.violations)}`,
    );
    assert.ok(result.scannedFileCount > 50);
    assert.deepEqual(result.violations, []);
  });

  test('the classified SQLite evaluator, DDL/renderer, typed-wire, and routing owner inventory is complete', () => {
    const result = auditClassifiedOwnerInventory();
    assert.equal(
      result.inventoryValid,
      true,
      `missing owners/tokens: ${JSON.stringify({
        missingOwners: result.missingOwners,
        missingTokens: result.missingTokens,
      })}`,
    );
    assert.equal(result.classifiedOwnerCount, CLASSIFIED_OWNER_INVENTORY.length);
  });

  test('full census audit passes on the repository and rejects known-bad reintroductions', () => {
    const repoReport = auditCoordinatorSqlEvaluationCensus();
    assert.equal(repoReport.passes, true);

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lagrange-sql-census-'));
    try {
      const reintroducedModule = path.join(tmpRoot, DELETED_JS_SQL_EVALUATOR_MODULES[0]);
      fs.mkdirSync(path.dirname(reintroducedModule), {recursive: true});
      fs.writeFileSync(reintroducedModule, 'export function combineAggregate() {}\n', 'utf8');

      const badDeleted = auditDeletedModulesAbsent(tmpRoot);
      assert.equal(badDeleted.absent, false);
      assert.deepEqual(badDeleted.survivingFiles, [DELETED_JS_SQL_EVALUATOR_MODULES[0]]);

      const badSignatures = auditProhibitedEvaluatorSignatures(tmpRoot);
      assert.equal(badSignatures.zeroProhibitedSignatures, false);
      assert.ok(
        badSignatures.violations.some((v) =>
          PROHIBITED_JS_EVALUATOR_SIGNATURES.includes(v.signature),
        ),
      );
    } finally {
      fs.rmSync(tmpRoot, {recursive: true, force: true});
    }
  });
});
