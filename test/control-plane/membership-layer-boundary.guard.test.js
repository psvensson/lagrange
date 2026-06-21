import fs from 'node:fs';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';

// Membership layer-ownership boundary guard (cutover plan §5 step 1).
//
// Canonical three-layer membership architecture
// (.kiro/specs/membership-lifecycle-placement-hard-cutover/
//  membership-layer-ownership-contract.md):
//   1. Failure detector (evidence)        — scattered readiness/liveness guards
//   2. Membership agreement (view install) — Raft + control_plane_publications + epoch
//   3. Dissemination (projection READ)     — observers READ the installed view
//
// `resolveActiveNodeViews()` / `resolveCanonicalActiveNodeIds()` in
// active-node-projection.js are the FD + view-computation entry points (layers 1+3
// combined). Non-owner code must NOT re-derive membership through them — it must READ
// the installed published view via the published-view read API
// (resolvePublishedActiveNodeIds / getLatestPublishedMembershipRow).
//
// A 21-file audit (2026-06-21, plan §8) found ZERO ad-hoc re-derivers and exactly the
// allowlist below. This guard pins that boundary so new code cannot regress it.

const SRC_ROOT = path.resolve(process.cwd(), 'src');

// The module that DEFINES (and may internally use) the projection entry points.
const PROJECTION_OWNER = 'src/control-plane/active-node-projection.js';

// Files permitted to call the full projection (they genuinely need the FD/readiness
// overlay: planning evidence, publication-candidate derivation, admin diagnostics).
const RESOLVE_ACTIVE_NODE_VIEWS_ALLOWED = new Set([
  PROJECTION_OWNER,
  'src/admin/admin-control-snapshot-node-view-projection.js',
  'src/control-plane/membership-publication-candidate-derivation.js',
  'src/control-plane/membership-publication-planning-evidence.js',
]);

// Files permitted to call the canonical-ids convenience wrapper.
const RESOLVE_CANONICAL_ACTIVE_NODE_IDS_ALLOWED = new Set([
  PROJECTION_OWNER,
  'src/bootstrap/owners/bootstrap-cluster-view-owner.js',
]);

// The underlying FD-derived projected-set helpers (one exported, one module-private).
// They compute the projected active set and BYPASS the published-view authority, so
// they are owner-only — no non-owner code may reach them either, or it could re-derive
// membership beneath the named entry points.
const PROJECTION_OWNER_ONLY = new Set([PROJECTION_OWNER]);

const GUARDED_SYMBOLS = [
  {name: 'resolveActiveNodeViews', allowed: RESOLVE_ACTIVE_NODE_VIEWS_ALLOWED},
  {
    name: 'resolveCanonicalActiveNodeIds',
    allowed: RESOLVE_CANONICAL_ACTIVE_NODE_IDS_ALLOWED,
  },
  {name: 'resolveProjectedActiveNodeIds', allowed: PROJECTION_OWNER_ONLY},
  {name: 'resolveProjectedActiveNodeSelection', allowed: PROJECTION_OWNER_ONLY},
];

// Entry points whose definition + export must persist, else the allowlist guard above
// could pass vacuously after a rename.
const VACUITY_GUARDED = [
  'resolveActiveNodeViews',
  'resolveCanonicalActiveNodeIds',
  'resolveProjectedActiveNodeIds',
];

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

// Blank out comments AND string/template contents with a string-aware character scan.
// A naive `//`-to-EOL strip would over-delete on lines like `const u = "http://x"; foo()`
// (a `//` inside a string would hide a real call after it — a silent false negative).
// This scanner removes comment bodies (so a comment-only mention is not counted) and
// string/template bodies (so a `//` inside a string cannot truncate code), while keeping
// real code. Residual blind spots (acceptable for these identifiers): a guarded call
// placed inside a template `${...}` interpolation or a regex literal — implausible for a
// membership-projection call.
function stripCommentsAndStrings(source) {
  let out = '';
  let state = 'code';
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const d = source[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') {
        state = 'line';
        i += 1;
      } else if (c === '/' && d === '*') {
        state = 'block';
        i += 1;
      } else if (c === '\'') {
        state = 'single';
      } else if (c === '"') {
        state = 'double';
      } else if (c === '`') {
        state = 'template';
      } else {
        out += c;
      }
      continue;
    }
    if (state === 'line') {
      if (c === '\n') {
        state = 'code';
        out += c;
      }
      continue;
    }
    if (state === 'block') {
      if (c === '*' && d === '/') {
        state = 'code';
        i += 1;
      }
      continue;
    }
    // string / template states: honor escapes, drop body
    if (c === '\\') {
      i += 1;
      continue;
    }
    if (
      (state === 'single' && c === '\'') ||
      (state === 'double' && c === '"') ||
      (state === 'template' && c === '`')
    ) {
      state = 'code';
    }
  }
  return out;
}

function relPosix(absPath) {
  return path.relative(process.cwd(), absPath).split(path.sep).join('/');
}

const SRC_FILES = listJsFiles(SRC_ROOT);

test('membership layer boundary - only owner sites may reach the projection entry points',
  async (t) => {
    const offenders = [];
    for (const symbol of GUARDED_SYMBOLS) {
      const pattern = new RegExp(`\\b${symbol.name}\\b`);
      for (const absPath of SRC_FILES) {
        const rel = relPosix(absPath);
        const code = stripCommentsAndStrings(fs.readFileSync(absPath, 'utf8'));
        if (pattern.test(code) && !symbol.allowed.has(rel)) {
          offenders.push(`${rel} -> ${symbol.name}`);
        }
      }
    }
    t.same(
      offenders,
      [],
      'non-owner code must READ the installed published view ' +
        '(resolvePublishedActiveNodeIds / getLatestPublishedMembershipRow), ' +
        'not re-derive membership via the projection entry points',
    );
  });

test('membership layer boundary - guard is not vacuous (owner still defines + exports the entry points)',
  async (t) => {
    const ownerSource = fs.readFileSync(
      path.resolve(process.cwd(), PROJECTION_OWNER),
      'utf8',
    );
    const exportBlock = ownerSource.slice(ownerSource.lastIndexOf('export {'));
    for (const name of VACUITY_GUARDED) {
      t.match(
        ownerSource,
        new RegExp(`function ${name}\\b`),
        `${PROJECTION_OWNER} must still define ${name} ` +
          '(rename would make the allowlist guard pass vacuously — update both)',
      );
      t.match(
        exportBlock,
        new RegExp(`\\b${name}\\b`),
        `${PROJECTION_OWNER} must still export ${name} ` +
          '(a renamed export with a kept internal helper would bypass the boundary)',
      );
    }
  });
