import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from '../../src/test-helpers/tap.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  buildOraclePayload,
  collectFileSites,
  evaluateOwnerContract,
  resolveDoneAt,
  resolveExitCode,
} from '../../scripts/check-partition-class-owner.js';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIRECTORY, '../..');
const PARENT_ORACLE =
  'solve/oracle/partition-class-ladder-single-owner-table.json';

function productionPath(fileName) {
  return path.join(REPO_ROOT, 'src', 'census-fixture', fileName);
}

test('partition-class census follows every supported alias-laundering shape', (t) => {
  const source = `
    import {
      CRITICAL_SYSTEM_PARTITION_IDS,
      isPriorityControlPlanePartition,
    } from '../bootstrap/system-partition-classification.js';
    let assigned;
    assigned = isPriorityControlPlanePartition;
    const {
      ['isCriticalSystemPartition']: criticalAlias,
      CRITICAL_SYSTEM_PARTITION_IDS: importedIds,
    } = injected;
    const bound = injected['isSystemTablePartition'].bind(injected);
    const renamedIds = CRITICAL_SYSTEM_PARTITION_IDS;
    const predicates = {priorityCheck: isPriorityControlPlanePartition};

    function callInjected(priorityCheck, partitionId) {
      return priorityCheck({partitionId});
    }

    export function classify(partitionId) {
      assigned({partitionId});
      criticalAlias(partitionId);
      bound({partitionId});
      importedIds.has(partitionId);
      renamedIds.has(partitionId);
      injected['isPriorityControlPlanePartition']({partitionId});
      predicates.priorityCheck({partitionId});
      callInjected(isPriorityControlPlanePartition, partitionId);
    }
  `;
  const sites = collectFileSites(productionPath('aliases.js'), source);
  t.same(
    sites.map((site) => site.kind),
    [
      'priority_predicate_call',
      'priority_predicate_call',
      'critical_predicate_call',
      'system_table_predicate_call',
      'critical_set_membership',
      'critical_set_membership',
      'priority_predicate_call',
      'priority_predicate_call',
    ],
  );
  t.equal(sites[0].enclosingIdentifier, 'callInjected');
  t.ok(sites.slice(1).every((site) =>
    site.enclosingIdentifier === 'classify'));
  t.end();
});

test('renamed object and destructured parameter injection stays visible', (t) => {
  const source = `
    const injected = {check: isPriorityControlPlanePartition};
    const firstForward = {...injected};
    let forwarded;
    forwarded = {...firstForward};
    const nestedInjected = {
      ['nested']: {['check']: isSystemTablePartition},
    };
    const nestedForwarded = {...nestedInjected};
    function callMember(deps, partitionId) {
      return deps.check({partitionId});
    }
    function callDestructured({check: renamed}, partitionId) {
      return renamed(partitionId);
    }
    function callNested(deps, partitionId) {
      return deps.nested.check({partitionId});
    }
    function callInlineNested(deps, partitionId) {
      return deps.nested.check({partitionId});
    }
    callMember({...forwarded}, 'tables-p1');
    callDestructured({check: isCriticalSystemPartition}, 'tables-p1');
    callNested(nestedForwarded, 'tables-p1');
    callInlineNested(
      {nested: {check: isPriorityControlPlanePartition}},
      'tables-p1',
    );
  `;
  const sites = collectFileSites(productionPath('renamed-injection.js'), source);
  t.same(
    sites.map((site) => site.kind),
    [
      'priority_predicate_call',
      'critical_predicate_call',
      'system_table_predicate_call',
      'priority_predicate_call',
    ],
  );
  t.same(
    sites.map((site) => site.enclosingIdentifier),
    ['callMember', 'callDestructured', 'callNested', 'callInlineNested'],
  );
  t.end();
});

