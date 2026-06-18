#!/usr/bin/env node

// Latent convergence-blocker census (Phase 0 + L5 of the
// .kiro/epics/latent-convergence-blocker-census.md plan).
//
// THE PROBLEM: the rolling-restart gate is a serial, max-frequency oracle — each run
// surfaces only the single highest-frequency dominant reason; every other real blocker
// is MASKED behind it. So fixes proceed by onion-peeling (epoch-disagree -> surplus-drain
// wedge -> leadership-churn settle -> ...), one slow gate per layer, and N<8 gates are
// sampling noise, not a rate.
//
// THIS TOOL mines the WHOLE on-disk report corpus at once to surface the masked
// distribution the serial gate hides:
//   - reason census (how often each reason is dominant, across how many gates);
//   - per-gate timeline (pass rate + dominant reasons over time = the onion-peel trend);
//   - peel-order (masking-by-succession heuristic: reasons whose dominance is concentrated
//     in LATER gates emerged after earlier ones were fixed = the "surprising next things");
//   - currently-emerging candidates (recently-first-seen, low-count dominant reasons);
//   - secondary/co-reasons parsed from each run's error string (canonicalBlocker /
//     instabilitySummary / quiescenceState) = blockers co-present but not yet dominant.
// It then prints the grounding-pack pointers + the uniform candidate-record schema the
// parallel agent census (L1-L4 + adversarial verify + peel-until-dry) consumes.
//
// This is the cheap, deterministic backbone — it does NOT replace the agent census; it
// gives it a data-grounded starting frontier so the fan-out is not blind.
//
// Usage:
//   node scripts/analyze-latent-blockers.js                         # all reports under test-output/reports
//   node scripts/analyze-latent-blockers.js --markdown
//   node scripts/analyze-latent-blockers.js --json
//   node scripts/analyze-latent-blockers.js --report-dir <dir>
//   node scripts/analyze-latent-blockers.js <run.report.json...>    # explicit files

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const JSON_INDENT_SPACES = 2;
const NEWLINE = '\n';
const FLAG_MARKDOWN = '--markdown';
const FLAG_JSON = '--json';
const FLAG_HELP = '--help';
const FLAG_REPORT_DIR = '--report-dir';
const DEFAULT_REPORT_DIR = 'test-output/reports';
const REPORT_SUFFIX = '.report.json';
const SCHEMA_VERSION = 'latent-blocker-census-v1';
const EMERGING_MAX_DOMINANT_GATES = 2; // dominant in <= this many gates = still emerging
// Harness sentinels that are NOT real blockers: `canonicalBlocker=none` marks "no blocker
// this sample". Ingesting them would emit a phantom candidate (`none`) and send a census
// agent chasing a non-existent blocker, so they are dropped everywhere a reason is recorded.
const SENTINEL_REASONS = new Set(['none', 'passed', 'null', '']);

// The uniform candidate-record schema every parallel finder emits (kept here so the tool
// prints the exact contract the agent census fills in — single source of truth).
const CANDIDATE_SCHEMA_FIELDS = Object.freeze([
  'id', 'lens', 'subsystem', 'mechanism', 'trigger',
  'failureKind', // product-bug | oracle-strictness | settle-time | harness-tax
  'maskedBy', 'masks', 'evidence', 'gateReasonCorrelation',
  'falsifierDesign', 'fixSketch', 'fixRisk', 'peelDepth', 'confidence',
]);

const FINDER_LENSES = Object.freeze([
  'L1-control-plane-state-machines (publication / surplus-drain+placement / raft+liferaft / quiescence / readiness / cdc)',
  'L1-sql-data-plane (write+txn coordination / data-plane placement+quorum / routing-under-churn)',
  'L2-circular-dependency-class (formation vs steady-state invariants)',
  'L3-assume-fixed-forward-simulation (onion-peeler)',
  'L4-lagging-persisted-vs-live-state (epoch / raft_role / leader_node_id / readiness rows)',
  'L5-historical-evidence-mining (this tool feeds it)',
]);

function gateIdFromPath(filePath) {
  const base = path.basename(filePath);
  // stat-gate-20260618T091351Z-run3.report.json -> stat-gate-20260618T091351Z
  const gate = base.match(/^(.*?)-run\d+\.report\.json$/u);
  if (gate) {
    return gate[1];
  }
  return base.replace(/\.report\.json$/u, '');
}

