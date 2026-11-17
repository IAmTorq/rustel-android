const qa=require('./regression-context.cjs'),d=require('./device.cjs'),o=require('./observation.cjs'),fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert');
(async()=>{const {browser,page}=await d.connect();let result;
try{
 const code='stack(note("c3 e3 g3 c4").s("triangle").gain(.02),s("sine!4").note("c2").gain(.01))';const revision=crypto.createHash('sha256').update(code).digest('hex');await d.key(page,'F8');await d.source(page,code);
 const cases=[];for(let i=0;i<8;i++){
  await d.key(page,'F5');const before=await o.playing(page,revision);let after;for(let n=0;n<25;n++){await page.waitForTimeout(150);after=o.snapshot();if(!after.playing||after.visible_error||after.callbacks>before.callbacks)break;}assert(after.playing&&!after.visible_error&&after.callbacks>before.callbacks&&after.allocator_tripwire_armed);assert(after.callback_xruns===before.callback_xruns&&after.late_events===before.late_events&&after.callback_allocations===before.callback_allocations);
  await d.key(page,'F8');let stopped=false;for(let n=0;n<30;n++){await page.waitForTimeout(100);if(!o.snapshot().playing){stopped=true;break;}}assert(stopped,'Stop did not settle');cases.push({iteration:i+1,sourceConfirmed:true,callbacksAdvance:true,stopped:true,xruns:after.callback_xruns,lateEvents:after.late_events,callbackAllocations:after.callback_allocations});
 }
 result={date:new Date().toISOString().slice(0,10),dateBasis:'UTC',apkSha256:qa.digest,complete:true,cases,limits:['Eight brief native-instrument play/stop cycles through actual F5/F8 dispatch.','Tempo changes, effect tails, device rerouting, acoustic output and endurance remain separate.']};
}finally{await d.key(page,'F8').catch(()=>{});await d.source(page,fs.readFileSync(path.join(__dirname,'readability-hydra.strudel'),'utf8')).catch(()=>{});await browser.close();}
fs.writeFileSync(qa.result('transport-repeat.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));})().catch(e=>{console.error(e);process.exit(1)});
