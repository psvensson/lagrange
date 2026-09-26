// Raw evidence of the distributed-transaction replicated-apply investigation
// (quest distributed-transaction-replicated-apply, finding
// F-TX-REPLICATED-APPLY): one JSON record per run plus the node logs, written
// where they outlive the run.
//
// A placed lab run executes in a throwaway worktree that is removed when the
// run ends, and the cluster's own temporary directory is removed on teardown.
// The evidence therefore goes under the test-output/ of the checkout that
// OWNS the git repository (its common git directory's parent): the main
// checkout on a lab host, the repository root anywhere else. It is rewritten
// after every phase, so a run killed mid-way still leaves what it measured.

import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {basename, dirname, join} from 'node:path';

const EVIDENCE_PATH = Object.freeze({
  TEST_OUTPUT: 'test-output',
  DIRECTORY: 'transaction-replicated-apply',
  JSON_SUFFIX: '.json',
});
const GIT_COMMON_DIR_ARGS = Object.freeze(
  ['rev-parse', '--path-format=absolute', '--git-common-dir']);
const GIT = 'git';
const TEXT = 'utf8';
const JSON_INDENT = 2;
const TIMESTAMP_UNSAFE = /[:.]/g;
const TIMESTAMP_SAFE = '-';

function repositoryOwnerRoot() {
  try {
    const commonDir = execFileSync(GIT, GIT_COMMON_DIR_ARGS,
      {encoding: TEXT}).trim();
    return dirname(commonDir);
  } catch {
    return process.cwd();
  }
}

/**
 * Create one run's evidence sink.
 * @param {string} name - run name, e.g. `settling`
 * @return {{directory: string, jsonPath: string,
 *   write: (record: object, nodes?: object[]) => void}}
 */
function createEvidenceSink(name) {
  const stamp = new Date().toISOString().replace(TIMESTAMP_UNSAFE,
    TIMESTAMP_SAFE);
  const directory = join(repositoryOwnerRoot(), EVIDENCE_PATH.TEST_OUTPUT,
    EVIDENCE_PATH.DIRECTORY, `${name}-${stamp}`);
  const jsonPath = join(directory, `${name}${EVIDENCE_PATH.JSON_SUFFIX}`);
  mkdirSync(directory, {recursive: true});
  return {
    directory,
    jsonPath,
    write(record, nodes = []) {
      writeFileSync(jsonPath, JSON.stringify(record, null, JSON_INDENT));
      for (const node of nodes) {
        if (!node.logPath || !existsSync(node.logPath)) continue;
        copyFileSync(node.logPath, join(directory,
          `${node.role}-${node.nodeId}-${basename(node.logPath)}`));
      }
    },
  };
}

export {createEvidenceSink};
