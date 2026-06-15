/**
 * Regression gate for Quest `cdc-cache-delete-resurrection`.
 *
 * A dropped or reordered CDC DELETE must never leave a permanently resurrected
 * row in any `internalCachePropagation` system-table cache, and equal-`updated_at`
 * UPDATE ties must converge identically across replicas.
 *
 * This asserts the FIXED contract (zero non-converging cells). It is RED until
 * the apply-path hardening lands (HLC carried end-to-end + HLC-compare in
 * `isStaleForExistingRecord` + DELETE tombstones + cache-vs-truth anti-entropy
 * sweep); the same harness then flips it green. The per-mode sub-tests pinpoint
 * which divergence class still leaks.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  MODE,
  runCdcDeleteResurrectionScenario,
} from './cdc-cache-delete-resurrection-scenario.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('cdc-cache-delete-resurrection: caches converge to authoritative absence', (t) => {
  const result = runCdcDeleteResurrectionScenario();

  t.ok(result.totalCells > 0, 'the propagated-table matrix is non-empty');

  const reorderFailures = result.cells
    .filter((cell) => cell.mode === MODE.REORDER && cell.failed)
    .map((cell) => cell.table);
  t.same(
    reorderFailures,
    [],
    'no table resurrects a row from a DELETE-before-INSERT reorder',
  );

  const dropFailures = result.cells
    .filter((cell) => cell.mode === MODE.DROP && cell.failed)
    .map((cell) => cell.table);
  t.same(
    dropFailures,
    [],
    'no table keeps a cache-only row after a dropped DELETE (anti-entropy sweep)',
  );

  const tieFailures = result.cells
    .filter((cell) => cell.mode === MODE.TIE && cell.failed)
    .map((cell) => cell.table);
  t.same(
    tieFailures,
    [],
    'no table diverges across replicas on an equal-updated_at UPDATE tie',
  );

  // Guard arms: a fix must not overreach. These hold today and must stay green —
  // they fail an unsafe sweep (evicting live rows) or an over-aggressive
  // tombstone (blocking a legitimate re-create after delete).
  const preserveFailures = result.cells
    .filter((cell) => cell.mode === MODE.PRESERVE && cell.failed)
    .map((cell) => cell.table);
  t.same(
    preserveFailures,
    [],
    'a row still present in authoritative truth survives the sweep',
  );

  const recreateFailures = result.cells
    .filter((cell) => cell.mode === MODE.RECREATE && cell.failed)
    .map((cell) => cell.table);
  t.same(
    recreateFailures,
    [],
    'a genuinely-newer INSERT after DELETE is not blocked by a tombstone',
  );

  const recreateNoHlcFailures = result.cells
    .filter((cell) => cell.mode === MODE.RECREATE_NO_HLC && cell.failed)
    .map((cell) => cell.table);
  t.same(
    recreateNoHlcFailures,
    [],
    'an equal-ms recreate with no HLC is not wrongly fenced (no-HLC fallback)',
  );

  t.equal(
    result.failingCells,
    0,
    `all ${result.totalCells} (table, mode) cells converge`,
  );
  t.end();
});
