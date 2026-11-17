const qa=require('./regression-context.cjs'),d=require('./device.cjs'),o=require('./observation.cjs'),fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
// export-audio.cjs must have completed in this private result directory first.
const exported=JSON.parse(fs.readFileSync(qa.result('export-audio.json'),'utf8'));
assert(exported.complete&&exported.apkSha256===qa.digest,'Generate exports on this installed APK first');
(async()=>{const {browser,page}=await d.connect();const cases=[],temporary=[],samples=[];let complete=false;
try{
 for(const format of ['wav','mp3']){
  const file=qa.result('export-probe.'+format),bytes=fs.readFileSync(file),entry=exported.cases.find(item=>item.format===format);assert(entry&&bytes.length===entry.bytes);
  if(format==='wav')assert(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WAVE');else assert(bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224));
  const sound='qa_export_'+format+'_'+Date.now(),remote='/data/local/tmp/'+sound+'.'+format,sample=qa.directory+'/'+sound+'.'+format;cp.execFileSync(d.adb,['push',file,remote],{stdio:'ignore'});temporary.push(remote);d.shell('run-as','cc.rustel.qa','cp',quote(remote),quote(sample));samples.push(sample);
  const copied=cp.execFileSync(d.adb,['exec-out','run-as','cc.rustel.qa','cat',sample],{maxBuffer:8*1024*1024});assert(copied.equals(bytes));
  const code='s("'+sound+'").gain(.5)';await d.source(page,code);await d.key(page,'F5');const before=await o.playing(page,hash(code));let ready=false;
  for(let i=0;i<60;i++){await page.waitForTimeout(100);const rows=await d.rows(page);assert(!rows.slice(0,3).some(row=>/sound.*failed|failed.*sound/i.test(row)));if(rows.slice(0,3).some(row=>row.includes('ready'))){ready=true;break;}}
  assert(ready,'Reimported '+format+' never became ready');const peaks=await page.evaluate(async()=>{const values=[],timer=setInterval(()=>{const row=term.buffer.active.getLine(term.buffer.active.baseY+term.rows-1)?.translateToString(true)||'',match=row.match(/pk\s*(-?\d+(?:\.\d+)?)/);if(match)values.push(Number(match[1]));},16);try{await new Promise(resolve=>setTimeout(resolve,3000));return values;}finally{clearInterval(timer);}});
  const after=o.snapshot();assert(after.playing&&!after.visible_error&&after.callbacks>before.callbacks&&after.allocator_tripwire_armed);assert(peaks.length>5&&Math.max(...peaks)>-59.9&&Math.max(...peaks)<0);const result={format,bytes:bytes.length,sourceFileSha256:hash(bytes),sampleCopyByteExact:true,ready:true,uiMeterObservations:peaks.length,maximumUiPeakDb:Math.max(...peaks),newXruns:after.callback_xruns-before.callback_xruns,newLateEvents:after.late_events-before.late_events,newCallbackAllocations:after.callback_allocations-before.callback_allocations};assert(!result.newXruns&&!result.newLateEvents&&!result.newCallbackAllocations);cases.push(result);await d.key(page,'F8');
 }
 complete=true;
}finally{await d.key(page,'F8').catch(()=>{});await d.source(page,fs.readFileSync(path.join(__dirname,'readability-hydra.strudel'),'utf8')).catch(()=>{});for(const file of samples)d.shell('run-as','cc.rustel.qa','rm','-f',quote(file));for(const file of temporary)d.shell('rm','-f',quote(file));await browser.close();fs.writeFileSync(qa.result('export-reimport.json'),JSON.stringify({date:new Date().toISOString().slice(0,10),dateBasis:'UTC',apkSha256:qa.digest,complete,cases,limits:['Generated two-second WAV/MP3 exports loaded as relative sample files on Android; not the document picker import path.','Finite above-floor digital meter output and backend health, not listening, waveform equivalence, MP3 metadata or complete format coverage.','Unique copied test inputs are removed; normal decoder/cache retention policy remains active.']},null,2));}
assert(complete);console.log(JSON.stringify(cases));
})().catch(error=>{console.error(error);process.exit(1)});
