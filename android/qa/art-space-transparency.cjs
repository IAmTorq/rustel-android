const qa=require('./regression-context.cjs'),d=require('./device.cjs'),o=require('./observation.cjs'),fs=require('fs'),crypto=require('crypto'),assert=require('assert');
// Public synthetic artwork; no personal picture or music is included.
const art=['// QA_ART_SPACES',...Array.from({length:20},(_,y)=>'// '+Array.from({length:56},(_,x)=>x%13===0||x===55||y%7===0?'⣿':' ').join(''))];
const code=art.join('\n')+'\nsilence',hash=crypto.createHash('sha256').update(code).digest('hex');
(async()=>{const {browser,page}=await d.connect();const original=d.prefs().theme;let complete=false,maximum=0,initial,final;
try{
 const size=await page.evaluate(()=>({cols:term.cols,rows:term.rows}));assert(size.cols>=70&&size.rows>=28,'Use a QA grid large enough for the unwrapped fixture');
 await d.source(page,code);await d.key(page,'s',4);initial=await o.playing(page,hash);await d.theme(page,'waves');
 for(let i=0;i<20;i++){await page.waitForTimeout(250);const count=await page.evaluate(art=>{let count=0;for(let i=1;i<art.length;i++){const row=term.buffer.active.getLine(term.buffer.active.baseY+3+i),start=row?.translateToString(true).indexOf('//');if(start<0)continue;const chars=Array.from(art[i]);for(let x=2;x<chars.length;x++)if(chars[x]===' '&&row?.getCell(start+x)?.getChars()!==' ')count++;}return count;},art);maximum=Math.max(maximum,count);}
 assert(maximum>0,'The backdrop never appeared inside ordinary artwork spaces');final=await o.playing(page,hash);assert(final.callbacks>initial.callbacks&&final.allocator_tripwire_armed);assert.strictEqual(final.callback_xruns,initial.callback_xruns);assert.strictEqual(final.late_events,initial.late_events);assert.strictEqual(final.callback_allocations,initial.callback_allocations);complete=true;
}finally{
 await d.key(page,'F8').catch(()=>{});await d.theme(page,original).catch(()=>{});await browser.close();fs.writeFileSync(qa.result('art-space-transparency.json'),JSON.stringify({date:new Date().toISOString(),apkSha256:qa.digest,complete,fixture:'Synthetic 20-row Braille frame with ordinary internal spaces',theme:'waves',samples:20,maximumBackdropGlyphsInsideArtSpaces:maximum,newXruns:final&&initial?final.callback_xruns-initial.callback_xruns:null,newLateEvents:final&&initial?final.late_events-initial.late_events:null,newCallbackAllocations:final&&initial?final.callback_allocations-initial.callback_allocations:null,limits:['Terminal model and accepted source revision, not a pixel-perfect desktop comparison.','One procedural theme and a silent score; other effects and heavy playback remain separate.']},null,2));
}
assert(complete);
})().catch(error=>{console.error(error);process.exit(1)});
