const qa=require('./regression-context.cjs'),d=require('./device.cjs'),o=require('./observation.cjs'),fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert');
const label=process.argv[3]||'sample-controls-live';assert(/^[a-z0-9-]+$/.test(label),'Expected a plain result label');
const input=fs.readFileSync(process.argv[2]||path.join(__dirname,'generated/sample-control-cases.json')),cases=JSON.parse(input),run=JSON.parse(fs.readFileSync(qa.result('offline-cases-run.json'),'utf8'));
assert(run.complete&&run.apkSha256===qa.digest&&run.casesSha256===crypto.createHash('sha256').update(input).digest('hex'),'Run these exact cases in the installed offline worker first');
const offline=fs.readFileSync(qa.result('offline-cases-device.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.deepStrictEqual(offline.map(row=>row.case),cases.map(row=>row.case));assert(offline.every(row=>row.status==='measured'));
(async()=>{const {browser,page}=await d.connect();const results=[];let complete=false;
try{
 for(let index=0;index<cases.length;index++){
  const item=cases[index],expectedSignal=offline[index].audible!==null;
  // Offline rendering returns silence for these ranges; live replacement
  // deliberately refuses them and retains the last-good graph on desktop too.
  if(['sample-control-empty-range','sample-control-reversed-range'].includes(item.case)){
   const before=await o.playing(page);await d.source(page,item.source);await d.key(page,'F5');let after,refused=false;
   for(let i=0;i<40;i++){await page.waitForTimeout(200);after=o.snapshot();const message=String(after.visible_error||'')+' '+(await d.rows(page)).join(' ');if(message.includes('ends before it starts')){refused=true;break;}}
   assert(refused,item.case+' did not explain the invalid range');await page.waitForTimeout(1200);after=o.snapshot();assert(after.playing&&after.callbacks>before.callbacks&&after.allocator_tripwire_armed);assert.strictEqual(after.source_revision,before.source_revision);assert.strictEqual(after.confirmed_audio_generation,before.confirmed_audio_generation);
   const result={case:item.case,outcome:'refused-invalid-range',clearErrorVisible:true,lastGoodSourceAndGenerationRetained:true,callbacksAdvance:true,newXruns:after.callback_xruns-before.callback_xruns,newLateEvents:after.late_events-before.late_events,newCallbackAllocations:after.callback_allocations-before.callback_allocations};assert(!result.newXruns&&!result.newLateEvents&&!result.newCallbackAllocations);results.push(result);console.log(JSON.stringify(result));
   // Clear the visible refusal using the known-valid middle-range score.
   await d.source(page,cases[6].source);await d.key(page,'F5');
   await o.playing(page);continue;
  }
  await d.source(page,item.source);await d.key(page,'F5');const before=await o.playing(page,crypto.createHash('sha256').update(item.source).digest('hex'));
  // The footer reports a held peak (1200 ms hold, then 24 dB/s fall), not
  // instantaneous audio. Allow it to clear before judging a silent score.
  await page.waitForTimeout(expectedSignal?2200:4500);const peaks=await page.evaluate(async()=>{const values=[],timer=setInterval(()=>{const row=term.buffer.active.getLine(term.buffer.active.baseY+term.rows-1)?.translateToString(true)||'',match=row.match(/pk\s*(-?\d+(?:\.\d+)?)/);if(match)values.push(Number(match[1]));},16);try{await new Promise(resolve=>setTimeout(resolve,3000));return values;}finally{clearInterval(timer);}});
  const rows=await d.rows(page);assert(!rows.slice(0,3).some(row=>/sound.*failed|failed.*sound/i.test(row)),item.case+' sample failure');const after=o.snapshot();assert(after.playing&&!after.visible_error&&after.callbacks>before.callbacks&&after.allocator_tripwire_armed);assert.strictEqual(after.source_revision,before.source_revision);
  const peak=peaks.length?Math.max(...peaks):null;if(expectedSignal)assert(peaks.length>5&&peak>-59.9&&peak<0,'Expected digital signal: '+item.case);else assert(after.master_peak_db<=-59.9&&(peak===null||peak<=-59.9),'Expected silence: '+item.case);
  const result={case:item.case,expectedSignal,sourceRevision:after.source_revision,uiMeterObservations:peaks.length,maximumUiPeakDb:peak,finalTelemetryPeakDb:after.master_peak_db,newXruns:after.callback_xruns-before.callback_xruns,newLateEvents:after.late_events-before.late_events,newCallbackAllocations:after.callback_allocations-before.callback_allocations};assert(!result.newXruns&&!result.newLateEvents&&!result.newCallbackAllocations,item.case);results.push(result);console.log(JSON.stringify(result));
 }
 complete=true;
}finally{await d.key(page,'F8').catch(()=>{});await d.source(page,fs.readFileSync(path.join(__dirname,'readability-hydra.strudel'),'utf8')).catch(()=>{});await browser.close();fs.writeFileSync(qa.result(label+'.json'),JSON.stringify({date:new Date().toISOString().slice(0,10),dateBasis:'UTC',apkSha256:qa.digest,casesSha256:run.casesSha256,complete,cases:results,limits:['Short live checks with default cached samples and the current app audio settings; not acoustic judgments or endurance.','Expected digital signal/silence is derived from the matching offline cases; full waveform equality is checked separately.','Startup before consumer generation confirmation is outside the recorded callback interval.']},null,2));}
assert(complete);
})().catch(error=>{console.error(error);process.exit(1)});
