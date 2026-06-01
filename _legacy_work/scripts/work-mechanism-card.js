#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Try to import the evidence summary builder; fallback if needed
let buildRepresentativeEvidenceSummary;
try {
  const summaryModule = await import('./summarize-representative-evidence.js');
  buildRepresentativeEvidenceSummary = summaryModule.buildRepresentativeEvidenceSummary;
} catch (err) {
  // Safe fallback if module not fully resolved/mocked in tests
  buildRepresentativeEvidenceSummary = null;
}

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_USAGE = 1;
const EXIT_FAILURE = 2;
const ARG_HELP_SHORT = '-h';
const ARG_HELP_LONG = '--help';
const ARG_JSON = '--json';

const HELP_TEXT = [
  'Usage: npm run work:mechanism-card -- <path-to-package-or-artifact> [--json]',
  '',
  'Reads a work package (.md) or evidence artifact (.json) and prints a structured',
  'mechanism card with stable facts, candidates, and domain-neutral classifications.',
].join('\n');

function parseCliArgs(args) {
  let isJsonFormat = false;
  const positional = [];
  for (const arg of args) {
    if (arg === ARG_HELP_SHORT || arg === ARG_HELP_LONG) {
      return { helpRequested: true, filePath: '', isJsonFormat };
    }
    if (arg === ARG_JSON) {
      isJsonFormat = true;
      continue;
    }
    positional.push(arg);
  }
  return {
    helpRequested: false,
    filePath: positional[0] || '',
    isJsonFormat,
  };
}

function parseMarkdownCard(content) {
  const cardSectionRegex = /## Mechanism Card\s*\n([\s\S]*?)(?=\n##|$)/i;
  const match = content.match(cardSectionRegex);
  const cardData = {};

  const keys = [
    'Failure mechanism',
    'Stable facts',
    'Changed facts',
    'Why not the alternatives',
    'Owner who decides',
    'Current code or workflow action',
    'Missing transition or missing observation',
    'Smallest falsifying probe',
    'Expected movement',
    'Negative result means',
    'Escalation rule',
  ];

  // Initialize with unknown
  for (const key of keys) {
    cardData[key] = 'unknown';
  }

  if (match && match[1]) {
    const lines = match[1].split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > 0) {
          const keyRaw = trimmed.slice(1, colonIndex).trim();
          const valRaw = trimmed.slice(colonIndex + 1).trim();
          
          // Match key case-insensitively but store with canonical case
          const foundKey = keys.find(k => k.toLowerCase() === keyRaw.toLowerCase());
          if (foundKey) {
            cardData[foundKey] = valRaw || 'unknown';
          }
        }
      }
    }
  }

  // Also extract candidates if available
  cardData['candidateMechanisms'] = cardData['Failure mechanism'] !== 'unknown' ? [cardData['Failure mechanism']] : ['unknown'];
  cardData['confidence'] = cardData['Failure mechanism'] !== 'unknown' ? 'high' : 'unknown';
  cardData['rejectedMechanisms'] = cardData['Why not the alternatives'] !== 'unknown' ? ['unknown'] : ['unknown'];

  return cardData;
}

