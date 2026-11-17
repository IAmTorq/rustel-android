const d=require('./device.cjs'),cp=require('child_process');
function snapshot(){
 const pid=d.shell('pidof','cc.rustel.qa').trim().split(' ')[0];
 const log=cp.execFileSync(d.adb,['shell','run-as','cc.rustel.qa','tail','-n','100','files/config/sessions/studio.log'],{encoding:'utf8',maxBuffer:16*1024*1024});
 for(const line of log.split('\n').reverse()){
  if(!line.includes('pid '+pid+' ')||!line.includes('[performance] '))continue;
  let record;
  try{record=JSON.parse(line.split('[performance] ')[1]);}catch{continue;}
  if(record.studio_runtime)return record.studio_runtime;
 }
 const error=new Error('No current-PID telemetry');error.code='RUSTEL_QA_NO_TELEMETRY';throw error;
}
async function playing(page,source){
 for(let i=0;i<40;i++){
  let record;
  try{record=snapshot();}catch(error){if(error.code!=='RUSTEL_QA_NO_TELEMETRY')throw error;}
  if(record&&record.playing&&!record.evaluating&&!record.visible_error&&record.confirmed_audio_generation===record.session_generation&&(!source||record.source_revision===source))return record;
  await page.waitForTimeout(200);
 }
 throw Error('Expected playback generation did not confirm');
}
module.exports={snapshot,playing};
