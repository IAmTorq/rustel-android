'use strict';
// The native Studio owns the palette; Android controls only consume its colors.
(()=>{
 const names=['background','surface','overlay','foreground','muted','rule','accent','selection','selectionText','warn'];
 let last='';
 window.applyPhoneTheme=palette=>{
  if(!palette||!names.every(name=>typeof palette[name]==='string'&&/^#[0-9a-f]{6}$/i.test(palette[name])))return false;
  for(const name of names)document.documentElement.style.setProperty('--phone-'+name,palette[name]);
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
