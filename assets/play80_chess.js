/* PLAY80 local chess rules engine — no wagering, no remote authoritative settlement.
 * Board indices 0..63, row 0=black home, uppercase=white.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PLAY80Chess=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const INIT='rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';
const color=p=>(!p||p==='.')?null:p===p.toUpperCase()?'w':'b';
const enemy=c=>c==='w'?'b':'w';
const rc=i=>[Math.floor(i/8),i%8],at=(r,c)=>r*8+c,inside=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
function start(){return {board:INIT.split(''),turn:'w',castle:{K:true,Q:true,k:true,q:true},ep:-1,last:null,finished:null,halfmove:0};}
function copy(s){return {...s,board:[...s.board],castle:{...s.castle}};}
function attacked(s,square,by){
 const [tr,tc]=rc(square),b=s.board;
 for(let i=0;i<64;i++){const p=b[i];if(!p||p==='.'||color(p)!==by)continue;
 const [r,c]=rc(i),dr=tr-r,dc=tc-c,t=p.toLowerCase();
 if(t==='p'&&dr===(by==='w'?-1:1)&&Math.abs(dc)===1)return true;
 if(t==='n'&&((Math.abs(dr)===2&&Math.abs(dc)===1)||(Math.abs(dr)===1&&Math.abs(dc)===2)))return true;
 if(t==='k'&&Math.max(Math.abs(dr),Math.abs(dc))===1)return true;
 if(t==='r'||t==='b'||t==='q'){
  if(dr===0&&dc===0)continue;
  const diag=Math.abs(dr)===Math.abs(dc),line=dr===0||dc===0;
  if((t==='r'&&!line)||(t==='b'&&!diag)||(t==='q'&&!line&&!diag))continue;
  const sr=Math.sign(dr),sc=Math.sign(dc);
  let x=r+sr,y=c+sc,clear=true;
  while(x!==tr||y!==tc){if(b[at(x,y)]!=='.'){clear=false;break}x+=sr;y+=sc;}
  if(clear)return true;
 }
 }
 return false;
}
function check(s,side){const king=side==='w'?'K':'k';const k=s.board.indexOf(king);return k<0||attacked(s,k,enemy(side));}
function possible(s,from){
 const p=s.board[from];if(!p||p==='.')return [];
 const side=color(p),t=p.toLowerCase(),[r,c]=rc(from),b=s.board,outs=[];
 const add=(x,y,extra)=>{if(inside(x,y)){const to=at(x,y),q=b[to];if(q==='.'||color(q)!==side&&q.toLowerCase()!=='k')outs.push({from,to,...extra});}};
 const slide=dirs=>{for(const [dr,dc] of dirs){let x=r+dr,y=c+dc;while(inside(x,y)){const to=at(x,y),q=b[to];if(q==='.')outs.push({from,to});else{if(color(q)!==side&&q.toLowerCase()!=='k')outs.push({from,to});break;}x+=dr;y+=dc;}}};
 const orth=[[0,1],[0,-1],[1,0],[-1,0]],diag=[[1,1],[1,-1],[-1,1],[-1,-1]];
 if(t==='p'){
  const d=side==='w'?-1:1,end=side==='w'?0:7;
  if(inside(r+d,c)&&b[at(r+d,c)]==='.'){
   outs.push({from,to:at(r+d,c),...(r+d===end?{promotion:true}:{})});
   if(r===(side==='w'?6:1)&&b[at(r+2*d,c)]==='.')outs.push({from,to:at(r+2*d,c),two:true});
  }
  for(const dc of [-1,1]){if(!inside(r+d,c+dc))continue;const to=at(r+d,c+dc),q=b[to];
   if(q!=='.'&&color(q)!==side&&q.toLowerCase()!=='k')outs.push({from,to,...(r+d===end?{promotion:true}:{})});
   if(to===s.ep&&q==='.')outs.push({from,to,enPassant:true});
  }
 }else if(t==='n'){for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dr,c+dc);}
 else if(t==='b')slide(diag);else if(t==='r')slide(orth);else if(t==='q')slide([...orth,...diag]);
 else if(t==='k'){
  for(const [dr,dc] of [...orth,...diag])add(r+dr,c+dc);
  if(!check(s,side)){
   const base=side==='w'?7:0,rights=side==='w'?['K','Q']:['k','q'];
   if(r===base&&c===4&&s.castle[rights[0]]&&b[at(base,7)]===(side==='w'?'R':'r')&&b[at(base,5)]==='.'&&b[at(base,6)]==='.'&&!attacked(s,at(base,5),enemy(side))&&!attacked(s,at(base,6),enemy(side)))outs.push({from,to:at(base,6),castle:'king'});
   if(r===base&&c===4&&s.castle[rights[1]]&&b[at(base,0)]===(side==='w'?'R':'r')&&b[at(base,1)]==='.'&&b[at(base,2)]==='.'&&b[at(base,3)]==='.'&&!attacked(s,at(base,3),enemy(side))&&!attacked(s,at(base,2),enemy(side)))outs.push({from,to:at(base,2),castle:'queen'});
  }
 }
 return outs;
}
function applyUnsafe(s,m,promo='Q'){
 const n=copy(s),b=n.board,p=b[m.from],side=color(p),[fr,fc]=rc(m.from),[tr,tc]=rc(m.to);
 const captured=b[m.to];b[m.to]=p;b[m.from]='.';
 if(m.enPassant)b[at(fr,tc)]='.';
 if(m.castle){const row=side==='w'?7:0,rookFrom=at(row,m.castle==='king'?7:0),rookTo=at(row,m.castle==='king'?5:3);b[rookTo]=b[rookFrom];b[rookFrom]='.';}
 if(m.promotion){const char=String(promo||'Q').toUpperCase();b[m.to]=side==='w'?(('QRBN'.includes(char))?char:'Q'):(('QRBN'.includes(char))?char:'Q').toLowerCase();}
 if(p==='K'){n.castle.K=false;n.castle.Q=false;}if(p==='k'){n.castle.k=false;n.castle.q=false;}
 if(m.from===63||m.to===63)n.castle.K=false;if(m.from===56||m.to===56)n.castle.Q=false;
 if(m.from===7||m.to===7)n.castle.k=false;if(m.from===0||m.to===0)n.castle.q=false;
 n.ep=m.two?at((fr+tr)/2,fc):-1;n.turn=enemy(side);n.last={from:m.from,to:m.to};
 n.halfmove=p.toLowerCase()==='p'||captured!=='.'?0:s.halfmove+1;
 return n;
}
function legal(s,from){if(s.finished||!Number.isInteger(from)||from<0||from>63||color(s.board[from])!==s.turn)return [];return possible(s,from).filter(m=>!check(applyUnsafe(s,m),s.turn));}
function allMoves(s){let a=[];for(let i=0;i<64;i++)if(color(s.board[i])===s.turn)a.push(...legal(s,i));return a;}
function move(s,from,to,promo='Q'){
 const found=legal(s,from).find(m=>m.to===to);
 if(!found)return {ok:false,error:'Illegal move',state:s};
 const n=applyUnsafe(s,found,promo);const moves=allMoves(n);
 if(!moves.length)n.finished=check(n,n.turn)?'checkmate':'stalemate';
 return {ok:true,state:n,move:found,check:check(n,n.turn),finished:n.finished};
}
function resign(s,side){
 if(s.finished||!['w','b'].includes(side))return {ok:false,state:s};
 const n=copy(s);n.finished='resignation';n.winner=enemy(side);return {ok:true,state:n,winner:n.winner};
}
function agreeDraw(s){
 if(s.finished)return {ok:false,state:s};
 const n=copy(s);n.finished='agreed_draw';n.winner=null;return {ok:true,state:n};
}
return {start,legal,move,check,attacked,allMoves,resign,agreeDraw};
});
