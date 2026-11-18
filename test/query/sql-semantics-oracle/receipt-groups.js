/**
 * The oracle's measured receipt groups, shared by the test file (which
 * names its top-level tests after them) and the Quest's evidence producer
 * (scripts/quest-evidence/coordinator-sqlite-merge-receipt.js), which selects
 * each group by its anchored name and requires the exact number of tests it
 * declares, so a dropped or renamed case cannot pass as a smaller group.
 */

import fs from 'node:fs';

import {FAMILY} from './corpus-generator.js';
import {LAYOUTS} from './schema.js';
import {PARAMETER_WITNESSES, ROW_VALUE_WITNESSES} from './typed-wire.js';

const GROUP = Object.freeze({
  DIFFERENTIAL: 'sqlite-differential-oracle-green',
  WITNESSES: 'expression-domain-witnesses-trim-cast-case',
  PUSHDOWN: 'pushdown-soundness-golden-cases',
  ORDER_DEPENDENT: 'order-dependent-aggregates-exact',
  ROUND_TRIP: 'sql-render-round-trip-fidelity',
  DECLARED: 'declared-ddl-reference-family',
  TYPED_WIRE: 'typed-wire-storage-class-round-trip',
});

// The families each seeded group runs at every layout.
const GROUP_FAMILIES = Object.freeze({
  [GROUP.DIFFERENTIAL]: Object.freeze([FAMILY.F1, FAMILY.F2, FAMILY.F3, FAMILY.F4, FAMILY.F5,
    FAMILY.F6, FAMILY.F7, FAMILY.F8]),
  [GROUP.DECLARED]: Object.freeze([FAMILY.F11]),
});
const GRAMMAR_PARITY_CASES = 1;

const GOLDEN_FILE = new URL('./golden-divergences.json', import.meta.url);
const WIRE_MODES = 2;
const NON_CANONICAL_CASES = 1;

function loadGoldenCases() {
  return JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8')).cases;
}

/**
 * Tests one group runs: its top-level test plus every subtest.
 * @param {string} group - A GROUP value.
 * @return {number}
 */
function expectedTestCount(group) {
  const cases = loadGoldenCases();
  const inGroup = cases.filter((golden) => golden.group === group);
  const statements = inGroup.filter((golden) => typeof golden.statement === 'string').length;
  const ddl = inGroup.length - statements;
  const layouts = LAYOUTS.length;
  const families = (GROUP_FAMILIES[group] || []).length;
  const subtests = {
    [GROUP.DIFFERENTIAL]: layouts * (families + statements) + ddl +
      GRAMMAR_PARITY_CASES,
    [GROUP.WITNESSES]: layouts * statements + ddl,
    [GROUP.PUSHDOWN]: layouts * statements + ddl,
    [GROUP.ORDER_DEPENDENT]: layouts * statements + ddl,
    [GROUP.DECLARED]: layouts * (families + statements) + ddl,
    [GROUP.ROUND_TRIP]: Object.values(FAMILY).length +
      cases.filter((golden) => typeof golden.statement === 'string').length + ddl,
    [GROUP.TYPED_WIRE]: WIRE_MODES * (ROW_VALUE_WITNESSES.length +
      PARAMETER_WITNESSES.length) + NON_CANONICAL_CASES,
  }[group];
  if (subtests === undefined) throw new Error(`unknown oracle group ${group}`);
  return 1 + subtests;
}

export {GROUP, GROUP_FAMILIES, expectedTestCount, loadGoldenCases};
