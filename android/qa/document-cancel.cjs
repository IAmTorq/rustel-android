// Actual Downloads cancellation; provider timing and copy races need separate tests.
const qa=require('./regression-context.cjs'),d=require('./device.cjs'),picker=require('./document-picker.cjs'),fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function inventory(){
 const names=d.shell('run-as','cc.rustel.qa','ls','-1',qa.directory).replace(/\r/g,'').split('\n').filter(name=>name==='rustel-set.json'||name.endsWith('.strudel')).sort();
 return names.map(name=>[name,hash(cp.execFileSync(d.adb,['exec-out','run-as','cc.rustel.qa','cat',qa.directory+'/'+name],{maxBuffer:8*1024*1024}))]);
}
(async()=>{const {browser,page}=await d.connect();let result;
try{
 await d.key(page,'F8');const before=inventory(),original=d.prefs().last_set;
 for(let attempt=0;attempt<3;attempt++){
  await picker.open(page);d.shell('input','keyevent','KEYCODE_BACK');await page.waitForTimeout(350);
  assert.strictEqual(d.prefs().last_set,original);assert.deepStrictEqual(inventory(),before);
  assert.strictEqual(d.shell('run-as','cc.rustel.qa','ls','-1','cache/pattern-imports').trim(),'');
 }
 // The last cancellation must release ownership too.
 await picker.open(page);d.shell('input','keyevent','KEYCODE_BACK');await page.waitForTimeout(350);
 assert.strictEqual(d.prefs().last_set,original);assert.deepStrictEqual(inventory(),before);
 result={date:new Date().toISOString(),apkSha256:qa.digest,complete:true,actualDownloadsPicker:true,cancellations:4,pickerReopensAfterCancellation:true,savedSceneAndManifestHashesUnchanged:true,stagingDirectoryEmpty:true,limits:['DocumentsUI cancellation and reopen only; no delayed provider, cross-mode completion, process death or copying interruption qualification.']};
}finally{await d.key(page,'Escape').catch(()=>{});await browser.close();}
fs.writeFileSync(qa.result('document-cancel.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exit(1)});
