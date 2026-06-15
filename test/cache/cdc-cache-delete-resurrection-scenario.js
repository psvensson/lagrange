/**
 * Deterministic repro for Quest `cdc-cache-delete-resurrection`.
 *
 * A dropped or reordered CDC DELETE must never leave a permanently resurrected
 * row in any of the `internalCachePropagation` system-table caches. This harness
 * drives the *real* `SystemTableCache.applySystemTableChange` apply path (no
 * mocks) for every propagated table, across the divergence modes the WS0 ordering
 * audit found
 * (`.kiro/specs/proximity-spray-cdc-propagation-overlay/ws0-ordering-audit.md`),
 * plus two guard arms that keep a fix honest.
 *
 * Bug-repro modes (RED today, must flip green under the fix):
 *   reorder  — DELETE delivered before its matching INSERT. Today the DELETE
 *              hits an absent key (silent no-op, no tombstone) and the later
 *              INSERT recreates the row permanently.        (audit criterion b)
 *   drop     — INSERT applied, DELETE genuinely lost. Authoritative truth holds
 *              the row absent, but no healer deletes a cache-only row, so it
 *              survives forever. Convergence requires a real anti-entropy sweep
 *              against authoritative truth.                  (audit criterion b)
 *   tie      — two replicas receive an equal-`updated_at` UPDATE pair in opposite
 *              orders. The millisecond tie defeats `isStaleForExistingRecord`, so
 *              `mergeRecords` settles last-delivered-wins and the replicas
 *              diverge on the differing field.               (audit criterion d)
 *
 * Guard arms (GREEN today, must STAY green — they fail a fix that overreaches):
 *   preserve — INSERT a row, run the sweep with truth that STILL contains it;
 *              the row must survive. Fails an unsafe "delete every cache row not
 *              in the passed-in snapshot" sweep that evicts live rows.
 *   recreate — DELETE then a genuinely-newer INSERT (higher HLC). The row must
 *              be present. Fails an over-aggressive tombstone that blocks a
 *              legitimate re-create after delete.
 *
 * Each (table, mode) pair is one "cell"; a cell FAILS when the bug is present
 * (resurrection / divergence) or a guard is violated. The scenario returns the
 * failing-cell count — the lower-is-better gradient the Quest drives to zero. The
 * planned fix (origin HLC carried end-to-end + HLC-compare in
 * `isStaleForExistingRecord` + DELETE tombstones + a cache-vs-truth anti-entropy
 * sweep) must flip every bug cell green without breaking a guard.
 *
 * Faithfulness notes:
 *   - reorder/tie use EQUAL wall-clock `updated_at`, so only an HLC/tombstone fix
 *     — not a wall-clock comparison — can pass them.
 *   - `tie` compares the FULL converged record, not a synthetic marker (a marker
 *     would be silently dropped by the `control_plane_publications` structured
 *     serializer, masking that table's real tie divergence); the publication tie
 *     is driven through a real surviving scalar (`reason_code`) at equal epoch.
 *   - The sweep is invoked ONLY through the optional, pinned production hook
 *     `SystemTableCache.reconcileAgainstAuthoritativeTruth(truthSnapshot)`. It is
 *     absent today, so `drop` fails for the right reason; the fix must add exactly
 *     this method (a free function elsewhere will leave `drop` red). NOTE: a
 *     correct sweep must treat the truth snapshot as authoritative/complete before
 *     evicting — a guarantee the `preserve` arm checks but cannot fully encode;
 *     completeness-awareness remains a fix-design requirement.
 */

import {
  SystemTableCache,
  CDC_OPERATIONS,
} from '../../src/cache/system-table-cache.js';
import {CDC_PROPAGATED_TABLES} from '../../src/cache/cdc-table-policy.js';
import {
  getSystemCachePrimaryKeyField,
} from '../../src/cache/system-cache-key-descriptor.js';
import {TABLES} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';

const REPRO_KEY = 'cdc-resurrection-repro-key';
const MARKER_FIELD = '__repro_marker';
const PUBLICATION_TIE_FIELD = 'reason_code';

// The exact production surface the fix must add for the sweep-dependent modes.
const SWEEP_HOOK = 'reconcileAgainstAuthoritativeTruth';

const MODE = Object.freeze({
  REORDER: 'reorder',
  DROP: 'drop',
  TIE: 'tie',
  PRESERVE: 'preserve',
  RECREATE: 'recreate',
  RECREATE_NO_HLC: 'recreate_no_hlc',
});

function hlcString(physical, logical, nodeId) {
  return new HLCTimestamp(physical, logical, nodeId).toString();
}

