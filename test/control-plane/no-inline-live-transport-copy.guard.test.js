/**
 * Static guard (spec node-liveness-veto-consolidation, Task 6.1 / R2.6,
 * design §5): FAIL if an eligibility source module gates node usability by a
 * LIVE transport/connection-state comparison (`getConnectionState(...) ===
 * CONNECTED`, incl. transport-ONLY inline checks) OR by reading the CDC-lagged
 * `connection_state` cache column, WITHOUT routing that decision through the
 * shared `hasLiveTransportEvidence` atom.
 *
 * Why the cache-column clause is KEPT: a new standalone cached-column transport
 * veto is the exact MODE-A mistake (`a79b3728`) — `isClusterMemberHealthy` once
 * trusted the CDC-lagged `connection_state` column, saw live peers as stale, and
 * stranded a table at 1/3. So the guard flags cached-column usability gates too,
 * and only exempts an intentionally-preserved cached-AGREEMENT conjunct where it
 * co-exists with an atom-routed LIVE term (a standalone cached veto stays
 * forbidden).
 *
 * Discrimination mechanism (maintainable):
 *   1. Each candidate gate line is flagged by a transport/connection regex.
 *   2. A line is EXEMPT iff it is routed through the atom (contains
 *      `hasLiveTransportEvidence`) OR it matches an explicit, per-file allowlist
 *      pattern anchored to a distinctive code substring (not a raw line number,
 *      so a NEW inline copy with different text is NOT covered).
 *   3. An allowlist entry is honoured ONLY if that file ALSO contains at least
 *      one `hasLiveTransportEvidence(` call — this is the "cached conjunct allowed
 *      only where it co-exists with an atom-routed live term" rule. Strip the
 *      atom call and the preserved cached gate becomes a standalone veto =
 *      violation.
 *
 * Anything flagged and not exempt is a violation → the guard fails. A new bare
 * inline `getConnectionState(...) === CONNECTED` (or a new cached-column veto)
 * added to any scanned module trips it (see the negative-control self-tests
 * below, which prove the detector can actually fail).
 */

import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from '../../src/test-helpers/tap.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Scan set — the EXACT eligibility source modules that (a) make a node-usability
 * decision (placement / serve / membership retention) and (b) apply a LIVE
 * transport veto over a stale secondary signal. These are the three declared
 * `Eligibility_Consumer`s of the atom (requirements Glossary):
 *
 *   - readiness `isClusterMemberHealthy` (gates provisioning / up-replication),
 *   - the lease-sweep transport guard (gates lease-expiry disconnect),
 *   - the rebalancer `available-nodes` placement gate.
 *
 * Deliberately OUT of the scan set (and why):
 *   - the membership projection (`active-node-projection.js`) — consensus-
 *     installed / injected transport source, NO live `messageRouter` in scope;
 *     rerouting it would change the single-owner installed view (R2.4, excluded);
 *   - the operational probes (remove-safety ping, recovery-unblock ping,
 *     split-brain routing) — they need live-now reachability and must NOT route
 *     through the atom (R3.1); routed by the sibling non-regression guard
 *     `operational-probes-not-routed.guard.test.js`, so requiring them to route
 *     through the atom here would contradict R3.1;
 *   - node-local self-readiness gates (`node/node-readiness-policy.js`) — a node
 *     grading its OWN readiness, not a peer-eligibility transport veto over a
 *     stale secondary signal, and not a declared consumer of the atom.
 */
const SCAN_SET = [
  'src/control-plane/control-plane-readiness-node-service-rows.js',
  'src/control-plane/lease-service.js',
  'src/rebalancer/unified-rebalancer-available-nodes.js',
];

/**
 * Candidate detectors — a line matching any of these gates node usability by a
 * transport/connection state (comment text is stripped before matching).
 */
const STATE_TERM =
  '(?:STATE\\.(?:CONNECTED|READY)|CONNECTION_STATE\\.CONNECTED|' +
  '[\'"](?:connected|ready)[\'"])';
