/* PLAY80 Bet Arena — authenticated demo-room matching + local chess practice.
 * IMPORTANT: "ready" means player seats filled; gameplay and coin settlement
 * are NOT network-synchronized or server-verified. Never call this a paid match.
 */
(() => {
 'use strict';
 const el=id=>document.getElementById(id);
 const BASE='https://suhpmjqrcqkzaslptpca.supabase.co';
 const KEY='sb_publishable_8VvDZLfwAeztWeDS2EqNBQ_nlYFwFyK';
 const AUTH='play80.secure_account.v1';
 let room=null, game='ludo', seats=2,stake=100,watch=null,selected=-1,chess=window.PLAY80Chess?.start();
 const promo=el('screen-bet');
 if(!promo||!window.PLAY80Chess)return;
 const style=document.createElement('style');
 style.textContent=`
 .p8ArenaForm{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}
 .p8ArenaForm label{font-size:11px;display:grid;gap:5px;color:#ddceff}
 .p8ArenaForm select,.p8ArenaForm input,.p8InviteInput{width:100%;padding:11px;border:1px solid #7e6abb;border-radius:10px;background:#1e1940;color:white}
 .p8ArenaActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
 .p8ArenaActions button{flex:1;min-width:110px}
 .p8ArenaAlert{font-size:12px;line-height:1.6;color:#fff2c4;white-space:pre-wrap;margin-top:9px}
 .p8ChessBoard{width:min(100%,480px);aspect-ratio:1;display:grid;grid-template-columns:repeat(8,1fr);border:3px solid #d5ab55;box-shadow:0 15px 25px #0007}
 .p8Square{padding:0;display:grid;place-items:center;border:0;font-size:clamp(23px,7vw,44px);cursor:pointer;position:relative}
 .p8Square.light{background:#eee6d5;color:#222}.p8Square.dark{background:#9474ba;color:#222}
 .p8Square.sel{outline:3px solid #ffe662;outline-offset:-3px}.p8Square.target:after{content:'';position:absolute;inset:36%;background:#27a0779f;border-radius:50%;pointer-events:none}
 .p8ChessNotice{font-size:12px;line-height:1.5;margin:10px 0;color:#e6ddf7}
 .p8Pill{display:inline-block;background:#332759;border:1px solid #7964ad;padding:6px 10px;border-radius:30px;margin:4px 4px 4px 0;font-size:12px}
 `;
 document.head.append(style);
 promo.querySelector('.play80Promo').innerHTML='<h2>♟️ PLAY80 — BET ARENA</h2><p>Online room matching and friend invitations with virtual demo coin amounts. Real-money stakes and cash payouts are NOT supported. Remote game moves and winner settlement are not active yet.</p>';
 const section=promo.querySelectorAll('.play80Surface');
 if(section[0]){section[0].querySelector('h2').textContent='🎲 Ludo • 2–4 Players';section[0].querySelector('p').textContent='Local Ludo & Expert AI ready. Online room matching below: same virtual stake, same seat count.';}
 if(section[1]){section[1].querySelector('h2').textContent='♟️ Chess • 2 Players';section[1].querySelector('p').textContent='Chess practice with legal move checking, castling, promotion, check/checkmate. Online player matching below.';section[1].querySelector('button').removeAttribute('disabled');section[1].querySelector('button').textContent='PLAY CHESS — LOCAL PRACTICE';section[1].querySelector('button').id='p8OpenChess';}
 if(section[2]){section[2].querySelector('p').textContent='Virtual fee illustration only: 10% of EACH player stake. Winner prize preview: players × stake × 90%. Example: two players × 100 = 200, company fee preview 20, winner preview 180. No demo coins are debited or credited by this lobby.';}
 const panel=document.createElement('div');panel.className='play80Surface';panel.innerHTML=`
 <h2>🌐 Online Match Lobby</h2>
 <p>Sign in with PLAY80 Online Account to create a room, auto-match or invite friends. Same game, demo stake and number of players required.</p>
 <div class="p8ArenaForm">
  <label>Game<select id="p8Game"><option value="ludo">Ludo</option><option value="chess">Chess</option></select></label>
  <label>Players<select id="p8Seats"><option value="2">2 Players</option><option value="3">3 Players</option><option value="4">4 Players</option></select></label>
  <label>Virtual stake (per player)<select id="p8Stake"><option>50</option><option selected>100</option><option>150</option><option>500</option><option>1000</option></select></label>
  <label>Match format<select id="p8Privacy"><option value="public">Public — auto match</option><option value="private">Private — invite only</option></select></label>
 </div>
 <div id="p8Payout" class="p8ArenaAlert" aria-live="polite"></div>
 <div class="p8ArenaActions"><button type="button" id="p8Auto" class="play80PrimaryBtn">FIND / CREATE ROOM</button><button type="button" id="p8Available" class="play80SecondaryBtn">CHECK WAITING PLAYERS</button></div>
 <div style="display:flex;gap:7px;margin:12px 0"><input class="p8InviteInput" id="p8Invite" maxlength="10" placeholder="Friend's 10-character invite code" aria-label="Invite code"/><button type="button" class="play80SecondaryBtn" id="p8Join">JOIN</button></div>
 <div id="p8Lobby" class="p8ArenaAlert" role="status">No room selected.</div>
 <div class="p8ArenaActions"><button type="button" id="p8Refresh" class="play80SecondaryBtn">↻ ROOM STATUS</button><button type="button" id="p8Leave" class="play80SecondaryBtn">LEAVE WAITING ROOM</button></div>
 <small>Room becomes READY when the required players join. The room does not start an authoritative game, collect fees or award demo coins yet.</small>
 `;
 promo.append(panel);
 const alert=(s)=>{el('p8Lobby').textContent=String(s);};
 function update(){
  game=el('p8Game').value;seats=Number(el('p8Seats').value);stake=Number(el('p8Stake').value);
  if(game==='chess'){seats=2;el('p8Seats').value='2';el('p8Seats').disabled=true;}else el('p8Seats').disabled=false;
  const fee=stake/10,total=seats*fee,prize=seats*(stake-fee);
  el('p8Payout').textContent=`Preview: ${seats} × ${stake} Demo Coins | Fee ${fee} each (total ${total}) | Winner preview ${prize} Demo Coins. NO real deduction or payout.`;
 }
 ['p8Game','p8Seats','p8Stake','p8Privacy'].forEach(id=>el(id).addEventListener('change',update));update();
 function getSession(){try{return JSON.parse(localStorage.getItem(AUTH)||'null');}catch(_){return null;}}
 async function access(){
  let s=getSession();if(!s?.access_token)throw Error('Sign in first: Online Account tab.');
  if(Number(s.expires_at||0)*1000<Date.now()+70000){
   const res=await fetch(BASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});
   if(!res.ok)throw Error('Sign in again; token expired.');
   const j=await res.json();s={...s,...j,expires_at:Math.floor(Date.now()/1000)+Number(j.expires_in||3600)};localStorage.setItem(AUTH,JSON.stringify(s));
  }
  return s.access_token;
 }
 async function rpc(name,data){
  const token=await access();
  const res=await fetch(BASE+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(data)});
  const j=await res.json().catch(()=>null);if(!res.ok)throw Error(j?.message||j?.error||'Server error '+res.status);return j;
 }
 async function run(fn){try{await fn();}catch(e){alert('⚠️ '+(e?.message||e));}}
 function renderRoom(r){
  room=r;if(!r){alert('No room selected.');return;}
  const people=(r.players||[]).map(p=>`Seat ${p.seat}: ${p.username}${p.self?' (You)':''}`).join('\n');
  alert(`${r.game.toUpperCase()} • ${r.stake} Demo Coins • ${r.status.toUpperCase()}\n${people}\nPlayers ${r.players.length}/${r.max_players}\nInvite Code: ${r.invite_code}\nNo coin deductions. Online gameplay sync and settlement are not yet enabled.`);
 }
 el('p8Auto').addEventListener('click',()=>run(async()=>{update();renderRoom(await rpc('play80_bet_find_or_create',{p_game:game,p_stake:stake,p_players:seats,p_private:el('p8Privacy').value==='private'}));}));
 el('p8Available').addEventListener('click',()=>run(async()=>{
  update();const r=await rpc('play80_bet_available',{p_game:game,p_players:seats});
  const list=r.available||[];
  const others=list.filter(x=>x.stake!==stake);
  if(!list.length)alert('No one is waiting in this game/player format. You can create a room or choose local computer practice.');
  else alert('Waiting now: '+list.map(x=>x.stake+' coins — '+x.waiting_players+' player(s)').join('; ')+(others.length?'\nSuggested amount: '+r.suggested_stake+' Demo Coins.':''));
 }));
 el('p8Join').addEventListener('click',()=>run(async()=>renderRoom(await rpc('play80_bet_join_invite',{p_invite:el('p8Invite').value.trim().toUpperCase()}))));
 el('p8Refresh').addEventListener('click',()=>run(async()=>{if(!room)throw Error('Create/join a room first.');renderRoom(await rpc('play80_bet_room_info',{p_room:room.id}));}));
 el('p8Leave').addEventListener('click',()=>run(async()=>{if(!room)throw Error('No room.');await rpc('play80_bet_leave_room',{p_room:room.id});renderRoom(null);}));
 // Reconnect only to an existing room when this tab is open, without unauthenticated activity.
 watch=setInterval(()=>{if(room&&room.status==='waiting'&&!promo.classList.contains('hidden'))rpc('play80_bet_room_info',{p_room:room.id}).then(renderRoom).catch(()=>{});},5000);
 const chessSection=document.createElement('section');chessSection.id='screen-chess';chessSection.className='screen hidden';chessSection.innerHTML=`<div class="play80Promo"><h2>♟️ Chess — Local Practice</h2><p>Two people share this device. Legal moves, check, castling, en passant and promotion. NOT an online match; no demo coin settlement.</p></div><div class="play80Surface"><div id="p8ChessStatus" class="p8ChessNotice">White to play</div><div id="p8ChessBoard" class="p8ChessBoard" role="grid" aria-label="Chessboard"></div><div class="p8ArenaActions"><button class="play80PrimaryBtn" id="p8ChessRestart" type="button">NEW CHESS GAME</button><button class="play80SecondaryBtn" id="p8ChessBack" type="button">BACK TO BET</button></div><p class="p8ChessNotice">Coupon player aliases PLAY80 and HOSSAIN302 apply to Ludo's disclosed local power rules, not to Chess. Chess pieces obey standard rules.</p></div>`;
 promo.parentNode.insertBefore(chessSection,promo.nextSibling);
 const symbols={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
 function renderChess(message){
  const board=el('p8ChessBoard');board.replaceChildren();
  const legal=selected<0?[]:window.PLAY80Chess.legal(chess,selected).map(m=>m.to);
  for(let i=0;i<64;i++){const sq=document.createElement('button');sq.type='button';sq.className='p8Square '+((Math.floor(i/8)+i%8)%2===0?'light':'dark')+(i===selected?' sel':'')+(legal.includes(i)?' target':'');sq.dataset.cell=String(i);sq.textContent=symbols[chess.board[i]]||'';sq.setAttribute('aria-label',String.fromCharCode(97+i%8)+(8-Math.floor(i/8))+' '+(chess.board[i]==='.'?'empty':chess.board[i]));board.append(sq);}
  el('p8ChessStatus').textContent=message||(chess.finished==='checkmate'?'Checkmate — '+(chess.turn==='w'?'Black':'White')+' wins':chess.finished==='stalemate'?'Stalemate — draw':(chess.turn==='w'?'White':'Black')+' to play'+(window.PLAY80Chess.check(chess,chess.turn)?' • CHECK':''));
 }
 el('p8ChessBoard').addEventListener('click',e=>{
  const b=e.target.closest('[data-cell]');if(!b||chess.finished)return;const to=Number(b.dataset.cell),p=chess.board[to];
  if(selected>=0){const r=window.PLAY80Chess.move(chess,selected,to,'Q');if(r.ok){chess=r.state;selected=-1;renderChess();return;}}
  if(p!=='.'&&(p===p.toUpperCase()?'w':'b')===chess.turn){selected=to;renderChess();}else{selected=-1;renderChess();}
 });
 el('p8OpenChess')?.addEventListener('click',()=>{document.querySelectorAll('.screen').forEach(x=>x.classList.add('hidden'));chessSection.classList.remove('hidden');window.scrollTo(0,0);renderChess();});
 el('p8ChessRestart').addEventListener('click',()=>{chess=window.PLAY80Chess.start();selected=-1;renderChess();});
 el('p8ChessBack').addEventListener('click',()=>{document.querySelector('[data-open="bet"]')?.click();});
 renderChess();
})();
