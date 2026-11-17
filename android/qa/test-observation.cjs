const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'observation.cjs'),'utf8');
const valid={playing:true,evaluating:false,visible_error:null,session_generation:2,confirmed_audio_generation:2,source_revision:'new'};
const line=(pid,state)=>'QA pid '+pid+' [performance] '+JSON.stringify({studio_runtime:state});
function harness(logs,pid='200'){
 let waits=0;const module={exports:{}};
 vm.runInNewContext(source,{module,require:name=>name==='./device.cjs'?{shell:()=>pid,adb:'test-adb'}:{execFileSync:()=>logs[Math.min(waits,logs.length-1)]},Error,JSON});
 return {o:module.exports,page:{waitForTimeout:async()=>{waits++;}},waits:()=>waits};
}
(async()=>{
 let h=harness([line('200',valid)+'\n'+line('100',{...valid,source_revision:'old'})]);assert.strictEqual(h.o.snapshot().source_revision,'new');
 h=harness([line('200',valid)+'\nQA pid 200 [performance] {']);assert.strictEqual(h.o.snapshot().source_revision,'new');
 h=harness(['',line('100',valid),line('200',valid)]);assert.strictEqual((await h.o.playing(h.page,'new')).source_revision,'new');assert.strictEqual(h.waits(),2);
 h=harness([line('200',{...valid,source_revision:'old'})]);await assert.rejects(h.o.playing(h.page,'new'),/did not confirm/);assert.strictEqual(h.waits(),40);
 h=harness([line('200',{...valid,confirmed_audio_generation:1}),line('200',valid)]);await h.o.playing(h.page,'new');assert.strictEqual(h.waits(),1);
 h=harness([line('200',{...valid,evaluating:true}),line('200',{...valid,visible_error:'test'}),line('200',valid)]);await h.o.playing(h.page,'new');assert.strictEqual(h.waits(),2);
 console.log('PASS: old PID, partial tail, delayed/missing records, stale source, unconfirmed generation, evaluation/error and bounded stalled-run checks');
})().catch(e=>{console.error(e);process.exit(1)});
