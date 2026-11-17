'use strict';
const bridge=window.Rustel;
const term=new Terminal({allowTransparency:true,fontFamily:'monospace',fontSize:bridge?bridge.fontSize():10,lineHeight:1.05,letterSpacing:0,cursorBlink:false,scrollback:1000,allowProposedApi:false,theme:{background:'#0f0f1c'},overviewRuler:{width:0}});
term.open(document.getElementById('term'));
// inputmode controls only the Android IME; physical keyboard events remain enabled.
window.setTouchKeyboard=enabled=>{
 const area=term.textarea;
 const search=document.getElementById('action-search');
 if(search)search.inputMode=enabled?'search':'none';
 if(area){area.inputMode=enabled?'text':'none';area.autocapitalize='off';area.setAttribute('autocorrect','off');area.spellcheck=false;}
};
window.focusTerminal=()=>term.focus();
window.setTouchKeyboard(!!(bridge&&bridge.touchKeyboardEnabled&&bridge.touchKeyboardEnabled()));

// Camera backgrounds repaint many differently colored braille cells. Use the
// GPU renderer when WebGL2 is available, with the normal renderer as fallback.
let webgl=null,atlasBudget=null;
function domRenderer(){
 if(atlasBudget){atlasBudget.dispose();atlasBudget=null;}
 if(webgl){const old=webgl;webgl=null;try{old.dispose();}catch(ignored){}}
 document.documentElement.dataset.renderer='dom';
}
try{
 webgl=new WebglAddon.WebglAddon();
 atlasBudget=boundRendererCache(term,webgl);
 webgl.onContextLoss(domRenderer);
 term.loadAddon(webgl);
 document.documentElement.dataset.renderer='webgl';
}catch(unsupported){domRenderer();}
let ready=false;
const modifiers=new Map([[1,0],[2,0],[4,0]]);
const named={Escape:27,Enter:13,Tab:9,Backspace:127,Insert:57348,Delete:57349,ArrowLeft:57350,ArrowRight:57351,ArrowUp:57352,ArrowDown:57353,PageUp:57354,PageDown:57355,Home:57356,End:57357};
for(let i=1;i<=12;i++)named['F'+i]=57363+i;
function raw(text){if(bridge)bridge.input(text);}
function modifierMask(){let result=0;for(const [bit,state] of modifiers)if(state)result|=bit;return result;}
function drawModifiers(){document.querySelectorAll('[data-mod]').forEach(button=>{let state=modifiers.get(+button.dataset.mod);button.classList.toggle('on',!!state);button.classList.toggle('locked',state===2);button.setAttribute('aria-pressed',state?'true':'false');});}
function releaseOneShot(){for(const [bit,state]of modifiers)if(state===1)modifiers.set(bit,0);drawModifiers();}
function clearModifiers(){for(const bit of modifiers.keys())modifiers.set(bit,0);drawModifiers();}
function keyCode(name){return named[name]??([...name].length===1?name.codePointAt(0):null);}
function sendKey(name,physical=0,kind=1,consume=true){
 const code=keyCode(name);if(code===null)return false;
 const mask=physical|modifierMask();
 raw('\x1b['+code+';'+(1+mask)+':'+kind+'u');
 if(consume&&kind!==3)releaseOneShot();
 return true;
}
function input(data){
 if([...data].length===1&&modifierMask()) {sendKey(data);return;}
 if([...data].length===1&&bridge&&bridge.piano&&bridge.piano()) {
  sendKey(data,0,1);setTimeout(()=>sendKey(data,0,3,false),100);return;
 }
 raw(data);
}
term.onData(input);
installTerminalTouch(term,bridge,raw,sendKey);
term.attachCustomKeyEventHandler(event=>{
 if(event.type!=='keydown')return true;
 const physical=(event.shiftKey?1:0)|(event.altKey?2:0)|(event.ctrlKey?4:0)|(event.metaKey?8:0);
 if((modifierMask()||event.ctrlKey||event.metaKey||Object.hasOwn(named,event.key))&&keyCode(event.key)!==null){
  event.preventDefault();sendKey(event.key,physical,event.repeat?2:1);return false;
 }
 return true;
});
term.onResize(({cols,rows})=>{if(bridge&&ready)bridge.resized(cols,rows);});
function fitScreen(){
 const container=document.getElementById('term'),screen=term.element.querySelector('.xterm-screen');
 if(!screen)return;
 const bounds=screen.getBoundingClientRect(),style=getComputedStyle(container);
 const cellWidth=bounds.width/term.cols,cellHeight=bounds.height/term.rows;
 if(!cellWidth||!cellHeight)return;
 const width=container.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
 const height=container.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
 // Fit the real character grid. The fit add-on reserves a 14 px scrollbar
 // gutter even with its ruler hidden; this phone uses no visible scrollbar.
 const cols=Math.max(60,Math.floor((width+0.001)/cellWidth));
 const rows=Math.max(10,Math.floor((height+0.001)/cellHeight));
 term.resize(cols,rows);
 const gridWidth=screen.getBoundingClientRect().width;
 term.element.style.width=gridWidth+'px';
 term.element.style.marginLeft=Math.max(0,(width-gridWidth)/2)+'px';
 // Large chosen text retains horizontal scrolling rather than clipping dialogs.
}

