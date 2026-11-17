// Reflow can damage xterm's old cells even if Studio draws only the final size.
const qa=require('./regression-context.cjs'),d=require('./device.cjs'),o=require('./observation.cjs'),fs=require('fs'),crypto=require('crypto'),assert=require('assert');
const code='// QA_RESIZE_ROUNDTRIP\nnote("c4 e4 g4").s("sine").gain(.02)\n// QA_RESIZE_END',hash=crypto.createHash('sha256').update(code).digest('hex');
(async()=>{const {browser,page}=await d.connect();let complete=false,initial,final;const checks=[];
try{
 await d.key(page,'F8');await d.source(page,code);await d.key(page,'s',4);initial=await o.playing(page,hash);
 const size=await page.evaluate(()=>({cols:term.cols,rows:term.rows}));assert(size.rows>=15);
 for(const holdMs of [0,20,60,0,20,60]){
  await d.text(page,'\x1b[O');await page.waitForTimeout(150);
  await page.evaluate(async({size,holdMs})=>{term.resize(size.cols,size.rows-3);if(holdMs)await new Promise(resolve=>setTimeout(resolve,holdMs));term.resize(size.cols,size.rows);},{size,holdMs});
  await page.waitForTimeout(150);await d.text(page,'\x1b[I');await page.waitForTimeout(150);
  let matched=false;for(let i=0;i<40;i++){const rows=await d.rows(page);if(rows[0].includes('File  Edit  Scene')&&rows.some(row=>row.includes('QA_RESIZE_ROUNDTRIP'))&&rows.some(row=>row.includes('QA_RESIZE_END'))){matched=true;break;}await page.waitForTimeout(100);}
  assert(matched,'Full header and source did not recover after resize round trip');checks.push({holdMs,menuAndSourceRecovered:true});
 }
 final=await o.playing(page,hash);assert(final.callbacks>initial.callbacks&&final.allocator_tripwire_armed);assert.strictEqual(final.callback_xruns,initial.callback_xruns);assert.strictEqual(final.late_events,initial.late_events);assert.strictEqual(final.callback_allocations,initial.callback_allocations);complete=true;
}finally{
 await d.text(page,'\x1b[I').catch(()=>{});await d.key(page,'F8').catch(()=>{});await browser.close();fs.writeFileSync(qa.result('resize-roundtrip.json'),JSON.stringify({date:new Date().toISOString(),apkSha256:qa.digest,complete,checks,newXruns:final&&initial?final.callback_xruns-initial.callback_xruns:null,newLateEvents:final&&initial?final.late_events-initial.late_events:null,newCallbackAllocations:final&&initial?final.callback_allocations-initial.callback_allocations:null,limits:['Generated xterm public-API resize events and terminal-model text assertions; not GPU pixels, arbitrary orientation changes or physical typing.','Marker/header checks alone do not compare every cell; the actual Downloads boundary test remains a separate regression.']},null,2));
}
assert(complete);
})().catch(error=>{console.error(error);process.exit(1)});
