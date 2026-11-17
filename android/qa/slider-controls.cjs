// Source-linked slider controls on a disposable QA scene; no external hardware.
const qa=require('./regression-context.cjs'),d=require('./device.cjs'),o=require('./observation.cjs'),fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert');
const line='note("c4").s("sine").gain(slider(0.02,0,0.04,0.01))';
const code='// QA_LIVE_SLIDER\n'+line,hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const list=()=>d.shell('run-as','cc.rustel.qa','ls','-1',qa.directory).replace(/\r/g,'').split('\n').filter(name=>name.endsWith('.strudel'));
const read=name=>cp.execFileSync(d.adb,['exec-out','run-as','cc.rustel.qa','cat',qa.directory+'/'+name],{maxBuffer:1024*1024}).toString('utf8');
(async()=>{const {browser,page}=await d.connect();const checks=[];let complete=false,created,initial,final;
try{
 await d.key(page,'F8');const before=list();await d.action(page,'new-scene');await page.waitForTimeout(350);const added=list().filter(name=>!before.includes(name));assert.strictEqual(added.length,1);created=added[0];
 await d.source(page,code);await d.key(page,'s',4);initial=await o.playing(page,hash(code));assert.strictEqual(read(created),code);
 async function caret(){await d.key(page,'End',4);await d.key(page,'Home');for(let i=0;i<line.indexOf('0.02')+1;i++)await d.key(page,'ArrowRight');}
 async function verify(name,value){const expected=code.replace('slider(0.02,','slider('+value+',');await d.key(page,'s',4);await o.playing(page,hash(expected));assert.strictEqual(read(created),expected);checks.push({name,savedSourceExact:true,value});}
 await caret();await d.key(page,'ArrowUp',2);await verify('one-step-increase','0.03');
 await d.action(page,'undo');await verify('undo','0.02');await d.action(page,'redo');await verify('redo','0.03');
 await caret();for(let i=0;i<4;i++)await d.key(page,'ArrowUp',2);await verify('upper-clamp','0.04');
 await caret();for(let i=0;i<8;i++)await d.key(page,'ArrowDown',2);await verify('lower-clamp','0');
 await page.waitForTimeout(1500);final=o.snapshot();assert(final.playing&&!final.visible_error&&final.callbacks>initial.callbacks&&final.allocator_tripwire_armed);
 assert.strictEqual(final.callback_xruns,initial.callback_xruns);assert.strictEqual(final.late_events,initial.late_events);assert.strictEqual(final.callback_allocations,initial.callback_allocations);complete=true;
}finally{
 await d.key(page,'F8').catch(()=>{});await browser.close();fs.writeFileSync(qa.result('slider-controls.json'),JSON.stringify({date:new Date().toISOString(),apkSha256:qa.digest,complete,checks,newXruns:final&&initial?final.callback_xruns-initial.callback_xruns:null,newLateEvents:final&&initial?final.late_events-initial.late_events:null,newCallbackAllocations:final&&initial?final.callback_allocations-initial.callback_allocations:null,limits:['Generated bridge keys and exact saved-source/playback-generation checks; not touch drag, acoustic parameter response, MIDI or arbitrary numeric/nonfinite controls.','The generated QA scene remains saved; no production data is changed.']},null,2));
}
assert(complete);
})().catch(error=>{console.error(error);process.exit(1)});
