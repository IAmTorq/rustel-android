const d=require('./device.cjs'),fs=require('fs'),path=require('path');
const expected=[
 '// QA_ASCII_0123456789 abcXYZ (){}[]+-/*',
 '// Unicode: caf\u00e9 \u00b5 \u0394 \u4e2d\u6587 \u2192 \u266b',
 'const level = 0.02',
 'setcps(0.5)',
 '$: note("c3 e3 g3 b3").s("sine").gain(level)',
 '// QA_END_SENTINEL_9876543210'
];
(async()=>{const {browser,page}=await d.connect();try{
 const names=JSON.parse(fs.readFileSync(path.join(d.root,'themes.json'),'utf8').replace(/^\uFEFF/,'' )).themes.filter(n=>n!=='randomize');
 await d.source(page,expected.join('\n')+'\n');await d.key(page,'Home',4);await page.waitForTimeout(300);
 const results=[];
 for(const name of names){
  await d.theme(page,name);
  const snapshots=[];
  for(let i=0;i<6;i++){
   await page.waitForTimeout(300);
   const rows=await d.rows(page);
   const missing=expected.filter(s=>!rows.some(r=>r.includes(s)));
   snapshots.push({missing,rows:missing.length?rows:undefined});
  }
  const actual=d.prefs().theme;
  const result={name,actual,frames:snapshots.length,badFrames:snapshots.filter(s=>s.missing.length).length,snapshots};results.push(result);
  if(result.badFrames){await page.screenshot({path:path.join(d.root,'screens','theme-'+name+'.png')});}
  fs.writeFileSync(path.join(d.root,'theme-audit.json'),JSON.stringify({device:'Titan 2 Android 16',expected,results},null,2));
  console.log(JSON.stringify({name,actual,badFrames:result.badFrames,total:results.length}));
 }
 await d.theme(page,'rustel-dark');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
