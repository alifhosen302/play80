/* PLAY80 computer arena, demo practice until server settlement is enabled. */
(() => {
 'use strict';
 const el=id=>document.getElementById(id);
 let selected=-1,chess=window.PLAY80Chess?.start();
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
 el('p8OpenBotLudo').addEventListener('click',()=>{
   go('ludo');newLudo('bot');ludo.arenaBot=true;
   $('ludoSetup').classList.add('hidden');
   beginLudoMatch();
 });
 const chessSection=document.createElement('section');chessSection.id='screen-chess';chessSection.className='screen hidden';
 chessSection.innerHTML=`<div class="play80Surface p8ChessClean">
 <div class="p8ChessPlayer" id="p8BlackRow"><span>♟</span><input id="p8BlackName" maxlength="28" aria-label="Black player" value="Computer" readonly><span>●</span></div>
 <div id="p8ChessStatus" class="p8ChessNotice" role="status" aria-live="polite">White to play</div>
 <div id="p8ChessWin" class="p8ChessWin hidden" role="status"></div>
 <div id="p8ChessBoard" class="p8ChessBoard" role="grid" aria-label="Chessboard"></div>
 <div class="p8ChessPlayer" id="p8WhiteRow"><span>♙</span><input id="p8WhiteName" maxlength="28" aria-label="White player" value="White Player"><span>●</span></div>
 <div class="p8ChessOptions"><button id="p8ChessLeave" type="button">← LEAVE</button><button id="p8ChessResign" type="button">🏳 RESIGN</button><button id="p8ChessRestart" type="button">↻ NEW GAME</button></div>
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
  for(let i=0;i<64;i++){const sq=document.createElement('button');sq.type='button';sq.className='p8Square '+((Math.floor(i/8)+i%8)%2===0?'light':'dark')+(i===selected?' sel':'')+(legal.includes(i)?' target':'');sq.dataset.cell=String(i);sq.disabled=!!chess.finished||chess.turn!=='w';const piece=chessPieceImage(chess.board[i]);if(piece)sq.append(piece);sq.setAttribute('aria-label',String.fromCharCode(97+i%8)+(8-Math.floor(i/8))+' '+(chess.board[i]==='.'?'empty':chess.board[i]));board.append(sq);}
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
  el('p8ChessResign').disabled=!!chess.finished;
 }
 function computerReply(){
  if(chess.finished||chess.turn!=='b')return;
  const position=chess;
  setTimeout(()=>{
   if(chess!==position||chessSection.classList.contains('hidden'))return;
   const m=window.PLAY80Chess.hardMove(position);
   if(m){const reply=window.PLAY80Chess.move(position,m.from,m.to);if(reply.ok)chess=reply.state;}
   renderChess();
  },80);
 }
 el('p8ChessBoard').addEventListener('click',e=>{
  const b=e.target.closest('[data-cell]');if(!b||chess.finished||chess.turn!=='w')return;const to=Number(b.dataset.cell),p=chess.board[to];
  if(selected>=0){const r=window.PLAY80Chess.move(chess,selected,to,'Q');if(r.ok){chess=r.state;selected=-1;renderChess();computerReply();return;}}
  if(p!=='.'&&(p===p.toUpperCase()?'w':'b')===chess.turn){selected=to;renderChess();}else{selected=-1;renderChess();}
 });
 el('p8OpenChess')?.addEventListener('click',()=>{document.querySelectorAll('.screen').forEach(x=>x.classList.add('hidden'));chessSection.classList.remove('hidden');window.scrollTo(0,0);renderChess();computerReply();});
 el('p8ChessRestart').addEventListener('click',()=>{chess=window.PLAY80Chess.start();selected=-1;renderChess();});
 el('p8ChessLeave').addEventListener('click',()=>document.querySelector('[data-main-tab="bet"]')?.click());
 el('p8ChessResign').addEventListener('click',()=>{if(chess.finished)return;if(!confirm(chessName('w')+' resigns and loses the match?'))return;const r=window.PLAY80Chess.resign(chess,'w');if(r.ok){chess=r.state;selected=-1;renderChess();}});
 for(const id of ['p8WhiteName','p8BlackName'])el(id).addEventListener('input',renderChess);

 renderChess();
})();
