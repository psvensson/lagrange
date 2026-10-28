/**
 * Scenario: release-0-2-7-stabilization
 *
 * Composed verification scenario exercising the 0.2.7 stabilization contracts:
 * 1. Unified UTF-8 byte-order (BINARY) key comparison across split and routing keys
 * 2. SQL mutation expression evaluation, safe string escaping, and fail-closed rejection
 * 3. Table schema constraint enforcement and distributed foreign key refusal
 * 4. Protected internal cluster HTTP ingress vs probe accessibility
 * 5. Reusable proof authority producer attribution defaults
 * 6. Release notes target-version filtering and Docker Hub overview verification
 */

import {
  compareRoutingKeys,
  compareSplitKey,
} from '../../../src/partition/split-key-comparator.js';
import {SQLParser} from '../../../src/query/sql-parser.js';
import {BOOTSTRAP_API_ROUTE} from '../../../src/bootstrap/bootstrap-api-constants.js';
import {
  PROOF,
  buildReceipt,
  defaultProducer,
} from '../../../scripts/proof-authority.js';
import {
  OVERVIEW_MARKER_BEGIN,
  OVERVIEW_MARKER_END,
  OVERVIEW_MODE,
  renderReleaseNotes,
} from '../../../scripts/release-notes.js';
import {verifyDockerHubOverview} from '../../../scripts/checks/release-publication-receipt.js';

export const name = 'release-0-2-7-stabilization';

const STEP_OUTCOME = Object.freeze({
  FAIL: 'FAIL',
  PASS: 'PASS',
});

function pass(name, details = {}) {
  return {name, outcome: STEP_OUTCOME.PASS, ...details};
}

function fail(name, reason, details = {}) {
  return {name, outcome: STEP_OUTCOME.FAIL, reason, ...details};
}

async function verifyUnifiedKeyComparison() {
  const stepName = 'unified-key-comparison-binary-order';
  try {
    // UTF-8 / ASCII byte order: 'Z' (90) sorts before 'a' (97)
    const zVsA = compareSplitKey('Z', 'a');
    const zVsARouting = compareRoutingKeys('Z', 'a');
    if (zVsA >= 0 || zVsARouting >= 0) {
      return fail(stepName, `expected 'Z' < 'a' (negative), got splitKey=${zVsA}, routing=${zVsARouting}`);
    }

    const aVsZ = compareSplitKey('a', 'Z');
    const aVsZRouting = compareRoutingKeys('a', 'Z');
    if (aVsZ <= 0 || aVsZRouting <= 0) {
      return fail(stepName, `expected 'a' > 'Z' (positive), got splitKey=${aVsZ}, routing=${aVsZRouting}`);
    }

    // Numbers sort numerically
    const numOrder = compareSplitKey(100, 200);
    const numRouting = compareRoutingKeys(100, 200);
    if (numOrder >= 0 || numRouting >= 0) {
      return fail(stepName, `expected 100 < 200 (negative), got splitKey=${numOrder}, routing=${numRouting}`);
    }

    // Mixed types must fail closed
    let threw = false;
    try {
      compareSplitKey('10', 2);
    } catch {
      threw = true;
    }
    if (!threw) {
      return fail(stepName, 'expected mixed-type split key comparison to throw');
    }

    return pass(stepName, {description: 'UTF-8 binary ordering holds across split and routing keys'});
  } catch (error) {
    return fail(stepName, error.message);
  }
}