document.querySelectorAll('[data-mod]').forEach(button=>{
 let timer=null,held=false;
 button.addEventListener('pointerdown',()=>{held=false;timer=setTimeout(()=>{held=true;modifiers.set(+button.dataset.mod,2);drawModifiers();},450);});
 for(const type of ['pointerup','pointercancel','pointerleave'])button.addEventListener(type,()=>clearTimeout(timer));
 button.addEventListener('contextmenu',event=>event.preventDefault());
 button.addEventListener('click',()=>{if(!held){let bit=+button.dataset.mod;modifiers.set(bit,modifiers.get(bit)?0:1);drawModifiers();}term.focus();});
});
function wireKey(button){button.addEventListener('click',event=>{const physical=(event.shiftKey?1:0)|(event.altKey?2:0)|(event.ctrlKey?4:0)|(event.metaKey?8:0);if(button.dataset.key==='F2')closeDrawer();sendKey(button.dataset.key,physical);term.focus();});}
document.querySelectorAll('[data-key]').forEach(wireKey);
const catalog=bridge&&bridge.actions?JSON.parse(bridge.actions()):[];
function invokeAction(key){const action=catalog.find(a=>a.key===key);if(!action)return;clearModifiers();closeDrawer();raw('\x1b['+action.token+';13u');term.focus();}
document.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>invokeAction(button.dataset.action));
const drawer=document.getElementById('drawer');
function openDrawer(tab){drawer.hidden=false;document.querySelectorAll('#drawer section').forEach(section=>section.hidden=section.id!==tab+'-panel');if(bridge&&bridge.terminalFocus)bridge.terminalFocus(tab!=='actions');if(tab==='actions'){document.getElementById('action-search').value='';filterActions();document.getElementById('action-search').focus();}else term.focus();}
function closeDrawer(){drawer.hidden=true;if(bridge&&bridge.terminalFocus)bridge.terminalFocus(true);term.focus();}
function cameraButton(){const facing=bridge&&bridge.cameraFacing?bridge.cameraFacing():'front';document.getElementById('flip-camera').textContent='Switch to '+(facing==='front'?'rear':'front')+' camera';}
cameraButton();
document.getElementById('flip-camera').onclick=()=>{clearModifiers();if(bridge&&bridge.flipCamera)bridge.flipCamera();cameraButton();closeDrawer();};
document.getElementById('actions').onclick=()=>openDrawer('actions');document.getElementById('more').onclick=()=>openDrawer('keys');document.getElementById('close-drawer').onclick=closeDrawer;
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>openDrawer(button.dataset.tab));
for(const action of catalog){const button=document.createElement('button');button.textContent=action.label;button.dataset.action=action.key;button.onclick=()=>invokeAction(action.key);document.getElementById('action-list').append(button);}
function filterActions(){const query=document.getElementById('action-search').value.toLowerCase();document.querySelectorAll('#action-list button').forEach(button=>button.hidden=!button.textContent.toLowerCase().includes(query));}
document.getElementById('action-search').oninput=filterActions;
for(const symbol of [...'0123456789(){}[]<>"\'`=+*-/_.,:;!?&|%^~\\@$#']){const button=document.createElement('button');button.textContent=symbol;button.dataset.symbol=symbol;button.onclick=()=>{clearModifiers();raw(symbol);term.focus();};document.getElementById('symbols').append(button);}
for(let i=1;i<=12;i++){const button=document.createElement('button');button.textContent='F'+i;button.dataset.key='F'+i;wireKey(button);document.getElementById('function-keys').append(button);}
for(const name of ['Home','End','Backspace','Delete','Insert','PageUp','PageDown','Tab']){const button=document.createElement('button');button.textContent=name;button.dataset.key=name;wireKey(button);document.getElementById('extra-keys').append(button);}
document.getElementById('settings').onclick=()=>bridge&&bridge.settings();
document.getElementById('keyboard').onclick=()=>{term.focus();if(bridge)bridge.keyboard();};
document.getElementById('paste').onclick=()=>{closeDrawer();if(bridge)bridge.paste();};
window.hardwareKey=(name,mask,kind)=>sendKey(name,mask,kind,false);
window.hardwareText=text=>input(text);
let outputPort=null;
function acknowledgeOutput(){
 if(outputPort){try{outputPort.postMessage('ack');return;}catch(unavailable){outputPort=null;}}
 if(bridge)bridge.ack();
}
// The native host transfers this port only to https://rustel.local. Output and
// its write-complete acknowledgement then avoid synchronous Java bridge calls.
window.addEventListener('message',event=>{
 if(!bridge||event.source!==null||event.data!=='rustel-terminal-output'||event.ports.length!==1||outputPort)return;
 outputPort=event.ports[0];outputPort.onmessage=event=>window.receive(event.data);outputPort.start();
 document.documentElement.dataset.outputTransport='message-port';
});
function writeOutput(b64){
 let bytes;
 if(typeof Uint8Array.fromBase64==='function')bytes=Uint8Array.fromBase64(b64);
 else{const raw=atob(b64);bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);}
 term.write(bytes,acknowledgeOutput);
}
window.receive=b64=>{
 if(!outputPort||document.hidden){writeOutput(b64);return;}
 // Parse after a refresh tick so the next synchronized frame does not open
 // just before the renderer paints the previous one. The host still permits
 // only one outstanding chunk; hidden/stalled refreshes must not block it.
 let done=false,frame,timer;
 const deliver=()=>{if(done)return;done=true;cancelAnimationFrame(frame);clearTimeout(timer);writeOutput(b64);};
 frame=requestAnimationFrame(deliver);timer=setTimeout(deliver,32);
};
window.receivePending=()=>{
 // A native port failure explicitly returns to the original bounded bridge.
 if(outputPort){try{outputPort.close();}catch(ignored){}outputPort=null;}
 document.documentElement.dataset.outputTransport='bridge';
 const data=bridge.readOutput();if(data!==null)window.receive(data);else acknowledgeOutput();
};
window.changeFontSize=value=>{term.options.fontSize=Math.max(8,Math.min(22,value));fitScreen();};
window.pasteText=text=>term.paste(text);
new ResizeObserver(fitScreen).observe(document.getElementById('term'));window.addEventListener('resize',fitScreen);
requestAnimationFrame(()=>{fitScreen();ready=true;if(bridge)bridge.ready(term.cols,term.rows);else term.writeln('Android display preview — native engine starts in the APK.');term.focus();});
