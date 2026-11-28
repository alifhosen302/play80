const safe=new Set([0,8,13,21,26,34,39,47]);
function random(n){
 const a=new Uint32Array(1),limit=2**32-(2**32%n);
 do{crypto.getRandomValues(a);}while(a[0]>=limit);
 return 1+a[0]%n;
}
export function initial(){return {pawns:[[-1,-1,-1,-1],[],[-1,-1,-1,-1],[]],turn:0,die:0,opening:1+random(2),last:null};}
function square(p,step){return (13*p+step)%52;}
function option(s,p,i,d){
 const start=s.pawns[p][i];
 if(start===undefined||start===56||(start<0&&d!==6))return null;
 const end=start<0?0:start+d;
 if(end>56)return null;
 const pos=square(p,end),op=2-p;
 const cuts=end>=51||safe.has(pos)?[]:s.pawns[op].flatMap((n,j)=>n>=0&&n<51&&square(op,n)===pos?[j]:[]);
 if(d>6&&(!cuts.length||p!==2))return null;
 const rank=cuts.length?3:start<0?2:end===56?1:0;
 const score=rank*100000+cuts.length*1000+cuts.reduce((v,j)=>v+s.pawns[op][j],0)+end+(end>=51||safe.has(pos)?30:0);
 return {i,end,cuts,rank,score};
}
export function choices(s,d){return s.pawns[s.turn].map((_,i)=>option(s,s.turn,i,d)).filter(Boolean).sort((a,b)=>b.score-a.score);}
export function botRoll(s){
 if(s.opening>0){s.opening--;return random(5);}
 let best=null,die=0;
 for(let d=1;d<=12;d++){
  const move=choices(s,d)[0];
  if(move?.rank&&(!best||move.score>best.score)){best=move;die=d;}
 }
 return die||random(6);
}
export function advance(s,action,pawn){
 const p=s.turn;
 if(action==='roll'&&p===0&&!s.die||action==='bot'&&p===2&&!s.die){
  s.die=p===2?botRoll(s):random(6);s.last={p,d:s.die};
  if(!choices(s,s.die).length){if(s.die!==6)s.turn=2-p;s.die=0;}
 }else if(s.die&&(action==='pawn'&&p===0||action==='bot'&&p===2)){
  const move=p===2?choices(s,s.die)[0]:choices(s,s.die).find(m=>m.i===pawn);
  if(!move)throw Error('এই গুটির চাল বৈধ নয়।');
  s.pawns[p][move.i]=move.end;
  for(const i of move.cuts)s.pawns[2-p][i]=-1;
  if(s.pawns[p].every(n=>n===56))return p===0?'won':'lost';
  if(!move.cuts.length&&move.end!==56&&s.die!==6)s.turn=2-p;
  s.die=0;
 }else throw Error('এই মুহূর্তে এই চাল দেওয়া যাবে না।');
 return 'active';
}