const CANDIDATE = [
  // Bare inline live compare: getConnectionState(...) === CONNECTED / !== …
  {
    name: 'inline-live-transport-compare',
    re: new RegExp(
      'getConnectionState\\s*\\([^)]*\\)\\s*(?:===|!==)\\s*' + STATE_TERM,
    ),
  },
  // A router-state variable compared to CONNECTED/READY.
  {
    name: 'router-state-var-compare',
    re: new RegExp(
      '[A-Za-z_$]*[Rr]outerState\\b\\s*(?:===|!==)\\s*' + STATE_TERM,
    ),
  },
  // A connectionState variable compared to CONNECTED/READY.
  {
    name: 'connection-state-var-compare',
    re: new RegExp('\\bconnectionState\\b\\s*(?:===|!==)\\s*' + STATE_TERM),
  },
  // A rowState (cached connection_state) variable compared to CONNECTED/READY.
  {
    name: 'row-state-var-compare',
    re: new RegExp('[A-Za-z_$]*[Rr]owState\\b\\s*(?:===|!==)\\s*' + STATE_TERM),
  },
  // Direct cached connection_state column read used to gate usability.
  {name: 'cached-connection-state-prop', re: /\.connection_state\b/},
  {name: 'cached-connection-state-column', re: /COLUMN\.CONNECTION_STATE/},
];

/**
 * Exhaustive per-file allowlist (design §5). Each entry pins a distinctive code
 * substring (NOT a line number) plus its rationale. Honoured ONLY when the file
 * also contains an atom call (co-exists-with-atom rule enforced in
 * `findInlineTransportGateViolations`).
 */
const ALLOWLIST = {
  'src/control-plane/control-plane-readiness-node-service-rows.js': [
    {
      pattern: /nodeRow\?\.\[COLUMN\.CONNECTION_STATE\]/,
      rationale:
        'Cached connection_state read feeding the getNodeTransportState() ' +
        'outer-admission composite and the connection_state===READY outer ' +
        'gate (~:507-513). These are permissive OUTER gates; the ' +
        'eligibility-deciding LIVE veto is the atom call at the ' +
        'isClusterMemberHealthy return (~:529-532), which backstops them (the ' +
        'stale-heartbeat grace branch is decided by the LIVE atom, not this ' +
        'cached read).',
    },
    {
      pattern: /normalizedRouterState\s*(?:===|!==)\s*STATE\.(?:CONNECTED|READY)/,
      rationale:
        'Live-router branch of the getNodeTransportState() composite used only ' +
        'by the outer admission gate (~:506); co-exists with and is backstopped ' +
        'by the atom-routed live veto (~:529-532).',
    },
    {
      pattern: /normalizedRowState\s*(?:===|!==)\s*STATE\.(?:CONNECTED|READY)/,
      rationale:
        'Cached rowState fallback inside the same getNodeTransportState() ' +
        'outer composite; permissive outer gate backstopped by the atom veto ' +
        '(~:529-532).',
    },
    {
      pattern: /connectionState\s*(?:===|!==)\s*STATE\.READY/,
      rationale:
        'The connection_state===READY outer readiness gate (~:510-513); ' +
        'co-exists with the atom-routed live veto (~:529-532).',
    },
  ],
  'src/rebalancer/unified-rebalancer-available-nodes.js': [
    {
      pattern: /node\.connection_state\b/,
      rationale:
        'Cached-agreement conjunct read (~:296-305): a DISTINCT cached gate ' +
        '(connection_state in {connected,ready}) that co-exists with the ' +
        'atom-routed LIVE term at ~:306-312. Preserved unchanged per R2.3.',
    },
    {
      pattern: /connectionState\s*!==\s*STATE\.(?:CONNECTED|READY)/,
      rationale:
        'The cached-agreement conjunct comparison (~:296-305); a distinct ' +
        'cached gate co-existing with the atom-routed LIVE term at ~:306-312 ' +
        '(R2.3).',
    },
  ],
  // Lease-sweep: fully atom-routed (isNodeTransportConnected -> atom). No
  // preserved cached/inline gate, so no allowlist entries — any candidate here
  // is a violation.
  'src/control-plane/lease-service.js': [],
};