// Minimal row that satisfies the apply path: a primary key plus the wall-clock
// and HLC version stamps the merge logic compares on. `updated_at_hlc` is the
// column the fix will populate and compare; it is carried here so the same
// harness exercises the fixed path unchanged.
function buildRow(tableName, {marker, updatedAt, hlc}) {
  const primaryKeyField = getSystemCachePrimaryKeyField(tableName);
  return {
    [primaryKeyField]: REPRO_KEY,
    updated_at: updatedAt,
    updated_at_hlc: hlc,
    [MARKER_FIELD]: marker,
  };
}

function hasSweepHook(cache) {
  return typeof cache[SWEEP_HOOK] === 'function';
}

function runSweep(cache, truthSnapshot) {
  if (hasSweepHook(cache)) {
    cache[SWEEP_HOOK](truthSnapshot);
  }
}

function rowIsPresent(cache, tableName) {
  return cache.get(tableName, REPRO_KEY) != null;
}

// Deterministic, order-insensitive serialization of a stored record so two
// replicas are compared on their FULL converged state, not one synthetic field.
function canonicalRecord(record) {
  if (record == null) {
    return null;
  }
  return JSON.stringify(record, Object.keys(record).sort());
}

// reorder: DELETE (causally later, higher HLC) is delivered BEFORE its INSERT.
// Fails when the row survives — the INSERT resurrected a deleted row.
function reorderResurrects(tableName) {
  const cache = new SystemTableCache();
  const insertRow = buildRow(tableName, {
    marker: 'created',
    updatedAt: 1000,
    hlc: hlcString(1000, 0, 'node-a'),
  });
  const deleteRow = buildRow(tableName, {
    marker: 'created',
    updatedAt: 1000,
    hlc: hlcString(1000, 1, 'node-a'),
  });
  cache.applySystemTableChange(tableName, CDC_OPERATIONS.DELETE, deleteRow);
  cache.applySystemTableChange(tableName, CDC_OPERATIONS.INSERT, insertRow);
  return rowIsPresent(cache, tableName);
}

// drop: INSERT applied, DELETE never delivered. Authoritative truth holds the
// row absent. Fails when the row survives after the anti-entropy sweep had its
// chance (the sweep hook is absent today, so it always survives).
function dropResurrects(tableName) {
  const cache = new SystemTableCache();
  const insertRow = buildRow(tableName, {
    marker: 'created',
    updatedAt: 1000,
    hlc: hlcString(1000, 0, 'node-a'),
  });
  cache.applySystemTableChange(tableName, CDC_OPERATIONS.INSERT, insertRow);

  // The DELETE is lost. Authoritative truth (post-delete) has no rows for this
  // table; a real sweep must remove the cache-only resurrected row.
  runSweep(cache, {[tableName]: []});
  return rowIsPresent(cache, tableName);
}

// The differing tie write for a table: a real surviving scalar so the comparison
// measures genuine merge divergence (not a marker the serializer would erase).
function buildTieWrite(tableName, {fieldValue, logical, nodeId}) {
  const isPublication = tableName === TABLES.CONTROL_PLANE_PUBLICATIONS;
  const tieField = isPublication ? PUBLICATION_TIE_FIELD : MARKER_FIELD;
  const row = {
    [getSystemCachePrimaryKeyField(tableName)]: REPRO_KEY,
    updated_at: 5000,
    updated_at_hlc: hlcString(5000, logical, nodeId),
    [tieField]: fieldValue,
  };
  if (isPublication) {
    // Equal epoch so the tie is decided on the scalar field, not the epoch rule.
    row.publication_epoch = 1;
  }
  return row;
}

// tie: two replicas apply an equal-`updated_at` UPDATE pair in opposite orders.
// The HLC must tie-break to the same winner on both replicas. Fails when the two
// replicas' FULL converged records differ.
function tieDiverges(tableName) {
  const replicaOne = new SystemTableCache();
  const replicaTwo = new SystemTableCache();
  const writeA = buildTieWrite(tableName,
    {fieldValue: 'value-a', logical: 0, nodeId: 'node-a'});
  const writeB = buildTieWrite(tableName,
    {fieldValue: 'value-b', logical: 1, nodeId: 'node-b'});

  replicaOne.applySystemTableChange(tableName, CDC_OPERATIONS.UPDATE, writeA);
  replicaOne.applySystemTableChange(tableName, CDC_OPERATIONS.UPDATE, writeB);

  replicaTwo.applySystemTableChange(tableName, CDC_OPERATIONS.UPDATE, writeB);
  replicaTwo.applySystemTableChange(tableName, CDC_OPERATIONS.UPDATE, writeA);

  return canonicalRecord(replicaOne.get(tableName, REPRO_KEY)) !==
    canonicalRecord(replicaTwo.get(tableName, REPRO_KEY));
}

