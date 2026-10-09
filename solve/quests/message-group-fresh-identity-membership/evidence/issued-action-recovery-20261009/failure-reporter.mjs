// Machine-readable node:test events alongside the ordinary TAP artifact.
function errorRecord(error) {
  if (!error) return null;
  return {name: error.name, code: error.code, message: error.message,
    failureType: error.failureType, cause: errorRecord(error.cause)};
}
export default async function* report(source) {
  for await (const event of source) {
    if (!['test:pass', 'test:fail', 'test:summary'].includes(event.type)) continue;
    const {name, file, nesting, skip, todo, details, counts, success} = event.data;
    yield JSON.stringify({type: event.type, name, file, nesting, skip, todo,
      error: errorRecord(details?.error), counts, success}) + '\n';
  }
}