function runLabelFromPath(filePath) {
  return path.basename(filePath).replace(/\.report\.json$/u, '');
}

// A gate id usually embeds an ISO-ish timestamp (…20260618T091351Z…). Extract a sortable
// key so gates order chronologically; fall back to the id itself.
function gateSortKey(gateId) {
  const match = gateId.match(/(\d{8}T\d{6}Z)/u);
  return match ? match[1] : gateId;
}

function selectRollingRestartScenario(report) {
  const scenarios = Array.isArray(report?.scenarios) ? report.scenarios : [];
  return (
    scenarios.find((s) => s?.scenario === 'rolling-restart') ??
    scenarios[0] ??
    report ??
    null
  );
}

// Secondary / co-present reasons hide inside the human error string the harness writes
// (canonicalBlocker=…, quiescenceState=…, instabilitySummary=name=a:b, name2=c:d, …).
// These are blockers co-present in a run but NOT the dominant one — i.e. masked.
// instabilitySummary has two grammars: `name=count:count` (a blocker name we want) and
// `state:detail:count` / `error:detail:count` (node-state-distribution noise, NOT a blocker
// name). We intentionally match ONLY the `name=` grammar so the distribution noise is skipped.
// Sentinel filtering (e.g. canonicalBlocker=none) happens in extractRun after normalization.
function parseSecondaryReasons(errorText) {
  if (typeof errorText !== 'string' || errorText.length === 0) {
    return [];
  }
  const found = new Set();
  const canonical = errorText.match(/canonicalBlocker=([a-z_][a-z0-9_]*)/iu);
  if (canonical) {
    found.add(canonical[1]);
  }
  const quiescence = errorText.match(/quiescenceState=([a-z_][a-z0-9_]*)/iu);
  if (quiescence) {
    found.add(quiescence[1]);
  }
  const instability = errorText.match(/instabilitySummary=([^)]*)/iu);
  if (instability) {
    for (const part of instability[1].split(',')) {
      const name = part.trim().match(/^([a-z_][a-z0-9_]*)=/iu);
      if (name) {
        found.add(name[1]);
      }
    }
  }
  return [...found];
}

// Many reasons embed a run-specific detail after '=' (a node id, a probe message):
// `publication_missing_active_node=11601fe0…`, `readiness_probe_timeout=Node … for X`.
// Normalize to the reason CLASS so the census aggregates them instead of splitting one
// reason into per-node variants (the detail is incidental to which blocker it is).
function normalizeReason(reason) {
  if (typeof reason !== 'string') {
    return reason;
  }
  return reason.split('=')[0].trim();
}

function extractRun(filePath, report) {
  const scenario = selectRollingRestartScenario(report);
  const fc = scenario?.failureClassification ?? {};
  const errorText =
    scenario?.summary?.error ?? scenario?.error ?? report?.summary?.error ?? '';
  const passed = scenario?.passed ?? null;
  const rawDominant =
    passed === true ? null : (fc.dominantReason ?? scenario?.dominantReason ?? null);
  const normalizedDominant = rawDominant === null ? null : normalizeReason(rawDominant);
  const dominantReason =
    normalizedDominant !== null && !SENTINEL_REASONS.has(normalizedDominant) ?
      normalizedDominant :
      null;
  const secondaryReasons = parseSecondaryReasons(errorText)
    .map(normalizeReason)
    .filter((r) => r !== dominantReason && !SENTINEL_REASONS.has(r));
  return {
    label: runLabelFromPath(filePath),
    gateId: gateIdFromPath(filePath),
    passed,
    verdict: scenario?.verdict ?? report?.verdict ?? null,
    dominantReason,
    secondaryReasons,
  };
}

