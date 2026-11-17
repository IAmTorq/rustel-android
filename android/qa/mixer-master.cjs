// Check audible engine levels as well as the mixer's displayed control values.
const qa=require('./regression-context.cjs'),d=require('./device.cjs'),o=require('./observation.cjs');
const fs=require('fs'),crypto=require('crypto'),assert=require('assert');
const code='note("c3").s("sine").gain(.03).sustain(1).release(.01).orbit(0)';
const revision=crypto.createHash('sha256').update(code).digest('hex');
(async()=>{
 const {browser,page}=await d.connect(),original=d.prefs().theme,checks=[];
 let initial,complete=false,failure;
 async function measure(name){
  // Master peak holds for 1.2 s before decaying; do not mistake that hold for sound.
  await page.waitForTimeout(4500);
  const state=o.snapshot(),rows=await d.rows(page);
  const reading=rows.at(-1).match(/pk\s*(-?\d+(?:\.\d+)?)/);
  assert(reading||rows.at(-1).includes('pk  --'),'Held peak readout missing');
  const result={name,peakDb:reading?Number(reading[1]):-60,instantaneousPeakDb:state.master_peak_db,activeVoices:state.pressure.voices.active,
   control:rows.find(row=>row.includes('── mixer'))?.trim()};
  assert(state.playing&&!state.visible_error&&state.allocator_tripwire_armed);
  assert(state.source_revision===revision&&state.confirmed_audio_generation===state.session_generation);
  checks.push(result);return result;
 }
 try{
  await d.key(page,'Escape');await d.key(page,'F8');
  if((await d.rows(page)).some(row=>row.includes('── mixer')))await d.action(page,'mixer');
  await d.theme(page,'rustel-dark');await d.source(page,code);await d.key(page,'F5');
  initial=await o.playing(page,revision);await d.action(page,'mixer');await d.key(page,'0');
  const baseline=await measure('unity');assert(baseline.peakDb>-55&&baseline.activeVoices>0);
  assert(baseline.control?.includes('master gain 0.0 dB'));
  for(let n=0;n<6;n++)await d.key(page,'ArrowDown');
  const lower=await measure('minus-six-db');assert(lower.control?.includes('master gain -6.0 dB'));
  assert(Math.abs((lower.peakDb-baseline.peakDb)+6)<1.5,'Master attenuation disagrees with engine peak');
  await d.key(page,'m');const muted=await measure('mute');assert(muted.peakDb<=-59,'Muted master still has signal');
  await d.key(page,'m');const unmuted=await measure('unmute');
  assert(Math.abs(unmuted.peakDb-lower.peakDb)<1.5,'Unmute did not recover prior level');
  await d.key(page,'0');const reset=await measure('reset');
  assert(reset.control?.includes('master gain 0.0 dB'));
  assert(Math.abs(reset.peakDb-baseline.peakDb)<1.5,'Reset did not recover unity level');
  const final=o.snapshot();const health={newXruns:final.callback_xruns-initial.callback_xruns,
   newLateEvents:final.late_events-initial.late_events,newCallbackAllocations:final.callback_allocations-initial.callback_allocations};
  assert(!health.newXruns&&!health.newLateEvents&&!health.newCallbackAllocations);
  checks.push({health});complete=true;
 }catch(error){failure=error.message;throw error;}
 finally{
  await d.key(page,'0').catch(()=>{});await d.key(page,'Escape').catch(()=>{});await d.key(page,'F8').catch(()=>{});
  if((await d.rows(page)).some(row=>row.includes('── mixer')))await d.action(page,'mixer').catch(()=>{});
  await d.theme(page,original).catch(()=>{});await browser.close();
  const originalThemeRestored=d.prefs().theme===original;
  fs.writeFileSync(qa.result('mixer-master.json'),JSON.stringify({date:new Date().toISOString(),apkSha256:qa.digest,
   complete:complete&&originalThemeRestored,originalThemeRestored,sourceSha256:revision,checks,failure,limits:['Engine meter and actual mixer keys, not acoustic measurement.',
   'Master gain/mute/reset only; orbit meters, pan, limiter, automation and save/reload remain separate.',
   'Uses the selected disposable QA set; no production data changes.']},null,2));
 }
 assert(complete);console.log('PASS: master gain, mute/unmute and reset agree with engine levels');
})().catch(error=>{console.error(error);process.exit(1)});
