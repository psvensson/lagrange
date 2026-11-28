import {carriesSplitDescriptorIntent, carriesSplitDescriptorReceipt} from
  '../partition/partition-split-descriptor-command.js';

// Transport preserves the destination owner's receipt, including its original
// commit position on replay. An ordinary query carries none of these fields.
function splitDescriptorIntentFields(options) {
  return options && carriesSplitDescriptorIntent(options) ?
    {splitDescriptorIntent: options.splitDescriptorIntent} : {};
}

function splitDescriptorCommitFields(answer) {
  if (!answer || !carriesSplitDescriptorReceipt(answer)) return {};
  const {splitDescriptorReceipt, committed, logIndex, term} = answer;
  return {splitDescriptorReceipt, committed, logIndex, term};
}

// A one-target descriptor command can return the destination's typed refusal.
// Keep the surrounding distributed participant diagnostics with that answer.
function splitDescriptorFailureFields(answer) {
  if (typeof answer?.failureCode !== 'string' || typeof answer.errorCode !== 'string') return {};
  const fields = {};
  for (const key of ['error', 'errorCode', 'failureCode', 'retryable', 'deferRetry']) {
    if (Object.hasOwn(answer, key)) fields[key] = answer[key];
  }
  return fields;
}

export {splitDescriptorCommitFields, splitDescriptorFailureFields, splitDescriptorIntentFields};
