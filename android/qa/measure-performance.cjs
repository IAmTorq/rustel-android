const d=require('./device.cjs'),fs=require('fs'),path=require('path');
(async()=>{const {browser,page}=await d.connect();try{
 const result=await page.evaluate(async()=>{
  const stats={renders:0,frames:0,chunks:0,bytes:0,raf:[],start:performance.now()};
  const old=window.receive;let tail='';const off=term.onRender(()=>stats.renders++);
  window.receive=b=>{let raw=atob(b);stats.chunks++;stats.bytes+=raw.length;stats.frames+=((tail+raw).match(/\x1b\[\?2026l/g)||[]).length;tail=raw.slice(-7);old(b)};
  let previous=performance.now(),active=true;const tick=now=>{stats.raf.push(now-previous);previous=now;if(active)requestAnimationFrame(tick)};requestAnimationFrame(tick);
  await new Promise(r=>setTimeout(r,8000));active=false;window.receive=old;off.dispose();stats.elapsed=performance.now()-stats.start;stats.raf.sort((a,b)=>a-b);
  return {...stats,raf:undefined,rafP50:stats.raf[Math.floor(stats.raf.length*.5)],rafP95:stats.raf[Math.floor(stats.raf.length*.95)],rafMax:Math.max(...stats.raf),atlasPixels:atlasBudget?.pixels,clears:atlasBudget?.clears};
 });
 fs.writeFileSync(path.join(d.root,process.argv[2]||'performance-current.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
