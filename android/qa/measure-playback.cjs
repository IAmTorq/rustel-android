// Replaces only the current disposable QA score. Keep raw results private.
// Usage: node measure-playback.cjs PUBLIC_SCORE RESULT_JSON [SECONDS]
const d=require('./device.cjs'),fs=require('fs'),path=require('path'),crypto=require('crypto');
function snapshot(){
 const pid=d.shell('pidof','cc.rustel.qa').trim().split(' ')[0];
 for(const line of d.shell('run-as','cc.rustel.qa','tail','-n','300','files/config/sessions/studio.log').split('\n').reverse()){
  if(!line.includes('pid '+pid+' '))continue;
  const index=line.indexOf('[performance] ');if(index<0)continue;
  const record=JSON.parse(line.slice(index+14));if(record.studio_runtime)return record;
 }return null;
}
(async()=>{
 const {browser,page}=await d.connect();
 const code=fs.readFileSync(process.argv[2],'utf8').replace(/\r\n/g,'\n');
 const duration=Number(process.argv[4]||30);
 if(!Number.isFinite(duration)||duration<8||duration>300)throw Error('Duration must be 8 through 300 seconds');
 const expected=[code,code+'\n'].map(x=>crypto.createHash('sha256').update(x).digest('hex'));
 try{
  await d.key(page,'Escape');await d.key(page,'F8');await page.waitForTimeout(400);
  await d.source(page,code);await d.key(page,'Home',4);await d.key(page,'F5');
  const deadline=Date.now()+30000;let ready;
  do{await page.waitForTimeout(300);ready=snapshot()?.studio_runtime;
   if(ready&&expected.includes(ready.source_revision)&&!ready.evaluating&&ready.playing&&ready.confirmed_audio_generation===ready.session_generation)break;
  }while(Date.now()<deadline);
  if(!ready||!expected.includes(ready.source_revision)||ready.evaluating||!ready.playing)throw Error('Benchmark score did not confirm');
  await page.waitForTimeout(2500);const before=snapshot();
  const display=await page.evaluate(async duration=>{
   const stats={renders:0,frames:0,chunks:0,bytes:0,raf:[],start:performance.now()};
   const old=window.receive;let tail='';const off=term.onRender(()=>stats.renders++);
   window.receive=b=>{const raw=atob(b);stats.chunks++;stats.bytes+=raw.length;stats.frames+=((tail+raw).match(/\x1b\[\?2026l/g)||[]).length;tail=raw.slice(-7);old(b);};
   let previous=performance.now(),active=true;const tick=now=>{stats.raf.push(now-previous);previous=now;if(active)requestAnimationFrame(tick);};requestAnimationFrame(tick);
   await new Promise(r=>setTimeout(r,duration*1000));active=false;window.receive=old;off.dispose();stats.elapsed=performance.now()-stats.start;stats.raf.sort((a,b)=>a-b);
   return {...stats,raf:undefined,rafP50:stats.raf[Math.floor(stats.raf.length*.5)],rafP95:stats.raf[Math.floor(stats.raf.length*.95)],rafMax:Math.max(...stats.raf),atlasPixels:atlasBudget?.pixels,clears:atlasBudget?.clears,renderer:document.documentElement.dataset.renderer,cols:term.cols,rows:term.rows};
  },duration);
  const after=snapshot(),a=before.studio_runtime,b=after.studio_runtime;
  const result={prefs:d.prefs(),sourceRevision:b.source_revision,display:{...display,displayedFps:display.renders/(display.elapsed/1000)},newXruns:b.callback_xruns-a.callback_xruns,lateEvents:b.late_events-a.late_events,allocations:b.callback_allocations-a.callback_allocations,before,after};
  fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,prefs:undefined,before:undefined,after:undefined}));
  if(result.newXruns||result.lateEvents||result.allocations||!b.playing||b.visible_error||!b.allocator_tripwire_armed||!Number.isFinite(b.master_peak_db)||b.master_peak_db>=0)throw Error('Audio gate failed');
 }catch(error){await d.key(page,'F8').catch(()=>{});throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
