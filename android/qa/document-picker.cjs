// Actual Downloads-provider controls; this contract targets DocumentsUI.
const d=require('./device.cjs'),assert=require('assert');
function ui(){d.shell('uiautomator','dump','/data/local/tmp/rustel-picker.xml');return d.shell('cat','/data/local/tmp/rustel-picker.xml');}
function find(xml,predicate){for(const tag of xml.matchAll(/<node\b[^>]*>/g)){const attributes={};for(const match of tag[0].matchAll(/([\w-]+)="([^"]*)"/g))attributes[match[1]]=match[2];if(predicate(attributes))return attributes;}throw Error('Expected picker control missing');}
function tap(control){const bounds=control.bounds.match(/\d+/g).map(Number);d.shell('input','tap',String((bounds[0]+bounds[2])>>1),String((bounds[1]+bounds[3])>>1));}
async function open(page){await d.key(page,'Escape');await d.key(page,'Escape');await d.action(page,'open-set');await page.waitForTimeout(350);await d.key(page,'Enter');await page.waitForTimeout(500);const xml=ui();assert(xml.includes('com.google.android.documentsui'));assert(xml.includes('text="Download"'));}
async function select(page,name){let xml=ui();tap(find(xml,control=>control['content-desc']==='Search'));d.shell('input','text',name.replace(/\.[^.]+$/,''));let item;for(let attempt=0;attempt<8;attempt++){await page.waitForTimeout(700);xml=ui();try{item=find(xml,control=>control.text===name);break;}catch{}}assert(item,'Downloads fixture was not found');tap(item);}
async function dismissError(page,expected){const xml=ui();assert(xml.includes(expected),'Expected document error missing: '+expected);tap(find(xml,control=>control['resource-id']==='android:id/button1'));await page.waitForTimeout(250);}
module.exports={open,select,dismissError};
