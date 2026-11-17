const qa=require('./regression-context.cjs'),d=require('./device.cjs'),o=require('./observation.cjs'),fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert');
const code='// QA_KNOB_CONTROLS\nnote("c4").s("sine").gain(0.02)',changed=code.replace('0.02','0.03'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const list=()=>d.shell('run-as','cc.rustel.qa','ls','-1',qa.directory).replace(/\r/g,'').split('\n').filter(name=>name.endsWith('.strudel'));
const read=name=>cp.execFileSync(d.adb,['exec-out','run-as','cc.rustel.qa','cat',qa.directory+'/'+name],{maxBuffer:1024*1024}).toString('utf8');
async function auto(page,enabled){
 await d.key(page,'o',4);await d.key(page,'Home');await d.key(page,'ArrowDown');await d.key(page,'ArrowDown');await page.waitForTimeout(150);
 assert((await d.rows(page)).some(row=>row.includes('auto evaluate')&&row.includes('▸')),'Expected General auto evaluate row');
 if(d.prefs().auto_evaluate!==enabled)await d.key(page,' ');await d.key(page,'Escape');
 for(let i=0;i<20&&d.prefs().auto_evaluate!==enabled;i++)await page.waitForTimeout(100);
 assert.strictEqual(d.prefs().auto_evaluate,enabled);
}
(async()=>{const {browser,page}=await d.connect();const original=d.prefs().auto_evaluate;assert.strictEqual(typeof original,'boolean');assert(!d.prefs().knobs_panel,'Start with the QA knobs column closed');let complete=false,opened=false,initial,final;const checks=[];
try{
 await d.key(page,'F8');await auto(page,true);const before=list();await d.action(page,'new-scene');await page.waitForTimeout(350);const added=list().filter(name=>!before.includes(name));assert.strictEqual(added.length,1);const created=added[0];
 await d.source(page,code);await d.key(page,'s',4);initial=await o.playing(page,hash(code));await d.key(page,'End',4);await d.key(page,'Home');for(let i=0;i<code.split('\n')[1].indexOf('0.02')+1;i++)await d.key(page,'ArrowRight');
 await d.action(page,'knobs');opened=true;await d.key(page,'ArrowRight');await o.playing(page,hash(changed));await page.waitForTimeout(900);assert.strictEqual(read(created),changed);checks.push('rail increase automatically applies and saves exact source');
 await d.key(page,'ArrowLeft');await o.playing(page,hash(code));checks.push('rail decrease automatically applies');
 await auto(page,false);await d.action(page,'knobs');await d.action(page,'knobs');await d.key(page,'ArrowRight');await page.waitForTimeout(1600);assert((await d.rows(page)).some(row=>row.includes('gain(0.03)')),'Edited gain is visible');assert.strictEqual(o.snapshot().source_revision,hash(code));checks.push('auto evaluate off retains accepted playback while the editor changes');
 await d.key(page,'s',4);await o.playing(page,hash(changed));assert.strictEqual(read(created),changed);checks.push('manual update saves and applies the edited rail');await page.waitForTimeout(1200);final=o.snapshot();assert(final.callbacks>initial.callbacks&&final.playing&&!final.visible_error&&final.allocator_tripwire_armed);
 assert.strictEqual(final.callback_xruns,initial.callback_xruns);assert.strictEqual(final.late_events,initial.late_events);assert.strictEqual(final.callback_allocations,initial.callback_allocations);complete=true;
}finally{
 await d.key(page,'F8');await d.key(page,'Escape');if(opened)await d.action(page,'knobs');await auto(page,original);await browser.close();
 fs.writeFileSync(qa.result('knob-controls.json'),JSON.stringify({date:new Date().toISOString(),apkSha256:qa.digest,complete,checks,originalAutoEvaluateRestored:true,newXruns:final&&initial?final.callback_xruns-initial.callback_xruns:null,newLateEvents:final&&initial?final.late_events-initial.late_events:null,newCallbackAllocations:final&&initial?final.callback_allocations-initial.callback_allocations:null,limits:['Generated bridge keys, exact saved text and confirmed playback source; no touch drag, acoustic parameter measurement, external controllers or arbitrary option-object rails.','The generated QA scene remains saved; no production data is changed.']},null,2));
}
assert(complete);
})().catch(error=>{console.error(error);process.exit(1)});
