// Bounding the per-attempt agent dossier.
//
// Each attempt spawns a FRESH agent process and hands it a dossier rebuilt from the
// durable log — context from state, not from an accumulating conversation. That design
// is right, but the dossier itself grew without bound: frontierState.findings is
// append-only and was shipped whole, so a Quest's 74th attempt carried all 383 of its
// findings. Measured worst case before this module: ~500 KB, roughly 125k tokens of
// findings alone, before the agent opened a single file.
//
// Two things make that tractable, in this order:
//
// 1. FIELD PROJECTION. applyFinding copies verification, regressionClassification and
//    scopePressureClassification into the projected finding. rungPrompt renders only
//    `claim` and `rulesOut`. On one real Quest those unread fields were 99,653 of
//    116,478 bytes — one finding's `verification` alone was 49,401. Projecting to the
//    fields anyone actually reads cut that Quest 99% with zero information loss. Do
//    this first; it is free.
//
// 2. A BYTE BUDGET over what remains. Note the budget must be byte-aware rather than
//    count-based: size is not proportional to count (3 findings reached 102 KB).
//
// The tempting invariant "never drop a rulesOut finding" was measured and rejected:
// rulesOut alone reaches 289 KB on the worst Quest and accrues ~2.5 per attempt, so it
// is itself unbounded — it would replace an unbounded dossier with a smaller unbounded
// one. Instead, ruled-out levers that do not fit in full degrade to a compact index of
// their `rulesOut` LABELS. The label is the part that carries the guard: it is what
// retread.js matches on, and retread deliberately suppresses a lineage dead lever on
// the assumption that the dossier replays it. Losing a claim costs an explanation;
// losing a label costs a re-derivation.
//
// SAFETY: eliding here changes a prompt, never a decision. frontierState.findings has
// exactly three readers — this dossier, rungPrompt, and report.js. Every gate, guard
// and honesty check reads EVENT_FINDING from the log instead, so no elision can move a
// gate. Reports keep the full set.

const KEPT_FIELDS = Object.freeze(['claim', 'kind', 'rulesOut']);
// The "[" and "]" of the serialized findings array; commas are counted per item.
const ARRAY_DELIMITER_BYTES = 2;
const UTF8 = 'utf8';

// Project a finding to the fields its readers actually use. Everything else is
// durable in the log and reachable by any consumer that needs it.
export function projectFinding(finding) {
  const projected = {};
  for (const field of KEPT_FIELDS) {
    if (finding?.[field] !== undefined && finding?.[field] !== null) {
      projected[field] = finding[field];
    }
  }
  return projected;
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), UTF8);
}

function truncateClaim(finding, maxClaimBytes) {
  const claim = typeof finding.claim === 'string' ? finding.claim : '';
  if (!maxClaimBytes || byteLength(claim) <= maxClaimBytes) return finding;
  return {...finding, claim: `${claim.slice(0, maxClaimBytes)}…[truncated]`};
}

// Select which findings travel in full, which degrade to a dead-lever label, and how
// many are dropped entirely.
//
// Fill newest-first, because the recent findings bear on the attempt being made. That
// ordering is also what makes a separate recency reservation unnecessary: an old tail
// can never crowd out recent findings when the recent ones are placed first. A
// mandatory-first fill would have inverted this and yielded "187 old + 3 recent",
// which is the opposite of useful.
export function selectDossierFindings(findings, options = {}) {
  const {maxBytes, maxClaimBytes} = options;
  const source = Array.isArray(findings) ? findings : [];
  if (!maxBytes || source.length === 0) {
    return {
      kept: source.map((f) => truncateClaim(projectFinding(f), maxClaimBytes)),
      ruledOutIndex: [],
      elidedCount: 0,
      totalCount: source.length,
    };
  }

  const newestFirst = [...source].reverse();
  const kept = [];
  const overflow = [];
  let used = 0;
  for (const finding of newestFirst) {
    const projected = truncateClaim(projectFinding(finding), maxClaimBytes);
    const size = byteLength(projected);
    // Budget against the SERIALIZED ARRAY, not the sum of its items: the enclosing
    // brackets and the inter-item commas are real bytes the agent receives, and
    // ignoring them lets a long tail of small findings overrun the cap.
    const serializedSize = ARRAY_DELIMITER_BYTES + used + size + kept.length;
    if (serializedSize <= maxBytes) {
      kept.push(projected);
      used += size;
    } else {
      overflow.push(finding);
    }
  }

  // Anything that did not fit still contributes its dead-lever label, which is the
  // part that prevents re-deriving a refuted approach.
  const keptLabels = new Set(kept.map((f) => f.rulesOut).filter(Boolean));
  const ruledOutIndex = [...new Set(overflow
    .map((f) => f?.rulesOut)
    .filter((label) => typeof label === 'string' && label &&
      !keptLabels.has(label)))];

  return {
    // Restore chronological order: the prompt reads oldest-to-newest.
    kept: kept.reverse(),
    ruledOutIndex,
    elidedCount: overflow.length,
    totalCount: source.length,
  };
}
