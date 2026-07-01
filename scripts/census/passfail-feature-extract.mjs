#!/usr/bin/env node
// passfail-feature-extract.mjs
// Reproducible PASS/FAIL census + feature extraction over the stat-gate rolling-restart
// report corpus. Emits ONE record per report. Read-only: never runs a scenario/gate.
//
// Corpus: test-output/reports/stat-gate-*-run*.report.json (JSON batch reports, each with
// scenarios.length === 1). Sizes span ~0.5MB..~158MB, so we NEVER JSON.parse the whole file.
// Instead we slice a bounded prefix of the file (the fields we need — scenario, passed,
// verdict, error, dominantReason, verdictReason — all live in scenarios[0]'s early keys) and
// pull them with anchored regexes. Files whose needed fields fall outside the read window are
// recorded verdict:'unparseable' rather than crashing.
//
// FIELD PROVENANCE (which json path actually names each feature):
//   F1 rejoinerNodeId       -> scenarios[0].error   (see extractRejoiner, line ~96)
//                              ("... within 120000ms for node <uuid>" / "nodeId=<uuid>" /
//                               dominantReason "<reason>=<uuid>"). No dedicated node-id field
//                              exists in the report; the restarted/rejoiner node is only named
//                              inside the free-text error string + the failure-bundle summary.
//   F2 leadershipColocationCount -> NOT OBSERVABLE as a structured field. No key
//                              (leadershipCount / ownedLeaderships / partitionLeaders /
//                              partitionOwnership / routingDiagnosticsByNodeId population)
//                              exists in report OR failure-bundle OR triage-summary.json.
//                              The parent's "~30/34 leaderships" is per-node .log line
//                              forensics, out of scope for a report-field extractor. We record
//                              null and mark f2_observable=false. Closest proxy noted below.
//   F3 drainDeadlineElapsed -> scenarios[0].error / scenarios[0].verdict
//                              ("120000ms" | "operation_drain_stalled" | "operation_drain" |
//                               dominantReason "operation_drain_stalled"). (see extractDrain,
//                              line ~118)
//
// VERDICT: PASS if scenarios[0].passed===true. FAIL if passed===false AND the run actually
// measured. INVALID (excluded from scoring) when the run never measured: verdict
// BLOCK_EVIDENCE_INCOMPLETE, or dominantReason in the admission/slot/container-start family
// (nodeAdmissionBlocked / nodeSlotUnavailable / attemptErrors / container-failed-to-start).

import { readdirSync, statSync, openSync, readSync, closeSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.argv[2] || process.cwd());
const CORPUS_DIR = join(REPO_ROOT, 'test-output', 'reports');
const OUT_PATH = join(CORPUS_DIR, 'passfail-census-features.json');
const READ_WINDOW = 512 * 1024; // 512KB prefix: covers scenarios[0] scalar fields even in 158MB files
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

// Read a bounded UTF-8 prefix of a (possibly huge) file without loading it all. (line ~64)
function readPrefix(path, bytes) {
  const fd = openSync(path, 'r');
  try {
    const size = statSync(path).size;
    const n = Math.min(bytes, size);
    const buf = Buffer.allocUnsafe(n);
    let read = 0;
    while (read < n) {
      const got = readSync(fd, buf, read, n - read, read);
      if (got <= 0) break;
      read += got;
    }
    return buf.toString('utf8', 0, read);
  } finally {
    closeSync(fd);
  }
}

