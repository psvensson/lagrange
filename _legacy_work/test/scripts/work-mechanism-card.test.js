import tap from 'tap';
import { parseMarkdownCard, classifyArtifact, renderTextCard } from '../../scripts/work-mechanism-card.js';

tap.test('work-mechanism-card unit tests', async (t) => {
  t.test('parseMarkdownCard parses valid package markdown with mechanism card', (t) => {
    const markdown = `
# Title
## Mechanism Card
- Failure mechanism: transition_gap
- Stable facts: none
- Changed facts: outcome
- Why not the alternatives: observation_gap
- Owner who decides: workflow_tooling_owner
- Current code or workflow action: do nothing
- Missing transition or missing observation: a transition
- Smallest falsifying probe: npm test
- Expected movement: state changes
- Negative result means: stuck
- Escalation rule: human
`;
    const card = parseMarkdownCard(markdown);
    t.equal(card['Failure mechanism'], 'transition_gap');
    t.equal(card['Stable facts'], 'none');
    t.equal(card['Changed facts'], 'outcome');
    t.equal(card['Why not the alternatives'], 'observation_gap');
    t.equal(card['Owner who decides'], 'workflow_tooling_owner');
    t.equal(card['Current code or workflow action'], 'do nothing');
    t.equal(card['Missing transition or missing observation'], 'a transition');
    t.equal(card['Smallest falsifying probe'], 'npm test');
    t.equal(card['Expected movement'], 'state changes');
    t.equal(card['Negative result means'], 'stuck');
    t.equal(card['Escalation rule'], 'human');
    t.end();
  });

  t.test('classifyArtifact classifies artifact with reasons properly', (t) => {
    const summary = {
      scenario: 'rolling-restart',
      topology: {
        dominantWitness: {
          owner: 'rolling_restart_owner',
          boundary: 'active_gate',
          frontierState: 'owner_reconcile_pending',
          dominantReason: 'write_deferred',
          reasons: ['reconcile pending', 'retry after timeout']
        }
      },
      causal: {
        outcome: 'failed',
        dominantFailureClass: 'active_gate_timed_out',
        stopCondition: 'timeout',
        stopReasons: []
      }
    };
    const card = classifyArtifact(summary, {});
    t.equal(card['Failure mechanism'], 'transition_gap');
    t.equal(card['Owner who decides'], 'rolling_restart_owner');
    t.equal(card['Current code or workflow action'], 'write_deferred');
    t.match(card['Stable facts'], 'owner_reconcile_pending');
    t.match(card['Why not the alternatives'], 'observation_gap');
    t.equal(card['Escalation rule'], 'open/select autonomous architecture experiment if no reduction appears');
    t.end();
  });

  t.test('renderTextCard produces expected formatting', (t) => {
    const card = {
      'Failure mechanism': 'transition_gap',
      'Stable facts': 'invariants',
      'Changed facts': 'metrics',
      'Why not the alternatives': 'none',
      'Owner who decides': 'owner',
      'Current code or workflow action': 'action',
      'Missing transition or missing observation': 'transition',
      'Smallest falsifying probe': 'test',
      'Expected movement': 'movement',
      'Negative result means': 'stuck',
      'Escalation rule': 'rule',
      candidateMechanisms: ['transition_gap'],
      confidence: 'medium',
      rejectedMechanisms: ['observation_gap']
    };
    const rendered = renderTextCard(card);
    t.match(rendered, 'Failure mechanism: transition_gap');
    t.match(rendered, 'Candidate Mechanisms: [transition_gap]');
    t.match(rendered, 'Confidence: medium');
    t.end();
  });
});
