/* PLAY80 2048 practice game. Practice scores are local and NEVER credited to any tournament,
 * wallet, or server leaderboard. An authoritative server validator is required before
 * this game can be enrolled in a competitive tournament. */
(() => {
 'use strict';
 const SIZE=4, MAX_TILE=2**48;
 function validTile(n){return Number.isSafeInteger(n)&&n>=0&&n<=MAX_TILE&&(n===0||Number.isInteger(Math.log2(n)));}
 function validGrid(value){return Array.isArray(value)&&value.length===SIZE&&value.every(row=>Array.isArray(row)&&row.length===SIZE&&row.every(validTile));}
 function compactLine(source){
   const nonzero=source.filter(x=>x!==0), result=[];
   let gain=0;
   for(let i=0;i<nonzero.length;i++){
     if(i+1<nonzero.length&&nonzero[i]===nonzero[i+1]&&nonzero[i]<MAX_TILE){
       const value=nonzero[i]*2;result.push(value);gain+=value;i++;
     }else result.push(nonzero[i]);
   }
   while(result.length<SIZE)result.push(0);
   return {line:result,gain};
 }
 function move(grid,direction){
   if(!['left','right','up','down'].includes(direction))throw Error('Invalid direction');
   if(!validGrid(grid))throw Error('Invalid grid');
   const next=grid.map(row=>row.slice());let gain=0,moved=false;
   for(let line=0;line<SIZE;line++){
     const positions=[];
     for(let index=0;index<SIZE;index++){
       const k=(direction==='right'||direction==='down')?SIZE-1-index:index;
       positions.push(direction==='left'||direction==='right'?[line,k]:[k,line]);
     }
     const values=positions.map(([r,c])=>grid[r][c]);
     const out=compactLine(values);gain+=out.gain;
     positions.forEach(([r,c],idx)=>{next[r][c]=out.line[idx];if(out.line[idx]!==values[idx])moved=true;});
   }
   return {grid:next,gain,moved};
 }
 function canMove(grid){
   if(!validGrid(grid))return false;
   if(grid.some(row=>row.includes(0)))return true;
   for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
     if(grid[r][c]<MAX_TILE&&r<3&&grid[r][c]===grid[r+1][c])return true;
     if(grid[r][c]<MAX_TILE&&c<3&&grid[r][c]===grid[r][c+1])return true;
   }
   return false;
 }
 const engine=Object.freeze({compactLine,move,canMove});
 if(typeof module!=='undefined'&&module.exports)module.exports=engine;
 if(typeof window!=='undefined')window.Play802048Engine=engine;
 if(typeof document==='undefined')return;
 const $=id=>document.getElementById(id), STORE='play80.practice2048.v1';
 let grid=null,score=0,best=0,won=false;
 function rand(max){
   if(typeof crypto!=='undefined'&&crypto.getRandomValues){
     const a=new Uint32Array(1);const limit=Math.floor(4294967296/max)*max;
     do{crypto.getRandomValues(a)}while(a[0]>=limit);return a[0]%max;
   }
   return Math.floor(Math.random()*max);
 }
 function addTile(){
   const empty=[];
   for(let r=0;r<4;r++)for(let c=0;c<4;c++)if(grid[r][c]===0)empty.push([r,c]);
   if(!empty.length)return;
   const [r,c]=empty[rand(empty.length)];grid[r][c]=rand(10)===0?4:2;
 }
 function persist(){try{localStorage.setItem(STORE,JSON.stringify({grid,score,best,won}));}catch(_){}}
 function restore(){try{
   const previous=JSON.parse(localStorage.getItem(STORE)||'null');
   if(previous&&validGrid(previous.grid)&&Number.isSafeInteger(previous.score)&&previous.score>=0&&Number.isSafeInteger(previous.best)&&previous.best>=0){
     grid=previous.grid;score=previous.score;best=Math.max(previous.best,score);won=grid.some(row=>row.some(n=>n>=2048))||previous.won===true;
   }
 }catch(_){}
 if(!grid)newGame();else render();}
 function newGame(){grid=Array.from({length:4},()=>[0,0,0,0]);score=0;won=false;addTile();addTile();persist();render();}
 function render(){
   const board=$('practice2048Grid');if(!board)return;board.replaceChildren();
   for(const row of grid)for(const value of row){
     const tile=document.createElement('div');tile.className='p2048Tile'+(value?' filled':'');
     tile.dataset.value=String(value);tile.textContent=value?String(value):'';
     board.append(tile);
   }
   $('practice2048Score').textContent=score.toLocaleString('en-US');
   $('practice2048Best').textContent=best.toLocaleString('en-US');
   $('practice2048Status').textContent=!canMove(grid)?'No more moves — try a new game.':
     won?'2048 achieved! Keep going or start again.':'Join matching tiles to reach 2048. Practice scores stay on this device.';
 }
 function play(direction){
   if(!$('screen-2048')||$('screen-2048').classList.contains('hidden')||!grid)return false;
   const result=move(grid,direction);if(!result.moved)return false;
   grid=result.grid;score=Math.min(Number.MAX_SAFE_INTEGER,score+result.gain);best=Math.max(best,score);
   if(grid.some(row=>row.some(n=>n>=2048)))won=true;
   addTile();persist();render();return true;
 }
 const onKey=e=>{
   if($('screen-2048').classList.contains('hidden'))return;
   if(e.target&&e.target.closest&&e.target.closest('input, textarea, select, [contenteditable="true"]'))return;
   const lookup={ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down'};
   const direction=lookup[e.key];if(direction){e.preventDefault();play(direction);}
 };
 document.addEventListener('keydown',onKey);
 $('practice2048New').addEventListener('click',newGame);
 document.querySelectorAll('[data-2048-dir]').forEach(b=>b.addEventListener('click',()=>play(b.dataset['2048Dir'])));
 const surface=$('practice2048Grid');let touch=null;
 surface.addEventListener('touchstart',e=>{touch=e.touches.length===1?{id:e.touches[0].identifier,x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});
 surface.addEventListener('touchcancel',()=>{touch=null;},{passive:true});
 surface.addEventListener('touchend',e=>{
   const started=touch;touch=null;
   if(!started||e.touches.length)return;
   const ended=Array.from(e.changedTouches).find(x=>x.identifier===started.id);if(!ended)return;
   const dx=ended.clientX-started.x,dy=ended.clientY-started.y;
   if(Math.max(Math.abs(dx),Math.abs(dy))<24)return;
   play(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');
 },{passive:true});
 const gameScreen=$('screen-2048');
 const applyNavigation=()=>{const shown=!gameScreen.classList.contains('hidden');if(!shown)touch=null;document.body.classList.toggle('play80PracticeActive',shown);};
 new MutationObserver(applyNavigation).observe(gameScreen,{attributes:true,attributeFilter:['class']});
 applyNavigation();
 restore();
})();
