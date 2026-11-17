'use strict';
// Animated true-color backgrounds otherwise keep adding glyph/color variants
// to xterm's GPU atlas. Use the add-on's public cache API between rendered
// frames, leaving terminal contents, colors and the GPU renderer intact.
window.boundRendererCache=(term,addon,clock=()=>performance.now(),schedule=requestAnimationFrame)=>{
 const canvases=new Set();
 const budgetPixels=1024*1024; // 4 MiB of RGBA atlas pages before maintenance.
 let lastClear=-Infinity,pending=false,disposed=false,clears=0,generation=0;
 const change=addon.onChangeTextureAtlas(canvas=>{
  // A font/DPR change replaces the atlas; its disposal does not emit page
  // removals. Forget those old backing stores and their scheduled maintenance.
  generation++;pending=false;lastClear=-Infinity;canvases.clear();canvases.add(canvas);
 });
 const add=addon.onAddTextureAtlasCanvas(canvas=>canvases.add(canvas));
 const remove=addon.onRemoveTextureAtlasCanvas(canvas=>canvases.delete(canvas));
 const render=term.onRender(()=>{
  // The initial page may predate the add-on's forwarded canvas event.
  const first=addon.textureAtlas;if(first)canvases.add(first);
  if(disposed||pending||clock()-lastClear<500)return;
  let pixels=0;for(const canvas of canvases)pixels+=canvas.width*canvas.height;
  if(pixels<budgetPixels)return;
  pending=true;const scheduledGeneration=generation;
  schedule(()=>{
   if(disposed||scheduledGeneration!==generation)return;
   pending=false;
   lastClear=clock();clears++;addon.clearTextureAtlas();
  });
 });
 return {get clears(){return clears;},get pixels(){let n=0;for(const c of canvases)n+=c.width*c.height;return n;},dispose(){disposed=true;change.dispose();add.dispose();remove.dispose();render.dispose();canvases.clear();}};
};