test('inline spread, nested destructuring, and assigned nesting stay visible',
  (t) => {
    const source = `
      function callInlineSpread(deps) {
        return deps.check();
      }
      function callNestedDestructured({nested: {check}}) {
        return check();
      }
      function callAssignedNested(deps) {
        return deps.nested.check();
      }
      function safeOverride(deps) {
        return deps.check();
      }
      function safeStoredOverride(deps) {
        return deps.check();
      }
      function legacyStoredOverride(deps) {
        return deps.check();
      }
      function safeNestedOverride(deps) {
        return deps.nested.check();
      }
      function failClosedAssignment(deps) {
        return deps.check();
      }
      callInlineSpread({...{check: isPriorityControlPlanePartition}});
      callNestedDestructured({
        nested: {check: isCriticalSystemPartition},
      });
      let assigned;
      assigned = {nested: {check: isSystemTablePartition}};
      callAssignedNested(assigned);
      safeOverride({
        ...{check: isPriorityControlPlanePartition},
        check: () => false,
      });
      const legacy = {check: isPriorityControlPlanePartition};
      const safe = {check: () => false};
      safeStoredOverride({...legacy, ...safe});
      legacyStoredOverride({...safe, ...legacy});
      const nestedLegacy = {
        nested: {check: isPriorityControlPlanePartition},
      };
      const nestedSafe = {nested: {check: () => false}};
      safeNestedOverride({...nestedLegacy, ...nestedSafe});
      const mutable = {check: isPriorityControlPlanePartition};
      mutable.check = () => false;
      failClosedAssignment(mutable);
    `;
    const sites = collectFileSites(
      productionPath('recursive-parameter-flow.js'),
      source,
    );
    t.same(
      sites.map((site) => site.kind),
      [
        'priority_predicate_call',
        'critical_predicate_call',
        'system_table_predicate_call',
        'priority_predicate_call',
        'priority_predicate_call',
      ],
    );
    t.end();
  });

test('local property destructuring preserves predicate and Set aliases', (t) => {
  const source = `
    const shallow = {check: isPriorityControlPlanePartition};
    const {check} = shallow;
    check();
    const renamedSource = {check: isPriorityControlPlanePartition};
    const {check: renamed} = renamedSource;
    renamed();
    const nestedSource = {
      nested: {check: isPriorityControlPlanePartition},
    };
    const {nested: {check: nestedCheck}} = nestedSource;
    nestedCheck();
    const computedSource = {check: isPriorityControlPlanePartition};
    const {['check']: computedCheck} = computedSource;
    computedCheck();
    let assignedCheck;
    ({check: assignedCheck} = shallow);
    assignedCheck();
    const {missing: defaultCheck = isPriorityControlPlanePartition} = {};
    defaultCheck();
    const {...rest} = shallow;
    rest.check();
    const {check: omitted, ...excludedRest} = shallow;
    excludedRest.check();
    omitted();
    const nestedRestSource = {
      nested: {other: true, check: isPriorityControlPlanePartition},
    };
    const {nested: {other, ...nestedRest}} = nestedRestSource;
    nestedRest.check();
    const setSource = {ids: CRITICAL_SYSTEM_PARTITION_IDS};
    const {ids} = setSource;
    ids.has(partitionId);
    const safeSource = {check: () => false};
    const {check: safeCheck} = safeSource;
    safeCheck();
  `;
  const sites = collectFileSites(
    productionPath('local-destructuring.js'),
    source,
  );
  t.same(
    sites.map((site) => site.kind),
    [
      'priority_predicate_call',
      'priority_predicate_call',
      'priority_predicate_call',
      'priority_predicate_call',
      'priority_predicate_call',
      'priority_predicate_call',
      'priority_predicate_call',
      'priority_predicate_call',
      'priority_predicate_call',
      'critical_set_membership',
    ],
  );
  t.end();
});

test('one critical-or-priority expression is one canonical decision site', (t) => {
  const source = `
    export function usesPriorityLane(owner, partitionId) {
      return owner.isCriticalSystemPartition(partitionId) ||
        owner.isPriorityControlPlanePartition(partitionId);
    }
  `;
  const sites = collectFileSites(productionPath('ladder.js'), source);
  t.equal(sites.length, 1);
  t.equal(sites[0].kind, 'ordered_partition_class_ladder');
  t.match(sites[0].detail, /critical_predicate_call/);
  t.match(sites[0].detail, /priority_predicate_call/);
  t.end();
});

