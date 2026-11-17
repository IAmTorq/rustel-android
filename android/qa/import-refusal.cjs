const qa=require('./regression-context.cjs'),d=require('./device.cjs'),picker=require('./document-picker.cjs'),fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert');
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'",hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const original=d.prefs().last_set,prefix='Rustel_QA_Refusal_'+Date.now(),staged=[];
function inventory(){const names=d.shell('run-as','cc.rustel.qa','ls','-1',quote(qa.directory)).replace(/\r/g,'').split('\n').filter(file=>file==='rustel-set.json'||file.endsWith('.strudel')).sort();return names.map(name=>[name,hash(cp.execFileSync(d.adb,['exec-out','run-as','cc.rustel.qa','cat',qa.directory+'/'+name],{maxBuffer:16*1024*1024}))]);}
(async()=>{const {browser,page}=await d.connect();const checks=[];let result;
try{
 await d.key(page,'F8');const baseline=inventory();
 for(const [suffix,bytes,error] of [['empty',0,'empty'],['overflow',4*1024*1024+1,'maximum 4 MiB'],['overflow-repeat',4*1024*1024+1,'maximum 4 MiB']]){
  const name=prefix+'_'+suffix+'.strudel',remote='/sdcard/Download/'+name,file=qa.result(name);fs.writeFileSync(file,Buffer.alloc(bytes,120));cp.execFileSync(d.adb,['push',file,remote],{stdio:'ignore'});staged.push(remote);await picker.open(page);await picker.select(page,name);await page.waitForTimeout(800);await picker.dismissError(page,error);assert.strictEqual(d.prefs().last_set,original);assert.deepStrictEqual(inventory(),baseline);assert.strictEqual(d.shell('run-as','cc.rustel.qa','ls','-1','cache/pattern-imports').trim(),'');await d.key(page,'Escape');checks.push({case:suffix,inputBytes:bytes,nativeErrorConfirmed:true,originalSetAndSavedSceneHashesUnchanged:true,stagingDirectoryEmpty:true});
 }
 result={date:new Date().toISOString().slice(0,10),dateBasis:'UTC',apkSha256:qa.digest,complete:true,actualDownloadsPicker:true,checks,limits:['Current QA set scene files and manifest are checked; sample caches and all other sets are not rehashed.','No retained-memory or cancellation-race qualification.','Native UI errors are checked with DocumentsUI; other providers remain untested.']};
}finally{for(const remote of staged)d.shell('rm','-f',quote(remote));await d.key(page,'Escape').catch(()=>{});await browser.close();}
fs.writeFileSync(qa.result('import-refusal.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exit(1)});