function classifyArtifact(summary, artifact) {
  const cardData = {};
  
  // Extract dominant witness
  const witness = summary?.topology?.dominantWitness || {};
  const causal = summary?.causal || {};
  const reasons = (witness.reasons || []).concat(causal.stopReasons || []);
  const reasonsStr = reasons.join(' ').toLowerCase();

  const candidateMechanisms = [];
  const rejectedMechanisms = [];

  // Determine candidates based on domain-neutral heuristics
  if (reasonsStr.includes('pending') || reasonsStr.includes('deferred') || reasonsStr.includes('retry') || reasonsStr.includes('wake') || reasonsStr.includes('enqueued')) {
    candidateMechanisms.push('transition_gap');
    candidateMechanisms.push('scheduling_gap');
  }
  if (reasonsStr.includes('timed out') || reasonsStr.includes('timeout') || reasonsStr.includes('budget')) {
    candidateMechanisms.push('budget_gap');
  }
  if (reasonsStr.includes('stale') || reasonsStr.includes('missing') || reasonsStr.includes('unknown') || reasonsStr.includes('stale')) {
    candidateMechanisms.push('observation_gap');
  }
  if (reasonsStr.includes('concurrency') || reasonsStr.includes('race') || reasonsStr.includes('lock') || reasonsStr.includes('starve')) {
    candidateMechanisms.push('concurrency_gap');
  }
  if (reasonsStr.includes('disagree') || reasonsStr.includes('mismatch') || reasonsStr.includes('contract')) {
    candidateMechanisms.push('contract_gap');
  }
  // Emergent-class detection
  if (reasonsStr.includes('oscillat') || reasonsStr.includes('flip') || reasonsStr.includes('toggle') || reasonsStr.includes('alternat')) {
    candidateMechanisms.push('emergent_oscillation');
  }
  if (reasonsStr.includes('amplif') || (reasonsStr.includes('retry') && reasonsStr.includes('increase')) || reasonsStr.includes('positive feedback')) {
    candidateMechanisms.push('feedback_amplification');
  }
  if (reasonsStr.includes('coupled') || reasonsStr.includes('lockstep') || (reasonsStr.match(/invariant/g) || []).length >= 2) {
    candidateMechanisms.push('coupled_invariants');
  }
  // protocol_mismatch: three or more distinct owners mentioned in reasons
  const ownerMatches = reasonsStr.match(/\b\w+_owner\b/g) || [];
  const distinctOwners = new Set(ownerMatches);
  if (distinctOwners.size >= 3 || (reasonsStr.includes('protocol') && reasonsStr.includes('disagree'))) {
    candidateMechanisms.push('protocol_mismatch');
  }

  // Default fallback if no specific heuristics match
  if (candidateMechanisms.length === 0) {
    candidateMechanisms.push('transition_gap');
    candidateMechanisms.push('scheduling_gap');
  }

  // Reject alternatives based on solid evidence
  if (!reasonsStr.includes('missing') && !reasonsStr.includes('stale')) {
    rejectedMechanisms.push('observation_gap');
  }
  if (reasonsStr.includes('pending') || reasonsStr.includes('deferred')) {
    rejectedMechanisms.push('selection_gap');
  }

  cardData['Failure mechanism'] = candidateMechanisms[0];
  cardData['Stable facts'] = [
    `Causal outcome: ${causal.outcome || 'unknown'}`,
    `Dominant witness state: ${witness.frontierState || 'unknown'}`,
    `Stop condition: ${causal.stopCondition || 'unknown'}`,
    reasons.length > 0 ? `Reasons: ${reasons.join(', ')}` : null,
  ].filter(Boolean).join('; ');

  cardData['Changed facts'] = `Dominant failure class: ${causal.dominantFailureClass || 'unknown'}`;
  cardData['Why not the alternatives'] = rejectedMechanisms.length > 0 
    ? `Contradicted by stable facts: ${rejectedMechanisms.join(', ')}`
    : 'unknown';

  cardData['Owner who decides'] = witness.owner || 'unknown';
  cardData['Current code or workflow action'] = witness.dominantReason || 'unknown';

  if (candidateMechanisms.includes('transition_gap') || candidateMechanisms.includes('scheduling_gap')) {
    cardData['Missing transition or missing observation'] = 'A state-machine transition or wake/retry event is missing to progress state.';
  } else {
    cardData['Missing transition or missing observation'] = 'unknown';
  }

  cardData['Smallest falsifying probe'] = summary?.scenario 
    ? `npm test -- test/distributed/scenarios/${summary.scenario}.js`
    : 'unknown';

  cardData['Expected movement'] = 'Reduction or migration of the dominant frontier state.';
  cardData['Negative result means'] = 'Frontier remains stuck on the same unchanged evidence.';
  cardData['Escalation rule'] = 'open/select autonomous architecture experiment if no reduction appears';

  cardData['candidateMechanisms'] = candidateMechanisms;
  cardData['confidence'] = candidateMechanisms.length > 0 ? 'medium' : 'low';
  cardData['rejectedMechanisms'] = rejectedMechanisms.length > 0 ? rejectedMechanisms : ['unknown'];

  return cardData;
}

function renderTextCard(cardData) {
  const keys = [
    'Failure mechanism',
    'Stable facts',
    'Changed facts',
    'Why not the alternatives',
    'Owner who decides',
    'Current code or workflow action',
    'Missing transition or missing observation',
    'Smallest falsifying probe',
    'Expected movement',
    'Negative result means',
    'Escalation rule',
  ];

  const lines = [
    '================================================================================',
    '                                MECHANISM CARD                                  ',
    '================================================================================',
  ];

  for (const key of keys) {
    lines.push(`${key}: ${cardData[key] || 'unknown'}`);
  }

  lines.push('================================================================================');
  lines.push(`Candidate Mechanisms: [${(cardData.candidateMechanisms || []).join(', ')}]`);
  lines.push(`Confidence: ${cardData.confidence || 'unknown'}`);
  lines.push(`Rejected Mechanisms: [${(cardData.rejectedMechanisms || []).join(', ')}]`);
  lines.push('================================================================================');

  return lines.join('\n');
}

function main(argv) {
  const parsedArgs = parseCliArgs(argv.slice(2));
  if (parsedArgs.helpRequested) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return EXIT_SUCCESS;
  }
  if (!parsedArgs.filePath) {
    process.stderr.write(`${HELP_TEXT}\n`);
    return EXIT_USAGE;
  }

  try {
    const resolvedPath = path.resolve(parsedArgs.filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File does not exist: ${parsedArgs.filePath}`);
    }

    const content = fs.readFileSync(resolvedPath, ENCODING_UTF8);
    let cardData;

    if (parsedArgs.filePath.endsWith('.md')) {
      cardData = parseMarkdownCard(content);
    } else if (parsedArgs.filePath.endsWith('.json')) {
      const artifact = JSON.parse(content);
      let summary = null;
      if (buildRepresentativeEvidenceSummary) {
        try {
          summary = buildRepresentativeEvidenceSummary(parsedArgs.filePath, artifact);
        } catch (err) {
          // Keep summary null if build fails
        }
      }
      cardData = classifyArtifact(summary, artifact);
    } else {
      throw new Error(`Unsupported file extension: must be .md (package) or .json (artifact)`);
    }

    const output = parsedArgs.isJsonFormat ?
      JSON.stringify(cardData, null, 2) :
      renderTextCard(cardData);

    process.stdout.write(`${output}\n`);
    return EXIT_SUCCESS;
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    return EXIT_FAILURE;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}

export {
  parseMarkdownCard,
  classifyArtifact,
  renderTextCard,
};
