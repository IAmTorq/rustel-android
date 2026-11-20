const fs=require('fs'),vm=require('vm'),assert=require('assert');let now=0,scheduled=[],clears=0;const events={};const event=name=>fn=>{events[name]=fn;return {dispose(){delete events[name]}}};let addon={onChangeTextureAtlas:event('change'),onAddTextureAtlasCanvas:event('add'),onRemoveTextureAtlasCanvas:event('remove'),clearTextureAtlas(){clears++}},term={onRender:event('render')};const context={window:{},performance:{now:()=>now},requestAnimationFrame:f=>scheduled.push(f)};vm.createContext(context);vm.runInContext(fs.readFileSync('android/app/assets/renderer-cache.js','utf8'),context);let b=context.window.boundRendererCache(term,addon,()=>now,f=>scheduled.push(f));let small={width:512,height:512},large={width:2048,height:1024};events.add(small);events.add({width:1024,height:1024});events.render();assert.equal(scheduled.length,0,'A warm Matrix-sized cache is retained');events.add(large);events.render();events.render();assert.equal(scheduled.length,1);assert.equal(clears,0);scheduled.shift()();assert.equal(clears,1);events.render();assert.equal(scheduled.length,0);now=500;events.render();assert.equal(scheduled.length,1);scheduled.shift()();assert.equal(clears,2);events.remove(large);now=1000;events.render();assert.equal(scheduled.length,0);events.add(large);events.render();assert.equal(scheduled.length,1);b.dispose();scheduled.shift()();assert.equal(clears,2);assert.equal(b.pixels,0);assert.deepEqual(Object.keys(events),[]);console.log('PASS: atlas pixel budget, frame-boundary scheduling, coalescing, 500ms rate limit, page removals and teardown');
// Existing atlas pages must count even when their creation event predates
// subscription to the public add-on events.
addon.textureAtlas={width:2048,height:1024};
b=context.window.boundRendererCache(term,addon,()=>now,f=>scheduled.push(f));
events.render();assert.equal(b.pixels,2*1024*1024);assert.equal(scheduled.length,1);
scheduled.shift()();assert.equal(clears,3);b.dispose();

// Font/DPR changes replace the atlas. Old canvases and queued maintenance must
// not remain attached to the new atlas or force endless rerasterization.
now=2000;addon.textureAtlas={width:512,height:512};
b=context.window.boundRendererCache(term,addon,()=>now,f=>scheduled.push(f));
events.render();events.add({width:2048,height:1024});events.render();
assert.equal(scheduled.length,1);
const replacement={width:512,height:512},beforeReplacement=clears;
addon.textureAtlas=replacement;if(events.change)events.change(replacement);
assert.equal(b.pixels,512*512,'Replaced atlas canvases remain retained');
scheduled.shift()();assert.equal(clears,beforeReplacement,'Old maintenance cleared the replacement atlas');
events.render();assert.equal(scheduled.length,0,'Stable replacement atlas caused unnecessary eviction');
events.add({width:2048,height:1024});events.render();
assert.equal(scheduled.length,1,'Replacement atlas growth escaped the original maintenance budget');
scheduled.shift()();assert.equal(clears,beforeReplacement+1);b.dispose();
assert.deepEqual(Object.keys(events),[]);
console.log('PASS: atlas replacement releases old canvases, cancels stale eviction and retains growth accounting');
