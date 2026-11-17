const d=require('./device.cjs'),fs=require('fs'),path=require('path'),cp=require('child_process');
fs.mkdirSync(path.join(d.root,'screens'),{recursive:true});
const snap=name=>{let b=cp.execFileSync(d.adb,['exec-out','screencap','-p']);fs.writeFileSync(path.join(d.root,'screens',name+'.png'),b.subarray(b.indexOf(Buffer.from([137,80,78,71,13,10,26,10]))));};
(async()=>{const {browser,page}=await d.connect();try{
 const expected=fs.readFileSync(path.join(d.root,'readability-score.strudel'),'utf8').trimEnd().split(/\r?\n/);const menu='File  Edit  Scene  Transport  View  Options  Help';
 const all=JSON.parse(fs.readFileSync(path.join(d.root,'themes.json'),'utf8').replace(/^\uFEFF/,'')).themes.filter(n=>n!=='randomize');
 const names=['lsd',...all.filter(n=>n!=='lsd')],results=[];
 for(const name of names){await d.theme(page,name);const seconds=name==='lsd'?60:10;const samples=[];const start=Date.now();let previousShot=0;
  while(Date.now()-start<seconds*1000){await page.waitForTimeout(250);const rows=await d.rows(page);const missing=expected.filter(s=>!rows.some(r=>r.includes(s)));const menuOk=rows[0].includes(menu);let elapsed=Date.now()-start;samples.push({elapsedMs:elapsed,missing,menuOk,playing:rows[1].includes('PLAYING'),rows:missing.length||!menuOk?rows:undefined});
   if(elapsed>=2000&&elapsed-previousShot>=3000){previousShot=elapsed;snap('slow-'+name+'-'+Math.floor(elapsed/1000));}
   fs.writeFileSync(path.join(d.root,'theme-slow-progress.json'),JSON.stringify({theme:name,elapsedSeconds:elapsed/1000,completed:results.length,results,current:samples},null,2));
  }
  const result={name,actual:d.prefs().theme,durationMs:Date.now()-start,samples:samples.length,badTextFrames:samples.filter(s=>s.missing.length).length,badMenuFrames:samples.filter(s=>!s.menuOk).length,stoppedFrames:samples.filter(s=>!s.playing).length,failures:samples.filter(s=>s.missing.length||!s.menuOk||!s.playing)};results.push(result);fs.writeFileSync(path.join(d.root,'theme-slow-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(result));
 }await d.theme(page,'rustel-dark');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
