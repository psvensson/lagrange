// Diagnostic output sink only. No runtime/application/authorization code replaced.
const sink = Object.freeze(Object.fromEntries(['trace', 'debug', 'info', 'warn', 'error', 'fatal']
  .map((level) => [level, (...args) => {
    if (level === 'error' || level === 'fatal') {
      console.error('diagnostic-log', level, ...args);
    }
  }])));
export class LoggingService {
  static getInstance() { return new LoggingService(); }
  forSubsystem() { return sink; }
}
// The shared fixture initializes and resets only the logging-output owner.
LoggingService.resetInstance = () => {};
LoggingService.prototype.isInitialized = () => true;
LoggingService.prototype.initialize = () => {};
