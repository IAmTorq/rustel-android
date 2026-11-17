const qa=require('./regression-context.cjs'),d=require('./device.cjs'),fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert');
const exportsDir=qa.directory+'/exports';
function files(){try{return d.shell('run-as','cc.rustel.qa','ls','-1',exportsDir).trim().split('\n').filter(Boolean);}catch(error){if(String(error.stderr).includes('No such file or directory'))return [];throw error;}}
(async()=>{const {browser,page}=await d.connect();const result={date:new Date().toISOString().slice(0,10),dateBasis:'UTC',apkSha256:qa.digest,cases:[],limits:['Structural/decode checks are separate from listening and export quality judgments.','One short native-instrument score; cancellation, long export, storage failure and stems remain separate.']};
try{
 await d.key(page,'F8');await d.source(page,'note("c3 e3 g3 c4").s("triangle").gain(.1)');
 const original=files();await d.action(page,'export');await page.waitForTimeout(300);await d.key(page,'Escape');assert.deepStrictEqual(files(),original,'Opening/cancelling sheet wrote a file');result.cancelBeforeRenderWritesNothing=true;
 for(const format of ['wav','mp3','mid']){
  const before=files();await d.action(page,'export');await page.waitForTimeout(250);await d.key(page,'ArrowDown');await d.key(page,'1');await d.key(page,'ArrowDown');
  // Select explicitly: export settings can persist from the preceding take.
  await d.key(page,'ArrowLeft');await d.key(page,'ArrowLeft');if(format!=='wav')await d.key(page,'ArrowRight');if(format==='mid')await d.key(page,'ArrowRight');
  assert((await d.rows(page)).some(r=>r.includes(format==='mid'?'midi':format)),'Format missing from export sheet');await d.key(page,'Enter');
  let added=[],completed=false;for(let i=0;i<450;i++){await page.waitForTimeout(200);const rows=await d.rows(page);if(rows.some(r=>/cannot export|export of .* failed/.test(r)))throw Error(rows.join('\n'));added=files().filter(f=>!before.includes(f)&&f.endsWith('.'+format));if(added.length&&rows.some(r=>/exported /.test(r))){completed=true;break;}}
  assert(completed,'Export did not report completion within 90 seconds');assert.strictEqual(added.length,1,'Expected one completed export');
  const bytes=cp.execFileSync(d.adb,['exec-out','run-as','cc.rustel.qa','cat',exportsDir+'/'+added[0]],{maxBuffer:32*1024*1024});assert(bytes.length>100);fs.writeFileSync(qa.result('export-probe.'+format),bytes);result.cases.push({format,bytes:bytes.length});await d.key(page,'Escape');
 }
 result.complete=true;
}finally{await d.key(page,'Escape').catch(()=>{});await d.key(page,'F8').catch(()=>{});await d.source(page,fs.readFileSync(path.join(__dirname,'readability-hydra.strudel'),'utf8')).catch(()=>{});await browser.close();}
fs.writeFileSync(qa.result('export-audio.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));})().catch(e=>{console.error(e);process.exit(1)});