// preserve (guard): a row that IS in authoritative truth must survive the sweep.
// Fails an unsafe sweep that evicts live rows. Green today (no hook) and after a
// correct fix.
function preserveViolated(tableName) {
  const cache = new SystemTableCache();
  const row = buildRow(tableName, {
    marker: 'created',
    updatedAt: 1000,
    hlc: hlcString(1000, 0, 'node-a'),
  });
  cache.applySystemTableChange(tableName, CDC_OPERATIONS.INSERT, row);
  runSweep(cache, {[tableName]: [row]});
  return !rowIsPresent(cache, tableName);
}

// recreate (guard): DELETE then a genuinely-newer INSERT (higher HLC) must leave
// the row present. Fails an over-aggressive tombstone that blocks a legitimate
// re-create. Green today and after a correct fix.
function recreateBlocked(tableName) {
  const cache = new SystemTableCache();
  const deleteRow = buildRow(tableName, {
    marker: 'gone',
    updatedAt: 1000,
    hlc: hlcString(1000, 1, 'node-a'),
  });
  const reinsertRow = buildRow(tableName, {
    marker: 'reborn',
    updatedAt: 2000,
    hlc: hlcString(2000, 0, 'node-a'),
  });
  cache.applySystemTableChange(tableName, CDC_OPERATIONS.DELETE, deleteRow);
  cache.applySystemTableChange(tableName, CDC_OPERATIONS.INSERT, reinsertRow);
  return !rowIsPresent(cache, tableName);
}

// recreate_no_hlc (guard): the no-HLC production case. A DELETE then a legitimate
// re-INSERT at the SAME wall-clock millisecond, neither carrying an HLC, must leave
// the row present. Fails a tombstone wall-clock fence that uses strict `>` (it would
// wrongly fence the equal-ms recreate — a regression on rows like
// control_plane_publications that carry `updated_at` on DELETE).
function recreateBlockedNoHlc(tableName) {
  const cache = new SystemTableCache();
  const pk = getSystemCachePrimaryKeyField(tableName);
  const deleteRow = {[pk]: REPRO_KEY, updated_at: 1000, [MARKER_FIELD]: 'gone'};
  const reinsertRow = {[pk]: REPRO_KEY, updated_at: 1000, [MARKER_FIELD]: 'reborn'};
  cache.applySystemTableChange(tableName, CDC_OPERATIONS.DELETE, deleteRow);
  cache.applySystemTableChange(tableName, CDC_OPERATIONS.INSERT, reinsertRow);
  return !rowIsPresent(cache, tableName);
}

const MODE_PROBES = Object.freeze({
  [MODE.REORDER]: reorderResurrects,
  [MODE.DROP]: dropResurrects,
  [MODE.TIE]: tieDiverges,
  [MODE.PRESERVE]: preserveViolated,
  [MODE.RECREATE]: recreateBlocked,
  [MODE.RECREATE_NO_HLC]: recreateBlockedNoHlc,
});

/**
 * Run the full repro matrix.
 * @return {{
 *   scenario: string,
 *   totalCells: number,
 *   failingCells: number,
 *   passed: boolean,
 *   cells: Array<{table: string, mode: string, failed: boolean}>,
 *   byMode: Object<string, number>,
 *   failingTables: string[],
 * }}
 */
function runCdcDeleteResurrectionScenario() {
  const cells = [];
  const byMode = Object.fromEntries(
    Object.keys(MODE_PROBES).map((mode) => [mode, 0]),
  );
  const failingTables = new Set();

  for (const tableName of CDC_PROPAGATED_TABLES) {
    for (const mode of Object.keys(MODE_PROBES)) {
      const failed = MODE_PROBES[mode](tableName) === true;
      cells.push({table: tableName, mode, failed});
      if (failed) {
        byMode[mode] += 1;
        failingTables.add(tableName);
      }
    }
  }

  const failingCells = cells.filter((cell) => cell.failed).length;
  return {
    scenario: 'cdc-cache-delete-resurrection',
    totalCells: cells.length,
    failingCells,
    passed: failingCells === 0,
    cells,
    byMode,
    failingTables: [...failingTables],
  };
}

export {
  MODE,
  REPRO_KEY,
  MARKER_FIELD,
  SWEEP_HOOK,
  runCdcDeleteResurrectionScenario,
};
