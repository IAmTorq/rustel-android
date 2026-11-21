const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),url=require('url'),assert=require('assert');
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../crates/studio/src/keybinds.rs'),'utf8');
 const order=[...source.split('pub const ALL:')[1].split('];')[0].matchAll(/Self::(\w+)/g)].map(m=>m[1]);
 const table=s=>Object.fromEntries([...s.matchAll(/Self::(\w+)\s*=>\s*"([^"]+)"/g)].map(m=>[m[1],m[2]]));
 const keys=table(source.split('pub fn key(')[1].split('pub fn parse_key')[0]);
 const labels=table(source.split('pub fn label(')[1].split('pub fn default_binding')[0]);
 const catalog=order.map((a,i)=>({key:keys[a],label:labels[a],token:0xF0000+i}));assert(catalog.length===59);
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || chromium.executablePath(),headless:true,args:['--force-device-scale-factor=3.333333']});
 try {
  const page=await browser.newPage({viewport:{width:432,height:432},deviceScaleFactor:10/3,isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(a=>{window.calls=[];window.pianoActive=false;window.referenceBounds=[0,0,0,0];window.cameraSide='front';window.Rustel={showKeyboard:()=>calls.push(['ime']),touchKeyboardEnabled:()=>true,cameraFacing:()=>cameraSide,flipCamera:()=>{cameraSide=cameraSide==='front'?'rear':'front';calls.push(['camera',cameraSide]);return cameraSide;},referenceRegion:()=>JSON.stringify(referenceBounds),fontSize:()=>10,ready:(c,r)=>calls.push(['ready',c,r]),input:s=>calls.push(['input',s]),resized:(c,r)=>calls.push(['resize',c,r]),ack:()=>calls.push(['ack']),settings:()=>calls.push(['settings']),keyboard:()=>calls.push(['keyboard']),terminalFocus:f=>calls.push(['focus',f]),piano:()=>pianoActive,actions:()=>JSON.stringify(a),paste:()=>window.pasteText('note("c4")')};},catalog);
  await page.goto(url.pathToFileURL(path.join(__dirname,'app/assets/index.html')).href);await page.waitForFunction(()=>calls.some(x=>x[0]==='ready'));
  assert(await page.locator('.xterm-helper-textarea').getAttribute('inputmode')==='text');
  await page.evaluate(()=>setTouchKeyboard(false));
  assert(await page.locator('.xterm-helper-textarea').getAttribute('inputmode')==='none');
  await page.evaluate(()=>setTouchKeyboard(true));
  assert(await page.locator('.xterm-helper-textarea').getAttribute('inputmode')==='text');
  await page.evaluate(()=>setTouchKeyboard(false));
  const ready=await page.evaluate(()=>calls.find(x=>x[0]==='ready'));
  assert(ready[1]>=60&&ready[2]>=10);
  const renderer=await page.evaluate(()=>document.documentElement.dataset.renderer);
  assert(renderer==='webgl','GPU renderer must actually initialize in this test');
  assert(await page.locator('.xterm-screen canvas').count()>0);
  const canvasScale=await page.evaluate(()=>{const canvas=term.element.querySelector('canvas:not(.xterm-link-layer)');return canvas.width/canvas.getBoundingClientRect().width;});
  assert(Math.abs(canvasScale-10/3)<0.03,'GPU backing resolution must match phone pixel ratio');
  const margins=[];
  for(const width of [320,360,432,500]){
   await page.setViewportSize({width,height:432});await page.waitForTimeout(70);
   const m=await page.evaluate(()=>{const container=document.getElementById('term');container.scrollLeft=0;const c=container.getBoundingClientRect(),r=term.element.querySelector('.xterm-screen').getBoundingClientRect(),style=getComputedStyle(container);return {width:innerWidth,cols:term.cols,viewportWidth:container.clientWidth,gridWidth:r.width,paddingLeft:parseFloat(style.paddingLeft),paddingRight:parseFloat(style.paddingRight),scrollWidth:container.scrollWidth,left:r.left-c.left-container.clientLeft,right:c.left+container.clientLeft+container.clientWidth-r.right};});
   if(m.gridWidth<=m.viewportWidth-m.paddingLeft-m.paddingRight+0.01){
    assert(Math.abs(m.left-m.right)<1,JSON.stringify(m));m.mode='fitted';
   }else{
    // Font metrics differ by OS. A 60-column minimum can overflow even at
    // size 10; it must remain scrollable rather than being centered/clipped.
    assert(m.cols===60&&Math.abs(m.left-m.paddingLeft)<1,JSON.stringify(m));
    assert(m.scrollWidth>=m.gridWidth+m.paddingLeft+m.paddingRight-1,JSON.stringify(m));
    const end=await page.evaluate(()=>{const container=document.getElementById('term');container.scrollLeft=container.scrollWidth;const c=container.getBoundingClientRect(),r=term.element.querySelector('.xterm-screen').getBoundingClientRect();const result={scrollLeft:container.scrollLeft,right:c.left+container.clientLeft+container.clientWidth-r.right};container.scrollLeft=0;return result;});
    assert(end.scrollLeft>0&&Math.abs(end.right-m.paddingRight)<1,JSON.stringify({m,end}));m.mode='scrollable';m.end=end;
   }
   margins.push(m);
  }
  assert(margins.some(m=>m.mode==='fitted')&&margins.some(m=>m.mode==='scrollable'),'Exercise both fitted and minimum-width layouts');
  await page.setViewportSize({width:432,height:432});await page.waitForTimeout(70);
  await page.evaluate(()=>{changeFontSize(14);changeButtonSize(16);});
  const buttonMetrics=()=>page.evaluate(()=>({
   terminal:term.options.fontSize,
   toolbar:getComputedStyle(document.querySelector('#tools button')).fontSize,
   arrow:getComputedStyle(document.querySelector('#arrows button')).fontSize
  }));
  assert.deepStrictEqual(await buttonMetrics(),{terminal:14,toolbar:'16px',arrow:'16px'});
  await page.evaluate(()=>changeFontSize(10));
  assert.deepStrictEqual(await buttonMetrics(),{terminal:10,toolbar:'16px',arrow:'16px'});
  await page.evaluate(()=>changeButtonSize(12));

  assert(await page.locator('[data-key="Enter"]').count()===0);assert(await page.locator('#shift').count()===0);
  const arrows=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#arrows button')].map(b=>{const r=b.getBoundingClientRect();return [b.dataset.key,{x:r.x,y:r.y,w:r.width,h:r.height}]})));
  assert(Math.abs(arrows.ArrowLeft.w-52)<0.1&&Math.abs(arrows.ArrowRight.w-52)<0.1);
  assert(Math.abs(arrows.ArrowLeft.h-arrows.ArrowUp.h-arrows.ArrowDown.h-3)<0.1);
  assert(arrows.ArrowLeft.x<arrows.ArrowUp.x&&arrows.ArrowUp.x<arrows.ArrowRight.x&&arrows.ArrowDown.x===arrows.ArrowUp.x);
  const input=async()=>page.evaluate(()=>calls.filter(x=>x[0]==='input'&&!x[1].startsWith('\x1b[<35;')).map(x=>x[1]));
  const last=async()=>{const data=await input();return data[data.length-1];};
  const symBar=page.locator('#sym-bar');
  await page.evaluate(()=>toggleSymBar());
  assert(await symBar.isHidden(),'Opt-out keeps quick symbols closed');
  await page.evaluate(()=>{setSymBarEnabled(true);toggleSymBar();});
  assert(await symBar.isVisible());
  for(const symbol of ['{','}','[',']',';','$','|','\\','~','^']){
   await symBar.getByRole('button',{name:symbol,exact:true}).tap();
   assert.strictEqual(await last(),symbol);
   assert(await page.evaluate(()=>document.activeElement===term.textarea));
  }
  await page.evaluate(()=>toggleSymBar());assert(await symBar.isHidden());
  await page.locator('#more').tap();
  await page.getByRole('button',{name:'Quick symbols',exact:true}).tap();
  assert(await symBar.isVisible());
  await page.evaluate(()=>setSymBarEnabled(false));assert(await symBar.isHidden());
  await page.locator('#more').tap();
  await page.getByRole('button',{name:'Adjust slider',exact:true}).tap();
  assert.strictEqual(await last(),'\x1b[13;3:1u');
  assert(await page.locator('#drawer').isHidden());
  await page.locator('#tools [data-action="update"]').click();assert(await last()==='\x1b[983040;13u');
  await page.locator('#tools [data-action="stop"]').click();assert(await last()==='\x1b[983041;13u');
  await page.locator('#ctrl').click();await page.keyboard.press('o');assert(await last()==='\x1b[111;5:1u');assert(!(await page.locator('#ctrl').getAttribute('class')||'').includes('on'));
  await page.evaluate(()=>hardwareKey('m',4,1));assert.strictEqual(await last(),'\x1b[109;5:1u');
  await page.evaluate(()=>{setCtrlMComments(true);hardwareKey('m',4,1);});assert.strictEqual(await last(),'\x1b[47;5:1u');
  await page.evaluate(()=>hardwareKey('m',5,1));assert.strictEqual(await last(),'\x1b[109;6:1u');
  await page.locator('#ctrl').tap();await page.keyboard.press('m');assert.strictEqual(await last(),'\x1b[47;5:1u');
  await page.evaluate(()=>{setCtrlMComments(false);hardwareKey('/',4,1);});assert.strictEqual(await last(),'\x1b[47;5:1u');
  // Fn mapped to Android Ctrl preserves exact Enter, punctuation, and release events.
  await page.evaluate(()=>{hardwareKey('Enter',4,1);hardwareKey('Enter',4,3);hardwareKey('.',4,1);hardwareKey('ArrowLeft',5,1);hardwareText('@');});
  const sequence=await input();assert(sequence.includes('\x1b[13;5:1u'));assert(sequence.includes('\x1b[13;5:3u'));assert(sequence.includes('\x1b[46;5:1u'));assert(sequence.includes('\x1b[57350;6:1u'));assert(await last()==='@');
  // A held touch modifier stays on until explicitly switched off.
  const ctrl=await page.locator('#ctrl').boundingBox();await page.mouse.move(ctrl.x+10,ctrl.y+10);await page.mouse.down();await page.waitForTimeout(500);await page.mouse.up();
  assert((await page.locator('#ctrl').getAttribute('class')).includes('locked'));await page.keyboard.press('c');await page.keyboard.press('v');assert((await page.locator('#ctrl').getAttribute('class')).includes('locked'));await page.locator('#ctrl').click();
  await page.locator('#actions').click();assert(await page.locator('#action-list button').count()===59);
  const flip=page.locator('#flip-camera');assert(await flip.isVisible());assert(await page.locator('#help-f2').count()===0);
  assert((await flip.boundingBox()).y<(await page.locator('#action-list').boundingBox()).y);
  assert(await flip.textContent()==='Switch to rear camera');await flip.click();
  assert(await page.evaluate(()=>cameraSide)==='rear');assert(await page.locator('#drawer').isHidden());
  await page.locator('#actions').click();assert(await flip.textContent()==='Switch to front camera');await flip.click();
  assert(await page.evaluate(()=>cameraSide)==='front');await page.locator('#actions').click();
  await page.locator('#action-search').fill('theme');assert(await page.locator('#action-list button:visible').count()===1);await page.locator('#action-list button:visible').click();
  assert(await last()==='\x1b['+catalog.find(a=>a.label==='theme picker').token+';13u');
  await page.locator('#more').click();for(let i=1;i<=12;i++){await page.locator('#function-keys [data-key="F'+i+'"]').click();assert(await last()==='\x1b['+(57363+i)+';1:1u');if(i===2){assert(await page.locator('#drawer').isHidden());await page.locator('#more').click();}}
  await page.locator('[data-tab="symbols"]').click();const symbols=page.locator('#symbols button');for(let i=0;i<await symbols.count();i++){const s=await symbols.nth(i).textContent();await symbols.nth(i).click();assert(await last()===s);}
  await page.locator('[data-tab="keys"]').click();await page.locator('#paste').click();assert((await last()).includes('note("c4")'));
  await page.locator('#settings').click();assert(await page.evaluate(()=>calls.some(x=>x[0]==='settings')));
  for(const size of [8,10,14,22]){await page.evaluate(n=>changeFontSize(n),size);await page.waitForTimeout(30);const d=await page.evaluate(()=>[term.options.fontSize,term.cols,term.rows]);assert(d[0]===size&&d[1]>=60&&d[2]>=10);}
  await page.evaluate(()=>{changeFontSize(10);pianoActive=true;hardwareText('c');});await page.waitForTimeout(150);const piano=await input();assert(piano.includes('\x1b[99;1:1u')&&piano.includes('\x1b[99;1:3u'));
  await page.evaluate(()=>receive(btoa('\x1b[?1000h\x1b[?1006h')));await page.waitForTimeout(40);const box=await page.locator('#term').boundingBox();await page.touchscreen.tap(box.x+40,box.y+12);
  assert((await input()).some(s=>s.startsWith('\x1b[<0;')));assert(errors.length===0,errors.join('\n'));
  // Real browser touch sequences: swipe scrolls the native reference bounds;
  // a tap stays one click, and swiping must never activate a reference row.
  await page.evaluate(()=>{referenceBounds=[30,2,48,18];calls.length=0;});
  const point=await page.evaluate(()=>{const r=term.element.querySelector('.xterm-screen').getBoundingClientRect();return {x:r.left+r.width*45.5/term.cols,y:r.top+r.height*11.5/term.rows};});
  const cdp=await page.context().newCDPSession(page);
  async function touch(type,x,y){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:0,radiusX:2,radiusY:2,force:1}]});}
  const selection=page.locator('#select-text');
  const moreBox=await page.locator('#more').boundingBox(),selectionBox=await selection.boundingBox();
  assert(selectionBox.x>moreBox.x&&Math.abs(selectionBox.width-moreBox.width)<1);
  await selection.tap();assert.strictEqual(await selection.textContent(),'End selection');
  await page.evaluate(()=>{referenceBounds=[0,0,0,0];calls.length=0;});
  const selectionStep=await page.evaluate(()=>Math.max(12,term.element.querySelector('.xterm-screen').getBoundingClientRect().height/term.rows*3));
  await touch('touchStart',point.x,point.y);
  assert.strictEqual(await page.evaluate(()=>calls.filter(call=>call[0]==='input'&&call[1].startsWith('\x1b[<35;')).length),1,'Holding updates the pointer before release');
  await touch('touchMove',point.x+selectionStep-1,point.y);
  assert.strictEqual(await page.evaluate(()=>calls.filter(call=>call[0]==='input'&&call[1].startsWith('\x1b[<35;')).length),2,'Dragging sends movement without a click');
  assert.deepStrictEqual(await input(),[]);
  await touch('touchMove',point.x+selectionStep+1,point.y);
  await touch('touchEnd');
  assert.deepStrictEqual(await input(),['\x1b[57351;2:1u']);
  await page.touchscreen.tap(point.x,point.y);
  assert.match(await last(),/^\x1b\[<4;\d+;\d+M\x1b\[<4;\d+;\d+m$/);
  await page.locator('#arrows [data-key="ArrowRight"]').tap();
  assert.strictEqual(await last(),'\x1b[57351;2:1u');
  await page.locator('#ctrl').tap();await page.keyboard.press('c');
  assert.strictEqual(await last(),'\x1b[99;5:1u');
  await selection.tap();assert.strictEqual(await selection.textContent(),'Start selection');
  await page.locator('#arrows [data-key="ArrowRight"]').tap();
  assert.strictEqual(await last(),'\x1b[57351;1:1u');
  await page.evaluate(()=>{referenceBounds=[30,2,48,18];calls.length=0;});
  await page.evaluate(()=>{term.focus();window.editorBlurCount=0;term.textarea.addEventListener('blur',()=>editorBlurCount++);});
  for(const id of ['ctrl','alt']){
   const button=page.locator('#'+id), box=await button.boundingBox();
   await touch('touchStart',box.x+box.width/2,box.y+box.height/2);
   await page.waitForTimeout(500);
   assert(await page.evaluate(()=>document.activeElement===term.textarea));
   await touch('touchEnd');
   assert(await button.evaluate(el=>el.classList.contains('locked')));
   await button.tap();
   assert(!(await button.evaluate(el=>el.classList.contains('locked'))));
  }
  await page.locator('#arrows [data-key="ArrowUp"]').tap();
  assert.strictEqual(await last(),'\x1b[57352;1:1u');
  assert.strictEqual(await page.evaluate(()=>editorBlurCount),0,'Touch modifiers and arrows must never blur the active editor');
  const arrow=page.locator('#arrows [data-key="ArrowDown"]'),arrowBox=await arrow.boundingBox();
  assert.strictEqual(await arrow.evaluate(el=>getComputedStyle(el).userSelect),'none');
  await page.evaluate(()=>calls.length=0);
  await touch('touchStart',arrowBox.x+arrowBox.width/2,arrowBox.y+arrowBox.height/2);
  await page.waitForTimeout(250);
  assert.deepStrictEqual(await input(),[],'A short hold waits for the initial repeat delay');
  await page.waitForTimeout(750);
  const early=(await input()).length;
  await page.waitForTimeout(1000);
  const beforeRelease=await input();
  assert(early>=2 && beforeRelease.length-early>early,'Held arrow repeat accelerates');
  assert.strictEqual(beforeRelease[0],'\x1b[57353;1:1u');
  assert(beforeRelease.slice(1).every(event=>event==='\x1b[57353;1:2u'));
  await touch('touchEnd');
  await page.waitForTimeout(210);
  assert.deepStrictEqual(await input(),beforeRelease,'Release stops repeating without an extra tap');
  assert.strictEqual(await page.evaluate(()=>editorBlurCount),0);
  await page.evaluate(()=>calls.length=0);
  await touch('touchStart',point.x,point.y);await touch('touchMove',point.x,point.y-45);await touch('touchMove',point.x,point.y-95);await touch('touchEnd');
  let swipe=await input();assert(swipe.some(x=>x.includes('\x1b[<65;')));assert(!swipe.some(x=>x.includes('\x1b[<0;')),'Swipe must not click a row');
  await page.evaluate(()=>calls.length=0);
  await touch('touchStart',point.x,point.y-95);await touch('touchMove',point.x,point.y-40);await touch('touchMove',point.x,point.y);await touch('touchEnd');
  swipe=await input();assert(swipe.some(x=>x.includes('\x1b[<64;')));
  await page.evaluate(()=>calls.length=0);await page.touchscreen.tap(point.x,point.y);
  let taps=(await input()).join('');assert((taps.match(/\x1b\[<0;\d+;\d+M/g)||[]).length===1);assert(taps.includes('m'));
  await page.evaluate(()=>calls.length=0);await touch('touchStart',point.x,point.y);await touch('touchMove',point.x+3,point.y+2);await touch('touchEnd');
  assert((await input()).join('').includes('\x1b[<0;'),'Small tap jitter remains a click');
  await page.evaluate(()=>calls.length=0);await touch('touchStart',point.x,point.y);await touch('touchCancel');assert((await input()).length===0);
  await page.evaluate(()=>{referenceBounds=[0,0,0,0];calls.length=0;});await page.touchscreen.tap(point.x,point.y);
  assert((await input()).some(s=>s.startsWith('\x1b[<0;')),'Existing terminal tap outside reference remains usable');
  // Outside the reference panel, use the identical travel threshold but
  // send one cursor arrow per threshold, in the direction of the finger.
  const step=await page.evaluate(()=>term.element.querySelector('.xterm-screen').getBoundingClientRect().height/term.rows*3);
  const arrowsIn=text=>text.match(/\x1b\[5735[23];\d+:1u/g)||[];
  await page.evaluate(()=>calls.length=0);
  await touch('touchStart',point.x,point.y);await touch('touchMove',point.x,point.y-step+1);
  assert(arrowsIn((await input()).join('')).length===0,'No move before the shared swipe threshold');
  await touch('touchMove',point.x,point.y-step-1);
  assert(arrowsIn((await input()).join('')).join('')==='\x1b[57352;1:1u','Swipe up moves exactly one line up');
  await touch('touchMove',point.x,point.y-step*2-1);await touch('touchEnd');
  assert(arrowsIn((await input()).join('')).length===2,'Two thresholds move two lines');
  assert(!(await input()).join('').includes('\x1b[<'),'Cursor swipe must not click or send scroll-wheel events');
  await page.evaluate(()=>calls.length=0);
  await touch('touchStart',point.x,point.y-step*2);await touch('touchMove',point.x,point.y-step+1);await touch('touchEnd');
  assert(arrowsIn((await input()).join('')).join('')==='\x1b[57353;1:1u','Swipe down moves exactly one line down');
  await page.evaluate(()=>calls.length=0);await touch('touchStart',point.x,point.y);await touch('touchCancel');assert((await input()).length===0);
  // The same physical travel works left/right; lock each gesture to its
  // dominant axis so a diagonal finger motion does not send stray arrows.
  await page.evaluate(()=>calls.length=0);
  await touch('touchStart',point.x,point.y);await touch('touchMove',point.x-step+1,point.y);
  assert((await input()).length===0,'Left swipe waits for the same threshold');
  await touch('touchMove',point.x-step-1,point.y+2);await touch('touchEnd');
  assert((await input()).join('')==='\x1b[57350;1:1u','Swipe left moves exactly one character left');
  await page.evaluate(()=>calls.length=0);
  await touch('touchStart',point.x-step*2,point.y);await touch('touchMove',point.x-step+1,point.y);await touch('touchEnd');
  assert((await input()).join('')==='\x1b[57351;1:1u','Swipe right moves exactly one character right');
  // Two fingers retain horizontal grid panning at large text sizes.
  await page.evaluate(()=>{changeFontSize(22);document.getElementById('term').scrollLeft=0;calls.length=0;});
  await touch('touchStart',250,180);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:250,y:180,id:0},{x:280,y:180,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:190,y:180,id:0},{x:220,y:180,id:1}]});
  await touch('touchEnd');
  assert(await page.evaluate(()=>document.getElementById('term').scrollLeft)>0);assert((await input()).length===0,'Two-finger pan sends no cursor or click events');
  await page.evaluate(()=>{document.getElementById('term').scrollLeft=0;changeFontSize(10);});
  for(const [direction,scrollOnly] of [[-1,321],[1,320]]){
   await page.evaluate(()=>calls.length=0);
   await touch('touchStart',point.x,point.y);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,id:0},{x:point.x+30,y:point.y,id:1}]});
   const drag=distance=>cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y+direction*distance,id:0},{x:point.x+30,y:point.y+direction*distance,id:1}]});
   const rowHeight=await page.evaluate(()=>term.element.querySelector('.xterm-screen').getBoundingClientRect().height/term.rows);
   const report=new RegExp('\\x1b\\[<'+scrollOnly+';\\d+;\\d+M','g');
   const scrolls=async()=>((await input()).join('').match(report)||[]).length;
   await drag(rowHeight*0.6);
   assert.strictEqual(await scrolls(),0);
   await drag(rowHeight*1.2);
   assert.strictEqual(await scrolls(),1);
   await drag(rowHeight*11.2);
   assert.strictEqual(await scrolls(),11,'Fast drags preserve all whole rows of travel');
   await touch('touchEnd');
   const events=await input();
   assert(events.length>0&&events.every(text=>text.replaceAll(report,'')===''),
    'Vertical two-finger pan sends scroll only, without a click or cursor movement');
  }
  // Exercise sustained colored braille output with the same receive/ack bridge,
  // while checking that user input is still dispatched. Desktop test, not phone timing.
  const stress=await page.evaluate(async()=>{
   let ticks=0;const timer=setInterval(()=>{hardwareKey('ArrowRight',0,1);ticks++;},10);
   const start=performance.now(),frames=90;
   for(let f=0;f<frames;f++){
    let text='\x1b[H';
    for(let y=0;y<term.rows;y++){
     text+='\x1b['+(y+1)+';1H';
     for(let x=0;x<term.cols;x++)text+='\x1b[38;2;'+((f+x*7)%256)+';'+((f*3+y*9)%256)+';180m'+String.fromCodePoint(0x2800+(f+x+y)%256);
    }
    const bytes=new TextEncoder().encode(text),b64=btoa(String.fromCharCode(...bytes));
    const acks=calls.filter(x=>x[0]==='ack').length;receive(b64);
    while(calls.filter(x=>x[0]==='ack').length===acks)await new Promise(r=>setTimeout(r,1));
   }
   clearInterval(timer);return {frames,elapsedMs:Math.round(performance.now()-start),inputTimerTicks:ticks};
  });assert(stress.inputTimerTicks>0);
  // Simulate context loss and verify usable DOM fallback plus input.
  await page.evaluate(()=>term.element.querySelectorAll('canvas').forEach(canvas=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}))));
  await page.waitForFunction(()=>document.documentElement.dataset.renderer==='dom');
  await page.locator('#tools [data-action="stop"]').click();assert(await last()==='\x1b[983041;13u');
  const fallback=await browser.newPage({viewport:{width:432,height:432}});
  await fallback.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:get.call(this,type,...args);};});
  await fallback.goto(url.pathToFileURL(path.join(__dirname,'app/assets/index.html')).href);
  await fallback.waitForFunction(()=>document.documentElement.dataset.renderer==='dom');
  assert(await fallback.locator('.xterm-screen').count()===1);await fallback.close();
  await page.evaluate(()=>setTouchKeyboard(true));
  const imeTarget=await page.locator('.xterm-screen').boundingBox();
  const imeBefore=await page.evaluate(()=>calls.filter(x=>x[0]==='ime').length);
  await page.touchscreen.tap(imeTarget.x+5,imeTarget.y+5);
  assert(await page.evaluate(()=>calls.filter(x=>x[0]==='ime').length)===imeBefore+1);
  await page.evaluate(()=>setTouchKeyboard(false));
  await page.touchscreen.tap(imeTarget.x+5,imeTarget.y+5);
  assert(await page.evaluate(()=>calls.filter(x=>x[0]==='ime').length)===imeBefore+1);
  const outputChannel=await page.evaluate(async()=>{
   const channel=new MessageChannel();let acknowledged=0,waiting;
   channel.port2.onmessage=event=>{if(event.data==='ack'){acknowledged++;if(waiting){waiting();waiting=null;}}};
   // Ordinary page messages cannot replace the native output channel.
   window.dispatchEvent(new MessageEvent('message',{data:'rustel-terminal-output',ports:[channel.port1],source:window}));
   if(document.documentElement.dataset.outputTransport==='message-port')throw Error('Accepted non-native source');
   window.dispatchEvent(new MessageEvent('message',{data:'rustel-terminal-output',ports:[channel.port1]}));
   const bytes=new TextEncoder().encode('\x1b[H\x1b[2Kqa-port café 中文');
   const cuts=[0,bytes.indexOf(0xc3)+1,bytes.indexOf(0xe4)+1,bytes.length];
   for(let i=1;i<cuts.length;i++){
    const ack=new Promise(resolve=>waiting=resolve);
    channel.port2.postMessage(btoa(String.fromCharCode(...bytes.slice(cuts[i-1],cuts[i]))));
    await Promise.race([ack,new Promise((_,reject)=>setTimeout(()=>reject(Error('Missing write acknowledgement')),2000))]);
   }
   const line=term.buffer.active.getLine(term.buffer.active.baseY).translateToString(true);
   if(!line.includes('qa-port café 中文')||acknowledged!==3)throw Error('Port UTF-8 ordering or acknowledgement failed');
   const raf=requestAnimationFrame,cancel=cancelAnimationFrame,decode=Uint8Array.fromBase64,stalled=[];
   window.requestAnimationFrame=callback=>{stalled.push(callback);return stalled.length;};
   window.cancelAnimationFrame=()=>{};Uint8Array.fromBase64=undefined;
   try{
    const ack=new Promise(resolve=>waiting=resolve);
    channel.port2.postMessage(btoa('\r\nqa-timeout'));
    await Promise.race([ack,new Promise((_,reject)=>setTimeout(()=>reject(Error('Stalled refresh blocked output')),2000))]);
   }finally{window.requestAnimationFrame=raf;window.cancelAnimationFrame=cancel;Uint8Array.fromBase64=decode;}
   for(const callback of stalled)callback(performance.now());
   await new Promise(resolve=>setTimeout(resolve,50));
   if(acknowledged!==4)throw Error('Stale refresh duplicated output');
   const oldAck=bridge.ack;
   bridge.readOutput=()=>btoa('\r\nqa-bridge');
   await new Promise(resolve=>{bridge.ack=()=>{oldAck();resolve();};receivePending();});
   bridge.ack=oldAck;channel.port2.close();
   if(document.documentElement.dataset.outputTransport!=='bridge')throw Error('Bridge fallback not restored');
   if(!term.buffer.active.getLine(term.buffer.active.baseY+2).translateToString(true).includes('qa-bridge'))throw Error('Fallback lost output');
   return {nativeSourceRequired:true,splitUtf8:true,orderedAcknowledgements:acknowledged,stalledRefreshFallback:true,legacyBase64Decode:true,bridgeFallback:true};
  });
  assert(errors.length===0,errors.join('\n'));
  const report={ready,errors,renderer,margins,stress,webglContextLossFallback:true,webglUnavailableFallback:true,actions:catalog.length,checks:['touch keyboard enabled preference and on/off textarea input mode','physical Ctrl+Enter and Ctrl+period','Shift+Ctrl selection','Android Alt symbols','piano down/up','touch Ctrl lock','all F1-F12 keys','all symbol buttons','searchable actions and pinned front/rear camera switch', 'reference finger swipe in both directions, tap, jitter, cancel and outside bounds', 'editor swipe up/down/left/right sends one arrow per shared travel threshold; diagonal axis lock; no accidental click; two-finger horizontal panning', 'symmetric fitted margins and reachable minimum-width grid edges', 'GPU braille output with interleaved input', 'WebGL loss/unavailable fallback','numeric font sizes 8-22','terminal mouse touch','no duplicate Enter or Shift buttons'],passed:true};
  report.outputChannel=outputChannel;
  fs.writeFileSync(path.join(__dirname,'ui-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
