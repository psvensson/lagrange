const MODEL_CONTRACT_COMMAND = 'npm run model:contracts';
const CORE_SYSTEM_MODEL_REF = 'model:architecture/contracts/core-system-logic.md';
const MODEL_REPORT_PATTERN = 'test-output/reports/*.model.report.json';

const QUEST_KEYWORD_RULES = Object.freeze([
  Object.freeze({
    reason: 'architecture boundary language',
    pattern: /\barchitecture\b|\barchitectural\b|\bcurrent-owner-maps\b/u,
  }),
  Object.freeze({
    reason: 'owner-boundary language',
    pattern: /\bowner(?:ship)?\b|\bowner[-_\s]?boundary\b|\bsemantic[-_\s]?owner\b/u,
  }),
  Object.freeze({
    reason: 'core-system logic language',
    pattern: /\bcore[-_\s]?system\b|\bsystem[-_\s]?logic\b|\bnormalized[-_\s]?state\b/u,
  }),
  Object.freeze({
    reason: 'model-contract language',
    pattern: /\bmodel[-_\s]?contract\b|\binvariant\b|\bstatechart\b|\balloy\b|\btla\+?\b/u,
  }),
  Object.freeze({
    reason: 'handoff or lifecycle language',
    pattern: /\bhandoff\b|\blifecycle\b|\bphase[-_\s]?owner\b|\bread[-_\s]?model\b/u,
  }),
]);

function normalizeText(value) {
  return String(value || '').trim();
}

function textFromValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' ||
    typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(textFromValue).join(' ');
  }
  if (typeof value === 'object') {
    return Object.values(value).map(textFromValue).join(' ');
  }
  return '';
}

function questText(quest) {
  return [
    quest.id,
    quest.statement,
    textFromValue(quest.doneWhen),
    textFromValue(quest.frontiers),
    textFromValue(quest.constraints),
  ].join(' ');
}

function logText(log) {
  return log
    .map((event) => textFromValue({
      type: event.type,
      claim: event.claim,
      evidence: event.evidence,
      rulesOut: event.rulesOut,
      summary: event.summary,
      hypothesis: event.hypothesis,
      owner: event.owner,
      boundary: event.boundary,
      dominantReason: event.dominantReason,
      verdictReason: event.verdictReason,
      mechanism: event.mechanism,
      nextAction: event.nextAction,
      waitMode: event.waitMode,
      problem: event.problem,
      intervention: event.intervention,
    }))
    .join(' ');
}

function matchedRules(text) {
  const normalized = normalizeText(text).toLowerCase();
  return QUEST_KEYWORD_RULES
    .filter((rule) => rule.pattern.test(normalized))
    .map((rule) => rule.reason);
}

export function modelGuidanceForQuest(quest, log = []) {
  const reasons = matchedRules(`${questText(quest)} ${logText(log)}`);
  if (reasons.length === 0) return null;
  return {
    applies: true,
    reasons,
    command: MODEL_CONTRACT_COMMAND,
    discriminator: MODEL_CONTRACT_COMMAND,
    modelRef: CORE_SYSTEM_MODEL_REF,
    reportPattern: MODEL_REPORT_PATTERN,
    instruction:
      'Use this gate as the Quest theory discriminator for architecture, ' +
      'owner-boundary, core-system, lifecycle, or model-contract theories. ' +
      'At the model rung, pass the modelRef unless a finding explains why the ' +
      'architecture model is not applicable.',
  };
}

export {
  CORE_SYSTEM_MODEL_REF,
  MODEL_CONTRACT_COMMAND,
  MODEL_REPORT_PATTERN,
};