test('nested independent critical-priority ladders stay independent', (t) => {
  const source = `
    export function choose(owner, leftId, rightId) {
      return (
        owner.isCriticalSystemPartition(leftId) ||
        owner.isPriorityControlPlanePartition(leftId)
      ) || (
        owner.isCriticalSystemPartition(rightId) ||
        owner.isPriorityControlPlanePartition(rightId)
      );
    }
  `;
  const sites = collectFileSites(productionPath('nested-ladders.js'), source);
  t.equal(sites.length, 2);
  t.ok(sites.every((site) =>
    site.kind === 'ordered_partition_class_ladder'));
  t.end();
});

test('all independently rebuilt bootstrap-critical sets stay visible', (t) => {
  const literalIds = Object.values(SYSTEM_TABLE_NAME)
    .map((tableName) => `${tableName}-p1`)
    .map((partitionId) => JSON.stringify(partitionId))
    .join(', ');
  const templateIds = Object.values(SYSTEM_TABLE_NAME)
    .map((tableName) => `\`${tableName}-p1\``)
    .join(', ');
  const concatenatedIds = Object.values(SYSTEM_TABLE_NAME)
    .map((tableName) => `${JSON.stringify(tableName)} + '-p1'`)
    .join(', ');
  const source = `
    import {
      CRITICAL_SYSTEM_PARTITION_IDS as canonicalIds,
    } from '../bootstrap/system-partition-classification.js';
    const bootstrapIds = new Set(
      Object.values(SYSTEM_TABLE_NAME).map((tableName) => \`${'${tableName}'}-p1\`),
    );
    const keyedIds = new Set(
      Object.keys(SYSTEM_TABLE_NAME)
        .map((key) => SYSTEM_TABLE_NAME[key] + '-p1'),
    );
    const literalIds = new Set([${literalIds}]);
    const entriesIds = new Set(
      Object.entries(SYSTEM_TABLE_NAME)
        .map(([, tableName]) => tableName + '-p1'),
    );
    const templatedIds = new Set([${templateIds}]);
    const intermediateIds = [${templateIds}];
    const spreadIds = new Set([...intermediateIds]);
    const copiedIds = new Set(canonicalIds);
    const concatenatedIds = new Set([${concatenatedIds}]);
    function hasInjected(ids, partitionId) {
      return ids.has(partitionId);
    }
    function hasDestructured({ids}, partitionId) {
      return ids.has(partitionId);
    }
    export function isBootstrapCritical(partitionId, mode) {
      if (mode === 'keyed') return keyedIds.has(partitionId);
      if (mode === 'literal') return literalIds.has(partitionId);
      if (mode === 'entries') return entriesIds.has(partitionId);
      if (mode === 'template') return templatedIds.has(partitionId);
      if (mode === 'spread') return spreadIds.has(partitionId);
      if (mode === 'copy') {
        return hasInjected(new Set(canonicalIds), partitionId);
      }
      if (mode === 'concatenated') {
        return hasDestructured({ids: concatenatedIds}, partitionId);
      }
      return bootstrapIds.has(partitionId);
    }
  `;
  const sites = collectFileSites(productionPath('rebuilt-set.js'), source);
  t.same(
    sites.map((site) => site.kind),
    [
      'critical_set_declaration',
      'critical_set_declaration',
      'critical_set_declaration',
      'critical_set_declaration',
      'critical_set_declaration',
      'critical_set_declaration',
      'critical_set_declaration',
      'critical_set_declaration',
      'critical_set_membership',
      'critical_set_membership',
      'critical_set_membership',
      'critical_set_membership',
      'critical_set_membership',
      'critical_set_membership',
      'critical_set_membership',
      'critical_set_membership',
    ],
  );
  t.end();
});

test('semantic names fail closed while distinct names do not false-positive', (t) => {
  const source = `
    function isPriorityControlPlanePartition() { return true; }
    function isCriticalSystemPartition() { return true; }
    function isPriorityPartition() { return true; }
    isPriorityControlPlanePartition();
    isCriticalSystemPartition();
    isPriorityPartition();
  `;
  const sites = collectFileSites(productionPath('name-contract.js'), source);
  t.same(
    sites.map((site) => site.kind),
    ['priority_predicate_call', 'critical_predicate_call'],
  );
  t.end();
});

