// Golden-table differential for the services lifecycle reconciliation
// (quest service-lifecycle-reconciliation-row-integrity, record v2, Q1-Q4).
// The golden is the sealed base's own builder and predicate output over the
// shared model grid, produced on a lab host; see the fixture's provenance.
// The Q1 oracle below is written from the record, independently of the
// product helper, so a drifted product condition disagrees with it.
import {readFileSync} from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {
  SYSTEM_TABLE_CACHE_SERVICE_IDENTITY_FIELD_NAMES,
} from '../../src/cache/cache-constants.js';
import {
  areAuthoritativeSystemTableCacheRowsAligned,
  buildAuthoritativeServiceLifecycleCacheReplacement,
} from '../../src/cache/system-table-cache-authoritative-reconciliation.js';
import {
  comboKey,
  digest,
  enumerateComboCells,
  enumerateGridCombos,
  isIdentityColumn,
  isLifecycleColumn,
  isLocalHlcColumn,
  serializeRow,
} from './system-table-cache-lifecycle-reconciliation-grid.js';

const GOLDEN = JSON.parse(readFileSync(new URL(
  './fixtures/system-table-cache-lifecycle-reconciliation-golden.json',
  import.meta.url,
), 'utf8'));
const ROW_VERSION_COLUMN = 'updated_at';
const LIFECYCLE_VERSION_COLUMN = 'state_entered_at';
const INCARNATION_TOKEN_COLUMNS = Object.freeze([
  ...SYSTEM_TABLE_CACHE_SERVICE_IDENTITY_FIELD_NAMES,
  'create_attempt_token',
  'cleanup_token',
]);

function isAbsent(value) {
  return value === null || value === undefined;
}

function isFiniteVersion(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  return typeof value === 'string' && value.trim() !== '' &&
    Number.isFinite(Number(value));
}

