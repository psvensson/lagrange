// Deterministic evidence harness for the MessageRouter/formation-attribution
// interaction Quest. Every receipt re-runs the production-path interaction
// witness; the tracked receipt is therefore derived from executable proof.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const QUEST_ID = 'formation-transport-message-attribution-interaction';
const TEST_FILE =
  'test/transport/message-router-formation-attribution-interaction.test.js';

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'owner-interaction-contract-registered',
    testFile: TEST_FILE,
    detail: 'the protected coupled-pair registry binds inbound router ' +
      'behavior and formation mapping/accounting to one typed contract and ' +
      'this exact witness',
  }),
  Object.freeze({
    id: 'incoming-socket-production-dispatch',
    testFile: TEST_FILE,
    detail: 'an asynchronous inbound resource enters the real listener ' +
      'installed by handleIncomingConnection before reaching handleMessage',
  }),
  Object.freeze({
    id: 'service-message-ack-before-handler-and-async-continuation',
    testFile: TEST_FILE,
    detail: 'service requests retain ACK-before-handler ordering, no-handler ' +
      'responses, rejected-handler responses, and inherited async ownership',
  }),
  Object.freeze({
    id: 'control-and-response-branches',
    testFile: TEST_FILE,
    detail: 'PING, PONG, ACK, live and retired SERVICE_RESPONSE, and ' +
      'incomplete IDENTIFY execute through their production branches',
  }),
  Object.freeze({
    id: 'malformed-and-unknown-behavior',
    testFile: TEST_FILE,
    detail: 'unknown messages retain their warning and malformed input ' +
      'retains its error log and propagated SyntaxError under transport_message',
  }),
  Object.freeze({
    id: 'exclusive-partition-and-inactive-equivalence',
    testFile: TEST_FILE,
    detail: 'transport and nested readiness durations partition injected ' +
      'time without overlap, while current and reverted mappings have ' +
      'identical normalized behavior when attribution is inactive',
  }),
  Object.freeze({
    id: 'interaction-red-on-revert',
    testFile: TEST_FILE,
    detail: 'a module-loader control removes only the transport_message ' +
      'mapping, preserves production effects, and moves the measured work to ' +
      'unattributed so the named owner claim becomes red',
  }),
]);

const OUTPUT_FILE = path.join(
  'solve',
  'quests',
  QUEST_ID,
  'evidence',
  'receipt.json',
);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE,
  receipts: RECEIPTS,
});