test('owner contract requires the ordered vocabulary, rows, and outcome', (t) => {
  const invalid = evaluateOwnerContract(`
    function classifySystemPartition() { return {}; }
    export {classifySystemPartition};
  `);
  t.equal(invalid.passed, false);
  t.match(invalid.problems.join('\n'), /SYSTEM_PARTITION_CLASS/);

  const defaultOnly = evaluateOwnerContract(`
    const SYSTEM_PARTITION_CLASS = Object.freeze({DEFAULT: 'default'});
    const SYSTEM_PARTITION_CLASS_ROWS = Object.freeze([]);
    function classifySystemPartition() {
      const row = SYSTEM_PARTITION_CLASS_ROWS[0];
      return Object.freeze({nonsense: row || SYSTEM_PARTITION_CLASS.DEFAULT});
    }
    export {
      SYSTEM_PARTITION_CLASS,
      SYSTEM_PARTITION_CLASS_ROWS,
      classifySystemPartition,
    };
  `);
  t.equal(defaultOnly.passed, false);
  t.match(defaultOnly.problems.join('\n'), /exactly three|ordered rows|canonical/);

  const validOwnerSource = `
    const SYSTEM_PARTITION_CLASS = Object.freeze({
      BOOTSTRAP_CRITICAL: 'bootstrap_critical',
      PRIORITY_CONTROL_PLANE: 'priority_control_plane',
      DEFAULT: 'default',
    });
    const SYSTEM_PARTITION_CLASS_ROWS = Object.freeze([
      Object.freeze({
        partitionClass: SYSTEM_PARTITION_CLASS.BOOTSTRAP_CRITICAL,
        matches: ({partitionId}) =>
          CRITICAL_SYSTEM_PARTITION_IDS.has(partitionId),
      }),
      Object.freeze({
        partitionClass: SYSTEM_PARTITION_CLASS.PRIORITY_CONTROL_PLANE,
        matches: ({tableId}) =>
          PRIORITY_CONTROL_PLANE_TABLE_IDS.has(tableId),
      }),
      Object.freeze({
        partitionClass: SYSTEM_PARTITION_CLASS.DEFAULT,
        matches: () => true,
      }),
    ]);
    function classifySystemPartition(options = {}) {
      const partitionId = getPartitionIdFromPartitionRow(options.partitionRow) ||
        normalizeNonEmptyString(options.partitionId);
      const tableId = resolvePartitionTableId(options);
      const context = Object.freeze({partitionId, tableId});
      const row = SYSTEM_PARTITION_CLASS_ROWS.find((candidate) =>
        candidate.matches(context));
      return Object.freeze({
        partitionClass: row.partitionClass,
        bootstrapCritical: CRITICAL_SYSTEM_PARTITION_IDS.has(partitionId),
        formationLivenessDependency:
          FORMATION_LIVENESS_DEPENDENCY_PARTITION_IDS.has(partitionId),
        operationLedger: tableId === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        priorityControlPlane: PRIORITY_CONTROL_PLANE_TABLE_IDS.has(tableId),
        systemTable: SYSTEM_TABLE_IDS.has(tableId),
      });
    }
    export {
      SYSTEM_PARTITION_CLASS,
      SYSTEM_PARTITION_CLASS_ROWS,
      classifySystemPartition,
    };
  `;
  const valid = evaluateOwnerContract(validOwnerSource);
  t.same(valid, {passed: true, problems: []});

  const bypassedRows = evaluateOwnerContract(validOwnerSource.replace(
    `SYSTEM_PARTITION_CLASS_ROWS.find((candidate) =>
        candidate.matches(context))`,
    'SYSTEM_PARTITION_CLASS_ROWS.find(() => true)',
  ));
  t.equal(bypassedRows.passed, false);
  t.match(
    bypassedRows.problems.join('\n'),
    /selected row/u,
  );

  const deadProof = evaluateOwnerContract(validOwnerSource.replace(
    `return Object.freeze({
        partitionClass: row.partitionClass,`,
    `if (false) {
        Object.freeze({
          partitionClass: row.partitionClass,
          bootstrapCritical: CRITICAL_SYSTEM_PARTITION_IDS.has(partitionId),
          priorityControlPlane: PRIORITY_CONTROL_PLANE_TABLE_IDS.has(tableId),
          systemTable: SYSTEM_TABLE_IDS.has(tableId),
        });
      }
      return Object.freeze({
        partitionClass: 'wrong',`,
  ));
  t.equal(deadProof.passed, false);
  t.match(
    deadProof.problems.join('\n'),
    /selected row/u,
  );

  const shadowedInputs = evaluateOwnerContract(validOwnerSource.replace(
    `function classifySystemPartition(options = {}) {
      const partitionId = getPartitionIdFromPartitionRow(options.partitionRow) ||
        normalizeNonEmptyString(options.partitionId);
      const tableId = resolvePartitionTableId(options);`,
    `function classifySystemPartition() {
      const partitionId = 'always-critical-p1';
      const tableId = 'wrong';`,
  ));
  t.equal(shadowedInputs.passed, false);
  t.match(
    shadowedInputs.problems.join('\n'),
    /receive options|partitionId must derive|tableId must derive/u,
  );

  const earlyReturn = evaluateOwnerContract(validOwnerSource.replace(
    'const partitionId = getPartitionIdFromPartitionRow(options.partitionRow)',
    `if (options.forceWrong) {
        return Object.freeze({
          partitionClass: 'wrong',
          bootstrapCritical: false,
          priorityControlPlane: false,
          systemTable: false,
        });
      }
      const partitionId = getPartitionIdFromPartitionRow(options.partitionRow)`,
  ));
  t.equal(earlyReturn.passed, false);
  t.match(
    earlyReturn.problems.join('\n'),
    /one top-level frozen canonical return/u,
  );

  const reassignedInput = evaluateOwnerContract(validOwnerSource.replace(
    'const context = Object.freeze({partitionId, tableId});',
    `partitionId = 'always-critical-p1';
      const context = Object.freeze({partitionId, tableId});`,
  ));
  t.equal(reassignedInput.passed, false);
  t.match(
    reassignedInput.problems.join('\n'),
    /four canonical const declarations/u,
  );

  const spreadOutcome = evaluateOwnerContract(validOwnerSource.replace(
    'systemTable: SYSTEM_TABLE_IDS.has(tableId),',
    `systemTable: SYSTEM_TABLE_IDS.has(tableId),
        ...override,`,
  ));
  t.equal(spreadOutcome.passed, false);
  t.match(
    spreadOutcome.problems.join('\n'),
    /one top-level frozen canonical return/u,
  );

  const spreadRow = evaluateOwnerContract(validOwnerSource.replace(
    'matches: ({partitionId}) =>',
    `...override,
        matches: ({partitionId}) =>`,
  ));
  t.equal(spreadRow.passed, false);
  t.match(
    spreadRow.problems.join('\n'),
    /exactly partitionClass and matches/u,
  );

  const spreadVocabulary = evaluateOwnerContract(validOwnerSource.replace(
    'DEFAULT: \'default\',',
    `DEFAULT: 'default',
      ...override,`,
  ));
  t.equal(spreadVocabulary.passed, false);
  t.match(
    spreadVocabulary.problems.join('\n'),
    /exactly three classes/u,
  );

  const rebuiltResolverInput = evaluateOwnerContract(validOwnerSource.replace(
    'resolvePartitionTableId(options)',
    `resolvePartitionTableId({
        partitionRow: options.partitionRow,
        partitionId,
      })`,
  ));
  t.equal(rebuiltResolverInput.passed, false);
  t.match(
    rebuiltResolverInput.problems.join('\n'),
    /tableId must derive/u,
  );

  const spreadContext = evaluateOwnerContract(validOwnerSource.replace(
    'Object.freeze({partitionId, tableId})',
    'Object.freeze({partitionId, tableId, ...override})',
  ));
  t.equal(spreadContext.passed, false);
  t.match(
    spreadContext.problems.join('\n'),
    /selected row/u,
  );

  const spoofed = evaluateOwnerContract(`
    const SYSTEM_PARTITION_CLASS = Object.freeze({
      BOOTSTRAP_CRITICAL: 'bootstrap_critical',
      PRIORITY_CONTROL_PLANE: 'priority_control_plane',
      DEFAULT: 'default',
    });
    const SYSTEM_PARTITION_CLASS_ROWS = Object.freeze([
      Object.freeze({
        partitionClass: SYSTEM_PARTITION_CLASS.BOOTSTRAP_CRITICAL,
        matches: () => false,
        note: 'CRITICAL_SYSTEM_PARTITION_IDS',
      }),
      Object.freeze({
        partitionClass: SYSTEM_PARTITION_CLASS.PRIORITY_CONTROL_PLANE,
        matches: () => false,
        note: 'PRIORITY_CONTROL_PLANE_TABLE_IDS',
      }),
      Object.freeze({
        partitionClass: SYSTEM_PARTITION_CLASS.DEFAULT,
        matches: () => true,
      }),
    ]);
    function classifySystemPartition() {
      const row = SYSTEM_PARTITION_CLASS_ROWS.find((candidate) =>
        candidate.matches({partitionId: 'x-p1', tableId: 'x'}));
      return Object.freeze({
        partitionClass: 'wrong',
        bootstrapCritical: false,
        priorityControlPlane: false,
        systemTable: false,
      });
    }
    export {
      SYSTEM_PARTITION_CLASS,
      SYSTEM_PARTITION_CLASS_ROWS,
      classifySystemPartition,
    };
  `);
  t.equal(spoofed.passed, false);
  t.match(
    spoofed.problems.join('\n'),
    /declared match predicate|selected row|must derive/u,
  );
  t.end();
});