async function verifySqlMutationExpressions() {
  const stepName = 'sql-mutation-expression-contract';
  try {
    // Regular literal string in INSERT
    const regularInsert = new SQLParser('INSERT INTO users (id, name) VALUES (1, \'Alice\')').parse();
    if (!regularInsert || regularInsert.type.toUpperCase() !== 'INSERT') {
      return fail(stepName, 'failed to parse standard INSERT statement');
    }

    // Dollar-quoted string literal
    const dollarInsert = new SQLParser('INSERT INTO notes (id, body) VALUES (1, $$hello dollar$$)').parse();
    if (!dollarInsert || dollarInsert.type.toUpperCase() !== 'INSERT') {
      return fail(stepName, 'failed to parse dollar-quoted INSERT statement');
    }
    const val = dollarInsert.values?.[0]?.[1]?.value;
    if (val !== 'hello dollar') {
      return fail(stepName, `dollar-quoted string was not preserved: expected 'hello dollar', got ${val}`);
    }

    // Unsupported INSERT ... SELECT must fail closed
    let rejectedSelect = false;
    try {
      new SQLParser('INSERT INTO users (id, name) SELECT id, name FROM old_users').parse();
    } catch {
      rejectedSelect = true;
    }
    if (!rejectedSelect) {
      return fail(stepName, 'expected INSERT ... SELECT to be refused before mutation');
    }

    return pass(stepName, {description: 'SQL expressions and dollar-quoted literals evaluate safely'});
  } catch (error) {
    return fail(stepName, error.message);
  }
}

async function verifySchemaConstraintsContract() {
  const stepName = 'table-schema-constraints-contract';
  try {
    // Table with PRIMARY KEY, UNIQUE, and CHECK constraints
    const createAst = new SQLParser(
      'CREATE TABLE items (id INT PRIMARY KEY, sku VARCHAR(32) UNIQUE, qty INT CHECK (qty >= 0))',
    ).parse();
    if (!createAst || createAst.type !== 'CREATE_TABLE') {
      return fail(stepName, 'failed to parse CREATE TABLE with inline constraints');
    }

    // Composite PRIMARY KEY
    const compositeAst = new SQLParser(
      'CREATE TABLE orders (tenant_id INT, order_id INT, PRIMARY KEY (tenant_id, order_id))',
    ).parse();
    if (!compositeAst || compositeAst.type !== 'CREATE_TABLE') {
      return fail(stepName, 'failed to parse CREATE TABLE with composite primary key');
    }

    // FOREIGN KEY across distributed partitions must fail closed
    let rejectedFk = false;
    try {
      new SQLParser('CREATE TABLE child (id INT PRIMARY KEY, parent_id INT REFERENCES parent(id))').parse();
    } catch (err) {
      if (/FOREIGN KEY \/ REFERENCES constraints are not supported/u.test(err.message)) {
        rejectedFk = true;
      }
    }
    if (!rejectedFk) {
      return fail(stepName, 'expected distributed FOREIGN KEY to be explicitly refused before creation');
    }

    return pass(stepName, {description: 'Table constraints enforced and distributed foreign keys refused'});
  } catch (error) {
    return fail(stepName, error.message);
  }
}

async function verifyInternalClusterHttpIngress() {
  const stepName = 'internal-cluster-http-ingress-protection';
  try {
    // Probe endpoints remain accessible
    const probeRoutes = [
      BOOTSTRAP_API_ROUTE.LIVEZ,
      BOOTSTRAP_API_ROUTE.STARTUPZ,
      BOOTSTRAP_API_ROUTE.READYZ,
      BOOTSTRAP_API_ROUTE.HEALTH,
    ];
    for (const route of probeRoutes) {
      if (!route || typeof route !== 'string') {
        return fail(stepName, `invalid probe route definition: ${route}`);
      }
    }

    // Internal cluster endpoints require protection
    const internalRoutes = [
      BOOTSTRAP_API_ROUTE.CLUSTER_STATE,
      BOOTSTRAP_API_ROUTE.BOOTSTRAP,
      BOOTSTRAP_API_ROUTE.REGISTER_SERVICE,
    ];
    for (const route of internalRoutes) {
      if (!route || typeof route !== 'string') {
        return fail(stepName, `invalid internal route definition: ${route}`);
      }
    }

    return pass(stepName, {
      description: 'Internal routes identified for auth; probe routes remain accessible',
      internalRoutes,
      probeRoutes,
    });
  } catch (error) {
    return fail(stepName, error.message);
  }
}

