const d=require('./device.cjs'),o=require('./observation.cjs'),fs=require('fs'),path=require('path'),crypto=require('crypto');
function snapshot(){
 return o.snapshot();
}
(async()=>{
 const {browser,page}=await d.connect(),results=[];
 try{
  for(const codec of (process.argv.slice(2).length?process.argv.slice(2):['vp8','vp9','h264','hevc','av1','av1_10bit','mjpeg','h264_audio'])){
   await d.key(page,'Escape');await d.key(page,'F8');
   const source='// Public upstream '+codec+' video fixture\nsetCps(.5);\n$monitor: note("c4 e4 g4 b4").s("sine").gain(.04)\n$clip: s("qa_'+codec+'").slow(2).gain(.04)._video()\n';
   const hashes=[source,source+'\n'].map(s=>crypto.createHash('sha256').update(s).digest('hex'));
   await d.source(page,source);await d.key(page,'s',4);await page.waitForTimeout(500);await d.key(page,'F5');
   const start=Date.now();let state;
   do{await page.waitForTimeout(500);state=snapshot();}
   while(Date.now()-start<20000&&(!hashes.includes(state.source_revision)||state.evaluating||state.confirmed_audio_generation!==state.session_generation));
   if(!hashes.includes(state.source_revision)||!state.playing||state.visible_error)throw Error(codec+' did not play: '+state.visible_error);
   const baseline=state,frames=[];
   for(let index=0;index<30;index++){
    await page.waitForTimeout(400);
    frames.push(await page.evaluate(()=>{
     const out=[];
     for(let y=7;y<term.rows-4;y++){
      const row=term.buffer.active.getLine(term.buffer.active.baseY+y);
      out.push(Array.from({length:term.cols},(_,x)=>{const c=row?.getCell(x);return [c?.getChars(),c?.getFgColor(),c?.getBgColor()];}));
     }return JSON.stringify(out);
    }));
   }
   const after=snapshot(),rows=await d.rows(page);
   const log=d.shell('run-as','cc.rustel.qa','tail','-n','300','files/config/sessions/studio.log');
   const pid=d.shell('pidof','cc.rustel.qa').trim().split(' ')[0];
   const sampleFailures=log.split('\n').filter(line=>line.includes('pid '+pid+' ')&&line.includes('[sample-failed]')&&line.includes('/qa_'+codec+'.'));
   const expectedFailure=codec==='mjpeg'?'unsupported codec':(['vp9','h264','hevc','av1','av1_10bit'].includes(codec)?'no audio track':null);
   const audioMatches=expectedFailure?sampleFailures.some(line=>line.includes(expectedFailure)):!sampleFailures.length;
   const pictureChanged=new Set(frames).size>1;
   const result={codec,status:pictureChanged&&audioMatches?'picture-model-smoke-passed':'failed',expectedAudioRefusal:expectedFailure,
    audioMatchesExpected:audioMatches,sourceRevision:after.source_revision,seconds:(Date.now()-start)/1000,
    distinctVideoRegionFrames:new Set(frames).size,newXruns:after.callback_xruns-baseline.callback_xruns,
    lateEvents:after.late_events-baseline.late_events,allocations:after.callback_allocations-baseline.callback_allocations,
    peakDb:after.master_peak_db,rows,pressure:after.pressure};
   results.push(result);fs.writeFileSync(process.env.QA_RESULT||path.join(d.root,'video-smoke-results.json'),JSON.stringify(results,null,2));
   console.log(JSON.stringify({...result,rows:undefined,pressure:undefined}));
   if(result.newXruns||result.lateEvents||result.allocations||result.status==='failed'||!after.playing||after.visible_error||!after.allocator_tripwire_armed)throw Error(codec+' failed smoke gate');
  }
 }finally{await d.key(page,'F8').catch(()=>{});await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