function oracleLifecycleVersion(row) {
  if (isFiniteVersion(row[LIFECYCLE_VERSION_COLUMN])) {
    return {
      column: LIFECYCLE_VERSION_COLUMN,
      value: Number(row[LIFECYCLE_VERSION_COLUMN]),
    };
  }
  if (!Object.hasOwn(row, LIFECYCLE_VERSION_COLUMN) &&
      isFiniteVersion(row[ROW_VERSION_COLUMN])) {
    return {
      column: ROW_VERSION_COLUMN,
      value: Number(row[ROW_VERSION_COLUMN]),
    };
  }
  return null;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function oracleDifferentIncarnation(cached, authority) {
  return INCARNATION_TOKEN_COLUMNS.some((column) =>
    isNonEmptyString(cached[column]) &&
      isNonEmptyString(authority[column]) &&
      cached[column] !== authority[column]) ||
    (isFiniteVersion(cached.created_at) &&
      isFiniteVersion(authority.created_at) &&
      Number(cached.created_at) !== Number(authority.created_at));
}

function isQ1Column(cached, authority, column) {
  return authority.service_type !== SERVICE_TYPE.PARTITION_CLEANUP &&
    !isIdentityColumn(column) &&
    !isLifecycleColumn(column) &&
    !isLocalHlcColumn(column) &&
    column !== ROW_VERSION_COLUMN &&
    isAbsent(cached[column]) &&
    !isAbsent(authority[column]);
}

function isCachedRowVersionBlocking(cached, authority) {
  return !isFiniteVersion(authority[ROW_VERSION_COLUMN]) ||
    (isFiniteVersion(cached[ROW_VERSION_COLUMN]) &&
      Number(cached[ROW_VERSION_COLUMN]) >
        Number(authority[ROW_VERSION_COLUMN]));
}

function isCachedLifecycleBlocking(cached, authority) {
  const authorityLifecycle = oracleLifecycleVersion(authority);
  return authorityLifecycle === null ||
    (isFiniteVersion(cached[authorityLifecycle.column]) &&
      Number(cached[authorityLifecycle.column]) > authorityLifecycle.value);
}

// Q1 of the record. The partition-cleanup kind is excluded: the builder
// replaces such a row wholesale, so it never keeps an absent cached cell.
function isQ1Cell(cached, authority, column) {
  return isQ1Column(cached, authority, column) &&
    !isCachedRowVersionBlocking(cached, authority) &&
    !isCachedLifecycleBlocking(cached, authority) &&
    !oracleDifferentIncarnation(cached, authority);
}

function q1Columns(cached, authority) {
  return Object.keys(authority).filter((column) =>
    isQ1Cell(cached, authority, column));
}

function hexToBits(hex, length) {
  const bits = [];
  for (const nibble of hex) {
    const value = parseInt(nibble, 16);
    for (let offset = 3; offset >= 0; offset -= 1) {
      bits.push(Boolean((value >> offset) & 1));
    }
  }
  return bits.slice(0, length);
}

function aligned(row, authority) {
  return areAuthoritativeSystemTableCacheRowsAligned(
    TABLES.SERVICES,
    row,
    authority,
  );
}

function evaluateCombo(axes, report) {
  const key = comboKey(axes);
  const golden = GOLDEN.golden[key];
  const cells = [...enumerateComboCells(axes)];
  const goldenBefore = hexToBits(golden.alignedBefore, cells.length);
  const goldenAfter = hexToBits(golden.alignedAfter, cells.length);
  const baseEquivalentOutputs = [];
  cells.forEach((cell, index) => {
    const label = `${key}|${cell.column}|${cell.cachedState}|` +
      cell.authorityState;
    const output = buildAuthoritativeServiceLifecycleCacheReplacement(
      cell.cached,
      cell.authority,
    );
    const inputQ1 = q1Columns(cell.cached, cell.authority);
    report.q1CellCount += inputQ1.length;
    const baseEquivalent = {...output};
    for (const column of inputQ1) {
      if (serializeRow({v: output[column]}) !==
          serializeRow({v: cell.authority[column]})) {
        report.q1NotAuthoritative.push(`${label}:${column}`);
      }
      if (Object.hasOwn(cell.cached, column) && cell.cached[column] === null) {
        baseEquivalent[column] = null;
      }
    }
    baseEquivalentOutputs.push(baseEquivalent);
    const before = aligned(cell.cached, cell.authority);
    const expectedBefore = inputQ1.length > 0 ? false : goldenBefore[index];
    if (before !== expectedBefore) {
      report.predicateBefore.push(label);
    }
    const after = aligned(output, cell.authority);
    const outputQ1 = q1Columns(output, cell.authority);
    if (outputQ1.length > 0) {
      report.outputQ1.push(`${label}:${outputQ1.join(',')}`);
    }
    const expectedAfter = outputQ1.length > 0 ? false : goldenAfter[index];
    if (after !== expectedAfter) {
      report.predicateAfter.push(label);
    }
  });
  report.cellCount += cells.length;
  if (digest(baseEquivalentOutputs.map(serializeRow)) !== golden.outputs) {
    report.outputMismatch.push(key);
  }
}

test(
  'lifecycle reconciliation equals the sealed base golden everywhere ' +
    'except the Q1 fill and the Q3 refusal',
  (t) => {
    const report = {
      cellCount: 0,
      q1CellCount: 0,
      q1NotAuthoritative: [],
      outputMismatch: [],
      predicateBefore: [],
      predicateAfter: [],
      outputQ1: [],
    };
    for (const axes of enumerateGridCombos()) {
      evaluateCombo(axes, report);
    }

    t.equal(
      report.cellCount,
      GOLDEN.cellCount,
      'the grid enumerates exactly the golden cells',
    );
    t.ok(report.q1CellCount > 0, 'the grid reaches Q1 cells');
    t.same(
      report.outputMismatch,
      [],
      'Q2: outside Q1 cells the builder output equals the base golden',
    );
    t.same(
      report.q1NotAuthoritative,
      [],
      'Q1: every Q1 cell holds the authoritative value',
    );
    t.same(
      report.predicateBefore,
      [],
      'Q3: the aligned predicate equals the base except refusing Q1 cells',
    );
    t.same(
      report.outputQ1,
      [],
      'Q4: the builder output carries no Q1 cell',
    );
    t.same(
      report.predicateAfter,
      [],
      'Q3/Q4: the predicate over the builder output equals the base',
    );
    t.end();
  },
);