// Pull a JSON scalar string/bool/number value for a top-of-object key from raw text. (line ~82)
function grabString(text, key) {
  const m = text.match(new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
  return m ? m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : null;
}
function grabBool(text, key) {
  const m = text.match(new RegExp('"' + key + '"\\s*:\\s*(true|false)'));
  return m ? m[1] === 'true' : null;
}

// F1: rejoiner / restarted node identity, hunted from scenarios[0].error (line ~96).
function extractRejoiner(error, dominantReason) {
  const hay = error || '';
  // "... within 120000ms for node <uuid>" / "for node <uuid>"
  let m = hay.match(new RegExp('for node (' + UUID + ')'));
  if (m) return m[1];
  // "nodeId=<uuid>"
  m = hay.match(new RegExp('nodeId=(' + UUID + ')'));
  if (m) return m[1];
  // "... for <uuid>" (readiness probe timed out for <uuid>)
  m = hay.match(new RegExp('for (' + UUID + ')'));
  if (m) return m[1];
  // dominantReason "publication_missing_active_node=<uuid>" / "...=<uuid>"
  m = (dominantReason || '').match(new RegExp('=(' + UUID + ')'));
  if (m) return m[1];
  // a bare quoted "<uuid>" (seed) failed to start
  m = hay.match(new RegExp('"(' + UUID + ')"'));
  if (m) return m[1];
  // first uuid anywhere in the error string as last resort
  m = hay.match(new RegExp('(' + UUID + ')'));
  return m ? m[1] : null;
}

// F3: did REPLACE surplus-drain / source-removal fail to complete within ~120s? (line ~118)
function extractDrainDeadline(error, verdict, dominantReason) {
  const hay = [error, verdict, dominantReason].filter(Boolean).join(' ');
  if (/operation_drain_stalled|operation_drain\b/.test(hay)) return true;
  // the 120000ms recovery/ACTIVE deadline is the drain window in this scenario family
  if (/\b120000ms\b/.test(hay)) return true;
  if (/did not become recovery-ready within 120000/.test(error || '')) return true;
  if (/Not all nodes reached ACTIVE state within 120000/.test(error || '')) return true;
  return false;
}

// Classify a run that did NOT pass into FAIL vs INVALID (never measured). (line ~131)
const INVALID_REASONS = /nodeAdmissionBlocked|nodeSlotUnavailable|attemptErrors|failed to start|BLOCK_EVIDENCE_INCOMPLETE/i;
function isInvalidNonPass(verdict, dominantReason, error) {
  if (verdict === 'BLOCK_EVIDENCE_INCOMPLETE') return true;
  if (INVALID_REASONS.test(dominantReason || '')) return true;
  if (/failed to start|Container .* failed to start/.test(error || '')) return true;
  return false;
}

function extractOne(path) {
  const size = statSync(path).size;
  let text;
  try {
    text = readPrefix(path, READ_WINDOW);
  } catch (e) {
    return unparseable(path, 'read_error:' + e.message);
  }
  // Locate the scenarios[0] object; scalar fields we need are near the top of it.
  const passed = grabBool(text, 'passed');
  const verdict = grabString(text, 'verdict');
  if (passed === null && verdict === null) {
    // needed fields not inside the read window (or genuinely huge/opaque head)
    return unparseable(path, size > 50 * 1024 * 1024 ? 'oversize_fields_out_of_window' : 'fields_not_found');
  }
  const dominantReason = grabString(text, 'dominantReason');

  let outVerdict;
  if (passed === true) outVerdict = 'PASS';
  else if (isInvalidNonPass(verdict, dominantReason, grabString(text, 'error'))) outVerdict = 'INVALID';
  else outVerdict = 'FAIL';

  // F1/F3 are only meaningful for non-PASS runs: a PASS report's scenarios[0].error is null,
  // so the diagnostic scenario-level error string only exists when passed===false. Reading a
  // uuid from a PASS report would false-positive off unrelated ids (published node lists) that
  // also appear in the read window. (line ~152)
  const error = outVerdict === 'PASS' ? null : grabString(text, 'error');
  const f1 = extractRejoiner(error, dominantReason);
  const f3 = extractDrainDeadline(error, verdict, dominantReason);

  return {
    file: path.replace(REPO_ROOT + '/', ''),
    verdict: outVerdict,
    F1_rejoinerNodeId: f1,
    F2_leadershipColocationCount: null, // not observable in reports (see header F2)
    F3_drainDeadlineElapsed: f3,
    f1_observable: f1 !== null,
    f2_observable: false,               // no structured leadership-count field exists
    f3_observable: outVerdict !== 'PASS' ? true : false, // PASS reports carry no drain signal to observe
    _rawVerdict: verdict,
    _dominantReason: dominantReason,
    _bytes: size,
  };
}

function unparseable(path, why) {
  return {
    file: path.replace(REPO_ROOT + '/', ''),
    verdict: 'unparseable',
    F1_rejoinerNodeId: 'unparseable',
    F2_leadershipColocationCount: 'unparseable',
    F3_drainDeadlineElapsed: 'unparseable',
    f1_observable: false,
    f2_observable: false,
    f3_observable: false,
    _rawVerdict: null,
    _dominantReason: why,
    _bytes: null,
  };
}

function main() {
  const files = readdirSync(CORPUS_DIR)
    .filter((f) => /^stat-gate-.*-run\d+\.report\.json$/.test(f))
    .sort()
    .map((f) => join(CORPUS_DIR, f));

  const records = files.map(extractOne);

  const counts = { N_total: records.length, N_pass: 0, N_fail: 0, N_invalid: 0, N_unparseable: 0 };
  let f1obs = 0, f2obs = 0, f3obs = 0;
  for (const r of records) {
    if (r.verdict === 'PASS') counts.N_pass++;
    else if (r.verdict === 'FAIL') counts.N_fail++;
    else if (r.verdict === 'INVALID') counts.N_invalid++;
    else counts.N_unparseable++;
    if (r.f1_observable) f1obs++;
    if (r.f2_observable) f2obs++;
    if (r.f3_observable) f3obs++;
  }

  writeFileSync(OUT_PATH, JSON.stringify(records, null, 2) + '\n');

  // Machine-readable table to stdout.
  process.stdout.write(JSON.stringify(records) + '\n');
  const summary =
    `SUMMARY N_total=${counts.N_total} N_pass=${counts.N_pass} N_fail=${counts.N_fail} ` +
    `N_invalid=${counts.N_invalid} N_unparseable=${counts.N_unparseable} | ` +
    `f1_observable=${f1obs} f2_observable=${f2obs} f3_observable=${f3obs} | wrote=${OUT_PATH.replace(REPO_ROOT + '/', '')}`;
  process.stderr.write(summary + '\n');
}

main();
