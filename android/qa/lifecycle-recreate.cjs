const d=require('./device.cjs'),fs=require('fs'),path=require('path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const results=[];for(let i=0;i<12;i++){
 let {browser,page}=await d.connect();let before=await d.rows(page);if(!before.some(r=>r.includes('QA_User_Set')))throw Error('Set missing before recreation '+i);
 try{await page.evaluate(()=>Rustel.qaRecreate());}catch(e){if(!/closed|destroyed/.test(String(e)))throw e;}try{await browser.close();}catch{}
 await delay(750);({browser,page}=await d.connect());await page.waitForFunction(()=>term.buffer.active.getLine(term.buffer.active.baseY+1)?.translateToString().includes('QA_User_Set'),{timeout:5000});
 await d.key(page,'ArrowDown');await page.waitForTimeout(100);let rows=await d.rows(page);results.push({round:i+1,header:rows[1],footer:rows.slice(-2),alive:rows.some(r=>r.includes('rustel STOPPED'))});fs.writeFileSync(path.join(d.root,'lifecycle-recreate.json'),JSON.stringify(results,null,2));await browser.close();console.log('recreated',i+1);
 }} )().catch(e=>{console.error(e);process.exitCode=1});
