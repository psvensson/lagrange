// Observation-only Node test reporter: retain actual per-test outcomes.
// Stdout containing a test name is not a failure event or assertion receipt.
export default async function* report(events) {
  for await (const {type, data} of events) {
    if (type === 'test:pass' || type === 'test:fail') {
      const error = data.details?.error;
      yield JSON.stringify({type, name: data.name, file: data.file,
        nesting: data.nesting, testNumber: data.testNumber,
        durationMs: data.details?.duration_ms, skip: data.skip === true,
        todo: data.todo === true, failureType: error?.failureType,
        errorCode: error?.code, assertionCode: error?.cause?.code,
        assertionMessage: error?.cause?.message, message: error?.message}) + '\n';
    } else if (type === 'test:summary') {
      yield JSON.stringify({type, file: data.file ?? null,
        success: data.success, counts: data.counts, durationMs: data.duration_ms}) + '\n';
    } else if (['test:diagnostic', 'test:stdout', 'test:stderr'].includes(type)) {
      yield JSON.stringify({type, ...data}) + '\n';
    }
  }
}
