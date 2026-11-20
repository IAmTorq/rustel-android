const assert=require('assert'),vm=require('vm'),fs=require('fs'),path=require('path');
const values=new Map(),events={};let calls=0,writes=0,documentValue,interval;
const palette={background:'#010203',surface:'#111213',overlay:'#212223',foreground:'#f1f2f3',muted:'#818283',rule:'#414243',accent:'#00aabb',selection:'#223344',selectionText:'#ffffff',warn:'#cc9900'};
documentValue=JSON.stringify(palette);
const context={window:{},document:{hidden:false,documentElement:{style:{setProperty:(key,value)=>{writes++;values.set(key,value);}}},addEventListener:(name,callback)=>events[name]=callback},setInterval:(callback,ms)=>{assert.strictEqual(ms,250);interval=callback;}};
context.window.Rustel=context.Rustel={uiTheme:()=>{calls++;return documentValue;}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/assets/phone-theme.js'),'utf8'),context);
assert.strictEqual(values.get('--phone-background'),palette.background);
const initialWrites=writes;
interval();assert.strictEqual(writes,initialWrites,'Unchanged palette must not rewrite styles');
const before=calls;context.document.hidden=true;interval();assert.strictEqual(calls,before,'Hidden UI must not poll JNI');
context.document.hidden=false;documentValue=JSON.stringify({...palette,accent:'#ff0000'});events.visibilitychange();assert.strictEqual(values.get('--phone-accent'),'#ff0000');
documentValue='{invalid';interval();assert.strictEqual(values.get('--phone-accent'),'#ff0000');
documentValue=JSON.stringify({...palette,background:'url(https://invalid.example)'});interval();assert.strictEqual(values.get('--phone-background'),palette.background);
documentValue='{}';interval();assert.strictEqual(values.size,initialWrites);
documentValue=JSON.stringify({...palette,background:'#FFFFFF',foreground:'#000000'});interval();assert.strictEqual(values.get('--phone-background'),'#FFFFFF');assert.strictEqual(values.get('--phone-foreground'),'#000000');
const themeDir=path.join(__dirname,'../../android-native/vendor/rustel-studio-themes/themes');
const ratio=(first,second)=>{
 const linear=byte=>byte<=10?byte/3294.6:((byte/255+0.055)/1.055)**2.4;
 const light=hex=>hex.slice(1).match(/../g).reduce((sum,part,index)=>sum+linear(parseInt(part,16))*[.2126,.7152,.0722][index],0);
 const levels=[light(first),light(second)].sort((a,b)=>b-a);
 return (levels[0]+.05)/(levels[1]+.05);
};
const pairs=[['buttonText','surface',4.5],['selectedText','selection',4.5],['lockedText','accent',4.5],['inputText','background',4.5],['helpText','overlay',4.5]];
const fixtures=fs.readdirSync(themeDir).filter(name=>name.endsWith('.json')).map(name=>{
 const theme=JSON.parse(fs.readFileSync(path.join(themeDir,name),'utf8'));
 return [name,Object.fromEntries(Object.keys(palette).map(key=>{
  const value=theme[key==='selectionText'?'selection_text':key];
  return [key,typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:palette[key]];
 }))];
});
for(const color of ['#171717','#777777','#dddddd']){
 fixtures.push(['same-color palette',Object.fromEntries(Object.keys(palette).map(key=>[key,color]))]);
}
for(const [name,colors] of fixtures){
 assert(context.window.applyPhoneTheme(colors),name);
 for(const [foreground,background,minimum] of pairs){
  assert(ratio(values.get('--phone-'+foreground),colors[background])>=minimum,name+': '+foreground);
 }
 if(name==='rainbow.json'){
  assert.strictEqual(values.get('--phone-buttonText'),'#e6e9f0');
  assert.strictEqual(values.get('--phone-rule'),'#303640');
 }
}
console.log('PASS: palette changes, caching, and control contrast across '+fixtures.length+' palettes');
