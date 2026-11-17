const qa=require('./regression-context.cjs'),d=require('./device.cjs'),picker=require('./document-picker.cjs'),fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert');
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'",hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const prefix='Rustel_QA_Boundary_'+Date.now(),name=prefix+'.strudel',remote='/sdcard/Download/'+name;
const original=d.prefs().last_set,limit=Number(process.argv[2]||4*1024*1024);
assert(Number.isInteger(limit)&&limit>=1024&&limit<=4*1024*1024,'Expected document bytes from 1024 through 4194304');
const head='// QA_BOUNDARY_START\nnote("c4").s("sine").gain(.02)\n/*\n',tail='\n*/\n// QA_BOUNDARY_END \u00e9';
const padding=Buffer.alloc(limit-Buffer.byteLength(head)-Buffer.byteLength(tail),120);for(let i=511;i<padding.length;i+=512)padding[i]=10;
const source=Buffer.concat([Buffer.from(head),padding,Buffer.from(tail)]);
assert.strictEqual(source.length,limit);
function pss(){const info=d.shell('dumpsys','meminfo','cc.rustel.qa');const match=info.match(/TOTAL PSS:\s*(\d+)/)||info.match(/^\s*TOTAL\s+(\d+)/m);assert(match,'Missing QA process PSS');return Number(match[1]);}
async function waitFor(page,predicate,message){for(let i=0;i<100;i++){if(await predicate())return;await page.waitForTimeout(200);}throw Error(message);}
(async()=>{const {browser,page}=await d.connect();let result,staged=false,restored=false,stage='setup',failure; const mark=value=>{stage=value;console.log('Boundary check: '+stage);};
try{
 await d.key(page,'F8');await page.waitForTimeout(400);const beforePssKiB=pss(),file=qa.result(name);fs.writeFileSync(file,source);cp.execFileSync(d.adb,['push',file,remote],{stdio:'ignore'});staged=true;
 mark('open-picker');await picker.open(page);const started=Date.now();await picker.select(page,name);mark('await-import');await waitFor(page,()=>d.prefs().last_set!==original,'Import did not complete within 20 seconds');const directory=d.prefs().last_set;assert(directory.includes('/files/config/sets/'+prefix));
 mark('render-start');await d.key(page,'Home',4);await waitFor(page,async()=>(await d.rows(page)).some(row=>row.includes('QA_BOUNDARY_START')),'Imported source did not render');const names=d.shell('run-as','cc.rustel.qa','ls','-1',quote(directory)).replace(/\r/g,'').split('\n').filter(file=>file.endsWith('.strudel'));assert.strictEqual(names.length,1);
 mark('verify-source');const saved=cp.execFileSync(d.adb,['exec-out','run-as','cc.rustel.qa','cat',directory+'/'+names[0]],{maxBuffer:8*1024*1024});assert(saved.equals(source),'Accepted-boundary source changed');
 const loadedMs=Date.now()-started;mark('navigate-end');await d.key(page,'End',4);await waitFor(page,async()=>(await d.rows(page)).some(row=>row.includes('QA_BOUNDARY_END')),'End of imported source did not render');const atBoundaryPssKiB=pss();await d.key(page,'Home',4);await waitFor(page,async()=>(await d.rows(page)).some(row=>row.includes('QA_BOUNDARY_START')),'Document navigation did not return to start');
 result={date:new Date().toISOString().slice(0,10),dateBasis:'UTC',apkSha256:qa.digest,complete:true,actualDownloadsPicker:true,acceptedBytes:source.length,finalUtf8Character:'U+00E9',sourceSha256:hash(source),durableSourceByteExact:true,documentStartAndEndRender:true,pickerSelectionToRenderedAndVerifiedMs:loadedMs,beforePssKiB,atBoundaryPssKiB,limits:[`One ${limit}-byte score with bounded 512-byte block-comment lines; no playback or general large-composition qualification.`,'PSS covers the main QA process, not all WebView/GPU processes. Two snapshots are not a retained-memory growth test.','Timing includes picker search, document copy, source loading and verification.','DocumentsUI Downloads provider on the connected test device; other providers remain untested.']};
}catch(error){failure=error;result={date:new Date().toISOString().slice(0,10),dateBasis:'UTC',apkSha256:qa.digest,complete:false,stage,error:error.message};}finally{
 try{mark('restore-set');await d.key(page,'Escape');await d.action(page,'open-set');await page.waitForTimeout(300);await d.key(page,'a',4);await d.text(page,original);await page.waitForTimeout(200);await d.key(page,'Enter');await waitFor(page,()=>d.prefs().last_set===original,'Original QA set was not restored');restored=true;}finally{if(staged)d.shell('rm','-f',quote(remote));await browser.close();}
}
assert(restored);result.originalQaSetRestored=true;result.attemptedBytes=limit;fs.writeFileSync(qa.result(limit===4*1024*1024?'import-boundary.json':`import-size-${limit}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(failure)throw failure;
})().catch(error=>{console.error(error);process.exit(1)});
