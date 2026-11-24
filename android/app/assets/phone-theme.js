'use strict';
// The native Studio owns the palette; Android controls only consume its colors.
(()=>{
 const names=['background','surface','overlay','foreground','muted','rule','accent','selection','selectionText','warn'];
 let last='';
 function luminance(color){
  const channels=[1,3,5].map(index=>{
   const value=parseInt(color.slice(index,index+2),16)/255;
   return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;
  });
  return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
 }
 function visibleOn(background,minimum,...candidates){
  const base=luminance(background);
  const ratio=color=>{const value=luminance(color);return (Math.max(base,value)+0.05)/(Math.min(base,value)+0.05);};
  return candidates.find(color=>ratio(color)>=minimum)||
   (ratio('#ffffff')>ratio('#000000')?'#ffffff':'#000000');
 }
 window.applyPhoneTheme=palette=>{
  if(!palette||!names.every(name=>typeof palette[name]==='string'&&/^#[0-9a-f]{6}$/i.test(palette[name])))return false;
  const colors={...palette,
   buttonText:visibleOn(palette.surface,4.5,palette.foreground,palette.accent),
   selectedText:visibleOn(palette.selection,4.5,palette.selectionText,palette.foreground),
   lockedText:visibleOn(palette.accent,4.5,palette.background,palette.foreground),
   inputText:visibleOn(palette.background,4.5,palette.foreground),
   helpText:visibleOn(palette.overlay,4.5,palette.muted,palette.foreground)
  };
  for(const [name,color] of Object.entries(colors))document.documentElement.style.setProperty('--phone-'+name,color);
  return true;
 };
 function sync(){
  if(document.hidden||!window.Rustel||typeof Rustel.uiTheme!=='function')return;
  try{const value=Rustel.uiTheme();if(value===last)return;if(window.applyPhoneTheme(JSON.parse(value)))last=value;}catch(unavailable){}
 }
 document.addEventListener('visibilitychange',sync);
 setInterval(sync,250);
 sync();
})();
