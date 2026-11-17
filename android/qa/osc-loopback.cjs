const qa=require('./regression-context.cjs'),d=require('./device.cjs'),o=require('./observation.cjs'),fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert');
function decode(data){
 const packets=[];let cursor=0;
 while(cursor<data.length){
  assert(data.subarray(cursor,cursor+8).equals(Buffer.from('#bundle\0')));
  const timetag=data.readBigUInt64BE(cursor+8),length=data.readUInt32BE(cursor+16),message=data.subarray(cursor+20,cursor+20+length);assert.strictEqual(message.length,length);let offset=0;
  function string(){const end=message.indexOf(0,offset);assert(end>=offset);const value=message.toString('utf8',offset,end);offset=(end+4)&~3;return value;}
  assert.strictEqual(string(),'/dirt/play');const tags=string(),args=[];assert(tags.startsWith(','));
  for(const tag of tags.slice(1)){if(tag==='s')args.push(string());else{assert(tag==='f'||tag==='i');const value=tag==='f'?message.readFloatBE(offset):message.readInt32BE(offset);assert(Number.isFinite(value));args.push(value);offset+=4;}}
  assert.strictEqual(offset,message.length);assert.strictEqual(args.length%2,0);const pairs={};for(let i=0;i<args.length;i+=2){assert.strictEqual(typeof args[i],'string');pairs[args[i]]=args[i+1];}packets.push({timetag,pairs});cursor+=20+length;
 }
 return packets;
}
(async()=>{
 const {browser,page}=await d.connect(),port=20000+Math.floor(Math.random()*10000),chunks=[],errors=[],remoteFile='/data/local/tmp/rustel-osc-'+port+'.bin';
 // Keep binary packets out of the terminal stream entirely.
 const listener=cp.spawn(d.adb,['shell','echo $$; exec toybox nc -u -l -s 127.0.0.1 -p '+port+' > '+remoteFile],{stdio:['ignore','pipe','pipe']});
 listener.stdout.on('data',x=>chunks.push(x));listener.stderr.on('data',x=>errors.push(x));const exited=new Promise(resolve=>listener.on('close',resolve));let result;
 function stopListener(){
  const captured=Buffer.concat(chunks),newline=captured.indexOf(10),pid=captured.subarray(0,newline).toString().trim();
  assert(/^[0-9]+$/.test(pid),'Listener PID missing');
  const command=d.shell('ps','-p',pid,'-o','ARGS=');
  if(command.includes('toybox nc')&&command.includes(String(port)))d.shell('kill',pid);
 }
 try{
  await page.waitForTimeout(400);await d.source(page,'note("c3 e3 g3 c4").s("sine").gain(.02).osc('+port+')');await d.key(page,'F5');const before=await o.playing(page);await page.waitForTimeout(6000);const after=o.snapshot();await d.key(page,'F8');stopListener();await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,2000))]);
  const data=cp.execFileSync(d.adb,['exec-out','cat',remoteFile],{maxBuffer:1024*1024});fs.writeFileSync(qa.result('osc-loopback.private.bin'),data);const packets=decode(data);
  assert(packets.length>=4);assert(packets.every(p=>p.pairs.s==='sine'&&p.timetag>0n&&!('oscport' in p.pairs)));assert(packets.every((p,i)=>i===0||p.timetag>=packets[i-1].timetag));assert(after.playing&&after.callbacks>before.callbacks);
  assert.deepStrictEqual([...new Set(packets.map(p=>p.pairs.midinote))].sort((a,b)=>a-b),[48,52,55,60]);assert(packets.every(p=>Math.abs(p.pairs.gain-.02)<1e-6));
  result={date:new Date().toISOString().slice(0,10),dateBasis:'UTC',apkSha256:qa.digest,complete:true,packets:packets.length,allDirtPlay:true,allSine:true,finiteNumericValues:true,monotonicTimetags:true,routingPortNotOnWire:true,observedArgumentNames:[...new Set(packets.flatMap(p=>Object.keys(p.pairs)))].sort(),newXruns:after.callback_xruns-before.callback_xruns,newLateEvents:after.late_events-before.late_events,newCallbackAllocations:after.callback_allocations-before.callback_allocations,limits:['Actual Android UDP output to a temporary phone-local listener, not PC-peer interoperability.','Receive/mapping, peer loss, multicast, backgrounding and external timing remain separate.']};assert(!result.newXruns&&!result.newLateEvents&&!result.newCallbackAllocations);
 }catch(error){fs.writeFileSync(qa.result('osc-loopback-incomplete.json'),JSON.stringify({complete:false,error:String(error),capturedBytes:Buffer.concat(chunks).length,stderr:Buffer.concat(errors).toString(),rows:await d.rows(page)},null,2));throw error;
 }finally{
  try{if(listener.exitCode===null)stopListener();}catch{}
  d.shell('rm','-f',remoteFile);
  await d.key(page,'F8').catch(()=>{});await d.source(page,fs.readFileSync(path.join(__dirname,'readability-hydra.strudel'),'utf8')).catch(()=>{});await browser.close();if(listener.exitCode===null)listener.kill();
 }
 fs.writeFileSync(qa.result('osc-loopback.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exit(1)});
