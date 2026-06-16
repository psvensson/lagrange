import {test} from '../../src/test-helpers/tap.js';
import {
  computeStrandedNoFailback,
  deriveLinks,
  extractTerminal,
  summarize,
} from '../../scripts/analyze-cl039-link-rate.js';

test('computeStrandedNoFailback: leadership left and never returned', (t) => {
  // Left the seed, last resolution still names another node => stranded.
  t.equal(computeStrandedNoFailback({
    seedNodeId: 'seed', leadershipLeftCount: 3,
    lastWriteLeaderHelper: false, lastWriteLeaderTier1: 'other',
  }), true);
  // Left, but recovered: last resolution names the seed and helper=true.
  t.equal(computeStrandedNoFailback({
    seedNodeId: 'seed', leadershipLeftCount: 3,
    lastWriteLeaderHelper: true, lastWriteLeaderTier1: 'seed',
  }), false);
  // Never left at all.
  t.equal(computeStrandedNoFailback({
    seedNodeId: 'seed', leadershipLeftCount: 0,
    lastWriteLeaderHelper: true, lastWriteLeaderTier1: 'seed',
  }), false);
  t.end();
});

test('deriveLinks: L1 fires without L2 (gap crossed but leadership held)', (t) => {
  // The run1 self-heal shape: a >3000ms gap but leadership never left the seed.
  const links = deriveLinks({
    gapCrossCount: 2, leadershipLeftCount: 0,
    strandedNoFailback: false, upsertFailPublications: 0,
  });
  t.equal(links.L1_gap_cross, true);
  t.equal(links.L2_leadership_left, false);
  t.equal(links.L3_stranded_no_failback, false);
  t.equal(links.L4_write_fail_closed, false);
  t.end();
});

test('deriveLinks: full CL-039 STALL chain fires', (t) => {
  const links = deriveLinks({
    gapCrossCount: 1, leadershipLeftCount: 4,
    strandedNoFailback: true, upsertFailPublications: 39,
  });
  t.same(links, {
    L1_gap_cross: true, L2_leadership_left: true,
    L3_stranded_no_failback: true, L4_write_fail_closed: true,
  });
  t.end();
});

test('deriveLinks: null (no seed log) is not-measurable, never a false positive', (t) => {
  t.same(deriveLinks(null), {
    L1_gap_cross: null, L2_leadership_left: null,
    L3_stranded_no_failback: null, L4_write_fail_closed: null,
  });
  t.end();
});

test('extractTerminal: OPEN + missing>=1 is the terminal stall', (t) => {
  const stalled = extractTerminal({scenarios: [{passed: false, publicationConvergence: {
    publicationStatus: 'OPEN', missingPublishedCount: 1, dominantReason: 'leadership_unstable',
  }}]});
  t.equal(stalled.terminalStall, true);
  t.equal(stalled.dominantReason, 'leadership_unstable');
  // PUBLISHED + missing=0 (converged) is NOT a stall.
  const ok = extractTerminal({scenarios: [{passed: true, publicationConvergence: {
    publicationStatus: 'PUBLISHED', missingPublishedCount: 0,
  }}]});
  t.equal(ok.terminalStall, false);
  // No publicationConvergence => not measurable.
  t.equal(extractTerminal({scenarios: [{}]}).hasPublicationConvergence, false);
  t.end();
});

test('summarize: graded chain tally counts only measurable runs', (t) => {
  const ev = (gapCrossCount, leadershipLeftCount, upsertFailPublications) =>
    ({gapCrossCount, leadershipLeftCount, strandedNoFailback: false, upsertFailPublications});
  const runs = [
    {label: 'run1', seedLogPresent: true, links: deriveLinks(ev(2, 0, 0)),
      TT_terminal_stall: false, seedEvidence: {seedNodeId: 's', maxGapMs: 6813}, terminal: {}},
    {label: 'run2', seedLogPresent: true, links: deriveLinks(ev(1, 2, 3)),
      TT_terminal_stall: false, seedEvidence: {seedNodeId: 's', maxGapMs: 4200}, terminal: {}},
    // run3 unmeasurable (no seed log) — excluded from link denominators.
    {label: 'run3', seedLogPresent: false,
      links: deriveLinks(null), TT_terminal_stall: null, seedEvidence: null, terminal: {}},
  ];
  const s = summarize(runs);
  t.equal(s.totalRuns, 3);
  t.equal(s.measurableRuns, 2);
  const l1 = s.links.find((x) => x.key === 'L1_gap_cross');
  const l2 = s.links.find((x) => x.key === 'L2_leadership_left');
  t.equal(l1.firedCount, 2); // both measurable runs crossed the ceiling
  t.equal(l1.measurableRuns, 2);
  t.equal(l2.firedCount, 1); // only run2 lost leadership
  t.equal(s.terminal.firedCount, 0);
  t.end();
});
