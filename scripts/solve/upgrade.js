import {
  EVENT_QUEST_UPGRADED,
} from './constants.js';
import {detectUnrecordedEvidence, ingestEvidence} from './evidence.js';
import {writeReport} from './report.js';
import {appendEvent, loadQuest, readLog} from './store.js';

export function upgradeQuest(root, args = {}) {
  const id = args.id || args._?.[0];
  if (!id) throw new Error('upgrade: --id <questId> is required');
  const quest = loadQuest(root, id);
  const existingBaseline = readLog(root, id).find((event) =>
    event.type === EVENT_QUEST_UPGRADED && event.strictAudit === true);
  const baseline = existingBaseline || appendEvent(root, id, {
    type: EVENT_QUEST_UPGRADED,
    strictAudit: true,
    reason: typeof args.reason === 'string' ?
      args.reason :
      'enable strict Solver workflow enforcement for future Quest events',
  });

  const unrecorded = detectUnrecordedEvidence(root, id);
  const ingested = unrecorded ?
    ingestEvidence(root, {
      questId: id,
      frontierId: unrecorded.frontier,
      evidencePath: unrecorded.evidence,
    }) :
    null;
  if (!ingested) writeReport(root, id);

  return {
    questId: quest.id,
    baseline,
    alreadyUpgraded: Boolean(existingBaseline),
    ingested,
  };
}

export function runUpgradeCommand(root, args) {
  const result = upgradeQuest(root, args);
  const lines = [
    result.alreadyUpgraded ?
      `already upgraded ${result.questId}` :
      `upgraded ${result.questId}`,
    `strict audit baseline: ${result.baseline.ts}`,
  ];
  if (result.ingested) {
    lines.push(`ingested evidence: ${result.ingested.evidence}`);
  }
  return `${lines.join('\n')}\n`;
}
