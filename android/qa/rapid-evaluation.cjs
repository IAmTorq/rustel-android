const qa=require('./regression-context.cjs'),d=require('./device.cjs'),o=require('./observation.cjs'),fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
(async()=>{const {browser,page}=await d.connect();let result;
try{
 const score=i=>'// public rapid-edit probe '+i+'\nstack(note("c3 e3 g3 c4").s("triangle").gain('+(.015+i*.0001).toFixed(4)+'),s("sine!4").note("c2").gain(.01),note("e4 g4").s("sawtooth").gain(.005))';
 await d.source(page,score(0));await d.key(page,'F5');const before=await o.playing(page,hash(score(0)));
 for(let i=1;i<=16;i++){await d.source(page,score(i));await d.key(page,'F5');}
 const final=await o.playing(page,hash(score(16)));await page.waitForTimeout(2500);const settled=o.snapshot();
 assert.strictEqual(settled.source_revision,hash(score(16)));assert.strictEqual(settled.session_generation,settled.confirmed_audio_generation);assert(settled.playing&&!settled.evaluating&&!settled.visible_error&&settled.callbacks>before.callbacks&&settled.allocator_tripwire_armed);
 result={date:new Date().toISOString().slice(0,10),dateBasis:'UTC',apkSha256:qa.digest,edits:16,finalSourceConfirmed:true,noStaleSourceAfterSettling:true,callbacksAdvance:true,newXruns:settled.callback_xruns-before.callback_xruns,newLateEvents:settled.late_events-before.late_events,newCallbackAllocations:settled.callback_allocations-before.callback_allocations,limits:['Three native instruments; normal bridge source helper waits 200 ms per edit.','This does not prove in-flight cancellation: some evaluations can finish before the next edit.','No acoustic listening or pixel/input-latency judgment.']};assert(!result.newXruns&&!result.newLateEvents&&!result.newCallbackAllocations);result.complete=true;
}finally{await d.key(page,'F8').catch(()=>{});await d.source(page,fs.readFileSync(path.join(__dirname,'readability-hydra.strudel'),'utf8')).catch(()=>{});await browser.close();}
fs.writeFileSync(qa.result('rapid-evaluation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));})().catch(e=>{console.error(e);process.exit(1)});
