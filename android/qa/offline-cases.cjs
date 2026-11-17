// Execute an explicitly supplied public case list in the installed QA worker.
const qa=require('./regression-context.cjs'),d=require('./device.cjs'),fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert');
const input=process.argv[2];assert(input,'Pass a public case JSON path');const bytes=fs.readFileSync(path.resolve(input)),cases=JSON.parse(bytes),names=cases.map(item=>item.case);
assert(cases.length>0&&new Set(names).size===names.length&&names.every(name=>typeof name==='string'&&name.length));assert(cases.every(item=>typeof item.source==='string'&&Number.isFinite(item.dur)&&item.dur>0));
const directory='files/qa-corpus',stamp=Date.now(),temporary='/data/local/tmp/rustel-qa-cases-'+stamp+'.json';
const raw=name=>cp.execFileSync(d.adb,['exec-out','run-as','cc.rustel.qa','cat',directory+'/'+name],{maxBuffer:32*1024*1024});
(async()=>{const {browser,page}=await d.connect();let started=false,complete=false,result;const begin=Date.now();
try{
 await d.key(page,'F8');await page.waitForTimeout(300);d.shell('run-as','cc.rustel.qa','mkdir','-p',directory);const previous=d.shell('run-as','cc.rustel.qa','ls','-1',directory).replace(/\r/g,'').split('\n');
 if(previous.includes('status.json'))assert(JSON.parse(raw('status.json')).complete,'Previous worker must be completed before replacement');
 for(const name of ['cases.json','status.json','results.jsonl','fatal.json'])if(previous.includes(name))fs.writeFileSync(qa.result('prior-worker-'+stamp+'-'+name),raw(name));
 d.shell('run-as','cc.rustel.qa','rm','-f',directory+'/status.json',directory+'/results.jsonl',directory+'/fatal.json',directory+'/cancel');
 cp.execFileSync(d.adb,['push',path.resolve(input),temporary],{stdio:'ignore'});d.shell('chmod','644',temporary);d.shell('run-as','cc.rustel.qa','cp',temporary,directory+'/cases.json');assert(raw('cases.json').equals(bytes),'Case transfer changed bytes');
 assert(await page.evaluate(()=>Rustel.qaRun()),'QA worker refused to start');started=true;const pid=d.shell('pidof','cc.rustel.qa').trim();
 const deadline=Date.now()+120000;for(let i=0;i<600&&Date.now()<deadline;i++){
  await page.waitForTimeout(200);assert.strictEqual(d.shell('pidof','cc.rustel.qa').trim(),pid,'QA process changed during run');const files=d.shell('run-as','cc.rustel.qa','ls','-1',directory).replace(/\r/g,'').split('\n');assert(!files.includes('fatal.json'),'Worker reported fatal error');
  if(!files.includes('status.json'))continue;let status;try{status=JSON.parse(raw('status.json'));}catch{continue;}if(!status.complete)continue;
  assert.strictEqual(status.total,cases.length);assert.strictEqual(status.index,cases.length);const output=raw('results.jsonl'),rows=output.toString('utf8').trim().split('\n').map(line=>JSON.parse(line));assert.strictEqual(rows.length,cases.length);assert.deepStrictEqual(rows.map(row=>row.case),names);fs.writeFileSync(qa.result('offline-cases-device.jsonl'),output);
  result={date:new Date().toISOString().slice(0,10),dateBasis:'UTC',apkSha256:qa.digest,casesSha256:crypto.createHash('sha256').update(bytes).digest('hex'),complete:true,status,wallMilliseconds:Date.now()-begin,limits:['Debug-only native offline worker, not realtime playback or acoustic qualification.','Case names/order/count and current process are verified; individual results still require comparison with the reference.']};complete=true;break;
 }
 assert(complete,'Worker did not complete within its two-minute observation window');
}finally{if(started&&!complete)d.shell('run-as','cc.rustel.qa','touch',directory+'/cancel');d.shell('rm','-f',temporary);await browser.close();}
fs.writeFileSync(qa.result('offline-cases-run.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exit(1)});
