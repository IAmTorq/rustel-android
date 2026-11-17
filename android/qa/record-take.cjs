// Record only in the disposable QA package; never read an existing recording.
const qa=require('./regression-context.cjs'),d=require('./device.cjs'),o=require('./observation.cjs');
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert');
const folder='files/config/recordings';
assert(!d.prefs().recordings_directory,'Custom recording directory needs a separate isolated test');
const code='note("c3 e3 g3 c4").s("triangle").gain(.12)';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const read=name=>cp.execFileSync(d.adb,['exec-out','run-as','cc.rustel.qa','cat',folder+'/'+name],{maxBuffer:8*1024*1024});
function list(){return d.shell('run-as','cc.rustel.qa','ls','-1',folder).trim().split('\n').map(x=>x.trim()).filter(x=>x.endsWith('.wav'));}
(async()=>{const{browser,page}=await d.connect();let complete=false,created,recording=false,failure,result;
try{
 d.shell('run-as','cc.rustel.qa','mkdir','-p',folder);const beforeFiles=list();
 await d.key(page,'F8');await d.source(page,code);await d.key(page,'F5');const initial=await o.playing(page,hash(code));
 await d.action(page,'record-take');recording=true;await page.waitForTimeout(5000);
 await d.action(page,'record-take');recording=false;
 let bytes;for(let n=0;n<30;n++){
  await page.waitForTimeout(200);const added=list().filter(name=>!beforeFiles.includes(name));
  assert(added.length<=1,'Unexpected extra recordings');if(!added.length)continue;created=added[0];
  assert(/^[A-Za-z0-9_. -]+\.wav$/.test(created),'Unexpected recording name');bytes=read(created);
  if(bytes.length>44&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.readUInt32LE(4)+8===bytes.length)break;
 }
 assert(bytes&&bytes.length>44&&bytes.readUInt32LE(4)+8===bytes.length,'Take WAV did not finalize');
 fs.writeFileSync(qa.result('recorded-take.wav'),bytes);const index=list().sort().indexOf(created);assert(index>=0);
 const afterRecord=o.snapshot();assert(afterRecord.playing&&!afterRecord.visible_error);
 const playback='s("recordings:'+index+'").gain(.8)';
 await d.source(page,playback);await d.key(page,'F5');const beforePlay=await o.playing(page,hash(playback));
 let peak=-60;for(let i=0;i<12;i++){await page.waitForTimeout(250);const footer=(await d.rows(page)).at(-1),m=footer.match(/pk\s*(-?\d+(?:\.\d+)?)/);if(m)peak=Math.max(peak,Number(m[1]));}
 const final=o.snapshot();assert(final.playing&&!final.visible_error&&final.callbacks>beforePlay.callbacks&&peak>-59.9&&peak<0,'Recorded bank playback lacks safe signal');
 result={date:new Date().toISOString(),apkSha256:qa.digest,complete:true,bytes:bytes.length,
  wavSha256:hash(bytes),recordedSourceSha256:hash(code),replayedFromRecordingsBank:true,replayMaximumHeldPeakDb:peak,
  newXruns:final.callback_xruns-initial.callback_xruns,newLateEvents:final.late_events-initial.late_events,
  newCallbackAllocations:final.callback_allocations-initial.callback_allocations,
  limits:['One short output take; microphone input, storage exhaustion, interruption and long recording remain separate.',
   'Generated WAV is retained privately for independent format/PCM inspection; existing recordings are not read.']};
 assert(!result.newXruns&&!result.newLateEvents&&!result.newCallbackAllocations);complete=true;
}catch(error){failure=error.message;throw error;}
finally{
 if(recording)await d.action(page,'record-take').catch(()=>{});
 await d.key(page,'F8').catch(()=>{});await browser.close();
 fs.writeFileSync(qa.result('record-take.json'),JSON.stringify(result||{complete:false,apkSha256:qa.digest,failure},null,2));
}
assert(complete);console.log('PASS: take saved, finalized and replayed from the recordings bank');
})().catch(error=>{console.error(error);process.exit(1)});
