'use strict';
// Reference swipes scroll its list. Elsewhere, the same travel sends one
// arrow press in the finger's direction. Delay clicks until a tap ends.
window.installTerminalTouch=(term,bridge,send,move,isSelecting)=>{
 const element=term.element;
 let gesture=null,pan=null;
 const consume=event=>{event.preventDefault();event.stopImmediatePropagation();};
 const mouse=(flags,column,row,ending='M')=>'\x1b[<'+flags+';'+column+';'+row+ending;
 const extendTo=(column,row)=>send(mouse(4,column,row)+mouse(4,column,row,'m'));
 const midpoint=touches=>({
  x:(touches[0].clientX+touches[1].clientX)/2,
  y:(touches[0].clientY+touches[1].clientY)/2
 });
 element.addEventListener('touchstart',event=>{
  if(event.touches.length===2){
   gesture=null;
   const point=midpoint(event.touches),rect=element.querySelector('.xterm-screen').getBoundingClientRect();
   pan={...point,axis:null,pending:0,
    column:Math.max(1,Math.min(term.cols,1+Math.floor((point.x-rect.left)*term.cols/rect.width))),
    row:Math.max(1,Math.min(term.rows,1+Math.floor((point.y-rect.top)*term.rows/rect.height))),
    step:rect.height/term.rows};
   consume(event);return;
  }
  if(pan){consume(event);return;}
  if(gesture){consume(event);gesture=null;return;}
  if(event.touches.length!==1)return;
  let region=[0,0,0,0];
  try{if(bridge&&bridge.referenceRegion)region=JSON.parse(bridge.referenceRegion());}catch(ignored){}
  if(!Array.isArray(region)||region.length!==4)region=[0,0,0,0];
  const touch=event.touches[0],rect=element.querySelector('.xterm-screen').getBoundingClientRect();
  const x=Math.floor((touch.clientX-rect.left)*term.cols/rect.width);
  const y=Math.floor((touch.clientY-rect.top)*term.rows/rect.height);
  if(x<0||y<0||x>=term.cols||y>=term.rows)return;
  const reference=x>=region[0]&&y>=region[1]&&x<region[0]+region[2]&&y<region[1]+region[3];
  gesture={id:touch.identifier,x:touch.clientX,y:touch.clientY,lastX:touch.clientX,lastY:touch.clientY,pending:0,moved:false,axis:null,reference,column:x+1,row:y+1,step:Math.max(12,rect.height/term.rows*3),flags:(event.shiftKey?4:0)|(event.altKey?8:0)|(event.ctrlKey?16:0)};
  gesture.selecting=!reference&&isSelecting();
  gesture.pointerColumn=x+1;gesture.pointerRow=y+1;
  if(!reference)send(mouse(35,gesture.pointerColumn,gesture.pointerRow));
  consume(event);
 },{capture:true,passive:false});
 element.addEventListener('touchmove',event=>{
  if(pan){
   consume(event);
   if(event.touches.length!==2)return;
   const point=midpoint(event.touches),dx=pan.x-point.x,dy=pan.y-point.y;
   if(!pan.axis){
    if(Math.hypot(dx,dy)<Math.min(8,pan.step))return;
    pan.axis=Math.abs(dx)>Math.abs(dy)?'horizontal':'vertical';
   }
   const viewport=element.parentElement;
   if(pan.axis==='horizontal')viewport.scrollLeft+=dx;
   else if(viewport.scrollHeight>viewport.clientHeight)viewport.scrollTop+=dy;
   else {
    pan.pending+=dy;
    const count=Math.floor(Math.abs(pan.pending)/pan.step);
    if(count){
     const down=pan.pending>0;
     // The Android input decoder uses bit 256 for scroll-only gestures.
     send(mouse(256+(down?65:64),pan.column,pan.row).repeat(count));
     pan.pending-=(down?1:-1)*count*pan.step;
    }
   }
   pan.x=point.x;pan.y=point.y;return;
  }
  if(!gesture)return;
  consume(event);
  const touch=[...event.touches].find(t=>t.identifier===gesture.id);
  if(!touch || event.touches.length!==1){gesture=null;return;}
  if(!gesture.reference){
   const rect=element.querySelector('.xterm-screen').getBoundingClientRect();
   const column=Math.max(1,Math.min(term.cols,1+Math.floor((touch.clientX-rect.left)*term.cols/rect.width)));
   const row=Math.max(1,Math.min(term.rows,1+Math.floor((touch.clientY-rect.top)*term.rows/rect.height)));
   if(column!==gesture.pointerColumn||row!==gesture.pointerRow){
    gesture.pointerColumn=column;gesture.pointerRow=row;
    send(mouse(35,column,row));
   }
  }
  if(!gesture.moved && Math.hypot(touch.clientX-gesture.x,touch.clientY-gesture.y)<8)return;
  if(!gesture.moved)gesture.axis=!gesture.reference&&Math.abs(touch.clientX-gesture.x)>Math.abs(touch.clientY-gesture.y)?'horizontal':'vertical';
  gesture.moved=true;
  const horizontal=gesture.axis==='horizontal';
  gesture.pending+=horizontal?gesture.lastX-touch.clientX:gesture.lastY-touch.clientY;
  gesture.lastX=touch.clientX;gesture.lastY=touch.clientY;
  const count=Math.min(8,Math.floor(Math.abs(gesture.pending)/gesture.step));
  if(count){
   const down=gesture.pending>0;
   if(gesture.reference)send(mouse(down?65:64,gesture.column,gesture.row).repeat(count));
   else {
    const mask=(gesture.flags&4?1:0)|(gesture.flags&8?2:0)|(gesture.flags&16?4:0);
    const key=horizontal?(down?'ArrowLeft':'ArrowRight'):(down?'ArrowUp':'ArrowDown');
    for(let i=0;i<count;i++)move(key,mask);
   }
   gesture.pending-=(down?1:-1)*count*gesture.step;
  }
 },{capture:true,passive:false});
 element.addEventListener('touchend',event=>{
  if(pan){consume(event);if(event.touches.length===0)pan=null;return;}
  if(!gesture)return;
  consume(event);
  if(![...event.changedTouches].some(t=>t.identifier===gesture.id))return;
  const done=gesture;gesture=null;
  if(done.selecting){if(!done.moved)extendTo(done.column,done.row);term.focus();return;}
  if(!done.moved){send(mouse(done.flags,done.column,done.row)+mouse(done.flags,done.column,done.row,'m'));term.focus();if(term.textarea?.inputMode==='text'&&bridge?.showKeyboard)bridge.showKeyboard();}
 },{capture:true,passive:false});
 element.addEventListener('touchcancel',event=>{if(gesture||pan){consume(event);gesture=null;pan=null;}},{capture:true,passive:false});
 element.addEventListener('contextmenu',event=>{if(gesture||pan)consume(event);},{capture:true});
};
