const qa=require('./regression-context.cjs');
const d=require('./device.cjs'),fs=require('fs'),cp=require('child_process'),path=require('path'),assert=require('assert');
const config='files/config/studio.json',temp='/data/local/tmp/rustel-qa-config-check.json',backup=cp.execFileSync(d.adb,['exec-out','run-as','cc.rustel.qa','cat',config]);
fs.writeFileSync(qa.result('config-recovery-original.private.json'),backup);
function replace(bytes){const local=qa.result('config-recovery-transfer.private.json');fs.writeFileSync(local,bytes);cp.execFileSync(d.adb,['push',local,temp],{stdio:'ignore'});d.shell('run-as','cc.rustel.qa','cp',temp,config);}
async function open(){d.shell('am','start','-n','cc.rustel.qa/cc.rustel.android.MainActivity');let connected;for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,200));try{connected=await d.connect();const rows=await d.rows(connected.page);if(rows.some(r=>r.includes('rustel')))return connected;await connected.browser.close();}catch{}}throw Error('QA terminal did not become ready');}
(async()=>{const cases=[];try{
 for(const [name,bytes,menu] of [['malformed-json',Buffer.from('{'),true],['wrong-type-valid-neighbor',Buffer.from(JSON.stringify({...JSON.parse(backup),frame_rate:{bad:1},show_menu:false})),false],['missing-values',Buffer.from('{}'),true]]){
  d.shell('am','force-stop','cc.rustel.qa');replace(bytes);const {browser,page}=await open();try{await page.waitForTimeout(600);const rows=await d.rows(page),menuVisible=rows.slice(0,3).some(r=>/File\s+Edit\s+Scene/.test(r));assert.strictEqual(menuVisible,menu,name);await d.key(page,'F2');await page.waitForTimeout(300);const helpResponsive=(await d.rows(page)).some(r=>/reference|Reference|help|Help/.test(r));assert(helpResponsive,name+' input unresponsive');await d.key(page,'Escape');cases.push({name,terminalReady:true,menuVisible,helpResponsive});}finally{await browser.close();}
 }
 }finally{d.shell('am','force-stop','cc.rustel.qa');replace(backup);assert(cp.execFileSync(d.adb,['exec-out','run-as','cc.rustel.qa','cat',config]).equals(backup));d.shell('rm',temp);const {browser}=await open();await browser.close();}
 const result={date:new Date().toISOString().slice(0,10),apkSha256:qa.digest,cases,originalConfigRestoredByteForByteBeforeRelaunch:true,limits:['QA config only; verifies startup, documented menu default and valid neighboring key retention, not every setting migration.']};fs.writeFileSync(qa.result('config-recovery-current.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exit(1)});
