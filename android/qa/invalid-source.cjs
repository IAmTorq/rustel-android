// Refused edits must leave the accepted graph playing, then accept a correction.
const qa=require('./regression-context.cjs'),d=require('./device.cjs'),o=require('./observation.cjs');
const fs=require('fs'),crypto=require('crypto'),assert=require('assert');
const baseline='note("c3 e3 g3").s("triangle").gain(.04)';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const cases=[['incomplete-javascript','note("c3"'],['undefined-function','qa_missing_function_8721()'],
 ['explicit-exception','throw new Error("QA_EXPECTED_EXCEPTION")'],
 ['malformed-mini','note("[c3 e3").s("sine").gain(.03)']];
(async()=>{const{browser,page}=await d.connect(),rows=[];let complete=false,failure;
try{
 await d.key(page,'F8');
 for(const[name,source]of cases){
  await d.source(page,baseline);await d.key(page,'F5');const before=await o.playing(page,hash(baseline));
  await d.source(page,source);await d.key(page,'F5');let after,errorVisible=false;
  for(let i=0;i<40;i++){await page.waitForTimeout(150);after=o.snapshot();errorVisible=!!after.visible_error||(await d.rows(page)).slice(-3).some(row=>/^\s*[✗×]/u.test(row));if(errorVisible&&!after.evaluating)break;}
  assert(errorVisible,'No visible error for '+name);
  await page.waitForTimeout(1200);after=o.snapshot();
  assert(after.playing&&after.callbacks>before.callbacks&&after.allocator_tripwire_armed,'Last-good playback stopped: '+name);
  assert.strictEqual(after.source_revision,before.source_revision);
  assert.strictEqual(after.confirmed_audio_generation,before.confirmed_audio_generation);
  const row={case:name,visibleError:true,lastGoodSourceRetained:true,lastGoodAudioGenerationRetained:true,
   callbacksAdvance:true,newXruns:after.callback_xruns-before.callback_xruns,newLateEvents:after.late_events-before.late_events,
   newCallbackAllocations:after.callback_allocations-before.callback_allocations};
  assert(!row.newXruns&&!row.newLateEvents&&!row.newCallbackAllocations);
  await d.source(page,baseline);await d.key(page,'F5');await o.playing(page,hash(baseline));
  row.correctionAccepted=true;rows.push(row);
 }
 complete=true;
}catch(error){failure=error.message;throw error;}
finally{await d.key(page,'F8').catch(()=>{});await browser.close();fs.writeFileSync(qa.result('invalid-source.json'),JSON.stringify({
 date:new Date().toISOString(),apkSha256:qa.digest,complete,cases:rows,failure,
 limits:['Four source errors, not every parser boundary or unsafe numeric control.','Actual last-good source/generation and callback checks; no new acoustic judgment.']},null,2));}
console.log('PASS: four invalid edits refused; last-good playback and correction recovery verified');
})().catch(error=>{console.error(error);process.exit(1)});