// Pure: given [{...extractRun}], return the census summary.
function summarizeLatentBlockers(runs) {
  const totalRuns = runs.length;
  const passedRuns = runs.filter((r) => r.passed === true).length;

  // --- per-gate timeline ---
  const gateMap = new Map();
  for (const r of runs) {
    if (!gateMap.has(r.gateId)) {
      gateMap.set(r.gateId, {gateId: r.gateId, runs: 0, passed: 0, dominantReasons: {}});
    }
    const g = gateMap.get(r.gateId);
    g.runs += 1;
    if (r.passed === true) {
      g.passed += 1;
    }
    if (r.dominantReason) {
      g.dominantReasons[r.dominantReason] =
        (g.dominantReasons[r.dominantReason] || 0) + 1;
    }
  }
  const gates = [...gateMap.values()]
    .map((g) => ({
      ...g,
      passRate: g.runs > 0 ? g.passed / g.runs : 0,
      sortKey: gateSortKey(g.gateId),
    }))
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
  const gateOrder = gates.map((g) => g.gateId);
  const gateIndex = new Map(gateOrder.map((id, i) => [id, i]));

  // --- reason census (dominant + secondary), with gate spread + time centroid ---
  const reasonMap = new Map();
  function ensureReason(name) {
    if (!reasonMap.has(name)) {
      reasonMap.set(name, {
        reason: name,
        dominantCount: 0,
        secondaryCount: 0,
        dominantGateIds: new Set(),
        anyGateIds: new Set(),
      });
    }
    return reasonMap.get(name);
  }
  for (const r of runs) {
    if (r.dominantReason) {
      const rec = ensureReason(r.dominantReason);
      rec.dominantCount += 1;
      rec.dominantGateIds.add(r.gateId);
      rec.anyGateIds.add(r.gateId);
    }
    for (const sec of r.secondaryReasons) {
      const rec = ensureReason(sec);
      rec.secondaryCount += 1;
      rec.anyGateIds.add(r.gateId);
    }
  }
  const reasons = [...reasonMap.values()]
    .map((rec) => {
      const dominantGateIdxs = [...rec.dominantGateIds].map((id) => gateIndex.get(id));
      // Time centroid in [0,1] over the chronological gate order; later = emerged later.
      const denom = Math.max(1, gateOrder.length - 1);
      const centroid =
        dominantGateIdxs.length > 0 ?
          dominantGateIdxs.reduce((a, b) => a + b, 0) /
            dominantGateIdxs.length /
            denom :
          null;
      return {
        reason: rec.reason,
        dominantCount: rec.dominantCount,
        secondaryCount: rec.secondaryCount,
        dominantInGates: rec.dominantGateIds.size,
        presentInGates: rec.anyGateIds.size,
        dominanceTimeCentroid: centroid === null ? null : Number(centroid.toFixed(3)),
      };
    })
    .sort((a, b) => b.dominantCount - a.dominantCount || b.secondaryCount - a.secondaryCount);

  // --- peel order: reasons that are EVER dominant, ordered by when their dominance
  // concentrates (time centroid). Later centroid = surfaced after earlier layers fixed. ---
  const peelOrder = reasons
    .filter((r) => r.dominantCount > 0)
    .slice()
    .sort((a, b) => (a.dominanceTimeCentroid ?? 0) - (b.dominanceTimeCentroid ?? 0))
    .map((r) => ({
      reason: r.reason,
      dominantCount: r.dominantCount,
      dominanceTimeCentroid: r.dominanceTimeCentroid,
    }));

  // --- currently-emerging candidates: dominant in few gates AND late-centroid, OR
  // present-as-secondary-but-rarely-dominant (masked). These are the "surprising next". ---
  const emerging = reasons
    .filter(
      (r) =>
        (r.dominantInGates > 0 &&
          r.dominantInGates <= EMERGING_MAX_DOMINANT_GATES &&
          (r.dominanceTimeCentroid ?? 0) >= 0.5) ||
        (r.dominantCount === 0 && r.secondaryCount > 0),
    )
    .map((r) => ({
      reason: r.reason,
      dominantCount: r.dominantCount,
      secondaryCount: r.secondaryCount,
      dominanceTimeCentroid: r.dominanceTimeCentroid,
      signal:
        r.dominantCount === 0 ?
          'masked: co-present but never dominant' :
          'recently surfaced: dominant in few, late gates',
    }));

  return {
    schemaVersion: SCHEMA_VERSION,
    totalRuns,
    passedRuns,
    overallPassRate: totalRuns > 0 ? Number((passedRuns / totalRuns).toFixed(3)) : 0,
    gateCount: gates.length,
    gates,
    reasons,
    peelOrder,
    emerging,
  };
}

