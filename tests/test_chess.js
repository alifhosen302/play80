'use strict';
const assert=require('node:assert/strict');
const C=require('../assets/play80_chess.js');
function pos(s){return (8-Number(s[1]))*8+(s.charCodeAt(0)-97);}
function go(s,a,b){const r=C.move(s,pos(a),pos(b));assert.equal(r.ok,true,a+b+' legal');return r.state;}
let s=C.start();
assert.equal(s.board.length,64,'64-square board');
assert.equal(C.allMoves(s).length,20,'white has 20 legal opening moves');
assert.equal(C.move(s,pos('e2'),pos('e5')).ok,false,'illegal pawn jump');
s=go(s,'e2','e4');s=go(s,'e7','e5');
assert.equal(s.board[pos('e4')],'P');assert.equal(s.board[pos('e5')],'p');
let f=C.start();f=go(f,'f2','f3');f=go(f,'e7','e5');f=go(f,'g2','g4');f=go(f,'d8','h4');
assert.equal(f.finished,'checkmate','Fools mate recognized');
let ep=C.start();ep=go(ep,'e2','e4');ep=go(ep,'a7','a6');ep=go(ep,'e4','e5');ep=go(ep,'d7','d5');ep=go(ep,'e5','d6');
assert.equal(ep.board[pos('d5')],'.','en passant removes pawn');
let ca=C.start();ca=go(ca,'e2','e4');ca=go(ca,'e7','e5');ca=go(ca,'g1','f3');ca=go(ca,'b8','c6');ca=go(ca,'f1','e2');ca=go(ca,'g8','f6');ca=go(ca,'e1','g1');assert.equal(ca.board[pos('f1')],'R','king-side castle moves rook');
let pr=C.start();pr.board=Array(64).fill('.');pr.board[pos('e1')]='K';pr.board[pos('e8')]='k';pr.board[pos('a7')]='P';pr.turn='w';pr.castle={K:false,Q:false,k:false,q:false};
let p=C.move(pr,pos('a7'),pos('a8'),'N');assert.equal(p.ok,true);assert.equal(p.state.board[pos('a8')],'N');

let term=C.start();let resignation=C.resign(term,'w');assert.equal(resignation.ok,true);assert.equal(resignation.state.finished,'resignation');assert.equal(resignation.state.winner,'b');assert.equal(C.move(resignation.state,pos('e2'),pos('e4')).ok,false,'terminal state blocks moves');
let agreed=C.agreeDraw(C.start());assert.equal(agreed.ok,true);assert.equal(agreed.state.finished,'agreed_draw');assert.equal(C.legal(agreed.state,pos('e2')).length,0,'draw stops game');
console.log('PASS chess engine legality, checkmate, resignation and agreed draw including 20 opening moves, checkmate, en passant, castling, promotion');

for(const bad of ['QR','BN','XYZ','']){const x=C.move(pr,pos('a7'),pos('a8'),bad);assert.equal(x.ok,true);assert.equal(x.state.board[pos('a8')],'Q');}
assert.equal(p.state.finished,'dead_position','King and knight against king is drawn');
const dead=C.start();dead.board=Array(64).fill('.');dead.board[pos('e1')]='K';dead.board[pos('e8')]='k';dead.castle={K:false,Q:false,k:false,q:false};
assert.equal(C.move(dead,pos('e1'),pos('d1')).state.finished,'dead_position');
const long=C.start();long.board=Array(64).fill('.');long.board[pos('e1')]='K';long.board[pos('e8')]='k';long.board[pos('a1')]='R';long.castle={K:false,Q:false,k:false,q:false};long.halfmove=149;
assert.equal(C.move(long,pos('a1'),pos('a2')).state.finished,'seventy_five_move_draw');
assert.equal(require('node:fs').readFileSync('assets/play80_chess.js','utf8'),require('node:fs').readFileSync('supabase/functions/bot-arena/chess.js','utf8'),'Chess rules copies must stay identical');
console.log('PASS promotion validation, common dead positions, 75-move draw, client/server rule parity');
