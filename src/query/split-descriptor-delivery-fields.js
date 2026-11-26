// Transport preserves the destination owner's receipt, including its original
// commit position on replay. An ordinary query carries none of these fields.
function splitDescriptorIntentFields(options) {
  return options && Object.hasOwn(options, 'splitDescriptorIntent') ?
    {splitDescriptorIntent: options.splitDescriptorIntent} : {};
}

function splitDescriptorCommitFields(answer) {
  if (!answer || !Object.hasOwn(answer, 'splitDescriptorReceipt')) return {};
  const {splitDescriptorReceipt, committed, logIndex, term} = answer;
  return {splitDescriptorReceipt, committed, logIndex, term};
}

export {splitDescriptorCommitFields, splitDescriptorIntentFields};