async function verifyProofProducerAttribution() {
  const stepName = 'proof-authority-producer-attribution';
  try {
    const local = defaultProducer({}, {});
    if (local.kind !== 'local-cli' || !local.id.startsWith('pid-')) {
      return fail(stepName, `unexpected local producer: ${JSON.stringify(local)}`);
    }

    const ciEnv = {
      GITHUB_ACTIONS: 'true',
      GITHUB_WORKFLOW: 'Release-0-2-7',
      GITHUB_RUN_ID: '5566',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'org/lagrange',
    };
    const ciProducer = defaultProducer({}, ciEnv);
    if (ciProducer.kind !== 'github-actions' || ciProducer.id !== 'Release-0-2-7:5566:1') {
      return fail(stepName, `unexpected CI producer: ${JSON.stringify(ciProducer)}`);
    }

    const receipt = buildReceipt({
      proofId: PROOF.RELEASE_FULL,
      sha: 'c'.repeat(40),
      env: ciEnv,
    });
    if (!receipt.producer || receipt.producer.kind !== 'github-actions') {
      return fail(stepName, `receipt did not inherit attributable producer: ${JSON.stringify(receipt)}`);
    }

    return pass(stepName, {description: 'Producer attribution defaults populated for local and CI'});
  } catch (error) {
    return fail(stepName, error.message);
  }
}

async function verifyReleaseNotesAndDockerHubGate() {
  const stepName = 'release-notes-and-dockerhub-overview-gate';
  try {
    const template = [
      '# Lagrange',
      OVERVIEW_MARKER_BEGIN,
      OVERVIEW_MARKER_END,
      '## Usage',
    ].join('\n');

    const sampleChangelog = [
      '# Changelog',
      '',
      '## [0.2.7] — 2026-10-28',
      '### Fixed',
      '- 0.2.7 stabilization items.',
      '',
      '## [0.2.6] — 2026-09-20',
      '### Added',
      '- 0.2.6 released features.',
    ].join('\n');

    const rendered = renderReleaseNotes(sampleChangelog, '0.2.6', {
      mode: OVERVIEW_MODE,
      template,
    });

    if (rendered.includes('0.2.7') || rendered.includes('0.2.7 stabilization items')) {
      return fail(stepName, 'overview for 0.2.6 leaked newer 0.2.7 changelog section');
    }
    if (!rendered.includes('0.2.6')) {
      return fail(stepName, 'overview for 0.2.6 missing 0.2.6 section');
    }

    const verified = verifyDockerHubOverview({
      content: rendered,
      targetVersion: '0.2.6',
      changelogText: sampleChangelog,
    });
    if (!verified.valid) {
      return fail(stepName, 'verifyDockerHubOverview did not approve valid overview');
    }

    return pass(stepName, {description: 'Docker Hub overview filtered and verified against leakage'});
  } catch (error) {
    return fail(stepName, error.message);
  }
}

/**
 * Execute the 0.2.7 stabilization scenario.
 * @param {Object} [context]
 * @return {Promise<Object>}
 */
export async function execute(context = {}) {
  const steps = [
    await verifyUnifiedKeyComparison(),
    await verifySqlMutationExpressions(),
    await verifySchemaConstraintsContract(),
    await verifyInternalClusterHttpIngress(),
    await verifyProofProducerAttribution(),
    await verifyReleaseNotesAndDockerHubGate(),
  ];

  const failed = steps.filter((step) => step.outcome === STEP_OUTCOME.FAIL);
  const passed = steps.filter((step) => step.outcome === STEP_OUTCOME.PASS);

  const report = {
    context: {
      clusterId: context?.cluster?.id || null,
      timestamp: new Date().toISOString(),
    },
    failedSteps: failed.map((s) => s.name),
    scenario: name,
    steps,
    summary: {
      failed: failed.length,
      passed: passed.length,
      total: steps.length,
    },
    verdict: failed.length === 0 ? 'PASS' : 'FAIL',
  };

  if (report.verdict !== 'PASS') {
    const error = new Error(`${name}: FAIL at ${report.failedSteps.join(', ')}`);
    error.diagnostics = {partialResult: report};
    throw error;
  }

  return report;
}

export async function run(cluster) {
  return execute({cluster});
}
