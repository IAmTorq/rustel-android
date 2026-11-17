'use strict';
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),url=require('url'),assert=require('assert');
(async()=>{
 assert(process.env.BASELINE_WEBGL,'Set BASELINE_WEBGL to the pinned original addon-webgl.js for pixel comparison');
 const baseline=fs.readFileSync(process.env.BASELINE_WEBGL,'utf8');
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||chromium.executablePath(),headless:true});
 try{
  const images=[];
  for(const original of [true,false]){
   const page=await browser.newPage({viewport:{width:576,height:576},deviceScaleFactor:2.5});
   await page.addInitScript(()=>window.Rustel={fontSize:()=>10,actions:()=> '[]',cameraFacing:()=> 'front',touchKeyboardEnabled:()=>false,ready(){},input(){},resized(){},ack(){},terminalFocus(){}});
   if(original)await page.route('**/addon-webgl.js',route=>route.fulfill({body:baseline,contentType:'text/javascript'}));
   await page.goto(url.pathToFileURL(path.join(__dirname,'../app/assets/index.html')).href);
   await page.waitForFunction(()=>document.documentElement.dataset.renderer==='webgl');
   const stride=await page.evaluate(()=>webgl._renderer._glyphRenderer.value._vertices.attributes.length/(term.cols*term.rows));
   assert.equal(stride,original?11:14,'Comparison must load distinct original and tinted renderers');
   await page.evaluate(async()=>{
    let s='\x1b[?25l\x1b[0m\x1b[2J\x1b[H';
    const styles=['','1;','2;','3;','4;','7;','9;','53;'];
    for(let row=0;row<styles.length;row++){
     for(let column=0;column<48;column++){
      const r=(column*17+row*37)%256,g=(column*29+row*23)%256,b=(column*47+row*71)%256;
      s+='\x1b[0;'+styles[row]+'38;2;'+r+';'+g+';'+b+';48;2;40;60;100m'+String.fromCharCode(33+column);
     }s+='\x1b[0m\r\n';
    }
    for(let row=0;row<8;row++){
     for(let column=0;column<32;column++)s+='\x1b[38;2;'+((column*13)%256)+';'+((row*37)%256)+';'+((column*29)%256)+'m'+String.fromCharCode(0x2800+row*32+column);
     s+='\r\n';
    }
    for(let row=0;row<5;row++){
     for(let column=0;column<32;column++)s+='\x1b[38;2;'+((column*13)%256)+';'+((row*37)%256)+';'+((column*29)%256)+'m'+String.fromCharCode(0x2500+row*32+column);
     s+='\r\n';
    }
    s+='\x1b[0mUnicode: café µ Δ 中文 → ♫ 👩‍💻\r\n';
    s+='\x1b[4:3;58;2;230;30;190;38;2;20;210;130mColored underline\x1b[0m';
    await new Promise(resolve=>term.write(s,resolve));
   });
   await page.waitForTimeout(300);
   images.push((await page.locator('.xterm-screen').screenshot()).toString('base64'));
  }
  const page=browser.contexts().at(-1).pages()[0];
  const difference=await page.evaluate(async images=>{
   const data=[];
   for(const image of images){
    const raw=atob(image),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);data.push(context.getImageData(0,0,canvas.width,canvas.height).data);bitmap.close();
   }
   let max=0,differing=0,total=0;
   for(let i=0;i<data[0].length;i++){const d=Math.abs(data[0][i]-data[1][i]);max=Math.max(max,d);total+=d;if(d)differing++;}
   return {maxChannelDifference:max,differingChannels:differing,totalChannels:data[0].length,meanChannelDifference:total/data[0].length};
  },images);
  console.log(JSON.stringify(difference));
  assert(difference.maxChannelDifference<=2,'Tint path changed glyph geometry or colors beyond 8-bit rounding tolerance');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
