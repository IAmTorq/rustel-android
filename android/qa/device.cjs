const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const root=__dirname;
const adb=process.env.ADB || 'adb';
function shell(...args){return execFileSync(adb,['shell',...args],{encoding:'utf8',maxBuffer:16*1024*1024});}
async function connect(){
 const pid=shell('pidof','cc.rustel.qa').trim().split(' ')[0];
 execFileSync(adb,['forward','tcp:9223','localabstract:webview_devtools_remote_'+pid]);
 const browser=await chromium.connectOverCDP('http://127.0.0.1:9223');
 const page=browser.contexts()[0].pages().find(p=>p.url().includes('rustel.local'));
 if(!page)throw Error('Rustel QA WebView not found');
 return {browser,page};
}
async function rows(page){return page.evaluate(()=>Array.from({length:term.rows},(_,y)=>term.buffer.active.getLine(term.buffer.active.baseY+y)?.translateToString(true)||''));}
async function key(page,name,mask=0){await page.evaluate(([n,m])=>hardwareKey(n,m,1),[name,mask]);}
async function text(page,value){await page.evaluate(s=>Rustel.input(s),value);}
async function action(page,name){await page.evaluate(s=>invokeAction(s),name);}
async function source(page,code){
 await key(page,'Escape');await key(page,'a',4);
 await page.evaluate(s=>pasteText(s),code);
 await page.waitForTimeout(200);
}
async function theme(page,name){
 await key(page,'Escape');await key(page,'t',4);await text(page,name);await key(page,'Home');
 await page.waitForTimeout(250);await key(page,'Enter');
 for(let i=0;i<30;i++){
  if(prefs().theme===name)return;
  await page.waitForTimeout(150);
 }
 throw Error('Requested QA theme did not persist: '+name);
}
function prefs(){return JSON.parse(shell('run-as','cc.rustel.qa','cat','files/config/studio.json'));}
module.exports={connect,rows,key,text,action,source,theme,prefs,shell,adb,root};
if(require.main===module){(async()=>{const {browser,page}=await connect();
 const command=process.argv[2];
 if(command==='rows')console.log(JSON.stringify({rows:await rows(page),info:await page.evaluate(()=>({renderer:document.documentElement.dataset.renderer,cols:term.cols,rows:term.rows,fontSize:term.options.fontSize,actions:catalog.length,pixelRatio:devicePixelRatio})),prefs:prefs()},null,2));
 else if(command==='eval')console.log(JSON.stringify(await page.evaluate(process.argv[3])));
 else if(command==='theme'){await theme(page,process.argv[3]);console.log(JSON.stringify({rows:await rows(page),theme:prefs().theme}));}
 else if(command==='source'){await source(page,fs.readFileSync(process.argv[3],'utf8'));console.log(JSON.stringify(await rows(page)));}
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});}
