import fs from 'node:fs';

const UNKNOWN = 'unknown';
const MAX_REASON_COUNT = 8;
const MAX_TRAVERSE_DEPTH = 8;
const REASON_KEY_PATTERN =
  /reason|verdict|state|status|owner|boundary|failure|class|condition/iu;

function safeReadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function addReason(reasons, value) {
  const text = String(value || '').trim();
  if (text && !reasons.includes(text) && reasons.length < MAX_REASON_COUNT) {
    reasons.push(text);
  }
}

function collectReasons(value, reasons = [], depth = 0) {
  if (depth > MAX_TRAVERSE_DEPTH || reasons.length >= MAX_REASON_COUNT) {
    return reasons;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectReasons(item, reasons, depth + 1);
    return reasons;
  }
  if (!value || typeof value !== 'object') return reasons;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && REASON_KEY_PATTERN.test(key)) {
      addReason(reasons, child);
    } else if (child && typeof child === 'object') {
      collectReasons(child, reasons, depth + 1);
    }
  }
  return reasons;
}

function latestScenario(data) {
  const scenarios = data?.standardSummary?.scenarios;
  if (!Array.isArray(scenarios) || scenarios.length === 0) return null;
  return scenarios[0];
}

function priorityItems(data) {
  const value = data?.optimizationSummary?.totalPriorityItems;
  return Number.isInteger(value) ? value : null;
}

function classifyMechanism(reasonText) {
  const text = String(reasonText || '').toLowerCase();
  if (/stale|missing|unknown|incomplete|evidence/iu.test(text)) {
    return 'observation_gap';
  }
  if (/pending|deferred|retry|wake|enqueued|blocked/iu.test(text)) {
    return 'transition_gap';
  }
  if (/timeout|budget|deadline/iu.test(text)) {
    return 'budget_gap';
  }
  if (/owner|authority|handoff/iu.test(text)) {
    return 'ownership_gap';
  }
  if (/publish|membership|topology|coverage|snapshot/iu.test(text)) {
    return 'topology_gap';
  }
  if (/protocol|contract|mismatch|disagree/iu.test(text)) {
    return 'protocol_gap';
  }
  return 'transition_gap';
}

function rejectedMechanisms(reasonText) {
  const text = String(reasonText || '').toLowerCase();
  const rejected = [];
  if (!/stale|missing|unknown|incomplete|evidence/iu.test(text)) {
    rejected.push('observation_gap');
  }
  if (!/timeout|budget|deadline/iu.test(text)) {
    rejected.push('budget_gap');
  }
  return rejected.length > 0 ? rejected : [UNKNOWN];
}

export function buildMechanismCardFromEvidence(filePath) {
  const data = safeReadJson(filePath);
  const scenario = latestScenario(data);
  const reasons = collectReasons(data);
  const reasonText = reasons.join(' ');
  const mechanism = classifyMechanism(reasonText);
  const priority = priorityItems(data);
  const verdict = scenario?.current?.verdict || data?.summary?.status || UNKNOWN;
  const scenarioName = scenario?.scenario || data?.scenario || UNKNOWN;
  return {
    failureMechanism: mechanism,
    stableFacts: [
      `scenario=${scenarioName}`,
      `verdict=${verdict}`,
      priority === null ? 'priorityItems=unknown' : `priorityItems=${priority}`,
      reasons.length > 0 ? `reasons=${reasons.join(', ')}` : null,
    ].filter(Boolean),
    changedFacts: [
      `evidence=${filePath}`,
    ],
    rejectedAlternatives: rejectedMechanisms(reasonText),
    decidingOwner: UNKNOWN,
    currentAction: verdict,
    missingTransitionOrObservation:
      mechanism === 'observation_gap' ?
        'fresh, owner-bound evidence is missing or incomplete' :
        'state transition or scheduling movement must be proven',
    smallestFalsifyingProbe: data?.scenario ?
      `node test/distributed/run.js --scenario ${data.scenario}` :
      `probe evidence ${filePath}`,
    expectedMovement: 'the selected Quest metric decreases or doneWhen evidence advances',
    negativeResultMeans: 'fresh evidence keeps the same metric and mechanism',
    escalationRule: 'select a different theory layer before another same-shape patch',
    evidence: filePath,
  };
}
