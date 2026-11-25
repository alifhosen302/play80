/* PLAY80 Bubble Shooter — premium cannon demo. Virtual free practice only. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),root=$('screen-p8-practice');if(!root)return;
const wrap=document.createElement('div');wrap.id='p8BubbleDeluxe';wrap.className='hidden';
wrap.innerHTML='<div id="p8BubbleStats">🎯 BUBBLE SHOOTER <strong id="p8BubbleScore">Score: 0</strong></div><canvas id="p8BubbleCanvas" width="400" height="590" role="img" aria-label="Aimable cannon and bubble board"></canvas><div id="p8BubbleControls"><button id="p8BubbleSwap" type="button">⇄ SWAP</button><button id="p8BubbleBomb" type="button">💣 BOMB ×2</button></div><p id="p8BubbleMessage" role="status">Aim above the cannon and tap to shoot.</p>';
$('p8PracticeGrid').before(wrap);
const css=document.createElement('style');css.textContent=[
'#p8BubbleDeluxe{max-width:430px;margin:10px auto;color:white}',
'#p8BubbleCanvas{width:100%;height:auto;aspect-ratio:400/590;display:block;background:#17172d;border:3px solid #d8ab60;border-radius:16px;box-sizing:border-box;touch-action:none;box-shadow:0 9px 28px #0008}',
'#p8BubbleStats{display:flex;justify-content:space-between;align-items:center;background:#292045;padding:12px;border-radius:13px;margin-bottom:9px;font-weight:900}',
'#p8BubbleScore{color:#ffdf8c}',
'#p8BubbleControls{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}',
'#p8BubbleControls button{min-height:51px;background:linear-gradient(120deg,#9e55d9,#583092);border:1px solid #ffca7d;color:white;border-radius:12px;font-weight:800}',
'#p8BubbleControls button:disabled{opacity:.45}',
'#p8BubbleMessage{min-height:30px;font-size:13px;text-align:center;color:#ffe0a1}'
].join('\n');document.head.append(css);
const canvas=$('p8BubbleCanvas'),ctx=canvas.getContext('2d'),COLS=8,ROWS=12,R=20,CX=22,D=46,Y0=33,DY=39;
const palette=['#f44b78','#3fc5fa','#f9d34f','#62e89b','#aa78f9'];const rand=n=>Math.floor(Math.random()*n),position=(r,c)=>({x:CX+c*D+(r%2)*21,y:Y0+r*DY});
let board=[],score=0,current=0,next=0,aim={x:200,y:120},moving=null,frame=0,bombs=2,bombMode=false,swapped=false,over=false;
function ball(x,y,color,r=R){const grad=ctx.createRadialGradient(x-r*.4,y-r*.55,2,x,y,r);grad.addColorStop(0,'#fff');grad.addColorStop(.22,palette[color]);grad.addColorStop(.85,palette[color]);grad.addColorStop(1,'#2a103b');ctx.fillStyle=grad;ctx.shadowColor=palette[color];ctx.shadowBlur=6;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#fff9';ctx.lineWidth=1.5;ctx.stroke();}
function draw(){
const bg=ctx.createLinearGradient(0,0,0,590);bg.addColorStop(0,'#2b2059');bg.addColorStop(.67,'#11162c');bg.addColorStop(1,'#391b52');ctx.fillStyle=bg;ctx.fillRect(0,0,400,590);
for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){if(board[r][c]!==null){const p=position(r,c);ball(p.x,p.y,board[r][c]);}}
ctx.strokeStyle='#ffde9966';ctx.setLineDash([6,9]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(200,522);
let dx=aim.x-200,dy=Math.min(-32,aim.y-522),len=Math.hypot(dx,dy),vx=dx/len*10,vy=dy/len*10,x=200,y=522;
for(let i=0;i<60;i++){x+=vx;y+=vy;if(x<R||x>400-R){x=Math.min(400-R,Math.max(R,x));vx=-vx;}ctx.lineTo(x,y);if(y<30)break;}ctx.stroke();ctx.setLineDash([]);
ctx.save();ctx.translate(200,538);ctx.rotate(Math.atan2(dy,dx)+Math.PI/2);
ctx.fillStyle='#f2d076';ctx.strokeStyle='#a26a29';ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(-17,-42,34,75,12);ctx.fill();ctx.stroke();ctx.fillStyle='#7432a7';ctx.fillRect(-23,-5,46,35);ctx.restore();
if(moving)ball(moving.x,moving.y,moving.color,19);else if(bombMode){ctx.font='37px system-ui';ctx.fillText('💣',182,523);}else ball(200,505,current,18);
ctx.textAlign='center';ctx.fillStyle='#fbe2a3';ctx.font='bold 13px system-ui';ctx.fillText('NEXT',342,513);ball(341,545,next,19);
}
function announce(s){$('p8BubbleMessage').textContent=s;$('p8BubbleScore').textContent='Score: '+score;}
function neighbors(r,c){const center=position(r,c),out=[];for(let rr=Math.max(0,r-2);rr<=Math.min(ROWS-1,r+2);rr++)for(let cc=Math.max(0,c-2);cc<=Math.min(COLS-1,c+2);cc++)if((rr!==r||cc!==c)&&Math.hypot(position(rr,cc).x-center.x,position(rr,cc).y-center.y)<R*2.4)out.push([rr,cc]);return out;}
function cluster(r,c,match){const seen=new Set(),stack=[[r,c]];while(stack.length){const [rr,cc]=stack.pop(),key=rr*COLS+cc;if(seen.has(key)||board[rr][cc]===null||!match(board[rr][cc]))continue;seen.add(key);for(const n of neighbors(rr,cc))stack.push(n);}return seen;}
function dropFloating(){const attached=new Set();for(let c=0;c<COLS;c++)if(board[0][c]!==null)for(const key of cluster(0,c,()=>true))attached.add(key);
let fallen=0;for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(board[r][c]!==null&&!attached.has(r*COLS+c)){board[r][c]=null;fallen++;}score+=fallen*15;return fallen;}
function land(b){
let row=0,col=0,dmin=1e9;for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(board[r][c]===null){const p=position(r,c),d=Math.hypot(p.x-b.x,p.y-b.y);if(d<dmin){row=r;col=c;dmin=d;}}
if(dmin===1e9){over=true;announce('BOARD FULL — NEW PRACTICE');return;}
if(b.bomb){let gone=0;const where=position(row,col);for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(board[r][c]!==null&&Math.hypot(position(r,c).x-where.x,position(r,c).y-where.y)<R*4){board[r][c]=null;gone++;}
score+=gone*15;dropFloating();announce('💣 BOOM! '+gone+' bubbles destroyed');}
else{board[row][col]=b.color;const group=cluster(row,col,v=>v===b.color);if(group.size>=3){for(const k of group)board[Math.floor(k/COLS)][k%COLS]=null;score+=group.size*10;dropFloating();announce('Matched '+group.size+' bubbles!');}else announce('Match 3+ bubbles to pop');}
if(board.every(r=>r.every(v=>v===null))){score+=300;over=true;announce('🏆 BOARD CLEARED! +300');}
if(board.slice(10).some(r=>r.some(v=>v!==null))){over=true;announce('GAME OVER — bubbles reached the cannon');}
updateButtons();draw();}
function tick(){if(!moving)return;for(let n=0;n<2;n++){moving.x+=moving.vx/2;moving.y+=moving.vy/2;if(moving.x<R||moving.x>400-R){moving.x=Math.min(400-R,Math.max(R,moving.x));moving.vx=-moving.vx;}
let hit=moving.y<=R+8;
if(!hit)for(let r=0;r<ROWS&&!hit;r++)for(let c=0;c<COLS;c++)if(board[r][c]!==null&&Math.hypot(moving.x-position(r,c).x,moving.y-position(r,c).y)<R*2-3){hit=true;break;}
if(hit){const shot=moving;moving=null;land(shot);break;}}
draw();if(moving)frame=requestAnimationFrame(tick);}
function updateButtons(){$('p8BubbleSwap').disabled=swapped||!!moving||over;$('p8BubbleBomb').disabled=bombs<=0||!!moving||over;$('p8BubbleBomb').textContent=(bombMode?'💣 CANCEL':'💣 BOMB')+' ×'+bombs;}
function fire(){if(over||moving)return;let dx=aim.x-200,dy=Math.min(-32,aim.y-522),l=Math.hypot(dx,dy);moving={x:200,y:505,vx:dx/l*10,vy:dy/l*10,color:current,bomb:bombMode};
if(bombMode){bombs--;bombMode=false;}current=next;next=rand(palette.length);swapped=false;updateButtons();tick();}
function reset(){cancelAnimationFrame(frame);moving=null;score=0;over=false;bombs=2;bombMode=false;swapped=false;aim={x:200,y:110};board=Array.from({length:ROWS},(_,r)=>Array.from({length:COLS},()=>r<4?rand(palette.length):null));current=rand(palette.length);next=rand(palette.length);updateButtons();announce('Aim and tap to fire · SWAP or BOMB available');draw();}
function point(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*400/r.width,y:(e.clientY-r.top)*590/r.height};}
canvas.addEventListener('pointermove',e=>{if(!moving){aim=point(e);draw();}});
canvas.addEventListener('pointerdown',e=>{if(wrap.classList.contains('hidden'))return;e.preventDefault();aim=point(e);fire();});
$('p8BubbleSwap').addEventListener('click',()=>{if(swapped||moving||over)return;[current,next]=[next,current];swapped=true;updateButtons();draw();});
$('p8BubbleBomb').addEventListener('click',()=>{if(bombs<1||moving||over)return;bombMode=!bombMode;updateButtons();draw();});
function launch(){wrap.classList.remove('hidden');$('p8PracticeGrid').classList.add('hidden');$('p8PracticeShapes').classList.add('hidden');$('p8PracticeScore').classList.add('hidden');reset();}
function hide(){wrap.classList.add('hidden');$('p8PracticeGrid').classList.remove('hidden');$('p8PracticeShapes').classList.remove('hidden');$('p8PracticeScore').classList.remove('hidden');cancelAnimationFrame(frame);moving=null;}
window.Play80BubbleDeluxe=Object.freeze({launch,hide,reset});
})();