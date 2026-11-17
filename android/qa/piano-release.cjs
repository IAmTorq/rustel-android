// Verify real key-up/focus-loss audio with a private output take.
const qa=require('./regression-context.cjs'),d=require('./device.cjs'),o=require('./observation.cjs'),fs=require('fs'),cp=require('child_process'),assert=require('assert');
const folder='files/config/recordings';
assert(!d.prefs().recordings_directory,'Custom recording directory needs isolation');
assert(d.prefs().trim_recordings===false,'Disable trim recordings for this measurement, then restore it afterward');
const list=()=>d.shell('run-as','cc.rustel.qa','ls','-1',folder).trim().split('\n').map(x=>x.trim()).filter(x=>x.endsWith('.wav'));
(async()=>{const{browser,page}=await d.connect();let recording=false,piano=false,complete=false,failure;
try{
 await d.key(page,'Escape');await d.key(page,'F8');await d.source(page,'silence // QA_PIANO_RELEASE');await d.key(page,'F5');await o.playing(page);
 if((await d.rows(page)).some(x=>/\bPIANO\b/.test(x)))await d.action(page,'piano-mode');
 const before=list();await d.action(page,'piano-mode');piano=true;await d.action(page,'record-take');recording=true;
 await page.waitForTimeout(600);
 await page.evaluate(()=>hardwareKey('a',0,1));await page.waitForTimeout(400);
 await page.evaluate(()=>hardwareKey('a',0,3));await page.waitForTimeout(1200);
 await page.evaluate(()=>hardwareKey('a',0,1));await page.waitForTimeout(1200);
 // Actual Activity pause/resume exercises the native focus event.
 d.shell('input','keyevent','KEYCODE_HOME');await page.waitForTimeout(1200);
 d.shell('am','start','-n','cc.rustel.qa/cc.rustel.android.MainActivity');await page.waitForTimeout(700);
 await page.evaluate(()=>hardwareKey('a',0,2));await page.waitForTimeout(500);
 await page.evaluate(()=>hardwareKey('a',0,3));await page.waitForTimeout(1800);
 await d.action(page,'record-take');recording=false;await page.waitForTimeout(600);
 const added=list().filter(x=>!before.includes(x));assert.strictEqual(added.length,1);assert(/^[A-Za-z0-9_.-]+\.wav$/.test(added[0]));
 const bytes=cp.execFileSync(d.adb,['exec-out','run-as','cc.rustel.qa','cat',folder+'/'+added[0]],{maxBuffer:16*1024*1024});
 assert(bytes.length>44&&bytes.readUInt32LE(4)+8===bytes.length,'Take not finalized');
 fs.writeFileSync(qa.result('piano-release.wav'),bytes);
 assert((await d.rows(page)).some(row=>row.includes('QA_PIANO_RELEASE')),'Piano keys edited source');complete=true;
}catch(error){failure=error.message;throw error;}
finally{
 if(recording)await d.action(page,'record-take').catch(()=>{});
 await page.evaluate(()=>hardwareKey('a',0,3)).catch(()=>{});await d.key(page,'F8').catch(()=>{});
 if(piano)await d.action(page,'piano-mode').catch(()=>{});await browser.close();
 fs.writeFileSync(qa.result('piano-release.json'),JSON.stringify({date:new Date().toISOString(),apkSha256:qa.digest,complete,failure,
 sourcePreserved:complete,actualActivityPauseResume:true,keyUpAndStaleRepeatDispatched:true,
 limits:['Generated input dispatch, not a person holding a physical key.','Independent WAV analysis must verify signal and released-note silence; dispatch success alone is not an audio pass.']},null,2));
}
console.log('Piano release take captured; PCM analysis required');
})().catch(error=>{console.error(error);process.exit(1)});