test('owner path exclusion does not substitute for owner contract validation', (t) => {
  const ownerPath = path.join(
    REPO_ROOT,
    'src/bootstrap/system-partition-classification.js',
  );
  const source = `
    function isPriorityControlPlanePartition() { return true; }
    isPriorityControlPlanePartition({partitionId: 'p1'});
  `;
  t.same(collectFileSites(ownerPath, source), []);
  t.equal(evaluateOwnerContract(source).passed, false);
  t.end();
});

test('oracle reconciles 125 raw edges to the sealed 119 decision sites', (t) => {
  const counted = Array.from({length: 119}, (_value, index) => ({
    kind: index === 0 ?
      'ordered_partition_class_ladder' :
      'priority_predicate_call',
  }));
  const payload = buildOraclePayload(
    {
      counted,
      ownerContract: {passed: false, problems: ['missing owner table']},
      predicateEdgeCount: 122,
      collapsedLadderEdges: 6,
    },
    [
      {label: 'lint', passed: true, exitCode: 0},
      {label: 'targeted-suites', passed: true, exitCode: 0},
    ],
    0,
  );
  t.equal(payload.metric, 119);
  t.equal(payload.done, false, 'missing owner contract keeps oracle open');
  t.equal(payload.detail.baselineReconciliation.epicDecisionSites, 119);
  t.equal(payload.detail.currentRawPredicateEdges, 122);
  t.equal(payload.detail.currentCollapsedLadderEdges, 6);
  t.end();
});

test('sealed parent target cannot be weakened through done-at aliases', (t) => {
  t.throws(
    () => resolveDoneAt(`./${PARENT_ORACLE}`, '125'),
    /cannot change the sealed parent target 0/,
  );
  t.equal(resolveDoneAt('solve/oracle/child.json', '17'), 17);

  const result = spawnSync(
    process.execPath,
    [
      'scripts/check-partition-class-owner.js',
      '--oracle',
      '--done-at',
      '125',
    ],
    {cwd: REPO_ROOT, encoding: 'utf8'},
  );
  t.not(result.status, 0);
  t.match(result.stderr, /cannot change the sealed parent target 0/);
  t.end();
});

test('with-gates exit fails closed on a red gate', (t) => {
  const payload = {
    metric: 0,
    target: 0,
    done: false,
    detail: {ownerContract: {passed: true, problems: []}},
  };
  t.equal(resolveExitCode(payload, true), 1);
  t.equal(resolveExitCode(payload, false), 0);
  t.end();
});
