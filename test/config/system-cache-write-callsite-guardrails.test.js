import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcRoot = path.join(__dirname, '..', '..', 'src');

const SANCTIONED_APPLY_CALL_COUNTS = Object.freeze({
  'bootstrap/bootstrap-cache-hydration-applier.js': 1,
  'bootstrap/node-joining-cdc-subscription-and-backfill.js': 1,
  'bootstrap/phases/create-message-group-phase.js': 1,
  'bootstrap/phases/query-system-state-phase.js': 2,
  'cdc/cdc-integration-service-cache-visibility-wait.js': 1,
  'control-plane/control-plane-system-table-gateway-cache-reconciliation.js': 2,
  'message-group/cdc-handler.js': 1,
  // Documented local-only-truth seed writes (CL-016 priority local-commit
  // fallback; CL-035 seed raft_role at voter-ready). Both are superseded by
  // the durable write's CDC round-trip (newer updated_at wins in the cache
  // merge) — same sanctioned-exception class as the bootstrap hydration sites.
  'node/replica-handler-create-status-methods.js': 2,
  // CL-036 canonical-leader sibling: the actual local Raft leader transition
  // seeds its existing PARTITIONS row, while the same publication owner queues
  // and authoritatively confirms the durable leader_node_id write.
  'partition/partition-service-metadata-delivery-methods.js': 1,
  // replica_operations-row analog of CL-016/CL-035: seed the owner's locally-
  // decided operation workflow_step into the local cache when the durable
  // priority control-plane write defers under formation pressure (the write
  // routes through the partition being spread). Owner-local + priority-scoped,
  // superseded by the durable write's CDC round-trip — same exception class.
  'rebalancer/replica-operation-repository-row-methods.js': 1,
});

/**
 * Recursively collect source files under src/.
 * @param {string} dir
 * @return {string[]}
 */
function getSourceFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, {withFileTypes: true});

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getSourceFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Find direct applySystemTableChange invocations.
 * Matches member-call usage (".applySystemTableChange(") and the extracted
 * form ("applySystemTableChange.call(", introduced by the read-only-cache
 * tolerant seed in 73ae705b), not method declarations or typeof guards.
 * @return {Array<{file: string, line: number}>}
 */
function findApplyCallSites() {
  const matches = [];
  const sourceFiles = getSourceFiles(srcRoot);
  const pattern =
    /\.applySystemTableChange\s*\(|\bapplySystemTableChange\.call\s*\(/g;

  for (const filePath of sourceFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(srcRoot, filePath).split(path.sep).join('/');

    let match;
    while ((match = pattern.exec(source)) !== null) {
      const line = source.slice(0, match.index).split('\n').length;
      matches.push({file: relativePath, line});
      if (pattern.lastIndex === match.index) {
        pattern.lastIndex++;
      }
    }
  }

  return matches;
}

describe('system cache write callsite guardrails', () => {
  it('limits direct applySystemTableChange call sites to sanctioned owners', () => {
    const matches = findApplyCallSites();
    const allowedFiles = new Set(Object.keys(SANCTIONED_APPLY_CALL_COUNTS));
    const counts = new Map();
    const violations = [];

    for (const match of matches) {
      counts.set(match.file, (counts.get(match.file) || 0) + 1);
      if (!allowedFiles.has(match.file)) {
        violations.push(match);
      }
    }

    assert.equal(
      violations.length,
      0,
      `Unsanctioned applySystemTableChange call sites: ${JSON.stringify(violations)}`,
    );

    for (const [file, expectedCount] of Object.entries(SANCTIONED_APPLY_CALL_COUNTS)) {
      assert.equal(
        counts.get(file) || 0,
        expectedCount,
        `Expected ${expectedCount} direct applySystemTableChange calls in ${file}`,
      );
    }

    assert.equal(
      counts.size,
      Object.keys(SANCTIONED_APPLY_CALL_COUNTS).length,
      'Unexpected applySystemTableChange files: ' +
        `${JSON.stringify(Array.from(counts.keys()))}`,
    );
  });

  it('documents node-joining bootstrap exceptions near sanctioned writes', () => {
    const createMsgGroupPhasePath = path.join(
      srcRoot,
      'bootstrap',
      'phases',
      'create-message-group-phase.js',
    );
    const phaseSource = fs.readFileSync(
      createMsgGroupPhasePath,
      'utf8',
    );

    assert.match(
      phaseSource,
      /Bootstrap timing exception:/,
      'registerMessageGroupService callsite should document bootstrap timing exception',
    );

    const queryStatePhasePath = path.join(
      srcRoot,
      'bootstrap',
      'phases',
      'query-system-state-phase.js',
    );
    const querySource = fs.readFileSync(
      queryStatePhasePath,
      'utf8',
    );

    assert.match(
      querySource,
      /Bootstrap hydration exception:/,
      'hydrateSystemCacheFromSnapshots callsite should document bootstrap hydration exception',
    );
  });
});
