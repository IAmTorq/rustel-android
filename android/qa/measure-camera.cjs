// Run with an active camera theme in the isolated QA app. No image data is read.
const d=require('./device.cjs'),fs=require('fs');
(async()=>{
 const {browser,page}=await d.connect();
 try{
  const samples=[];
  for(let i=0;i<6;i++){
   samples.push(await page.evaluate(()=>({time:Date.now(),...JSON.parse(Rustel.qaCameraStats())})));
   if(i<5)await page.waitForTimeout(2000);
  }
  const first=samples[0],last=samples.at(-1),seconds=(last.time-first.time)/1000;
  if(!first.foreground||!last.foreground||first.leases<1||last.leases<1||last.callbacks<=first.callbacks)
   throw Error('Camera must remain active throughout the measurement');
  const result={samples,seconds,callbackFps:(last.callbacks-first.callbacks)/seconds,
   publishedFps:(last.published-first.published)/seconds,
   throttledFrames:last.throttled-first.throttled};
  if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
