const fs=require("fs");
const load=p=>fs.existsSync(p)?fs.readFileSync(p,"utf8").trim().split("\n").filter(Boolean).map(JSON.parse):[];
const [cur,...refs]=process.argv.slice(2);
const R=refs.map(p=>{const [n,f]=p.split("=");return [n,new Map(load(f).map(r=>[r.file,r]))];});
const c=load(cur); let pass=0, fail=0;
for (const r of c){ if(r.ok){pass++; for(const [n,m] of R){const x=m.get(r.file); if(x && !x.ok) console.log(`CURED-vs-${n} ${r.file} a=${r.assertions} (was ${x.firstFailureLine?.slice(0,90)})`);} continue;}
 fail++; let s=`FAIL ${r.file} a=${r.assertions} :: ${(r.firstFailureLine||"").slice(0,120)}`;
 for(const [n,m] of R){const x=m.get(r.file); if(x) s+=`\n     ${n}: ${x.ok?"ok":"FAIL"} a=${x.assertions} ${x.ok?"":(x.firstFailureLine===r.firstFailureLine?"IDENTICAL":":: "+(x.firstFailureLine||"").slice(0,110))}`;}
 console.log(s);}
console.log("pass",pass,"fail",fail);
