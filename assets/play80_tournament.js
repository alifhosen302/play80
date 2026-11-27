/* PLAY80 V4: Online, server-authoritative Memory skill tournament.
 * All deposits, entry fees, scores and rewards are computed in PostgreSQL.
 * No service_role key or monetary payment API is shipped in this file.
 */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const api=()=>window.Play80Cloud;
 const active=()=>api()?.user();
 const memorySelected=()=>$('p8TournamentDetail')?.dataset.game==='memory'&&!$('p8TournamentDetail').classList.contains('hidden');
 const fmt=n=>Number(n||0).toLocaleString('en-US');
 let tournament=null,serverDelta=0,board=null,lastSync=0,refreshing=false;
 const setText=(id,text)=>{const el=$(id);if(el)el.textContent=String(text)};
 const notice=(s,error=false)=>{const el=$('tourNotice');if(el){el.textContent=String(s);el.style.color=error?'#ffbcb7':'#ffe5a1'}};
 const memNotice=s=>setText('memNotice',s);
 function countdown(){
   if(!memorySelected())return;
   if(!tournament||!['registration_open','running'].includes(tournament.status)){setText('tourCountdown','--:--:--');return;}
   const end=tournament.status==='registration_open'?tournament.registration_ends_at:tournament.ends_at;
   const remaining=Math.max(0,Math.ceil((new Date(end).getTime()-(Date.now()+serverDelta))/1000));
   const d=Math.floor(remaining/86400),h=Math.floor((remaining%86400)/3600),m=Math.floor((remaining%3600)/60),s=remaining%60;
   const hh=(d?d+'d ':'')+String(h).padStart(2,'0');
   setText('tourCountdown',hh+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'));
   if(remaining===0&&Date.now()-lastSync>5000)void loadTournament();
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
   if(refreshing||!memorySelected())return;
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
     if(!memorySelected())return;
     tournament=t;lastSync=Date.now();serverDelta=new Date(t.server_time).getTime()-Date.now();
     setText('tourState',({registration_open:'নিবন্ধন চলছে',running:'খেলা চলছে',finished:'শেষ হয়েছে',idle:'অপেক্ষমাণ'})[t.status]||'তথ্য নেই');
     setText('tourClockLabel',t.status==='running'?'খেলা শেষ হতে বাকি':'খেলা শুরু হতে বাকি');
     setText('tourListTitle',t.status==='registration_open'?'👥 নিবন্ধিত খেলোয়াড়':'🏅 লিডারবোর্ড');
     setText('tourHumans',fmt(t.human_count));setText('tourBots',fmt(t.bot_count));
     setText('tourPool',fmt(t.funded_pool));setText('tourMyScore',fmt(t.my_score));
     const roundMode=t.fee_mode==='per_round'||t.rules?.fee_mode==='per_round';
     const join=$('tourJoin');join.disabled=!signed||t.joined||!(roundMode?t.status==='registration_open':['running','registration_open'].includes(t.status));
     join.textContent=t.joined?'✓ নিবন্ধিত':roundMode?'নিবন্ধন করুন · ফ্রি':'নিবন্ধন · ৫০০ কয়েন';
     join.classList.toggle('hidden',t.status==='running'&&t.joined);
     setText('tourFeeMode',roundMode?'প্রতি নতুন রাউন্ড':'একবারের ফি');
     setText('p8PrizeInfo','বর্তমান তহবিল: '+fmt(t.funded_pool)+' / ৭,৫০০ ডেমো কয়েন। প্রকৃত পুরস্কার তহবিল অনুযায়ী বণ্টিত হবে।');
     const rules=$('tourRulesList');
     if(rules&&rules.dataset.mode!==(roundMode?'round':'once')){
       if(!rules.dataset.original)rules.dataset.original=rules.innerHTML;
       rules.dataset.mode=roundMode?'round':'once';
       if(roundMode){
         rules.replaceChildren();
         for(const rule of ['৩ ঘণ্টা নিবন্ধন; তারপর ৭২ ঘণ্টা প্রতিযোগিতা।','নিবন্ধন ফ্রি; প্রতিটি নতুন রাউন্ডে ৫০০ ডেমো কয়েন। অসমাপ্ত রাউন্ড আবার চালাতে কোনো ফি নেই।','সার্ভারে যাচাই করা মোট স্কোরে র‍্যাঙ্কিং।','১৫ জন চিহ্নিত AI প্রতিযোগী, দিনে সর্বোচ্চ ৮ ঘণ্টা এবং ইভেন্টে ২৪ ঘণ্টা।','সর্বোচ্চ পুরস্কার তহবিল ৭,৫০০ ডেমো কয়েন; প্রকৃত ফান্ড অনুযায়ী ঘোষিত র‍্যাঙ্কে বণ্টন। AI পুরস্কার কোম্পানির ডেমো লেজারে।','কোনো বাস্তব টাকা বা নগদে রূপান্তর নেই।']){const li=document.createElement('li');li.textContent=rule;rules.append(li);}
       }else rules.innerHTML=rules.dataset.original;
     }
     const play=$('tourPlay');play.disabled=!signed||!(t.joined&&t.status==='running'&&t.game==='memory');
     play.classList.toggle('hidden',t.status!=='running');
     notice(!signed?'নিবন্ধনের জন্য লগইন করুন।':t.status==='registration_open'?(t.joined?'আপনার নিবন্ধন সম্পন্ন।':''):'');
      countdown();
      if(t.id)await loadLeaderboard(t.id,signed);
      else $('tourLeaderboard').textContent='No active tournament entries yet.';
    }catch(e){if(memorySelected()){notice('Server error: '+(e.message||e),true);setText('tourState','তথ্য পাওয়া যায়নি');}}
   finally{refreshing=false;}
 }
 async function loadLeaderboard(id,signed=!!active()){
   let ranks=[];
   try{
      if(signed)ranks=await call('play80_tournament_leaderboard',{p_tournament_id:id});
      else {
        const response=await fetch('https://suhpmjqrcqkzaslptpca.supabase.co/rest/v1/rpc/play80_tournament_public_leaderboard',{
          method:'POST',headers:{apikey:'sb_publishable_8VvDZLfwAeztWeDS2EqNBQ_nlYFwFyK','Content-Type':'application/json'},
          body:JSON.stringify({p_tournament_id:id})});
        if(!response.ok)throw Error('Public leaderboard currently unavailable');
        ranks=await response.json();
      }
   }catch(e){if(memorySelected())setText('tourLeaderboard','Leaderboard unavailable: '+e.message);return;}
   if(!memorySelected()||tournament?.id!==id)return;
   const list=$('tourLeaderboard');list.replaceChildren();
   if(!Array.isArray(ranks)||!ranks.length){list.textContent=tournament?.status==='registration_open'?'এখনো কেউ নিবন্ধন করেনি।':'এখনো কোনো স্কোর নেই।';return;}
   for(const p of ranks.slice(0,150)){
     const item=document.createElement('div');item.className='tourLeader';
     if(active()?.id===p.user_id)item.classList.add('me');
     const rank=document.createElement('span');rank.className='tourRank';rank.textContent=tournament?.status==='registration_open'?'✓':(({1:'🥇',2:'🥈',3:'🥉'})[p.rank]||('#'+p.rank));
     const avatar=document.createElement('span');avatar.textContent=p.avatar||'👤';
     const who=document.createElement('div');who.className='tourUser';
     const name=document.createElement('strong');name.textContent=p.username;
     const meta=document.createElement('small');meta.textContent=p.type==='ai'?'🤖 AI':tournament?.status==='registration_open'?'নিবন্ধিত':fmt(p.games_played)+' রাউন্ড';
     who.append(name,meta);
     const score=document.createElement('div');score.className='tourPoints';
     score.textContent=tournament?.status==='registration_open'?'✓':fmt(p.total_score)+' স্কোর';
     item.append(rank,avatar,who,score);list.append(item);
   }
 }
 $('tourRefresh').addEventListener('click',loadTournament);
 $('tourJoin').addEventListener('click',async e=>{
   const btn=e.currentTarget;if(btn.disabled||!tournament||!memorySelected())return;
   btn.disabled=true;
   try{
     const out=await call(tournament.fee_mode==='per_round'?'play80_tournament_join_v2':'play80_tournament_join',{p_tournament_id:tournament.id});
     notice(out.already_joined?'Already registered. No second entry fee was charged.':out.fee_mode==='per_round'?'Registered for free. Each new round costs 500 demo coins.':'Joined successfully. 500 nonredeemable demo coins charged once.');
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
     const perRound=tournament.fee_mode==='per_round';
     if(perRound&&!window.confirm('নতুন রাউন্ডে ৫০০ ডেমো কয়েন লাগবে। অসমাপ্ত রাউন্ড চালু থাকলে কোনো কয়েন কাটা হবে না। চালিয়ে যাবেন?'))return false;
     const out=await call(perRound?'play80_memory_start_v2':'play80_memory_start',{p_tournament_id:tournament.id});
     if(out.charged)await api().reloadAccount().catch(()=>{});
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
     countdown();if(Date.now()-lastSync>10000)loadTournament();
   }
 },1000);
 showTabs('home');
})();
