// A caller cutoff closes admission. A submitted participant keeps its reply
// until the chunk's existing outer safety deadline. The delivery owner supplies
// the outcome at that bound, including any unresolved earlier delivery.
export function createParallelWriteSettlement(options) {
  const admission = new AbortController();
  const signal = options.signal ?
    AbortSignal.any([options.signal, admission.signal]) : admission.signal;
  const unsubscribe = options.cancellationToken?.onCancel?.((reason) =>
    admission.abort(new Error(reason)));
  let submitted = false;

  return {
    get submitted() { return submitted; },
    get cutoff() { return signal.reason; },
    expire(error) { admission.abort(error); },
    dispose() { unsubscribe?.(); },
    async execute(run, deadline) {
      let finishSubmitted = null;
      const stopped = Promise.withResolvers();
      const onAbort = () => {
        if (!finishSubmitted) stopped.reject(signal.reason);
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, {once: true});
      try {
        const result = signal.aborted ? stopped.promise : run({
          signal,
          onWriteSubmitted(finish) {
            signal.throwIfAborted();
            submitted = true;
            finishSubmitted = finish;
          },
        });
        return await Promise.race([result, stopped.promise, deadline.catch((error) => {
          if (finishSubmitted) return finishSubmitted(error);
          throw error;
        })]);
      } finally {
        signal.removeEventListener('abort', onAbort);
        finishSubmitted = null;
      }
    },
  };
}
