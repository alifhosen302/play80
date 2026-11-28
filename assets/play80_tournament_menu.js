/* Tournament game selection: server tournament exists for Memory only.
   Bubble, Block and 2048 are clearly labelled PRACTICE until real server tournaments launch. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),home=$('p8TournamentCatalog'),detail=$('p8TournamentDetail'),live=$('p8TourMemoryLive'),upcoming=$('p8TourUpcoming');
if(!home||!detail)return;
const prizeButton=$('p8TourPrizeButton'),card=document.createElement('section');
card.className='play80Surface';card.id='p8TourPrizeBreakdown';card.hidden=true;
card.innerHTML='<h3>🏆 পুরস্কার</h3><p id="p8PrizeInfo">শুধু ডেমো কয়েন। সর্বোচ্চ বরাদ্দ ৭,৫০০; প্রকৃত পুরস্কার তহবিল অনুযায়ী কম হতে পারে।</p>';
const rankRewards=[1800,1200,1000,900,800,700,600,500];
const list=document.createElement('div');
rankRewards.forEach((amount,i)=>{const item=document.createElement('div');item.className='p8PrizeRow';const rank=document.createElement('span'),reward=document.createElement('strong');rank.textContent=(['🥇','🥈','🥉'][i]||'🏅')+' '+(i+1)+' নম্বর';reward.textContent=amount.toLocaleString('bn-BD')+' কয়েন পর্যন্ত';item.append(rank,reward);list.append(item);});
card.append(list);detail.querySelector('.p8TourCompactHead').after(card);
prizeButton.addEventListener('click',()=>{card.hidden=!card.hidden;prizeButton.setAttribute('aria-expanded',String(!card.hidden));});
const games={bubble:'Bubble Shooter',block:'Block Puzzle',memory:'Memory Puzzle','2048':'2048 Puzzle',temple:'Temple Trail',candy:'Candy Match',subway:'Metro Dash',coinrun:'Coin Quest'};
const serverGames={bubble:'bubbles',block:'blockpuzzle',memory:'memory','2048':'game2048'};
const ownerTest=()=>['owner','admin'].includes(window.Play80Cloud?.user()?.app_metadata?.role);
const navigate=name=>document.dispatchEvent(new CustomEvent('play80:menu-navigate',{detail:name}));
let current='memory',grid=[],score=0,selected=0,pieces=[],drag=null,blockOver=false;
const past=document.createElement('section');past.className='play80Surface';past.id='p8TourPastWinners';
const pastButton=document.createElement('button');pastButton.type='button';pastButton.className='play80SecondaryBtn';pastButton.textContent='🏅 আগের বিজয়ীদের তালিকা';
const pastList=document.createElement('div');pastList.setAttribute('aria-live','polite');past.append(pastButton,pastList);detail.append(past);
pastButton.addEventListener('click',async()=>{const chosen=current;pastList.textContent='লোড হচ্ছে…';try{const result=await window.Play80Cloud.rpc('play80_tournament_winners',{p_game:serverGames[chosen]});if(current!==chosen)return;pastList.replaceChildren();if(!result?.winners?.length){pastList.textContent='এই গেমের কোনো প্রকাশিত ফল নেই।';return;}const date=document.createElement('p');date.textContent='সমাপ্ত: '+new Date(result.ends_at).toLocaleString('bn-BD');pastList.append(date);for(const r of result.winners){const row=document.createElement('div');row.className='tourLeader';row.textContent=(r.rank===1?'🥇':r.rank===2?'🥈':r.rank===3?'🥉':'#'+r.rank)+' · '+r.username+(r.type==='ai'?' · AI Player':'')+' · '+r.score+' স্কোর · '+r.reward+' ডেমো কয়েন';pastList.append(row);}}catch(_){if(current===chosen)pastList.textContent='বিজয়ীদের তথ্য এখন পাওয়া যাচ্ছে না।';}});
const blockRules=window.Play80BlockRules;
const colors=['#ed527b','#42c6fd','#fac851','#8be88a','#af80ff'],rand=n=>Math.floor(Math.random()*n);
function choose(key){
 if(!games[key])return;
 current=key;
 if(ownerTest()){delete detail.dataset.game;detail.classList.add('hidden');home.classList.remove('hidden');practice();return;}
 pastList.replaceChildren();pastButton.hidden=!serverGames[key];home.classList.add('hidden');detail.classList.remove('hidden');
 $('p8TourChosenTitle').textContent=games[key];
 detail.dataset.game=key;
 card.hidden=true;prizeButton.setAttribute('aria-expanded','false');prizeButton.hidden=false;
 live.classList.remove('hidden');upcoming.classList.remove('hidden');
 for(const id of ['tourCountdown','tourHumans','tourBots','tourMyScore','tourPool'])$(id).textContent='—';
 $('tourClockLabel').textContent='খেলা শুরু হতে বাকি';
 $('tourState').textContent=key==='memory'?'লোড হচ্ছে…':'এখনো চালু হয়নি';
 $('tourFeeMode').textContent=key==='memory'?'রাউন্ড ফি':'বর্তমানে ফ্রি অনুশীলন';
 $('tourFeeAmount').hidden=key!=='memory';
 $('tourJoin').disabled=true;$('tourJoin').classList.toggle('hidden',key!=='memory');
 $('tourJoin').textContent='নিবন্ধন করুন';
 $('tourPlay').disabled=true;$('tourPlay').classList.add('hidden');
 $('tourRefresh').classList.toggle('hidden',key!=='memory');
 $('tourRulesList').parentElement.hidden=key!=='memory';
 $('tourListTitle').textContent='👥 নিবন্ধিত খেলোয়াড়';
 $('tourLeaderboard').textContent=key==='memory'?'তালিকা লোড হচ্ছে…':'নিবন্ধন এখনো খোলা হয়নি।';
 $('tourNotice').textContent=key==='memory'?'সার্ভারের তথ্য লোড হচ্ছে…':'';
 $('p8PrizeInfo').textContent=key==='memory'?'তহবিলের তথ্য লোড হচ্ছে…':'পরিকল্পিত সর্বোচ্চ পুরস্কার। এই গেমে এখনো টুর্নামেন্ট বা পুরস্কার চালু হয়নি।';
 if(key==='memory')$('tourRefresh')?.click();
 window.scrollTo(0,0);
}
function back(){delete detail.dataset.game;detail.classList.add('hidden');home.classList.remove('hidden');window.scrollTo(0,0);}
 document.addEventListener('play80:screen-changed',e=>{if(e.detail==='tournament'){home.classList.toggle('p8-owner-test',ownerTest());if(ownerTest())back();}});
home.querySelectorAll('[data-tour-choice]').forEach(el=>el.addEventListener('click',()=>choose(el.dataset.tourChoice)));
$('p8TourBack').addEventListener('click',back);
document.querySelectorAll('[data-main-tab="tournament"]').forEach(el=>el.addEventListener('click',back));
const screen=document.createElement('section');screen.id='screen-p8-practice';screen.className='screen hidden';
screen.innerHTML='<div class="play80Surface"><button id="p8PracticeBack" class="play80SecondaryBtn" type="button">‹</button><h2 id="p8PracticeName">Practice</h2><p id="p8PracticeDisclosure">ফ্রি প্রিভিউ · কোনো কয়েন কাটা হবে না; স্কোর টুর্নামেন্টে যোগ হবে না।</p><div id="p8PracticeScore">Score: 0</div><div id="p8PracticeGrid" role="grid" aria-label="Puzzle practice board"></div><div id="p8PracticeShapes"></div><div id="p8LocalMemoryGrid" class="memGrid hidden" aria-label="Memory test cards"></div><p id="p8BlockNotice" role="status"></p><button id="p8PracticeReset" class="play80PrimaryBtn">NEW PRACTICE</button></div>';
document.querySelector('main')?.append(screen);
const style=document.createElement('style');style.textContent=[
'#p8PracticeGrid{width:100%;max-width:410px;aspect-ratio:1;display:grid;grid-template-columns:repeat(8,minmax(0,1fr));grid-template-rows:repeat(8,minmax(0,1fr));gap:3px;background:#272440;padding:5px;border-radius:12px;margin:12px auto}',
'#p8PracticeGrid button{width:100%;height:100%;min-width:0;min-height:0;display:grid;place-items:center;padding:0;border:1px solid #ffffff25;border-radius:7px;background:#242443;color:#fff;cursor:pointer}',
'#p8PracticeGrid button.bubble{border-radius:50%;box-shadow:inset -3px -4px 5px #0008,inset 2px 2px 5px #fff7}',
'#p8PracticeGrid button.blockFilled{background:linear-gradient(145deg,#b76fff,#5b3bb9);box-shadow:inset 2px 2px 4px #fff7}',
'#p8PracticeScore{font-size:18px;font-weight:900;color:#ffe49b;margin:12px 0}',
'#p8PracticeShapes{display:flex;justify-content:center;gap:9px;margin:14px 0}',
'#p8PracticeShapes button{min-width:54px;min-height:46px;border:1px solid #cda967;border-radius:9px;color:white;background:#43305e}',
`#p8PracticeShapes button.chosen{outline:2px solid #f9dc80}
#p8PracticeGrid button.blockFilled{background:var(--block-color);box-shadow:inset 2px 2px 3px #fff8,inset -2px -3px 4px #0006;border:1px solid #fff5}
#p8PracticeGrid button.blockPreview{outline:2px solid #ffdb76;outline-offset:-2px;background:var(--preview-color)}
#p8PracticeGrid button.blockInvalid{outline:2px solid #ff6b83;outline-offset:-2px}
#p8PracticeGrid button.blockClear{animation:p8BlockClear .28s ease-out}
@keyframes p8BlockClear{0%{background:#fff2b1;box-shadow:0 0 13px #ffdf74}100%{background:#242443;box-shadow:none}}
#p8PracticeShapes{align-items:center;justify-content:space-between;gap:8px;min-height:72px}
#p8PracticeShapes button{flex:1;min-width:0;min-height:68px;padding:6px;display:grid;place-items:center;touch-action:none;user-select:none}
.p8-block-mini{--tile:clamp(10px,3.6vw,17px);display:grid!important;gap:2px!important;width:max-content!important;height:max-content!important;grid-template-columns:repeat(var(--cols),var(--tile));grid-template-rows:repeat(var(--rows),var(--tile));align-content:start;justify-content:start;pointer-events:none}
.p8-block-mini i{display:block!important;box-sizing:border-box;width:var(--tile)!important;height:var(--tile)!important;min-width:0;min-height:0;max-width:none;max-height:none;margin:0!important;padding:0!important;position:static!important;border-radius:3px;box-shadow:inset 1px 1px 2px #fff9,inset -1px -2px 3px #0006;border:1px solid #ffffff35}
.p8-block-mini i.empty{visibility:hidden}
.p8-block-ghost{position:fixed;z-index:9999;pointer-events:none;opacity:.88;filter:drop-shadow(0 4px 5px #0008)}
.p8-block-ghost .p8-block-mini{--tile:var(--ghost-cell)}
.p8-block-ghost .p8-block-mini i{border-radius:5px}
#p8PracticeShapes>button{height:84px!important;min-height:84px!important;max-height:84px;align-self:stretch;overflow:hidden}
#p8PracticeShapes>button>.p8-block-mini{place-self:center}
#p8BlockNotice{margin:4px 0 8px;color:#ffe3a4;font-size:.85rem;min-height:20px}
#screen-p8-practice.p8-block-active>.play80Surface{padding:9px}
#screen-p8-practice.p8-block-active h2{font-size:1.1rem;margin:5px 0}
#screen-p8-practice.p8-block-active p{font-size:.8rem;margin:4px 0}
#screen-p8-practice.p8-block-active #p8PracticeGrid{max-width:min(410px,calc(100dvh - 340px));margin:6px auto}
#screen-p8-practice.p8-block-active #p8PracticeShapes{margin:6px 0;min-height:60px}
#screen-p8-practice.p8-block-active #p8PracticeShapes button{min-height:60px}
#screen-p8-practice.p8-block-active #p8PracticeScore{margin:5px 0}
`
].join('\n');document.head.append(style);
function render(){const cells=$('p8PracticeGrid').children;for(let i=0;i<64;i++){let b=cells[i];b.className='';b.style.background='';if(current==='bubble'&&grid[i]>=0){b.className='bubble';b.style.background=colors[grid[i]];}else if(current==='block'&&grid[i]){b.className='blockFilled';b.style.setProperty('--block-color',grid[i]);}}
 $('p8PracticeScore').textContent='Score: '+score;
}
function drawBoard(){const root=$('p8PracticeGrid');root.replaceChildren();for(let i=0;i<64;i++){const b=document.createElement('button');b.type='button';b.dataset.cell=i;root.append(b);}
 root.onclick=e=>{const el=e.target.closest('[data-cell]');if(!el)return;const i=Number(el.dataset.cell);if(current==='bubble')shoot(i%8);else place(i);};
}
function flood(i,color,result=new Set()){
 if(i<0||i>=64||grid[i]!==color||result.has(i))return result;
 result.add(i);const r=Math.floor(i/8),c=i%8;
 for(const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]){let x=r+dr,y=c+dc;if(x>=0&&x<8&&y>=0&&y<8)flood(x*8+y,color,result);}
 return result;
}
function bubbleChoice(){const root=$('p8PracticeShapes');root.replaceChildren();const label=document.createElement('span');label.textContent='NEXT BUBBLE';root.append(label);const ball=document.createElement('button');ball.style.background=colors[selected];ball.textContent='●';root.append(ball);}
function shoot(col){let row=0;while(row<8&&grid[row*8+col]>=0)row++;if(row>=8)return;const i=row*8+col;grid[i]=selected;const hits=flood(i,selected);if(hits.size>=3){hits.forEach(j=>grid[j]=-1);score+=hits.size*10;for(let c=0;c<8;c++){const remaining=[];for(let r=0;r<8;r++)if(grid[r*8+c]>=0)remaining.push(grid[r*8+c]);for(let r=0;r<8;r++)grid[r*8+c]=remaining[r]??-1;}}
 selected=rand(colors.length);render();bubbleChoice();
 if(grid.slice(48).every(x=>x>=0))$('p8PracticeScore').textContent+=' — BOARD FULL';
}
function newShapes(){pieces=blockRules.makePieces();selected=0;drawShapes();}
function mini(piece){
  const holder=document.createElement('div');holder.className='p8-block-mini';
  const rows=Math.max(...piece.shape.map(([r])=>r))+1,cols=Math.max(...piece.shape.map(([,c])=>c))+1;
  holder.style.setProperty('--cols',String(cols));holder.style.setProperty('--rows',String(rows));
  const occupied=new Set(piece.shape.map(([r,c])=>r+','+c));
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const tile=document.createElement('i');if(occupied.has(r+','+c))tile.style.background=piece.color;else tile.className='empty';holder.append(tile);
  }
  return holder;
}
function drawShapes(){
  const root=$('p8PracticeShapes');root.replaceChildren();
  pieces.forEach((piece,i)=>{
    const b=document.createElement('button');b.type='button';b.disabled=!piece||blockOver;
    b.classList.toggle('chosen',i===selected&&!!piece);
    b.setAttribute('aria-label',piece?'Block '+(i+1)+' · '+piece.shape.length+' cells':'Used block');
    if(piece){b.append(mini(piece));b.addEventListener('pointerdown',e=>startDrag(e,i));}
    else b.textContent='✓';
    b.addEventListener('click',()=>{if(!piece||blockOver)return;selected=i;drawShapes();});
    root.append(b);
  });
}
function clearPreview(){for(const b of $('p8PracticeGrid').children){b.classList.remove('blockPreview','blockInvalid');b.style.removeProperty('--preview-color');}}
function dragPosition(e){
  const root=$('p8PracticeGrid'),box=root.getBoundingClientRect();
  const first=root.firstElementChild.getBoundingClientRect(),last=root.lastElementChild.getBoundingClientRect();
  const pitchX=(last.left-first.left)/7,pitchY=(last.top-first.top)/7;
  const x=e.clientX-drag.offsetX,y=e.clientY-drag.offsetY;
  return {row:Math.round((y-first.top)/pitchY),col:Math.round((x-first.left)/pitchX),x,y,cell:first.width,
    inside:e.clientX>=box.left-10&&e.clientX<=box.right+10&&e.clientY>=box.top-10&&e.clientY<=box.bottom+10};
}
function moveDrag(e){
  if(!drag||drag.pointer!==e.pointerId)return;
  e.preventDefault();if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5)drag.moved=true;
  if(!drag.moved)return;
  const p=dragPosition(e);drag.pos=p;
  drag.ghost.style.display='block';drag.ghost.style.left=p.x+'px';drag.ghost.style.top=p.y+'px';drag.ghost.style.setProperty('--ghost-cell',p.cell+'px');
  clearPreview();
  if(!p.inside)return;
  const cells=blockRules.cellsFor(pieces[drag.index],p.row,p.col);
  const valid=blockRules.canPlace(grid,pieces[drag.index],p.row,p.col);
  for(const i of cells||[]){const b=$('p8PracticeGrid').children[i];b.classList.add(valid?'blockPreview':'blockInvalid');b.style.setProperty('--preview-color',pieces[drag.index].color+'88');}
}
function endDrag(e,cancel=false){
  if(!drag||drag.pointer!==e.pointerId)return;
  const d=drag;
  if(!cancel&&d.moved)moveDrag(e);
  drag=null;d.ghost.remove();clearPreview();
  if(!cancel&&d.moved&&d.pos?.inside){
    selected=d.index;place(d.pos.row*8+d.pos.col,d.pos.row,d.pos.col);
  }else if(!cancel&&!d.moved){selected=d.index;drawShapes();}
}
function startDrag(e,index){
  if(blockOver||!pieces[index]||drag||e.button>0)return;
  e.preventDefault();
  const piece=pieces[index],ghost=document.createElement('div');
  ghost.className='p8-block-ghost';ghost.style.display='none';ghost.append(mini(piece));document.body.append(ghost);
  const cell=$('p8PracticeGrid').firstElementChild.getBoundingClientRect().width;
  const rows=Math.max(...piece.shape.map(([r])=>r))+1,cols=Math.max(...piece.shape.map(([,c])=>c))+1;
  drag={index,pointer:e.pointerId,ghost,startX:e.clientX,startY:e.clientY,moved:false,offsetX:cols*cell/2,offsetY:rows*cell/2+cell*.6};
  e.currentTarget.setPointerCapture(e.pointerId);
  const button=e.currentTarget;
  const cleanup=()=>{button.removeEventListener('pointermove',moveDrag);button.removeEventListener('pointerup',up);button.removeEventListener('pointercancel',cancel);};
  const up=ev=>{cleanup();endDrag(ev);},cancel=ev=>{cleanup();endDrag(ev,true);};
  button.addEventListener('pointermove',moveDrag);button.addEventListener('pointerup',up);button.addEventListener('pointercancel',cancel);
}
function place(i,row=Math.floor(i/8),col=i%8){
  if(blockOver)return;
  const result=blockRules.place(grid,pieces[selected],row,col);
  if(!result){$('p8BlockNotice').textContent='এখানে ব্লকটি বসানো যাবে না।';return;}
  grid=result.board;score+=result.score;pieces[selected]=null;
  if(pieces.every(x=>!x))newShapes();else{selected=pieces.findIndex(Boolean);drawShapes();}
  render();
  for(const j of result.cleared){const cell=$('p8PracticeGrid').children[j];cell.classList.add('blockClear');cell.addEventListener('animationend',()=>cell.classList.remove('blockClear'),{once:true});}
  blockOver=!blockRules.hasMove(grid,pieces);
  $('p8BlockNotice').textContent=blockOver?'আর ব্লক বসানো যাবে না · GAME OVER':result.lines?result.lines+' লাইন পরিষ্কার! +'+result.score:'ব্লকটি টেনে বোর্ডে বসান';
  if(blockOver)drawShapes();
}
function reset(){if(drag){drag.ghost.remove();drag=null;}blockOver=false;$('p8BlockNotice').textContent=current==='block'?'ব্লক টেনে বোর্ডে বসান; পূর্ণ সারি বা কলাম পরিষ্কার হবে।':'';score=0;if(current==='bubble'){grid=Array.from({length:64},(_,i)=>i<24?rand(colors.length):-1);selected=rand(colors.length);}else{grid=Array(64).fill(null);newShapes();}drawBoard();render();if(current==='bubble')bubbleChoice();}
// Shared free preview and owner QA: no tournament RPC, wallet, or leaderboard.
let memoryDeck=[],memoryMatched=new Set(),memoryShown=[],memoryAttempts=0,memoryEpoch=0,memoryBusy=false;
function renderLocalMemory(){
 const root=$('p8LocalMemoryGrid');root.replaceChildren();
 const icons=['🍒','🍇','🌟','🍋','🔔','💎','🍓','🍀'];
 memoryDeck.forEach((value,i)=>{
  const b=document.createElement('button');b.type='button';b.className='memCard';
  const done=memoryMatched.has(i),shown=memoryShown.includes(i);
  b.classList.toggle('show',done||shown);b.classList.toggle('done',done);
  b.textContent=done||shown?icons[value]:'✦';
  b.disabled=done||shown||memoryBusy;b.setAttribute('aria-label','Memory card '+(i+1));
  b.addEventListener('click',()=>flipLocalMemory(i));root.append(b);
 });
 $('p8PracticeScore').textContent='Score: '+score+' · Attempts: '+memoryAttempts;
}
function resetLocalMemory(){
 memoryEpoch++;memoryDeck=Array.from({length:16},(_,i)=>i%8);
 for(let i=15;i>0;i--){const j=rand(i+1);[memoryDeck[i],memoryDeck[j]]=[memoryDeck[j],memoryDeck[i]];}
 memoryMatched=new Set();memoryShown=[];memoryAttempts=0;memoryBusy=false;score=0;renderLocalMemory();
}
function flipLocalMemory(i){
 if(screen.classList.contains('hidden')||current!=='memory'||memoryBusy||memoryMatched.has(i)||memoryShown.includes(i))return;
 memoryShown.push(i);
 if(memoryShown.length===1){renderLocalMemory();return;}
 memoryAttempts++;const [a,b]=memoryShown;
 if(memoryDeck[a]===memoryDeck[b]){memoryMatched.add(a);memoryMatched.add(b);score+=100;memoryShown=[];renderLocalMemory();if(memoryMatched.size===16)$('p8PracticeScore').textContent+=' · Complete!';return;}
 memoryBusy=true;renderLocalMemory();const epoch=memoryEpoch;
 setTimeout(()=>{if(epoch!==memoryEpoch||screen.classList.contains('hidden')||current!=='memory')return;memoryShown=[];memoryBusy=false;renderLocalMemory();},800);
}
function practice(){
 const qa=ownerTest();
 if(window.Play80SkillPreview?.has(current)){window.Play80SkillPreview.open(current);return;}
 if(current==='2048'){navigate('2048');return;}
 if(!['bubble','block','memory'].includes(current))return;
 navigate('p8-practice');
 screen.classList.toggle('p8-block-active',current==='block');
 $('p8PracticeDisclosure').hidden=qa;
 $('p8PracticeName').textContent=games[current]+(qa?'':' — প্রিভিউ');
 $('p8PracticeReset').textContent=qa?'NEW GAME':'NEW PRACTICE';
 $('p8BlockNotice').hidden=current!=='block';
 const memory=current==='memory';
 $('p8LocalMemoryGrid').classList.toggle('hidden',!memory);
 $('p8PracticeGrid').classList.toggle('hidden',memory);
 $('p8PracticeShapes').classList.toggle('hidden',memory);
 if(memory){window.Play80BubbleDeluxe?.hide();resetLocalMemory();}
 else{reset();if(current==='bubble')window.Play80BubbleDeluxe?.launch();else window.Play80BubbleDeluxe?.hide();}
 window.scrollTo(0,0);
}
$('p8TourPractice').addEventListener('click',practice);
$('p8PracticeReset').addEventListener('click',()=>{if(current==='memory'){if(!screen.classList.contains('hidden'))resetLocalMemory();return;}reset();if(current==='bubble')window.Play80BubbleDeluxe?.reset();});
$('p8PracticeBack').addEventListener('click',()=>{if(drag){drag.ghost.remove();drag=null;}memoryEpoch++;window.Play80BubbleDeluxe?.hide();navigate('tournament');if(ownerTest())back();else choose(current);});
window.Play80TournamentMenu=Object.freeze({games:Object.keys(games),selected:()=>current});
})();