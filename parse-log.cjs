const fs = require('fs');
const ls = fs.readFileSync(process.argv[2], 'utf8').split('\n');
ls.forEach(l => {
  if (!l.trim()) return;
  try {
     const p = JSON.parse(l);
     console.log(p.time, p.subsystem, p.msg);
  } catch(e) {}
});