// Grounding-pack pointers (Phase 0): what the agent census needs as its shared brief.
async function buildGroundingPack(repoRoot) {
  const ledgerDir = path.join(
    repoRoot,
    '.kiro/specs/membership-lifecycle-placement-hard-cutover/closure-ledger',
  );
  let closureRecords = [];
  try {
    closureRecords = (await fs.readdir(ledgerDir))
      .filter((f) => /^CL-\d+\.md$/u.test(f))
      .sort();
  } catch {
    closureRecords = [];
  }
  return {
    closureLedgerDir: path.relative(repoRoot, ledgerDir),
    closureRecords,
    invariantSource: 'closure-ledger/CL-*.md (umbrella + per-record STATE headers)',
    deterministicSubstrate: 'docs/deterministic-directed-testing-plan.md (DT4/DT5/DT6 + TLC)',
    analyzerInventory: 'npm run commands (Report And Triage group) / npm run analyze:*',
    candidateSchemaFields: CANDIDATE_SCHEMA_FIELDS,
    finderLenses: FINDER_LENSES,
  };
}

function renderText(summary, grounding) {
  const lines = [];
  lines.push(`Latent convergence-blocker census — ${summary.totalRuns} run(s), ` +
    `${summary.gateCount} gate(s), overall pass ${summary.passedRuns}/${summary.totalRuns} ` +
    `(${summary.overallPassRate})`);
  lines.push('');
  lines.push('PEEL ORDER (dominance time-centroid 0..1 over chronological gates — HEURISTIC:');
  lines.push('"later = surfaced after earlier layers fixed" holds ONLY across a controlled');
  lines.push('fix→regate sequence; in a mixed/one-off corpus a late one-off scores the same):');
  for (const p of summary.peelOrder) {
    lines.push(`  [${p.dominanceTimeCentroid ?? '—'}] ${p.reason} (dominant x${p.dominantCount})`);
  }
  lines.push('');
  lines.push('CURRENTLY-EMERGING / MASKED CANDIDATES (the "surprising next things"):');
  if (summary.emerging.length === 0) {
    lines.push('  (none surfaced — corpus may be too small or single-gate)');
  }
  for (const e of summary.emerging) {
    lines.push(`  - ${e.reason} — ${e.signal} (dom x${e.dominantCount}, sec x${e.secondaryCount})`);
  }
  lines.push('');
  lines.push('REASON CENSUS (dominant / secondary across gates):');
  for (const r of summary.reasons) {
    lines.push(`  ${r.reason}: dominant x${r.dominantCount} in ${r.dominantInGates} gate(s), ` +
      `secondary x${r.secondaryCount}, present in ${r.presentInGates} gate(s)`);
  }
  lines.push('');
  lines.push('GATE TIMELINE (chronological):');
  for (const g of summary.gates) {
    const doms = Object.entries(g.dominantReasons)
      .map(([k, v]) => `${k}x${v}`)
      .join(', ') || 'none';
    lines.push(`  ${g.gateId}: pass ${g.passed}/${g.runs} — ${doms}`);
  }
  if (grounding) {
    lines.push('');
    lines.push('GROUNDING PACK (Phase 0 brief for the parallel agent census):');
    lines.push(`  closure records: ${grounding.closureRecords.length} under ${grounding.closureLedgerDir}`);
    lines.push(`  deterministic substrate: ${grounding.deterministicSubstrate}`);
    lines.push(`  finder lenses: ${grounding.finderLenses.length}`);
    lines.push(`  candidate-record schema: { ${grounding.candidateSchemaFields.join(', ')} }`);
    lines.push('  NEXT: feed this frontier to the L1-L4 agent fan-out + adversarial verify +');
    lines.push('        peel-until-dry (see .kiro/epics/latent-convergence-blocker-census.md).');
  }
  return lines.join(NEWLINE);
}

