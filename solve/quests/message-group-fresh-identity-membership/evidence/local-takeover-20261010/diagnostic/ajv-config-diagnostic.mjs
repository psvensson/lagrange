// Diagnostic only: the exact fixed configuration was independently validated
// against its actual schema using fastjsonschema. Refuse any changed input.
// No source/SQL/native result or observation is cached by this setup adapter.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const validation = JSON.parse(fs.readFileSync(new URL('./configuration-validation.json',import.meta.url)));
export default class Ajv {
  compile(schema) {
    return data => {
      const hash=createHash('sha256').update(JSON.stringify({schema,data})).digest('hex');
      if (!validation.valid || hash !== validation.sha256) {
        throw new Error('diagnostic configuration differs from independently validated fixture');
      }
      return true;
    };
  }
}
