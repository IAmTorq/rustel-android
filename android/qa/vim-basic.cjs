const qa=require('./regression-context.cjs'),d=require('./device.cjs'),fs=require('fs'),assert=require('assert');
async function selectBindings(page,value){
 await d.key(page,'Escape');await d.key(page,'o',4);
 let found=false;
 for(let i=0;i<9;i++){
  await d.key(page,'Home');await page.waitForTimeout(150);
  if((await d.rows(page)).some(r=>r.includes('\u25b8')&&r.toLowerCase().includes('terminal'))){await d.key(page,'ArrowDown');await page.waitForTimeout(150);found=(await d.rows(page)).some(r=>r.includes('\u25b8')&&r.toLowerCase().includes('editor keybindings'));break;}
  await d.key(page,'Tab');await page.waitForTimeout(100);
 }
 assert(found,'Editor keybindings setting not found');
 for(let i=0;i<3;i++){if((await d.rows(page)).some(r=>r.includes('\u25b8')&&r.toLowerCase().includes('editor keybindings')&&r.toLowerCase().includes(value==='vim'?'vim':'default')))break;await d.key(page,'ArrowRight');await page.waitForTimeout(150);}
 await d.key(page,'Escape');for(let i=0;i<25&&d.prefs().editor_keybindings!==value;i++)await page.waitForTimeout(200);assert.strictEqual(d.prefs().editor_keybindings,value);
}
const list=()=>d.shell('run-as','cc.rustel.qa','ls','-1',qa.directory).replace(/\r/g,'').trim().split('\n').filter(n=>n.endsWith('.strudel'));
(async()=>{const {browser,page}=await d.connect(),original=d.prefs().editor_keybindings||'default';let result;try{
 await d.key(page,'F8');await selectBindings(page,'vim');const before=list();await d.action(page,'new-scene');await page.waitForTimeout(500);const added=list().filter(n=>!before.includes(n));assert.strictEqual(added.length,1);
 await d.key(page,'i');await d.text(page,'abc');await d.key(page,'Escape');await d.key(page,'0');await d.key(page,'x');await d.key(page,'u');await d.key(page,'r',4);await d.key(page,'A',1);await d.text(page,'D');await d.key(page,'Escape');await d.key(page,'o');await d.text(page,'//second');await d.key(page,'Escape');await d.action(page,'close-scene');await page.waitForTimeout(500);
 const source=d.shell('run-as','cc.rustel.qa','cat',JSON.stringify(qa.directory+'/'+added[0])).replace(/\r\n/g,'\n').trimEnd();assert.strictEqual(source,'bcD\n//second');
 result={date:new Date().toISOString().slice(0,10),apkSha256:qa.digest,settingsUiSelectsVim:true,insertNormalDeleteUndoRedoAppendOpenLine:true,exactSavedSource:true,limits:['Basic native bridge Vim regression, not all profiles, mappings or hardware modifiers.']};
 }finally{try{await selectBindings(page,original);}finally{await browser.close();}}
 result.originalEditorModeRestored=true;fs.writeFileSync(qa.result('vim-basic.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));})().catch(e=>{console.error(e);process.exit(1)});