function renderMarkdown(summary, grounding) {
  const lines = [
    '# Latent convergence-blocker census',
    '',
    `- runs: ${summary.totalRuns} across ${summary.gateCount} gate(s)`,
    `- overall scenario-PASS: ${summary.passedRuns}/${summary.totalRuns} (${summary.overallPassRate})`,
    '',
    '## Peel order (the onion, oldest→newest dominance)',
    '',
    '_Heuristic: dominance time-centroid over chronological gates. "Later = surfaced after_',
    '_earlier layers fixed" is sound ONLY across a controlled fix→regate sequence; a late_',
    '_one-off in a mixed corpus scores the same as a genuine survivor._',
    '',
    '| centroid | reason | dominant×N |',
    '| --- | --- | --- |',
  ];
  for (const p of summary.peelOrder) {
    lines.push(`| ${p.dominanceTimeCentroid ?? '—'} | ${p.reason} | ${p.dominantCount} |`);
  }
  lines.push('', '## Emerging / masked candidates (the "surprising next things")', '');
  if (summary.emerging.length === 0) {
    lines.push('_(none surfaced — corpus may be too small or single-gate)_');
  }
  for (const e of summary.emerging) {
    lines.push(`- **${e.reason}** — ${e.signal} (dominant ×${e.dominantCount}, secondary ×${e.secondaryCount})`);
  }
  lines.push('', '## Reason census', '', '| reason | dominant×N | in gates | secondary×N |', '| --- | --- | --- | --- |');
  for (const r of summary.reasons) {
    lines.push(`| ${r.reason} | ${r.dominantCount} | ${r.dominantInGates} | ${r.secondaryCount} |`);
  }
  if (grounding) {
    lines.push('', '## Grounding pack (Phase 0)', '',
      `- closure records: ${grounding.closureRecords.length} under \`${grounding.closureLedgerDir}\``,
      `- substrate: ${grounding.deterministicSubstrate}`,
      `- candidate schema: \`{ ${grounding.candidateSchemaFields.join(', ')} }\``,
      '- next: parallel L1–L4 fan-out + adversarial verify + peel-until-dry',
      '  (`.kiro/epics/latent-convergence-blocker-census.md`).');
  }
  return lines.join(NEWLINE);
}

async function resolveReportFiles(args, reportDir) {
  const explicit = args.filter((a) => a.endsWith(REPORT_SUFFIX));
  if (explicit.length > 0) {
    return explicit;
  }
  const entries = await fs.readdir(reportDir);
  return entries
    .filter((f) => f.endsWith(REPORT_SUFFIX))
    .map((f) => path.join(reportDir, f))
    .sort();
}

async function readRun(filePath) {
  const text = await fs.readFile(filePath, ENCODING_UTF8);
  return extractRun(filePath, JSON.parse(text));
}

function parseReportDir(argv) {
  const idx = argv.indexOf(FLAG_REPORT_DIR);
  if (idx >= 0 && argv[idx + 1]) {
    return argv[idx + 1];
  }
  return DEFAULT_REPORT_DIR;
}

async function runCli(argv, {repoRoot} = {}) {
  if (argv.includes(FLAG_HELP)) {
    return {
      ok: false,
      output:
        'usage: analyze-latent-blockers [--markdown|--json] [--report-dir <dir>] [<run.report.json>...]\n' +
        '  Mines the report corpus for the masked blocker distribution the serial gate hides.\n' +
        '  Default: all *.report.json under test-output/reports.',
    };
  }
  const markdown = argv.includes(FLAG_MARKDOWN);
  const asJson = argv.includes(FLAG_JSON);
  const reportDir = parseReportDir(argv);
  const fileArgs = argv.filter(
    (a, i) => !a.startsWith('--') && argv[i - 1] !== FLAG_REPORT_DIR,
  );
  const files = await resolveReportFiles(fileArgs, reportDir);
  if (files.length === 0) {
    return {ok: false, output: `no ${REPORT_SUFFIX} files found in ${reportDir}`};
  }
  const runs = [];
  for (const filePath of files) {
    try {
      runs.push(await readRun(filePath));
    } catch {
      // skip unreadable/partial report (e.g. a gate still writing)
    }
  }
  if (runs.length === 0) {
    return {ok: false, output: `no readable ${REPORT_SUFFIX} reports (0 of ${files.length} parsed)`};
  }
  const summary = summarizeLatentBlockers(runs);
  const grounding = repoRoot ? await buildGroundingPack(repoRoot) : null;
  if (asJson) {
    return {
      ok: true,
      output: JSON.stringify({...summary, groundingPack: grounding}, null, JSON_INDENT_SPACES),
    };
  }
  return {
    ok: true,
    output: markdown ? renderMarkdown(summary, grounding) : renderText(summary, grounding),
  };
}

function isDirectRun() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  runCli(process.argv.slice(2), {repoRoot})
    .then((result) => {
      (result.ok ? process.stdout : process.stderr).write(result.output + NEWLINE);
      process.exitCode = result.ok ? EXIT_SUCCESS : EXIT_FAILURE;
    })
    .catch((error) => {
      process.stderr.write(String(error?.message ?? error) + NEWLINE);
      process.exitCode = EXIT_FAILURE;
    });
}

export {
  CANDIDATE_SCHEMA_FIELDS,
  FINDER_LENSES,
  parseSecondaryReasons,
  normalizeReason,
  extractRun,
  summarizeLatentBlockers,
  buildGroundingPack,
  renderText,
  renderMarkdown,
  runCli,
};