const ATOM_CALL_RE = /hasLiveTransportEvidence\s*\(/;

/**
 * Strip a line comment (everything from `//`) and skip pure comment/JSDoc lines,
 * so prose mentioning "routerState CONNECTED" is not matched.
 * @param {string} line Raw source line.
 * @return {string} Code portion of the line (empty for comment-only lines).
 */
function codeOf(line) {
  const trimmed = line.trim();
  if (
    trimmed.startsWith('*') ||
    trimmed.startsWith('/**') ||
    trimmed.startsWith('*/') ||
    trimmed.startsWith('//')
  ) {
    return '';
  }
  const idx = line.indexOf('//');
  return idx === -1 ? line : line.slice(0, idx);
}

/**
 * Pure detector — returns the list of unrouted inline transport-gate violations
 * for one file. Exported shape used by both the real-file guard and the
 * negative-control self-tests.
 * @param {string} relPath Repo-relative module path (selects the allowlist).
 * @param {string} source Full module source text.
 * @return {Array<{line: number, text: string, detector: string}>} Violations.
 */
function findInlineTransportGateViolations(relPath, source) {
  const allowEntries = ALLOWLIST[relPath] || [];
  const fileRoutesThroughAtom = ATOM_CALL_RE.test(source);
  const lines = source.split('\n');
  const violations = [];

  // Tainted-variable pass: any identifier assigned directly from a
  // getConnectionState(...) call, then compared to CONNECTED/READY (covers
  // arbitrary variable names, not just the known routerState/connectionState).
  const taintedVars = new Set();
  const declRe =
    /(?:const|let|var\s+)?\b([A-Za-z_$][\w$]*)\s*=\s*[^;]*getConnectionState\s*\(/;
  for (const raw of lines) {
    const code = codeOf(raw);
    const m = declRe.exec(code);
    if (m) {
      taintedVars.add(m[1]);
    }
  }

  lines.forEach((raw, i) => {
    const code = codeOf(raw);
    if (!code.trim()) {
      return;
    }
    // Routed through the atom on this very line → exempt.
    if (ATOM_CALL_RE.test(code)) {
      return;
    }

    let detector = null;
    for (const c of CANDIDATE) {
      if (c.re.test(code)) {
        detector = c.name;
        break;
      }
    }
    if (!detector) {
      for (const name of taintedVars) {
        const re = new RegExp(
          '\\b' + name + '\\b\\s*(?:===|!==)\\s*' + STATE_TERM,
        );
        if (re.test(code)) {
          detector = 'tainted-getConnectionState-var-compare';
          break;
        }
      }
    }
    if (!detector) {
      return;
    }

    // Exempt only if the file co-exists with an atom-routed live term AND this
    // line matches an explicit allowlist pattern.
    const allowed =
      fileRoutesThroughAtom &&
      allowEntries.some((e) => e.pattern.test(code));
    if (!allowed) {
      violations.push({line: i + 1, text: code.trim(), detector});
    }
  });

  return violations;
}

test('static guard: every eligibility module routes its live-transport gate ' +
  'through hasLiveTransportEvidence (R2.6)', async (t) => {
  for (const relPath of SCAN_SET) {
    const source = readFileSync(join(REPO_ROOT, relPath), 'utf8');
    const violations = findInlineTransportGateViolations(relPath, source);
    t.same(
      violations,
      [],
      relPath + ': no unrouted inline live-transport / cached-column ' +
        'usability gate (found: ' + JSON.stringify(violations) + ')',
    );
    // Every in-scope eligibility module must actually route through the atom.
    t.ok(
      ATOM_CALL_RE.test(source),
      relPath + ': routes an eligibility decision through the atom',
    );
  }
});

test('static guard: allowlist stays exhaustive & anchored (each entry ' +
  'carries a rationale)', async (t) => {
  for (const relPath of Object.keys(ALLOWLIST)) {
    for (const entry of ALLOWLIST[relPath]) {
      t.ok(entry.pattern instanceof RegExp, relPath + ' allowlist has a pattern');
      t.ok(
        typeof entry.rationale === 'string' && entry.rationale.length > 20,
        relPath + ' allowlist entry documents a rationale',
      );
    }
  }
});

// ---- Negative-control self-tests: prove the detector can actually FAIL. ----

test('NEGATIVE CONTROL: a bare inline getConnectionState(...) === CONNECTED ' +
  'added to an eligibility module trips the guard', async (t) => {
  const relPath = 'src/control-plane/control-plane-readiness-node-service-rows.js';
  const real = readFileSync(join(REPO_ROOT, relPath), 'utf8');
  // Simulate the exact regression the guard exists to catch — an inline copy
  // NOT routed through the atom, using the real file's real allowlist.
  const tampered =
    real +
    '\nfunction __bareInlineCopy(nodeId) {\n' +
    '  return this.messageRouter.getConnectionState(nodeId) === STATE.CONNECTED;\n' +
    '}\n';
  const violations = findInlineTransportGateViolations(relPath, tampered);
  t.ok(
    violations.some((v) => /getConnectionState\(nodeId\) === STATE\.CONNECTED/
      .test(v.text)),
    'bare inline live-transport compare is flagged as a violation',
  );
});

test('NEGATIVE CONTROL: a transport-ONLY inline check (!== CONNECTED) with an ' +
  'arbitrary variable name trips the guard', async (t) => {
  const synthetic =
    'import {hasLiveTransportEvidence} from "./live-transport-evidence.js";\n' +
    'function gate(nodeId, router) {\n' +
    '  const s = router.getConnectionState(nodeId);\n' +
    '  if (s !== STATE.CONNECTED) { return false; }\n' +
    '  return hasLiveTransportEvidence(nodeId, {messageRouter: router});\n' +
    '}\n';
  // Use a path with no allowlist for the tainted-var line.
  const violations = findInlineTransportGateViolations(
    'src/control-plane/__synthetic-transport-only.js',
    synthetic,
  );
  t.ok(
    violations.some((v) => v.detector ===
      'tainted-getConnectionState-var-compare'),
    'transport-only inline check via arbitrary var is flagged',
  );
});

test('NEGATIVE CONTROL: a standalone cached-column veto (no atom in file) is ' +
  'forbidden even if a cached-conjunct pattern would match', async (t) => {
  const synthetic =
    'function gate(node) {\n' +
    '  if (node.connection_state !== STATE.CONNECTED) { return false; }\n' +
    '  return true;\n' +
    '}\n';
  // Reuse the rebalancer allowlist patterns but WITHOUT an atom call in the
  // file → the co-exists-with-atom rule must reject the cached veto.
  const violations = findInlineTransportGateViolations(
    'src/rebalancer/unified-rebalancer-available-nodes.js',
    synthetic,
  );
  t.ok(
    violations.length > 0,
    'a cached-column veto with no co-existing atom call is a violation',
  );
});

test('DISCRIMINATION: the same cached conjunct IS allowed once an atom-routed ' +
  'live term co-exists in the file', async (t) => {
  const synthetic =
    'import {hasLiveTransportEvidence} from "./live-transport-evidence.js";\n' +
    'function gate(node, nodeId, router) {\n' +
    '  const connectionState = String(node.connection_state || "");\n' +
    '  if (connectionState !== STATE.CONNECTED) { return false; }\n' +
    '  return hasLiveTransportEvidence(nodeId, {messageRouter: router});\n' +
    '}\n';
  const violations = findInlineTransportGateViolations(
    'src/rebalancer/unified-rebalancer-available-nodes.js',
    synthetic,
  );
  t.same(
    violations,
    [],
    'cached conjunct co-existing with the atom-routed live term is allowed',
  );
});
