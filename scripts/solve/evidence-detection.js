import {
  EVENT_ATTEMPT,
  EVENT_EVIDENCE_INGESTED,
  EVENT_QUEST,
  EVENT_SOLVED,
} from './constants.js';
import {evaluate} from './probe.js';
import {loadQuest, readLog} from './store.js';
import {evidenceIdentityMatchesEvent} from './evidence-identity.js';

const EVIDENCE_PROBE_KIND_ALL = 'all';
const EVIDENCE_PROBE_KIND_FRONTIER = 'frontier';
const EVIDENCE_PROBE_KIND_CLOSURE = 'closure';
const EVIDENCE_PROBE_SCOPE_DONE_WHEN = 'doneWhen';
const EVIDENCE_PROBE_SCOPE_FRONTIER = 'frontier';
const DONE_WHEN_PROBE_FLAG = ' --probe doneWhen';

function questProbeSpecs(quest, kind = EVIDENCE_PROBE_KIND_ALL) {
  const fallbackFrontier = quest.frontiers[0]?.id || `${quest.id}-main`;
  const specs = [];
  if (kind !== EVIDENCE_PROBE_KIND_FRONTIER) {
    specs.push({
      frontier: fallbackFrontier,
      scope: EVIDENCE_PROBE_SCOPE_DONE_WHEN,
      probeSpec: quest.doneWhen,
    });
  }
  if (kind !== EVIDENCE_PROBE_KIND_CLOSURE) {
    specs.push(...quest.frontiers.map((frontier) => ({
      frontier: frontier.id,
      scope: EVIDENCE_PROBE_SCOPE_FRONTIER,
      probeSpec: frontier.metric,
    })));
  }
  return specs.filter((entry) => entry.probeSpec);
}

export function detectUnrecordedEvidence(root, questId, options = {}) {
  try {
    const quest = loadQuest(root, questId);
    const log = readLog(root, questId);
    const measuredEvents = log.filter((event) =>
      event.type === EVENT_ATTEMPT ||
      event.type === EVENT_EVIDENCE_INGESTED ||
      event.type === EVENT_SOLVED ||
      event.type === EVENT_QUEST);
    if (measuredEvents.length === 0 && options.requiresMeasuredHistory) {
      return null;
    }
    for (const spec of questProbeSpecs(
      quest,
      options.kind || EVIDENCE_PROBE_KIND_ALL,
    )) {
      const probe = evaluate(spec.probeSpec, {root});
      if (!probe.evidence || probe.evidenceIdentity?.exists !== true) continue;
      const alreadyIngested = measuredEvents.some((event) =>
        evidenceIdentityMatchesEvent(probe.evidenceIdentity, event, {
          requireProbeSpec: true,
        }),
      );
      if (alreadyIngested) continue;
      const probeFlag =
        spec.scope === EVIDENCE_PROBE_SCOPE_DONE_WHEN ?
          DONE_WHEN_PROBE_FLAG : '';
      return {
        frontier: spec.frontier,
        probeScope: spec.scope,
        evidence: probe.evidence,
        evidenceFingerprint: probe.evidenceFingerprint,
        command: `node scripts/solve.js ingest-evidence --id ${questId} ` +
          `--frontier ${spec.frontier}${probeFlag} --evidence ${probe.evidence}`,
      };
    }
  } catch (_err) {
    // Freshness detection is best-effort; unreadable probes surface no command.
  }
  return null;
}
