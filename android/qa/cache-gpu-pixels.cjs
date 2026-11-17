'use strict';
const {chromium}=require('playwright');
const path=require('path'),url=require('url'),assert=require('assert');

// Compare actual rendered pixels after cache churn, including styles that must
// retain their background-dependent glyph cache keys.
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||chromium.executablePath(),headless:true});
 try{
  const page=await browser.newPage({viewport:{width:576,height:576},deviceScaleFactor:2.5});
  await page.addInitScript(()=>window.Rustel={fontSize:()=>10,actions:()=> '[]',cameraFacing:()=> 'front',touchKeyboardEnabled:()=>false,ready(){},input(){},resized(){},ack(){},terminalFocus(){}});
  await page.goto(url.pathToFileURL(path.join(__dirname,'../app/assets/index.html')).href);
  await page.waitForFunction(()=>!!atlasBudget);
  const write=s=>page.evaluate(s=>new Promise(resolve=>term.write(s,resolve)),s);
  const fixed='\x1b[?25l\x1b[0m\x1b[2J\x1b[H'+[
   '\x1b[38;2;233;170;30m\x1b[48;2;20;60;100mASCII abcXYZ 012345 ()[]{} +-/*',
   '\x1b[7mInverse text\x1b[27m normal \x1b[2mdim text\x1b[22m',
   '\x1b[1mBold\x1b[22m \x1b[3mItalic\x1b[23m \x1b[4mUnderline\x1b[24m',
   '\x1b[0mUnicode: café µ Δ 中文 → ♫ ⣿⣷⡇',
   '\x1b[38;2;19;210;107m\x1b[48;2;117;16;91mGreen on purple\x1b[7m reversed\x1b[0m'
  ].join('\r\n');
  await write(fixed);await page.waitForTimeout(250);
  const screen=page.locator('.xterm-screen');
  const before=await screen.screenshot();
  for(let cycle=0;cycle<12;cycle++){
   for(let frame=0;frame<35;frame++){
    let s='\x1b[?2026h\x1b[H';
    for(let y=0;y<12;y++){
     for(let x=0;x<70;x++){
      const color=((cycle*35+frame)*11179+x*733+y*1591)&0xffffff;
      s+='\x1b[38;2;'+((color>>16)&255)+';'+((color>>8)&255)+';'+(color&255)+'m'+String.fromCharCode(33+x%90);
     }
     s+='\r\n';
    }
    await write(s+'\x1b[?2026l');await page.waitForTimeout(25);
   }
   await page.evaluate(()=>webgl.clearTextureAtlas());
   await write(fixed);await page.waitForTimeout(100);
   assert((await screen.screenshot()).equals(before),'Rendered glyph pixels changed after cache churn, cycle '+cycle);
  }
  console.log(JSON.stringify({renderer:await page.evaluate(()=>document.documentElement.dataset.renderer),cycles:12,colorFrames:420,pixelIdentical:true,styles:['RGB','inverse','dim','bold','italic','underline','Unicode','braille']}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
