// The one writer of the typed log line a partition leader's snapshot owners
// (checkpoint cadence, catch-up driver) emit for an outcome that is not
// success. Every such outcome is a line carrying its event, outcome and
// reason; a condition that persists is folded by the shared per-key log
// throttle (first occurrence at once, then one line per window carrying the
// suppressed count), so a standing refusal neither floods nor goes silent.

import {LogThrottle} from '../logging/log-throttle.js';

const KEY_SEPARATOR = '\u0000';

/**
 * @param {Object} options
 * @param {Object} options.service - The owning PartitionService (its logger
 *   and clock are read at each line).
 * @param {string} options.event - The line's `event` field.
 * @param {string} options.message - The line's message.
 * @return {Object} Frozen {report(subject, fields)}.
 */
function createPartitionSnapshotOutcomeLog(options) {
  const {service, event, message} = options;
  const throttle = new LogThrottle({now: () => service.timeSource.now()});
  return Object.freeze({
    /**
     * @param {string} subject - What the outcome is about (the partition,
     *   or one follower's address).
     * @param {Object} fields - {outcome, reason, ...} of the line.
     * @return {boolean} Whether a line was written (false: folded).
     */
    report(subject, fields) {
      const suppressed = throttle.admit(
        [subject, fields.outcome, fields.reason].join(KEY_SEPARATOR));
      if (suppressed === null) {
        return false;
      }
      service.logger.warn(message, {
        event,
        partitionId: service.partitionId,
        ...fields,
        suppressed,
      });
      return true;
    },
  });
}

export {createPartitionSnapshotOutcomeLog};
