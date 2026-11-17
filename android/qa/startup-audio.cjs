// Requires an explicitly selected disposable QA set; never edits its score.
const qa=require('./regression-context.cjs'),d=require('./device.cjs'),o=require('./observation.cjs');
const fs=require('fs'),assert=require('assert');
const count=Number(process.env.RUSTEL_QA_STARTUP_RUNS||3);
assert(Number.isInteger(count)&&count>=1&&count<=10,'Use 1 to 10 cold launches');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const runs=[];let complete=false;
 try{
  for(let index=0;index<count;index++){
   d.shell('am','force-stop','cc.rustel.qa');
   d.shell('am','start','-n','cc.rustel.qa/cc.rustel.android.MainActivity');
   await pause(2200);
   const {browser,page}=await d.connect();
   try{
    await page.waitForFunction(()=>typeof ready!=='undefined'&&ready);
    await d.key(page,'F5');const initial=await o.playing(page);
    await pause(8000);const final=await o.playing(page,initial.source_revision);
    const result={index,sourceRevision:final.source_revision,initialCallbacks:initial.callbacks,
     finalCallbacks:final.callbacks,xruns:final.callback_xruns,lateEvents:final.late_events,
     allocations:final.callback_allocations,errors:final.callback_errors,
     tripwireArmed:final.allocator_tripwire_armed,device:final.pressure?.device};
    runs.push(result);
    assert(final.callbacks>initial.callbacks,'Output callback must keep advancing');
    assert.strictEqual(final.callback_xruns,0,'Cold-start xruns must also be zero');
    assert.strictEqual(final.late_events,0);assert.strictEqual(final.callback_errors,0);
    assert.strictEqual(final.callback_allocations,0);assert(final.allocator_tripwire_armed);
   }finally{await d.key(page,'F8').catch(()=>{});await browser.close();}
  }
  complete=true;
 }finally{
  fs.writeFileSync(qa.result('startup-audio.json'),JSON.stringify({complete,apkSha256:qa.digest,
   runs,limits:['Selected score, route, device and buffer setting only.',
   'Eight-second playback checks per cold launch; sustained load and route changes require separate tests.']},null,2));
 }
 assert(complete);
})().catch(error=>{console.error(error);process.exitCode=1});
