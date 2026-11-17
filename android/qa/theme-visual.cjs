const d=require('./device.cjs'),fs=require('fs'),path=require('path'),cp=require('child_process');
fs.mkdirSync(path.join(d.root,'screens'),{recursive:true});
(async()=>{const {browser,page}=await d.connect();try{
 const names=JSON.parse(fs.readFileSync(path.join(d.root,'themes.json'),'utf8').replace(/^\uFEFF/,'' )).themes.filter(n=>n!=='randomize');
 const expected=fs.readFileSync(path.join(d.root,'readability-score.strudel'),'utf8').trimEnd().split(/\r?\n/);const results=[];
 for(const name of names){await d.theme(page,name);await page.waitForTimeout(200);const rows=await d.rows(page);const missing=expected.filter(s=>!rows.some(r=>r.includes(s)));
 const b=cp.execFileSync(d.adb,['exec-out','screencap','-p']);fs.writeFileSync(path.join(d.root,'screens','visual-'+name+'.png'),b.subarray(b.indexOf(Buffer.from([137,80,78,71,13,10,26,10]))));
 const cells=await page.evaluate(()=>Array.from({length:term.rows},(_,y)=>Array.from({length:term.cols},(_,x)=>{const c=term.buffer.active.getLine(term.buffer.active.baseY+y).getCell(x);return {s:c.getChars(),fg:c.getFgColor(),bg:c.getBgColor(),fgMode:c.getFgColorMode(),bgMode:c.getBgColorMode(),w:c.getWidth()}})));
 fs.writeFileSync(path.join(d.root,'screens','visual-'+name+'.json'),JSON.stringify({rows,cells}));results.push({name,actual:d.prefs().theme,missing,playing:rows[1].includes('PLAYING')});fs.writeFileSync(path.join(d.root,'theme-visual-results.json'),JSON.stringify(results,null,2));console.log(name,missing.length);
 }await d.theme(page,'rustel-dark');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
