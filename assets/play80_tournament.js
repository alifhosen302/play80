/* PLAY80 V4: Online, server-authoritative Memory skill tournament.
 * All deposits, entry fees, scores and rewards are computed in PostgreSQL.
 * No service_role key or monetary payment API is shipped in this file.
 */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const api=()=>window.Play80Cloud;
 const active=()=>api()?.user();
 const fmt=n=>Number(n||0).toLocaleString('en-US');
 let tournament=null,serverDelta=0,board=null,lastSync=0,refreshing=false;
 const setText=(id,text)=>{const el=$(id);if(el)el.textContent=String(text)};
 const notice=(s,error=false)=>{const el=$('tourNotice');if(el){el.textContent=String(s);el.style.color=error?'#ffbcb7':'#ffe5a1'}};
 const memNotice=s=>setText('memNotice',s);
 function countdown(){
   if(!tournament||!tournament.status){setText('tourCountdown','--:--:--');return;}
   const end=tournament.status==='registration_open'?tournament.registration_ends_at:tournament.ends_at;
   const remaining=Math.max(0,Math.ceil((new Date(end).getTime()-(Date.now()+serverDelta))/1000));
   const d=Math.floor(remaining/86400),h=Math.floor((remaining%86400)/3600),m=Math.floor((remaining%3600)/60),s=remaining%60;
   const hh=(d?d+'d ':'')+String(h).padStart(2,'0');
   setText('tourCountdown',hh+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'));
 }
 function showTabs(destination){
   const tab=(destination==='tournament'||destination==='memory'||destination==='2048')?'tournament':
    ((destination==='bet'||destination==='ludo')?'bet':
     (['account','remote-owner','wallet','online','rewards','support','profile'].includes(destination)?null:'home'));
   if(tab)document.querySelectorAll('[data-main-tab]').forEach(b=>b.classList.toggle('active',b.dataset.mainTab===tab));
 }
 document.addEventListener('click',e=>{
   const t=e.target.closest('[data-open]');if(!t)return;showTabs(t.dataset.open);
   if(t.dataset.open==='tournament')setTimeout(()=>loadTournament(),60);
 },true);
 async function call(name,data={}){
   if(!active())throw Error('Sign in via Online Account first. Email verification may be required.');
   if(!api()?.rpc)throw Error('The online account service is unavailable.');
   return api().rpc(name,data);
 }
 async function loadTournament(){
   if(refreshing)return;
   refreshing=true;
   try{
     const signed=!!active();
     let t;
     if(signed)t=await call('play80_tournament_public');
     else {
       const res=await fetch('https://suhpmjqrcqkzaslptpca.supabase.co/rest/v1/rpc/play80_tournament_public',{method:'POST',headers:{apikey:'sb_publishable_8VvDZLfwAeztWeDS2EqNBQ_nlYFwFyK','Content-Type':'application/json'},body:'{}'});
       if(!res.ok)throw Error('Public tournament status currently unavailable');
       t=await res.json();
     }
     tournament=t;lastSync=Date.now();serverDelta=new Date(t.server_time).getTime()-Date.now();
     setText('tourState',({registration_open:'REGISTRATION',running:'ACTIVE',finished:'COMPLETED',idle:'WAITING'})[t.status]||t.status);
     setText('tourHumans',fmt(t.human_count));setText('tourBots',fmt(t.bot_count));
     setText('tourPool',fmt(t.funded_pool));setText('tourMyScore',fmt(t.my_score));
     const join=$('tourJoin');join.disabled=!signed||t.joined||!['running','registration_open'].includes(t.status);
     join.textContent=t.joined?'✓ REGISTERED':'JOIN · 500 DEMO COINS';
     const play=$('tourPlay');play.disabled=!signed||!(t.joined&&t.status==='running'&&t.game==='memory');
     notice(!signed?'Public tournament details are visible. Sign in to register and see player rankings.':
        t.status==='registration_open'?'Registration open. Countdown shows when enrollment closes.':
        t.status==='running'?'Tournament live. View leaderboard.':'Waiting for next event.');
      countdown();
      if(signed&&t.id)await loadLeaderboard(t.id);
      else $('tourLeaderboard').textContent='Sign in to view individual player names and leaderboard.';
    }catch(e){notice('Server error: '+(e.message||e),true);setText('tourState','UNAVAILABLE');}
   finally{refreshing=false;}
 }
 async function loadLeaderboard(id){
   let ranks=[];
   try{ranks=await call('play80_tournament_leaderboard',{p_tournament_id:id});}catch(e){setText('tourLeaderboard','Leaderboard unavailable: '+e.message);return;}
   const list=$('tourLeaderboard');list.replaceChildren();
   if(!Array.isArray(ranks)||!ranks.length){list.textContent='No participants yet. The tournament begins automatically.';return;}
   for(const p of ranks.slice(0,150)){
     const item=document.createElement('div');item.className='tourLeader';
     if(active()?.id===p.user_id)item.classList.add('me');
     const rank=document.createElement('span');rank.className='tourRank';rank.textContent=({1:'🥇',2:'🥈',3:'🥉'})[p.rank]||('#'+p.rank);
     const avatar=document.createElement('span');avatar.textContent=p.avatar||'👤';
     const who=document.createElement('div');who.className='tourUser';
     const name=document.createElement('strong');name.textContent=p.username;
     const meta=document.createElement('small');meta.textContent=(p.type==='ai'?'🤖 AI Player':'👤 Human')+' · '+String(p.user_id).slice(0,8)+' · '+fmt(p.games_played)+' games';
     who.append(name,meta);
     const score=document.createElement('div');score.className='tourPoints';
     const possible=Math.floor(Number(p.maximum_rank_reward||0)*Number(tournament?.funded_pool||0)/7500);
     score.textContent=fmt(p.total_score)+' pts';
     const small=document.createElement('small');small.textContent=possible?'Up to '+fmt(possible)+' demo':'No funded reward';small.style.display='block';score.append(small);
     item.append(rank,avatar,who,score);list.append(item);
   }
 }
 $('tourRefresh').addEventListener('click',loadTournament);
 $('tourJoin').addEventListener('click',async e=>{
   const btn=e.currentTarget;if(btn.disabled||!tournament)return;
   btn.disabled=true;
   try{
     const out=await call('play80_tournament_join',{p_tournament_id:tournament.id});
     notice(out.already_joined?'Already registered. No second entry fee was charged.':'Joined successfully. 500 nonredeemable demo coins charged once.');
     await api().reloadAccount().catch(()=>{});await loadTournament();
   }catch(err){notice(err.message,true);btn.disabled=false;}
 });
 function renderBoard(){
   const grid=$('memGrid');grid.replaceChildren();
   if(!board){grid.textContent='Start a new Memory Puzzle round.';return;}
   for(let i=0;i<16;i++){
     const b=document.createElement('button');b.type='button';b.className='memCard';b.dataset.index=String(i);
     const known=board.matched.get(i),front=board.shown.get(i);
     if(known!==undefined){b.classList.add('show','done');b.textContent=['🍒','🍇','🌟','🍋','🔔','💎','🍓','🍀'][known-1]||known;b.disabled=true;}
     else if(front!==undefined){b.classList.add('show');b.textContent=['🍒','🍇','🌟','🍋','🔔','💎','🍓','🍀'][front-1]||front;b.disabled=true;}
     else{b.textContent='✦';b.setAttribute('aria-label','Face-down card '+(i+1));b.disabled=board.busy||board.finished;}
     b.addEventListener('click',()=>flipCard(i));grid.append(b);
   }
 }
 async function beginRound(){
   try{
     if(!tournament||tournament.status!=='running'||!tournament.joined)throw Error('Join the active tournament first.');
     const out=await call('play80_memory_start',{p_tournament_id:tournament.id});
     board={id:out.run_id,matched:new Map(),shown:new Map(),firstIndex:null,busy:false,finished:false};
     const state=await call('play80_memory_state',{p_run_id:board.id});
     for(const x of state.matched_cards||[])board.matched.set(Number(x.index),Number(x.value));
     if(state.first_index!==null && state.first_index!==undefined){board.firstIndex=Number(state.first_index);board.shown.set(board.firstIndex,Number(state.first_value));}
     board.finished=!!state.done;
     memNotice(out.resumed?'Resumed your unfinished game.':'New Memory Puzzle ready. Tap two cards to match.');
     renderBoard();
     return true;
   }catch(e){memNotice(e.message||String(e));return false;}
 }
 async function resyncRound(){
   if(!board?.id)throw Error('No active Memory round to reconnect.');
   const runId=board.id;
   const state=await call('play80_memory_state',{p_run_id:runId});
   if(!board||board.id!==runId)return false;
   board.matched=new Map((state.matched_cards||[]).map(x=>[Number(x.index),Number(x.value)]));
   board.shown=new Map();board.firstIndex=null;
   if(state.first_index!==null&&state.first_index!==undefined){
     board.firstIndex=Number(state.first_index);
     board.shown.set(board.firstIndex,Number(state.first_value));
   }
   board.finished=!!state.done;
   board.busy=false;renderBoard();
   return true;
 }
 $('memSyncRound').addEventListener('click',async()=>{
   try{await resyncRound();memNotice(board.finished?'Round completed on server.':'Round recovered from server state.');}
   catch(e){memNotice('Reconnect failed: '+(e.message||e));}
 });
 window.addEventListener('online',()=>{if(board?.id)resyncRound().catch(()=>{});});
 async function flipCard(index){
   if(!board||board.busy||board.finished||board.matched.has(index)||board.shown.has(index))return;
   board.busy=true;renderBoard();
   try{
     const step=await call('play80_memory_flip',{p_run_id:board.id,p_card_index:index});
     if(step.phase==='first'){
       board.firstIndex=index;board.shown.set(index,Number(step.value));board.busy=false;
       memNotice('Find the matching symbol.');renderBoard();return;
     }
     if(step.phase==='second'){
       board.shown.set(index,Number(step.value));
       if(step.matched){
         board.matched.set(index,Number(step.value));
         board.matched.set(Number(step.first_index),Number(step.first_value));
         memNotice('✓ Pair matched! Attempts: '+step.attempts);
       }else memNotice('Different symbols. Remember their positions.');
       renderBoard();
       await new Promise(resolve=>setTimeout(resolve,step.matched?220:920));
       board.shown.clear();board.firstIndex=null;board.finished=!!step.done;
       if(board.finished){
         memNotice('🏆 Board complete! Server-verified score: '+fmt(step.score)+' points. Start a new round to improve your total.');
         await loadTournament();
       }
       board.busy=false;renderBoard();return;
     }
     if(step.done){board.finished=true;memNotice('Round complete • '+fmt(step.score)+' points.');}
   }catch(e){
     memNotice('Connection interrupted: '+e.message+' — checking server state…');
     try{await resyncRound();memNotice('Connection recovered. Continue from the last server-verified state.');}
     catch(_){memNotice('Network unavailable. Use RECONNECT ROUND after reconnecting.');}
   }
   finally{if(board){board.busy=false;renderBoard();}}
 }
 $('tourPlay').addEventListener('click',async()=>{
   if(await beginRound())$('tourOpenMemory').click();
 });
 $('memNewRound').addEventListener('click',beginRound);
 renderBoard();
 setInterval(()=>{
   if(!$('screen-tournament').classList.contains('hidden')){
     countdown();if(Date.now()-lastSync>30000)loadTournament();
   }
 },1000);
 showTabs('home');
})();
