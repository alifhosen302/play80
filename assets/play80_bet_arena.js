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
 .p8ChessBoard{box-sizing:border-box;width:100%;max-width:480px;aspect-ratio:1/1;height:auto;min-width:0;display:grid;grid-template-columns:repeat(8,minmax(0,1fr));grid-template-rows:repeat(8,minmax(0,1fr));border:clamp(3px,1vw,6px) solid #ccad6b;border-radius:5px;box-shadow:0 12px 30px #0009;overflow:hidden;flex:none;margin:10px auto 14px}
 .p8Square{box-sizing:border-box;padding:0;margin:0;display:flex;justify-content:center;align-items:center;border:0;border-radius:0;min-width:0;min-height:0;width:100%;height:100%;overflow:hidden;position:relative;cursor:pointer;aspect-ratio:1/1;touch-action:manipulation;appearance:none}
 .p8Square.light{background:#fafafa;color:#171717}.p8Square.dark{background:#25262a;color:#fff}
 .p8ChessPiece{display:block;pointer-events:none;width:94%;height:94%;max-width:100%;max-height:100%;flex:none;background-image:url('play80_chess_3d_pieces.webp');background-size:600% 200%;background-repeat:no-repeat;filter:drop-shadow(0 1px 2px #0007)}
 #screen-chess .play80Surface{padding:clamp(10px,3vw,20px);min-width:0;overflow:hidden}
 #screen-chess .p8ArenaActions .play80PrimaryBtn{color:#191919;background:linear-gradient(#fff,#ddd);border:1px solid #aaa}
 #screen-chess .p8ArenaActions .play80SecondaryBtn{color:#fafafa;background:#292a30;border:1px solid #777}
 #screen-chess .p8Square:focus-visible{outline:3px solid #ffcf4f;outline-offset:-3px;z-index:2}
 .p8ChessBrand{width:86px;height:86px;object-fit:contain;float:right;filter:drop-shadow(0 4px 14px #a72af666)}
 @media(max-width:350px){.p8ChessBrand{width:62px;height:62px}}
 .p8Square.sel{outline:3px solid #ffe662;outline-offset:-3px}.p8Square.target:after{content:'';position:absolute;inset:36%;background:#27a0779f;border-radius:50%;pointer-events:none}
 .p8ChessNotice{font-size:12px;line-height:1.5;margin:10px 0;color:#e6ddf7}
 .p8Pill{display:inline-block;background:#332759;border:1px solid #7964ad;padding:6px 10px;border-radius:30px;margin:4px 4px 4px 0;font-size:12px}

 #screen-chess .p8ChessClean{padding:12px;min-width:0}
 #screen-chess .p8ChessPlayer{display:flex;align-items:center;gap:12px;background:#161822;border:1px solid #666874;border-radius:13px;padding:9px 12px;margin:8px 0;color:#fff}
 #screen-chess .p8ChessPlayer.active{border-color:#d8af4b;box-shadow:0 0 0 1px #d8af4b77}
 #screen-chess .p8ChessPlayer input{width:100%;min-width:0;flex:1;font-size:15px;font-weight:800;background:transparent;border:0;color:#fff}
 #screen-chess #p8ChessStatus{text-align:center;color:#ffdc8c;font-size:15px;font-weight:800;padding:8px}
 #screen-chess .p8ChessWin{color:#ffe4a2;background:#34234f;border:1px solid #d8b56a;border-radius:10px;text-align:center;padding:11px;font-weight:900;margin:8px 0}
 #screen-chess .p8ChessOptions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
 #screen-chess .p8ChessOptions button{min-width:0;min-height:45px;border:1px solid #777984;border-radius:10px;background:#2c2e38;color:#fff;font-weight:800}
 #screen-chess .p8ChessOptions button:disabled{opacity:.5}
  `;
 document.head.append(style);
 promo.querySelector('.play80Promo').innerHTML='<h2>♟️ PLAY80 — BET ARENA</h2><p>Online room matching and friend invitations with virtual demo coin amounts. Real-money stakes and cash payouts are NOT supported. Remote game moves and winner settlement are not active yet.</p>';
 const section=promo.querySelectorAll('.play80Surface');
 if(section[0]){section[0].querySelector('h2').textContent='🎲 Ludo • 2–4 Players';section[0].querySelector('p').textContent='Local Ludo & Expert AI ready. Online room matching below: same virtual stake, same seat count.';}
 // Move the ORIGINAL, already-tested Ludo tile from Casino into Bet (same element/listeners).
 const originalLudoTile=document.querySelector('#screen-home .gameTile[data-game-id="ludo"]');
 if(originalLudoTile&&section[0]){const grid=document.createElement('div');grid.className='cards';grid.style.marginTop='12px';grid.appendChild(originalLudoTile);section[0].appendChild(grid);}
 if(section[0]){const aiButton=document.createElement('button');aiButton.type='button';aiButton.className='play80SecondaryBtn';aiButton.style.marginTop='10px';aiButton.textContent='🤖 PLAY LUDO VS COMPUTER';aiButton.addEventListener('click',()=>{const local=section[0].querySelector('[data-open="ludo"]');local?.click();document.querySelector('#screen-ludo [data-mode="bot"]')?.click();});section[0].appendChild(aiButton);}

 if(section[1]){const logo=document.createElement('img');logo.className='p8ChessBrand';logo.src='play80_chess_logo_premium.webp';logo.alt='PLAY80 Chess';section[1].prepend(logo);section[1].querySelector('h2').textContent='♟️ Chess • 2 Players';section[1].querySelector('p').textContent='Chess practice with legal move checking, castling, promotion, check/checkmate. Online player matching below.';section[1].querySelector('button').removeAttribute('disabled');section[1].querySelector('button').textContent='PLAY CHESS — LOCAL PRACTICE';section[1].querySelector('button').id='p8OpenChess';}
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
 const chessSection=document.createElement('section');chessSection.id='screen-chess';chessSection.className='screen hidden';
 chessSection.innerHTML=`<div class="play80Surface p8ChessClean">
 <div class="p8ChessPlayer" id="p8BlackRow"><span>♟</span><input id="p8BlackName" maxlength="28" aria-label="Black player" value="Black Player"><span>●</span></div>
 <div id="p8ChessStatus" class="p8ChessNotice" role="status" aria-live="polite">White to play</div>
 <div id="p8ChessWin" class="p8ChessWin hidden" role="status"></div>
 <div id="p8ChessBoard" class="p8ChessBoard" role="grid" aria-label="Chessboard"></div>
 <div class="p8ChessPlayer" id="p8WhiteRow"><span>♙</span><input id="p8WhiteName" maxlength="28" aria-label="White player" value="White Player"><span>●</span></div>
 <div class="p8ChessOptions"><button id="p8ChessLeave" type="button">← LEAVE</button><button id="p8ChessResign" type="button">🏳 RESIGN</button><button id="p8ChessDraw" type="button">½ AGREE DRAW</button><button id="p8ChessRestart" type="button">↻ NEW GAME</button></div>
 </div>`;
 promo.parentNode.insertBefore(chessSection,promo.nextSibling);
  const chessPieceOrder='KQRBNP';
  function chessPieceImage(piece){
    if(piece==='.')return null;
    const col=chessPieceOrder.indexOf(piece.toUpperCase());
    if(col<0)return null;
    const sprite=document.createElement('span');
    sprite.className='p8ChessPiece';
    sprite.setAttribute('aria-hidden','true');
    sprite.style.backgroundPosition=(col*20)+'% '+(piece===piece.toUpperCase()?'0%':'100%');
    return sprite;
  }
 function chessName(side){return el(side==='w'?'p8WhiteName':'p8BlackName').value.trim()||(side==='w'?'White Player':'Black Player');}
 function renderChess(){
  const board=el('p8ChessBoard');board.replaceChildren();
  const legal=selected<0?[]:window.PLAY80Chess.legal(chess,selected).map(m=>m.to);
  for(let i=0;i<64;i++){const sq=document.createElement('button');sq.type='button';sq.className='p8Square '+((Math.floor(i/8)+i%8)%2===0?'light':'dark')+(i===selected?' sel':'')+(legal.includes(i)?' target':'');sq.dataset.cell=String(i);sq.disabled=!!chess.finished;const piece=chessPieceImage(chess.board[i]);if(piece)sq.append(piece);sq.setAttribute('aria-label',String.fromCharCode(97+i%8)+(8-Math.floor(i/8))+' '+(chess.board[i]==='.'?'empty':chess.board[i]));board.append(sq);}
  el('p8BlackRow').classList.toggle('active',chess.turn==='b'&&!chess.finished);el('p8WhiteRow').classList.toggle('active',chess.turn==='w'&&!chess.finished);
  let message;
  if(chess.finished==='checkmate')message='CHECKMATE — '+chessName(chess.turn==='w'?'b':'w')+' WINS!';
  else if(chess.finished==='stalemate')message='STALEMATE — DRAW';
  else if(chess.finished==='resignation')message=chessName(chess.winner)+' WINS — RESIGNATION';
  else if(chess.finished==='agreed_draw')message='DRAW — AGREED';
  else message=chessName(chess.turn)+' TO MOVE'+(window.PLAY80Chess.check(chess,chess.turn)?' • CHECK':'');
  el('p8ChessStatus').textContent=message;
  el('p8ChessWin').textContent=chess.finished?message:'';
  el('p8ChessWin').classList.toggle('hidden',!chess.finished);
  el('p8ChessResign').disabled=!!chess.finished;el('p8ChessDraw').disabled=!!chess.finished;
 }
 el('p8ChessBoard').addEventListener('click',e=>{
  const b=e.target.closest('[data-cell]');if(!b||chess.finished)return;const to=Number(b.dataset.cell),p=chess.board[to];
  if(selected>=0){const r=window.PLAY80Chess.move(chess,selected,to,'Q');if(r.ok){chess=r.state;selected=-1;renderChess();return;}}
  if(p!=='.'&&(p===p.toUpperCase()?'w':'b')===chess.turn){selected=to;renderChess();}else{selected=-1;renderChess();}
 });
 el('p8OpenChess')?.addEventListener('click',()=>{document.querySelectorAll('.screen').forEach(x=>x.classList.add('hidden'));chessSection.classList.remove('hidden');window.scrollTo(0,0);renderChess();});
 el('p8ChessRestart').addEventListener('click',()=>{chess=window.PLAY80Chess.start();selected=-1;renderChess();});
 el('p8ChessLeave').addEventListener('click',()=>document.querySelector('[data-main-tab="bet"]')?.click());
 el('p8ChessResign').addEventListener('click',()=>{if(chess.finished)return;if(!confirm(chessName(chess.turn)+' resigns and loses the match?'))return;const r=window.PLAY80Chess.resign(chess,chess.turn);if(r.ok){chess=r.state;selected=-1;renderChess();}});
 el('p8ChessDraw').addEventListener('click',()=>{if(chess.finished)return;if(!confirm('Both players agree to a draw?'))return;const r=window.PLAY80Chess.agreeDraw(chess);if(r.ok){chess=r.state;selected=-1;renderChess();}});
 for(const id of ['p8WhiteName','p8BlackName'])el(id).addEventListener('input',renderChess);
 el('p8ChessBack').addEventListener('click',()=>{document.querySelector('[data-open="bet"]')?.click();});
 renderChess();
})();
