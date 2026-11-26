// CPU-only real-browser/model benchmark. Run outside socket sandbox; see README.
const {spawn,execFileSync}=require('node:child_process')
const fs=require('node:fs'), fsp=fs.promises, path=require('node:path'), os=require('node:os'), crypto=require('node:crypto')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const {cases,datasets,csvFor,seeds}=require('./suite.cjs')
const root=path.resolve(__dirname,'..'), out=path.resolve(process.env.BENCHMARK_OUT || path.join(root,'artifacts/phase4'))
const binary=process.env.LLAMA_SERVER || path.join(os.homedir(),'llama.cpp/build/bin/llama-server')
const modelRoot=process.env.MODEL_DIR || path.join(os.homedir(),'Models/ReceiptAI')
const models=['Qwen3-1.7B-Q4_K_M.gguf','Qwen3-4B-Q4_K_M.gguf']
const port=Number(process.env.BENCHMARK_PORT || 8081)
const base=`http://127.0.0.1:${port}`
const serverArgs=['--host','127.0.0.1','--port',String(port),'-c','4096','-t','8','-tb','8','-ngl','0','-np','1','--jinja','--reasoning-budget','0']
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const read=p=>{try{return fs.readFileSync(p,'utf8')}catch{return null}}
const save=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2))
function sample(pid){
 const status=read(`/proc/${pid}/status`) || ''
 const stat=read(`/proc/${pid}/stat`)
 const after=stat?.slice(stat.lastIndexOf(')')+2).split(' ')
 return {at:Date.now(),rssKiB:Number(/VmRSS:\s+(\d+)/.exec(status)?.[1]||0),hwmKiB:Number(/VmHWM:\s+(\d+)/.exec(status)?.[1]||0),cpuTicks:after?Number(after[11])+Number(after[12]):null}
}
const cgRelative=(read('/proc/self/cgroup')||'').trim().split('::')[1]
const cg=cgRelative?path.join('/sys/fs/cgroup',cgRelative):null
function groupMemory(){return cg?{currentBytes:Number(read(path.join(cg,'memory.current'))),peakBytes:Number(read(path.join(cg,'memory.peak'))),limitBytes:read(path.join(cg,'memory.max'))?.trim(),swapMax:read(path.join(cg,'memory.swap.max'))?.trim(),events:read(path.join(cg,'memory.events'))}:null}
async function hash(file){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex')}
async function ready(proc){const deadline=Date.now()+120000;while(Date.now()<deadline){if(proc.exitCode!==null)throw Error(`Server exited ${proc.exitCode}`);try{const r=await fetch(base+'/health');if(r.ok)return}catch{}await sleep(200)}throw Error('Server readiness timeout')}
async function stop(proc){if(proc.exitCode!==null)return;proc.kill('SIGTERM');await Promise.race([new Promise(r=>proc.once('exit',r)),sleep(10000)]);if(proc.exitCode===null){proc.kill('SIGKILL');await new Promise(r=>proc.once('exit',r))}}
async function trial(browser,model,test,repeat,serverPid,dir){
 const ctx=await browser.newContext({viewport:{width:1400,height:1100},timezoneId:'America/Detroit',permissions:['clipboard-read','clipboard-write'],colorScheme:'light'})
 const id=`${test.id}-r${repeat}`, responses=[],pending=[],errors=[],requests=[],network=[]
 const page=await ctx.newPage()
 await ctx.addInitScript(()=>{const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-11-22T12:00:00Z']))}static now(){return new NativeDate('2026-11-22T12:00:00Z').getTime()}}})
 let generationCount=0
 await page.route('http://127.0.0.1:8080/**',async route=>{
   const request=route.request();const url=request.url().replace('http://127.0.0.1:8080',base)
   if(url.endsWith('/v1/chat/completions')){
     const body=request.postDataJSON();body.seed=seeds[repeat-1];body.cache_prompt=false
     generationCount++;requests.push({url,body})
     await route.continue({url,postData:JSON.stringify(body)})
   }else await route.continue({url})
 })
 page.on('response',r=>{if(r.url().includes('/v1/chat/completions'))pending.push((async()=>{let body;try{body=await r.json()}catch(error){body={parseError:error.message}}responses.push({status:r.status(),body})})())})
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('requestfailed',r=>network.push({url:r.url(),failure:r.failure()}))
 let started, result={model,id,caseId:test.id,kind:test.kind,dataset:test.dataset,question:test.question,repeat,seed:seeds[repeat-1]}
 try{
   await page.goto('http://localhost:5173')
   if(await page.evaluate(()=>localStorage.length)!==0)throw Error('Context was not isolated')
   await page.locator('input[type=file]').setInputFiles({name:test.dataset+'.csv',mimeType:'text/csv',buffer:Buffer.from(csvFor(test.dataset))})
   await page.getByRole('button',{name:'Confirm Import',exact:true}).click()
   await page.getByRole('button',{name:'AI Advisor',exact:true}).click()
   await page.getByText(/Local model ready:/).waitFor({timeout:30000})
   await page.getByLabel('Your question',{exact:true}).fill(test.question)
   const before=sample(serverPid), groupBefore=groupMemory()
   started=performance.now()
   await page.getByRole('button',{name:'Ask Advisor',exact:true}).click()
   const card=page.locator('.ai-advisor > .card').nth(1)
   await card.waitFor({timeout:140000})
   result.appLatencyMs=performance.now()-started
   result.serverBefore=before;result.serverAfter=sample(serverPid);result.groupBefore=groupBefore;result.groupAfter=groupMemory()
   await page.getByRole('button',{name:'Ask Advisor',exact:true}).waitFor({timeout:10000})
   await card.getByRole('button',{name:'Copy report',exact:true}).click()
   await card.getByRole('status').filter({hasText:'Report copied.'}).waitFor()
   result.report=await page.evaluate(()=>navigator.clipboard.readText())
   result.explanation=(await card.locator('.advisor-markdown').allInnerTexts()).join('\n')
   result.generationCalls=generationCount
   result.status=/AI explanation: (\w+)/.exec(result.report)?.[1] || 'not_requested'
   result.attemptReasons=[...result.report.matchAll(/^- Attempt \d+: (.+)$/gm)].map(m=>m[1])
   result.expectedChecks=test.expected?.map(text=>({text,passed:result.report.toLowerCase().includes(text.toLowerCase())})) || []
   result.routingPassed=test.kind==='model'?generationCount>0:generationCount===0
   for(const d of await card.locator('details').all())await d.evaluate(el=>{el.open=true})
   if(repeat===1 || result.status!=='checked' && test.kind==='model')await card.screenshot({path:path.join(dir,id+'.png')})
 }catch(error){result.error=error.stack;result.appLatencyMs=started?performance.now()-started:null}
 finally{await Promise.allSettled(pending);result.responses=responses;result.requests=requests;result.consoleErrors=errors;result.networkFailures=network;await ctx.close()}
 save(path.join(dir,id+'.json'),result)
 fs.appendFileSync(path.join(out,'trials.jsonl'),JSON.stringify(result)+'\n')
 console.log(`${model} ${id} ${result.status || 'ERROR'} calls=${generationCount} latency=${Math.round(result.appLatencyMs||0)}ms ${result.error||''}`)
 return result
}
async function main(){
 await fsp.mkdir(out,{recursive:true});await fsp.mkdir(path.join(out,'fixtures'),{recursive:true})
 for(const name of Object.keys(datasets))await fsp.writeFile(path.join(out,'fixtures',name+'.csv'),csvFor(name))
 save(path.join(out,'suite.json'),{cases,seeds,datasets})
 const occupied=await fetch(base+'/health').then(()=>true).catch(()=>false);if(occupied)throw Error(`Port ${port} already occupied; refusing to stop an unknown process`)
 const manifest={startedAt:new Date().toISOString(),serverArgs,binary,node:process.version,platform:os.platform(),release:os.release(),cpu:os.cpus()[0],logicalCPUs:os.cpus().length,totalMemoryBytes:os.totalmem(),meminfo:read('/proc/meminfo'),cgroup:groupMemory(),llamaVersion:execFileSync(binary,['--version'],{encoding:'utf8'}),hashes:{},clockTicks:Number(execFileSync('getconf',['CLK_TCK'],{encoding:'utf8'})),notes:'Sequential models, CPU-only; cache_prompt=false. App endpoints routed only in isolated browser to benchmark loopback port. Seeds vary by repeat. File hashes warm page cache; load time is not cold-disk time.'}
 for(const model of models)manifest.hashes[model]=await hash(path.join(modelRoot,model))
 save(path.join(out,'manifest.json'),manifest)
 for(const model of models){
   const dir=path.join(out,model.replace('.gguf',''));await fsp.mkdir(dir,{recursive:true})
   const log=fs.openSync(path.join(dir,'server.log'),'w'),loadStart=performance.now()
   const proc=spawn(binary,['-m',path.join(modelRoot,model),...serverArgs],{stdio:['ignore',log,log]});fs.closeSync(log)
   const samples=[];const sampling=setInterval(()=>samples.push({...sample(proc.pid),group:groupMemory()}),500)
   let browser;const info={model,pid:proc.pid,args:['-m',path.join(modelRoot,model),...serverArgs]}
   try{
     await ready(proc);info.loadMs=performance.now()-loadStart;info.groupAtReady=groupMemory();info.sampleAtReady=sample(proc.pid)
     const props=await fetch(base+'/props').then(r=>r.json());info.props={model_path:props.model_path,total_slots:props.total_slots,default_generation_settings:props.default_generation_settings}
     browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{})})
     // Common fixed order, three independently seeded repetitions of every model case.
     for(let repeat=1;repeat<=3;repeat++)for(const test of cases.filter(t=>t.kind==='model'))await trial(browser,model,test,repeat,proc.pid,dir)
     for(const test of cases.filter(t=>t.kind==='deterministic'))await trial(browser,model,test,1,proc.pid,dir)
   }catch(error){info.error=error.stack;console.error(info.error)}
   finally{
     if(browser)await browser.close();info.finalSample=sample(proc.pid);info.groupAtEnd=groupMemory();clearInterval(sampling);await stop(proc);info.exitCode=proc.exitCode;info.samples=samples;save(path.join(dir,'server-metrics.json'),info)
   }
 }
 save(path.join(out,'finished.json'),{finishedAt:new Date().toISOString(),group:groupMemory()})
}
main().catch(e=>{console.error(e);process.exitCode=1})
