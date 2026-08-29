import {detectUnrecordedEvidence, ingestEvidence} from './evidence.js';

const EXTRA_PROBE_SLOT = 1;

export function ingestDeclaredProbeEvidence(root, quest) {
  const recorded = [];
  const limit = (quest.frontiers?.length || 0) + EXTRA_PROBE_SLOT;
  for (let index = 0; index < limit; index += 1) {
    const pending = detectUnrecordedEvidence(root, quest.id);
    if (!pending) break;
    const event = ingestEvidence(root, {
      questId: quest.id,
      frontierId: pending.frontier,
      evidencePath: pending.evidence,
      probeScope: pending.probeScope,
    });
    recorded.push({
      frontier: pending.frontier,
      probeScope: pending.probeScope,
      evidence: pending.evidence,
      fingerprint: event.evidenceFingerprint,
    });
  }
  return recorded;
}
