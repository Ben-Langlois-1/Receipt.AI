const fs=require('node:fs'),path=require('node:path')
const {cases,seeds}=require('./suite.cjs')
const average=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null
const median=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y);return b.length%2?b[(b.length-1)/2]:(b[b.length/2-1]+b[b.length/2])/2}
function audit(text,test){
 const prose=text.replace(/<think>[\s\S]*?<\/think>/gi,'').replace(/^\s*\d+[.)]\s+/gm,'')
 const issues=[]
 if(/[\d$€£%]/.test(prose))issues.push('numeric_or_date_claim_requires_review')
 if(/\b(?:will|guaranteed to|can) save\b|\bincome is (?:steady|verified|established)|\byour balance is\b|\byou can afford\b/i.test(prose))issues.push('unsupported_financial_outcome_or_state')
 if(test.protected){
   const topic=test.protected==='Housing'?'housing|rent|mortgage|downsizing':'transport|commut|travel costs'
   const statements=prose.replace(/[*_]/g,'').replace(/\b(Transport|Housing)\s*\n+\s*/gi,'$1: ').split(/\n\s*\n|\n(?=-\s)/)
   if(statements.some(s=>new RegExp(topic,'i').test(s)&&/\b(reduce|cut|lower|combine|compare|cheaper|relocat|cancel)\b/i.test(s)&&!/unchanged|do not|don't|not reduc|not chang|keep.*fixed/i.test(s)))issues.push('possible_constraint_conflict')
 }
 return issues
}
function provisionalQuality(text,test){
 if(!text)return {safety:0,constraint:0,specificity:0,fit:0,coverage:0,polish:0,total:0,method:'lexical_proxy_not_ground_truth'}
 const issues=audit(text,test)
 const categoryCount=test.required.filter(c=>text.toLowerCase().includes(c.toLowerCase())).length
 const actions=(text.match(/pantry|shopping list|plan meals|bring lunch|restaurant visits|correct category|underlying transactions|still used|before.*cancell|combine trips|travel options/gi)||[]).length
 const safety=issues.some(i=>i!=='possible_constraint_conflict')?0:4
 const constraint=issues.includes('possible_constraint_conflict')?0:4
 const specificity=categoryCount>=3&&actions>=3?4:categoryCount>=2&&actions>=2?3:actions?2:1
 let fit=categoryCount===test.required.length?4:categoryCount?2:1
 if(test.special==='income_uncertainty'&&!/inflows?|credits?|refund|reimburse|deposits?|income|salary/i.test(text))fit=Math.min(fit,2)
 if(test.special==='subscription_uncertainty'&&!/not prove|not assume|not necessarily|whether|if.*(?:used|active)/i.test(text))fit=Math.min(fit,2)
 const coverage=/unverified|incomplete|missing|unknown coverage/i.test(text)?2:0
 const polish=/offer a practical|suggest checking|as an ai|<think>/i.test(text)?0:2
 return {safety,constraint,specificity,fit,coverage,polish,total:safety+constraint+specificity+fit+coverage+polish,method:'lexical_proxy_not_ground_truth'}
}
function summarize(directory){
 const trials=fs.readFileSync(path.join(directory,'trials.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'))
 const clockTicks=manifest.clockTicks
 const models=Object.keys(manifest.hashes)
 const plannedTrials=cases.filter(c=>c.kind==='model').length*seeds.length
 const reviewsPath=path.join(directory,'reviews.json'), reviews=fs.existsSync(reviewsPath)?JSON.parse(fs.readFileSync(reviewsPath,'utf8')):{}
 const rawReviewPath=path.join(directory,'raw-reviews.json'),rawReviews=fs.existsSync(rawReviewPath)?JSON.parse(fs.readFileSync(rawReviewPath,'utf8')):[]
 const summaries=[],details=[]
 for(const model of models){
   const all=trials.filter(t=>t.model===model),gen=all.filter(t=>t.kind==='model'),det=all.filter(t=>t.kind==='deterministic')
   const raw=gen.flatMap(t=>t.responses.map((r,i)=>({trial:t.id,attempt:i+1,text:r.body.choices?.[0]?.message?.content||'',timings:r.body.timings,usage:r.body.usage,status:r.status})))
   for(const t of gen){const test=cases.find(c=>c.id===t.caseId);const key=model+'/'+t.id;details.push({key,status:t.status,appLatencyMs:t.appLatencyMs,rawAudits:t.responses.map((r,i)=>({attempt:i+1,issues:audit(r.body.choices?.[0]?.message?.content||'',test)})),displayedAudit:t.status==='checked'?audit(t.explanation,test):[],proxy:provisionalQuality(t.status==='checked'?t.explanation:'',test),review:reviews[key]||null})}
   const judged=details.filter(d=>d.key.startsWith(model+'/'))
   const metrics=JSON.parse(fs.readFileSync(path.join(directory,model.replace('.gguf',''),'server-metrics.json'),'utf8'))
   const samples=metrics.samples||[],peakRSSKiB=Math.max(0,...samples.map(s=>s.rssKiB||0),metrics.finalSample?.hwmKiB||0)
   const cpuSeconds=gen.map(t=>t.serverBefore&&t.serverAfter?(t.serverAfter.cpuTicks-t.serverBefore.cpuTicks)/clockTicks:null).filter(x=>x!==null)
   const latency=gen.map(t=>t.appLatencyMs).filter(Number.isFinite)
   const speed=raw.map(r=>r.timings?.predicted_per_second).filter(Number.isFinite)
   const predicted=raw.reduce((sum,r)=>sum+(r.timings?.predicted_n||0),0),duration=raw.reduce((sum,r)=>sum+(r.timings?.predicted_ms||0),0)
   const firstPass=gen.filter(t=>t.attemptReasons?.[0]==='accepted').length,accepted=gen.filter(t=>t.status==='checked').length
   summaries.push({model,plannedModelTrials:plannedTrials,missingModelTrials:plannedTrials-gen.length,modelTrials:gen.length,rawGenerations:raw.length,firstPassAccepted:firstPass,firstPassRate:firstPass/plannedTrials,acceptedAfterRetry:gen.filter(t=>t.status==='checked'&&t.generationCalls>1).length,finalAccepted:accepted,finalAcceptanceRate:accepted/plannedTrials,withheld:gen.filter(t=>t.status==='withheld').length,unavailableOrError:gen.filter(t=>t.status==='unavailable'||t.error).length,finalFallbackRate:(plannedTrials-accepted)/plannedTrials,
     latencyMs:{mean:average(latency),median:median(latency),minimum:latency.length?Math.min(...latency):null,maximum:latency.length?Math.max(...latency):null},tokensPerSecond:{mean:average(speed),median:median(speed),aggregate:duration?predicted/(duration/1000):null},loadMs:metrics.loadMs,peakServerRSSKiB:peakRSSKiB,peakGroupBytes:Math.max(0,...samples.map(s=>s.group?.currentBytes||0)),cpuSecondsPerModelQuestion:average(cpuSeconds),cpuCoresBusyMean:average(gen.filter(t=>t.serverBefore&&t.serverAfter).map(t=>(t.serverAfter.cpuTicks-t.serverBefore.cpuTicks)/clockTicks/(t.appLatencyMs/1000))),
     flaggedRawAttempts:judged.reduce((n,d)=>n+d.rawAudits.filter(a=>a.issues.length).length,0),flaggedDisplayedAnswers:judged.filter(d=>d.displayedAudit.length).length,proxyQualityMean:average(judged.map(d=>d.proxy.total)),manualQualityMean:average(judged.map(d=>d.review?.total).filter(Number.isFinite)),reviewedAnswers:judged.filter(d=>d.review).length,acceptedOnlyManualQualityMean:average(judged.filter(d=>d.status==='checked').map(d=>d.review?.total).filter(Number.isFinite)),reviewedRawAttempts:rawReviews.filter(r=>r.model===model).length,reviewedNumericFabrications:rawReviews.filter(r=>r.model===model&&r.fabricatedFinancialAmountOrBalance).length,reviewedRawConstraintViolations:rawReviews.filter(r=>r.model===model&&r.constraintViolation).length,reviewedDisplayedConstraintViolations:rawReviews.filter(r=>r.model===model&&r.constraintViolation&&r.displayed).length,reviewedConceptualCreditErrors:rawReviews.filter(r=>r.model===model&&r.conceptualCreditClassificationError).length,
     deterministic:{trials:det.length,passed:det.filter(t=>t.routingPassed&&t.expectedChecks.every(c=>c.passed)&&!t.error).length,modelCredit:false},loadError:metrics.error||null,infrastructureErrors:all.filter(t=>t.error).map(t=>({id:t.id,error:t.error})),cgroupEnd:metrics.groupAtEnd})
 }
 const perCase=[]
 for(const model of models)for(const test of cases){
   const selected=trials.filter(t=>t.model===model&&t.caseId===test.id)
   const latencies=selected.map(t=>t.appLatencyMs).filter(Number.isFinite)
   perCase.push({model,caseId:test.id,kind:test.kind,trials:selected.length,firstPassAccepted:selected.filter(t=>t.attemptReasons?.[0]==='accepted').length,finalAccepted:selected.filter(t=>t.status==='checked').length,statuses:selected.map(t=>t.status||'error'),uniqueDisplayedExplanations:new Set(selected.filter(t=>t.status==='checked').map(t=>t.explanation)).size,latencyMs:{mean:average(latencies),median:median(latencies),min:latencies.length?Math.min(...latencies):null,max:latencies.length?Math.max(...latencies):null}})
 }
 const result={summaries,details,perCase};fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(result,null,2));return result
}
if(require.main===module){const result=summarize(path.resolve(process.argv[2]||path.join(__dirname,'../artifacts/phase4')));console.log(JSON.stringify(result.summaries,null,2))}
module.exports={average,median,audit,provisionalQuality,summarize}
