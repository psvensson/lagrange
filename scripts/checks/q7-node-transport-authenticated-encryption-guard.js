#!/usr/bin/env node
/**
 * Quest probe guard for Q7 (`node-transport-authenticated-encryption`).
 *
 * Verifies that all required Q7 modules, exports, error codes, and tests exist
 * and satisfy the node transport security specification (`A3 + B1 + 5C + D2`
 * and full Postgres `SCRAM-SHA-256`, `SCRAM-SHA-256-PLUS`, `cert` support).
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const stringIncludes = Function.call.bind(String.prototype.includes);

const UTF8 = 'utf8';
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');
const METRIC_ARG = '--metric';
const LINE_BREAK = '\n';
const ZERO_EXIT = 0;
const FAIL_EXIT = 1;
const VALID_MSG = 'q7-node-transport-authenticated-encryption-guard: valid\n';

const REQUIRED_FILES = Object.freeze([
  'src/transport/x509-ed25519-certificate-authority.js',
  'src/transport/cluster-trust-provider.js',
  'src/transport/cluster-join-token.js',
  'src/runtime/pgwire-scram-authenticator.js',
  'src/cli/cert-command-router.js',
  'test/transport/q7-node-transport-authenticated-encryption.test.js',
]);

const REQUIRED_SNIPPETS = Object.freeze([
  Object.freeze({
    file: 'src/transport/x509-ed25519-certificate-authority.js',
    markers: Object.freeze([
      'generateClusterRootCa',
      'issueNodeCertificate',
      'verifyNodeCertificate',
      'buildLagrangeSanUri',
      'lagrange://',
    ]),
  }),
  Object.freeze({
    file: 'src/transport/cluster-trust-provider.js',
    markers: Object.freeze([
      'ClusterTrustProvider',
      'CLUSTER_TRUST_MODE',
      'TRANSPORT_AUTH_ERROR_CODE',
      'TLSv1.3',
      'rotateNodeCertificate',
      'signIdentifyFrame',
      'verifyIdentifyFrame',
    ]),
  }),
  Object.freeze({
    file: 'src/transport/cluster-join-token.js',
    markers: Object.freeze([
      'lgr_join_v1_',
      'ClusterJoinTokenStore',
      'createEnrollmentCsrProof',
      'enrollNodeWithJoinToken',
      'timingSafeEqual',
    ]),
  }),
  Object.freeze({
    file: 'src/runtime/pgwire-scram-authenticator.js',
    markers: Object.freeze([
      'SCRAM-SHA-256',
      'SCRAM-SHA-256-PLUS',
      'tls-server-end-point',
      'ScramSha256ServerSession',
      'createScramCredentialRecord',
      'createScramAndCertAuthenticator',
    ]),
  }),
  Object.freeze({
    file: 'src/cli/cert-command-router.js',
    markers: Object.freeze([
      'init-ca',
      'issue-node',
      'rotate',
      'status',
      'runCertOrClusterCommand',
    ]),
  }),
  Object.freeze({
    file: 'src/transport/message-router.js',
    markers: Object.freeze(['trustProvider']),
  }),
]);

function checkQ7NodeTransportAuthenticatedEncryption(rootDir = REPO_ROOT) {
  const violations = [];

  for (const relPath of REQUIRED_FILES) {
    const absPath = path.join(rootDir, relPath);
    if (!fs.existsSync(absPath)) {
      violations.push(`missing required file: ${relPath}`);
    }
  }

  for (const entry of REQUIRED_SNIPPETS) {
    const absPath = path.join(rootDir, entry.file);
    if (!fs.existsSync(absPath)) {
      for (const marker of entry.markers) {
        violations.push(`missing marker '${marker}' in ${entry.file}`);
      }
      continue;
    }
    const content = fs.readFileSync(absPath, UTF8);
    for (const marker of entry.markers) {
      if (!stringIncludes(content, marker)) {
        violations.push(`missing marker '${marker}' in ${entry.file}`);
      }
    }
  }

  return {
    valid: violations.length === ZERO_EXIT,
    metric: violations.length,
    violations,
  };
}

const result = checkQ7NodeTransportAuthenticatedEncryption();
if (arrayIncludes(process.argv, METRIC_ARG)) {
  process.stdout.write(`${result.metric}${LINE_BREAK}`);
  process.exit(ZERO_EXIT);
}
if (!result.valid) {
  process.stderr.write(
    `${arrayJoin(result.violations, LINE_BREAK)}${LINE_BREAK}`,
  );
  process.exit(FAIL_EXIT);
}
process.stdout.write(VALID_MSG);

export {checkQ7NodeTransportAuthenticatedEncryption};
