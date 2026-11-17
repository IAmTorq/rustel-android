'use strict';
const {chromium}=require('playwright'),path=require('path'),fs=require('fs'),url=require('url'),assert=require('assert');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||chromium.executablePath(),headless:true});
 try{
  const page=await browser.newPage({viewport:{width:576,height:576},deviceScaleFactor:2.5});
  await page.addInitScript(()=>window.Rustel={fontSize:()=>10,actions:()=> '[]',cameraFacing:()=> 'front',touchKeyboardEnabled:()=>false,ready(){},input(){},resized(){},ack(){},terminalFocus(){}});
  await page.goto(url.pathToFileURL(path.join(__dirname,'../app/assets/index.html')).href);
  await page.waitForFunction(()=>!!atlasBudget);
  const phases=[];
  // Keep the original 600 changing-RGB frames, then force the colored-glyph
  // fallback through another 600 inverse frames. Both must plateau; the
  // fallback must still exercise repeated atlas eviction.
  for(const inverse of [false,true]){
   const result=await page.evaluate(async inverse=>{
    const samples=[],initialClears=atlasBudget.clears;
    for(let frame=0;frame<600;frame++){
     let s='\x1b[?2026h\x1b[H'+(inverse?'\x1b[7m':'\x1b[27m');
     for(let y=0;y<12;y++){
      for(let x=0;x<70;x++){
       const color=(frame*11179+x*733+y*1591)&0xffffff;
       s+='\x1b[38;2;'+((color>>16)&255)+';'+((color>>8)&255)+';'+(color&255)+'m\x1b[48;2;'+((color>>16)&255)+';'+((color>>8)&255)+';'+(color&255)+'m'+String.fromCharCode(33+x%90);
      }
      s+='\r\n';
     }
     await new Promise(resolve=>term.write(s+'\x1b[?2026l',resolve));await new Promise(resolve=>setTimeout(resolve,25));
     samples.push({frame,pixels:atlasBudget.pixels,clears:atlasBudget.clears-initialClears});
    }
    return {samples,renderer:document.documentElement.dataset.renderer};
   },inverse);
   const peak=Math.max(...result.samples.map(x=>x.pixels));
   const early=Math.max(...result.samples.slice(0,200).map(x=>x.pixels));
   const late=Math.max(...result.samples.slice(400).map(x=>x.pixels));
   const summary={phase:inverse?'inverse fallback':'RGB masks',frames:600,peakAtlasPixels:peak,earlyPeak:early,latePeak:late,final:result.samples.at(-1),renderer:result.renderer};
   phases.push({...summary,samples:result.samples});fs.writeFileSync(path.join(__dirname,'cache-gpu-stress.json'),JSON.stringify(phases));console.log(JSON.stringify(summary));
   assert(result.renderer==='webgl');
   if(inverse)assert(result.samples.at(-1).clears>5,'Fallback did not exercise repeated eviction');
   assert(peak<16*1024*1024,'GPU atlas grew beyond stress budget');
   assert(late<=early*1.5,'Atlas capacity kept growing after warmup');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
