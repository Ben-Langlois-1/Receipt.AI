// Groups identical real outputs for review; does not assign subjective scores.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const directory=path.resolve(process.argv[2]||path.join(__dirname,'../artifacts/phase4'))
const trials=fs.readFileSync(path.join(directory,'trials.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
const groups=new Map()
for(const t of trials.filter(t=>t.kind==='model'))for(const [index,r] of t.responses.entries()){
 const text=r.body.choices?.[0]?.message?.content || ''
 const hash=crypto.createHash('sha256').update(text).digest('hex').slice(0,12)
 if(!groups.has(hash))groups.set(hash,{hash,text,appearances:[]})
 groups.get(hash).appearances.push({key:t.model+'/'+t.id,caseId:t.caseId,attempt:index+1,displayed:t.status==='checked'&&index===t.responses.length-1,reasons:t.attemptReasons?.[index]})
}
fs.writeFileSync(path.join(directory,'review-groups.json'),JSON.stringify([...groups.values()],null,2))
console.log(`${trials.length} trials, ${groups.size} unique raw outputs grouped for review`)
