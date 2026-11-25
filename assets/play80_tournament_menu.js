/* Tournament game selection: server tournament exists for Memory only.
   Bubble, Block and 2048 are clearly labelled PRACTICE until real server tournaments launch. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),home=$('p8TournamentCatalog'),detail=$('p8TournamentDetail'),live=$('p8TourMemoryLive'),upcoming=$('p8TourUpcoming');
if(!home||!detail)return;
if(live){
  const card=document.createElement('div');
  card.className='play80Surface';
  card.id='p8TourPrizeBreakdown';
  const rankRewards=[1800,1200,1000,900,800,700,600,500];
  card.innerHTML='<h3>🏆 Tournament Prize Distribution</h3><p><b>Entry fee:</b> 500 non-redeemable Demo Coins once per person. <b>Maximum funded pool:</b> 7,500 Demo Coins. Actual awards scale with the funded prize pool; no company subsidy or cash redemption.</p>';
  const list=document.createElement('div');list.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px';
  rankRewards.forEach((amount,i)=>{const item=document.createElement('div');item.style.cssText='padding:10px;border:1px solid #a57ce2;border-radius:10px;background:#282041';item.textContent='#'+(i+1)+' · up to '+amount.toLocaleString('en-US')+' coins';list.append(item);});
  card.append(list);live.append(card);
}
const games={bubble:'Bubble Shooter',block:'Block Puzzle',memory:'Memory Puzzle','2048':'2048 Puzzle'};
let current='memory',grid=[],score=0,selected=0,pieces=[];
const colors=['#ed527b','#42c6fd','#fac851','#8be88a','#af80ff'],rand=n=>Math.floor(Math.random()*n);
function choose(key){
 if(!games[key])return;
 current=key;home.classList.add('hidden');detail.classList.remove('hidden');
 $('p8TourChosenTitle').textContent=games[key];
 $('p8TourChosenMeta').textContent=key==='memory'?'Live server tournament: start time, players, fee, ranking and funded rewards.':'Server tournament NOT scheduled. Practice mode only. No registration fee or prize.';
 live.classList.toggle('hidden',key!=='memory');upcoming.classList.toggle('hidden',key==='memory');
 if(key==='memory')$('tourRefresh')?.click();
 window.scrollTo(0,0);
}
function back(){detail.classList.add('hidden');home.classList.remove('hidden');window.scrollTo(0,0);}
home.querySelectorAll('[data-tour-choice]').forEach(el=>el.addEventListener('click',()=>choose(el.dataset.tourChoice)));
$('p8TourBack').addEventListener('click',back);
document.querySelectorAll('[data-main-tab="tournament"]').forEach(el=>el.addEventListener('click',back));
const screen=document.createElement('section');screen.id='screen-p8-practice';screen.className='screen hidden';
screen.innerHTML='<div class="play80Surface"><button id="p8PracticeBack" class="play80SecondaryBtn" type="button">← TOURNAMENT GAMES</button><h2 id="p8PracticeName">Practice</h2><p>Practice only. No server tournament fees, rankings or prizes for this game yet.</p><div id="p8PracticeScore">Score: 0</div><div id="p8PracticeGrid" role="grid" aria-label="Puzzle practice board"></div><div id="p8PracticeShapes"></div><button id="p8PracticeReset" class="play80PrimaryBtn">NEW PRACTICE</button></div>';
document.querySelector('main')?.append(screen);
const style=document.createElement('style');style.textContent=[
'#p8PracticeGrid{width:100%;max-width:410px;aspect-ratio:1;display:grid;grid-template-columns:repeat(8,minmax(0,1fr));grid-template-rows:repeat(8,minmax(0,1fr));gap:3px;background:#272440;padding:5px;border-radius:12px;margin:12px auto}',
'#p8PracticeGrid button{width:100%;height:100%;min-width:0;min-height:0;display:grid;place-items:center;padding:0;border:1px solid #ffffff25;border-radius:7px;background:#242443;color:#fff;cursor:pointer}',
'#p8PracticeGrid button.bubble{border-radius:50%;box-shadow:inset -3px -4px 5px #0008,inset 2px 2px 5px #fff7}',
'#p8PracticeGrid button.blockFilled{background:linear-gradient(145deg,#b76fff,#5b3bb9);box-shadow:inset 2px 2px 4px #fff7}',
'#p8PracticeScore{font-size:18px;font-weight:900;color:#ffe49b;margin:12px 0}',
'#p8PracticeShapes{display:flex;justify-content:center;gap:9px;margin:14px 0}',
'#p8PracticeShapes button{min-width:54px;min-height:46px;border:1px solid #cda967;border-radius:9px;color:white;background:#43305e}',
'#p8PracticeShapes button.chosen{outline:3px solid #f9dc80}'
].join('\n');document.head.append(style);
function render(){const cells=$('p8PracticeGrid').children;for(let i=0;i<64;i++){let b=cells[i];b.className='';b.style.background='';if(current==='bubble'&&grid[i]>=0){b.className='bubble';b.style.background=colors[grid[i]];}else if(current==='block'&&grid[i])b.className='blockFilled';}
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
const templates=[[[0,0]],[[0,0],[0,1]],[[0,0],[1,0]],[[0,0],[0,1],[0,2]],[[0,0],[1,0],[2,0]],[[0,0],[1,0],[1,1],[2,1]]];
function newShapes(){pieces=Array.from({length:3},()=>templates[rand(templates.length)]);selected=0;drawShapes();}
function drawShapes(){const root=$('p8PracticeShapes');root.replaceChildren();pieces.forEach((p,i)=>{const b=document.createElement('button');b.type='button';b.disabled=!p;b.textContent=p?'▣'.repeat(p.length):'✓';b.classList.toggle('chosen',i===selected);b.addEventListener('click',()=>{selected=i;drawShapes()});root.append(b);});}
function place(i){const shape=pieces[selected];if(!shape)return;const row=Math.floor(i/8),col=i%8;const cells=shape.map(([r,c])=>[row+r,col+c]);if(cells.some(([r,c])=>r>7||c>7||grid[r*8+c]))return;
 cells.forEach(([r,c])=>grid[r*8+c]=1);score+=shape.length;pieces[selected]=null;
 const cleared=new Set();
 for(let r=0;r<8;r++)if(grid.slice(r*8,r*8+8).every(Boolean))for(let c=0;c<8;c++)cleared.add(r*8+c);
 for(let c=0;c<8;c++)if(Array.from({length:8},(_,r)=>grid[r*8+c]).every(Boolean))for(let r=0;r<8;r++)cleared.add(r*8+c);
 cleared.forEach(j=>grid[j]=0);score+=cleared.size*5;
 if(pieces.every(x=>!x))newShapes();else{selected=pieces.findIndex(Boolean);drawShapes();}render();
}
function reset(){score=0;if(current==='bubble'){grid=Array.from({length:64},(_,i)=>i<24?rand(colors.length):-1);selected=rand(colors.length);}else{grid=Array(64).fill(0);newShapes();}drawBoard();render();if(current==='bubble')bubbleChoice();}
function practice(){if(current==='2048'){$('screen-tournament').querySelector('[data-open="2048"]')?.click();return;}
 if(current!=='bubble'&&current!=='block')return;
 document.querySelectorAll('.screen').forEach(el=>el.classList.add('hidden'));screen.classList.remove('hidden');
 $('p8PracticeName').textContent=games[current]+' — PRACTICE';reset();window.scrollTo(0,0);
}
$('p8TourPractice').addEventListener('click',practice);
$('p8PracticeReset').addEventListener('click',reset);
$('p8PracticeBack').addEventListener('click',()=>{screen.classList.add('hidden');$('screen-tournament').classList.remove('hidden');choose(current);});
window.Play80TournamentMenu=Object.freeze({games:Object.keys(games),selected:()=>current});
})();