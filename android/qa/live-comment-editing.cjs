// Run only against an authorized, disposable QA score. Production data is untouched.
const d=require('./device.cjs'),o=require('./observation.cjs'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const generated=path.join(__dirname,'generated');
const metadata=JSON.parse(fs.readFileSync(path.join(generated,'live-editing.json'),'utf8'));
let lines=fs.readFileSync(path.join(generated,metadata.file),'utf8').split('\n');
const output=process.env.QA_RESULT || path.join(generated,'live-comment-results.json');
function snapshot(){
 try{return o.snapshot();}catch(error){if(error.code==='RUSTEL_QA_NO_TELEMETRY')return null;throw error;}
}
async function waitSnapshot(page){
 const deadline=Date.now()+5000;
 do{const state=snapshot();if(state)return state;await page.waitForTimeout(250);}while(Date.now()<deadline);
 throw Error('No current-process QA telemetry within five seconds');
}
function hash(value){return crypto.createHash('sha256').update(value).digest('hex');}
async function confirm(page,expected){
 const begin=Date.now();let state;
 do{await page.waitForTimeout(250);state=snapshot();if(!state)continue;
  if(expected===state.source_revision&&!state.evaluating&&state.confirmed_audio_generation===state.session_generation&&state.playing){
   if(state.visible_error||!state.allocator_tripwire_armed)throw Error('Edited score has an error or lacks the allocation tripwire');
   return state;
  }
 }while(Date.now()-begin<20000);
 throw Error('Expected edited score did not commit: '+JSON.stringify({expected,revision:state?.source_revision,error:state?.visible_error}));
}
async function arrows(page,name,count,mask=0){
 for(let offset=0;offset<count;offset+=32){
  await page.evaluate(([n,c,m])=>{for(let i=0;i<c;i++)hardwareKey(n,m,1);},[name,Math.min(32,count-offset),mask]);
  await page.waitForTimeout(50);
 }
}
async function select(page,start,count){
 const last=lines.length-1,fromEnd=last-start<start;
 await d.key(page,fromEnd?'End':'Home',4);
 await arrows(page,fromEnd?'ArrowUp':'ArrowDown',fromEnd?last-start:start);
 // Home may first stop at indentation; a second Home reaches column zero.
 await d.key(page,'Home');await d.key(page,'Home');
 await arrows(page,'ArrowDown',count,1);
 await page.waitForTimeout(120);
}
function toggle(start,count){
 const all=lines.slice(start,start+count).filter(s=>s.trim()).every(s=>s.trimStart().startsWith('//'));
 const indents=lines.slice(start,start+count).filter(s=>s.trim()).map(s=>s.match(/^\s*/)[0].length);
 const indent=Math.min(...indents);
 for(let index=start;index<start+count;index++){
  if(!lines[index].trim())continue;
  if(all)lines[index]=lines[index].replace(/^(\s*)\/\/ ?/,'$1');
  else lines[index]=lines[index].slice(0,indent)+'// '+lines[index].slice(indent);
 }
}
(async()=>{
 const {browser,page}=await d.connect(),results=[];
 const report={fixture:{bytes:metadata.bytes,lines:metadata.lines,preparedSections:metadata.preparedSections},
  conditions:{prefs:d.prefs()},status:'running',results};
 function save(){fs.writeFileSync(output,JSON.stringify(report,null,2));}
 try{
  await d.key(page,'Escape');await d.key(page,'F8');await page.waitForTimeout(400);
  await d.source(page,lines.join('\n'));await d.key(page,'Home',4);await d.key(page,'F5');
  // The terminal paste path can append one final newline. Establish its exact revision.
  let initial;
  try{initial=await confirm(page,hash(lines.join('\n')));}catch(error){
   if((await waitSnapshot(page)).source_revision!==hash(lines.join('\n')+'\n'))throw error;
   lines.push('');initial=await confirm(page,hash(lines.join('\n')));
  }
  report.initial={sourceRevision:initial.source_revision,xrunsAtMeasuredStart:initial.callback_xruns};save();
  const first=metadata.blocks[0].start;
  const alternative=metadata.blocks.find(b=>b.section===32&&b.track===0).start;
  const steps=[['single-off',first,4],['single-on',first,4],
   ['group-eight-off',first,32],['group-eight-on',first,32],
   ['original-eight-off',first,32],['alternative-eight-on',alternative,32],
   ['alternative-eight-off',alternative,32],['original-eight-on',first,32],
   ['repeat-off',first,32],['repeat-on',first,32]];
  for(const [name,start,count] of steps){
   const before=await waitSnapshot(page),began=Date.now();
   await select(page,start,count);const selectedAt=Date.now();
   await page.evaluate(()=>{
    const stats=window.liveTransitionStats={start:performance.now(),previous:performance.now(),frames:0,maxGapMs:0};
    window.liveTransitionRender=term.onRender(()=>{const now=performance.now();stats.maxGapMs=Math.max(stats.maxGapMs,now-stats.previous);stats.previous=now;stats.frames++;});
   });
   await d.action(page,'comment');toggle(start,count);
   await d.key(page,'F5');const committed=await confirm(page,hash(lines.join('\n')));
   const commitMs=Date.now()-began;
   const transition=await page.evaluate(()=>{
    liveTransitionRender.dispose();window.liveTransitionRender=null;
    const now=performance.now(),stats=liveTransitionStats;
    return {frames:stats.frames,maxGapMs:stats.frames?Math.max(stats.maxGapMs,now-stats.previous):null,seconds:(now-stats.start)/1000};
   });
   await d.key(page,'ArrowLeft');
   await page.evaluate(()=>{const stats={renders:0,start:performance.now()};window.editStats=stats;window.editRender=term.onRender(()=>stats.renders++);});
   await page.waitForTimeout(8000);
   const display=await page.evaluate(()=>{editRender.dispose();return {renders:editStats.renders,seconds:(performance.now()-editStats.start)/1000};});
   const after=await waitSnapshot(page);
   const result={name,sourceRevision:after.source_revision,commitMs,
    selectionMs:selectedAt-began,evaluationAndConfirmationMs:commitMs-(selectedAt-began),
    transitionFrames:transition.frames,transitionLongestRenderGapMs:transition.maxGapMs,transitionSeconds:transition.seconds,
    evaluationXruns:committed.callback_xruns-before.callback_xruns,
    playbackXruns:after.callback_xruns-committed.callback_xruns,
    lateEvents:after.late_events-before.late_events,
    lateEventsAtCommit:committed.late_events-before.late_events,
    lateEventsAfterCommit:after.late_events-committed.late_events,
    allocations:after.callback_allocations-before.callback_allocations,
    displayedFps:display.renders/display.seconds,peakDb:after.master_peak_db,
    activeVoices:after.pressure.voices.active,peakVoices:after.pressure.voices.peak,
    semanticFades:after.pressure.voices.semantic_polyphony_fades,pressure:after.pressure};
   results.push(result);save();console.log(JSON.stringify({...result,pressure:undefined}));
   if(result.evaluationXruns||result.playbackXruns||result.lateEvents||result.allocations||after.master_peak_db>=0||!after.playing)throw Error('Live editing failed an audio gate');
  }
  await d.key(page,'s',4);await page.waitForTimeout(1000);
  report.status='passed-short-checks';save();
 }catch(error){report.status='failed';report.error=String(error);save();await d.key(page,'F8').catch(()=>{});throw error;
 }finally{await page.evaluate(()=>{if(window.editRender)editRender.dispose();if(window.liveTransitionRender)liveTransitionRender.dispose();}).catch(()=>{});await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
