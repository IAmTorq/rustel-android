const qa=require('./regression-context.cjs');
const d=require('./device.cjs'),fs=require('fs'),assert=require('assert');
const dir=qa.directory;
const list=()=>d.shell('run-as','cc.rustel.qa','ls','-1',dir).replace(/\r/g,'').trim().split('\n').filter(n=>n.endsWith('.strudel'));
const read=n=>d.shell('run-as','cc.rustel.qa','cat',JSON.stringify(dir+'/'+n)).replace(/\r\n/g,'\n');
(async()=>{const {browser,page}=await d.connect();const mode=d.shell('run-as','cc.rustel.qa','stat','-c','%a',dir).trim();assert(/^\d{3,4}$/.test(mode));let restricted=false;try{
 await d.key(page,'F8');const before=list();await d.action(page,'new-scene');await page.waitForTimeout(600);const added=list().filter(n=>!before.includes(n));assert.strictEqual(added.length,1);const file=added[0];
 const baseline='// QA save failure baseline\nnote("c3").s("sine").gain(.02)',changed='// QA save failure retry\nnote("e3").s("sine").gain(.02)';
 await d.source(page,baseline);await d.key(page,'s',4);for(let i=0;i<25&&read(file).trim()!==baseline;i++)await page.waitForTimeout(200);assert.strictEqual(read(file).trim(),baseline);
 d.shell('run-as','cc.rustel.qa','chmod','500',dir);restricted=true;await d.source(page,changed);await d.key(page,'s',4);let rows=[];
 for(let i=0;i<30;i++){await page.waitForTimeout(200);rows=await d.rows(page);if(rows.some(r=>/could not save|permission denied|Permission denied/.test(r)))break;}
 const visibleFailure=rows.some(r=>/could not save|permission denied|Permission denied/.test(r));assert(visibleFailure,'No visible write failure');assert.strictEqual(read(file).trim(),baseline);await d.action(page,'close-scene');await page.waitForTimeout(400);assert((await d.rows(page)).slice(0,3).some(r=>r.includes(file.slice(0,-8))),'Failed close lost current tab');assert.strictEqual(read(file).trim(),baseline);
 d.shell('run-as','cc.rustel.qa','chmod',mode,dir);restricted=false;await d.key(page,'s',4);for(let i=0;i<30&&read(file).trim()!==changed;i++)await page.waitForTimeout(200);assert.strictEqual(read(file).trim(),changed);assert.strictEqual(d.shell('run-as','cc.rustel.qa','stat','-c','%a',dir).trim(),mode);
 const result={date:new Date().toISOString().slice(0,10),apkSha256:qa.digest,visibleWriteFailure:true,existingSourceUnchangedOnFailure:true,unsavedEditRetainedForRetry:true,failedCloseKeepsUnsavedSceneOpen:true,retrySavedExactSource:true,originalDirectoryModeRestored:true,limits:['Scoped permission failure in disposable QA set; actual storage-full, provider and config failures remain open.']};fs.writeFileSync(qa.result('save-failure-current.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await d.key(page,'F8');await d.action(page,'close-scene');
 }finally{if(restricted)d.shell('run-as','cc.rustel.qa','chmod',mode,dir);await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
