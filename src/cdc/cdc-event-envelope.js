import {CDC_EVENT_IDENTITY} from '../constants/cdc-lifecycle-constants.js';
import {buildEventIdentity} from '../partition/cdc-event-buffer.js';

const CDC_METADATA_FIELDS = Object.freeze([
  'timestamp', 'sourcePartition', 'sourceReplica', 'eventKey', 'entryId',
  'sourceLogIndex', 'sourceOrdinal', 'sourceScope', 'causeId', 'replayOnly',
]);

// Forward the producer's envelope. A durable event cannot acquire a new
// identity or timestamp when crossing a transport/normalization boundary.
function copyCdcEventMetadata(event) {
  if (Object.hasOwn(event, 'eventKey')) {
    buildEventIdentity(event);
    if (typeof event.timestamp !== 'string' || event.timestamp.length === 0) {
      throw Object.assign(new Error(CDC_EVENT_IDENTITY.INVALID_MESSAGE),
        {code: CDC_EVENT_IDENTITY.INVALID_CODE});
    }
  }
  const metadata = {};
  for (const field of CDC_METADATA_FIELDS) {
    if (Object.hasOwn(event, field)) metadata[field] = event[field];
  }
  return metadata;
}

function copyCdcEvent(event) {
  return {
    tableName: event.tableName,
    operation: event.operation,
    data: event.data,
    ...copyCdcEventMetadata(event),
  };
}

export {copyCdcEvent, copyCdcEventMetadata};
