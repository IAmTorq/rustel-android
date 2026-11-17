const qa=require('./regression-context.cjs'),d=require('./device.cjs'),o=require('./observation.cjs'),fs=require('fs'),crypto=require('crypto'),assert=require('assert');
const code='// QA_PHONE_THEME\n// ⣿                 ⣿\nnote("c4 e4 g4").s("sine").gain(.01)',hash=crypto.createHash('sha256').update(code).digest('hex');
const rgb=hex=>'rgb('+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')+')';
(async()=>{const {browser,page}=await d.connect();const original=d.prefs().theme,checks=[];let complete=false,initial,final;
try{
 await d.key(page,'F8');await d.source(page,code);await d.key(page,'s',4);initial=await o.playing(page,hash);
 for(const name of ['rustel-dark','rustel-light','lsd','waves','scramble']){
  await d.theme(page,name);let state;
  for(let i=0;i<30;i++){
   state=await page.evaluate(()=>{const palette=JSON.parse(Rustel.uiTheme()),root=getComputedStyle(document.documentElement),style=getComputedStyle(document.querySelector('#tools button'));return {palette,background:root.getPropertyValue('--phone-background').trim(),foreground:style.color,fill:style.backgroundColor,border:style.borderTopColor,radius:style.borderTopLeftRadius,font:style.fontFamily};});
   if(state.background===state.palette.background)break;await page.waitForTimeout(100);
  }
  assert.strictEqual(state.background,state.palette.background);assert.strictEqual(state.foreground,rgb(state.palette.foreground));assert.strictEqual(state.fill,rgb(state.palette.surface));assert.strictEqual(state.border,rgb(state.palette.rule));assert.strictEqual(state.radius,'0px');assert(state.font.includes('monospace'));
  let selected;
  try{selected=await page.evaluate(()=>{const button=document.querySelector('[data-mod="4"]');button.click();const style=getComputedStyle(button);return {fill:style.backgroundColor,color:style.color};});assert.strictEqual(selected.fill,rgb(state.palette.selection));assert.strictEqual(selected.color,rgb(state.palette.selectionText));}finally{await page.evaluate(()=>clearModifiers());}
  const frames=[];for(let i=0;i<10;i++){await page.waitForTimeout(300);frames.push((await d.rows(page)).join('\n'));}
  checks.push({theme:name,colorsMatchNativePalette:true,monospaceAndSquareBorders:true,selectedModifierUsesThemeSelection:true,framesSampled:frames.length,framesWithChangedDisplayedSource:frames.filter(frame=>!frame.includes('note("c4 e4 g4").s("sine").gain(.01)')).length});
 }
 final=await o.playing(page,hash);assert(final.callbacks>initial.callbacks&&final.allocator_tripwire_armed);assert.strictEqual(final.callback_xruns,initial.callback_xruns);assert.strictEqual(final.late_events,initial.late_events);assert.strictEqual(final.callback_allocations,initial.callback_allocations);complete=true;
}finally{
 await d.key(page,'F8').catch(()=>{});await page.evaluate(()=>clearModifiers()).catch(()=>{});await d.theme(page,original).catch(()=>{});await browser.close();
 fs.writeFileSync(qa.result('phone-theme-live.json'),JSON.stringify({date:new Date().toISOString(),apkSha256:qa.digest,complete,checks,newXruns:final&&initial?final.callback_xruns-initial.callback_xruns:null,newLateEvents:final&&initial?final.late_events-initial.late_events:null,newCallbackAllocations:final&&initial?final.callback_allocations-initial.callback_allocations:null,limits:['Generated control events and computed CSS/native palette checks; native Settings dialogs and GPU pixels need separate inspection.','Changed visual source is expected for authored effects; source_revision continues to identify the original accepted score.','Five short theme samples, not the full theme suite or 16-part load qualification.']},null,2));
}
assert(complete);
})().catch(error=>{console.error(error);process.exit(1)});
