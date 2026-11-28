// The authenticated user supplies only a move. Dice, opponents and settlement are server-owned.
import './chess.js';
import {initial,advance} from './rules.mjs';
const chess=(globalThis as any).PLAY80Chess;
const base=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
function reply(data:unknown,status=200){return Response.json(data,{status,headers:cors});}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return reply({},405);
 try{
  const auth=await fetch(base+'/auth/v1/user',{headers:{apikey:service,Authorization:req.headers.get('authorization')||''}});
  if(!auth.ok)return reply({message:'আগে লগইন করো।'},401);
  const user=await auth.json(),b=await req.json();
  if(b.action==='terms')b.id='00000000-0000-4000-8000-000000000000';
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.id))return reply({},400);
  async function store(action:string,state:unknown=null,status='active'){
   const r=await fetch(base+'/rest/v1/rpc/play80_bot_arena_store',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({p_player:user.id,p_id:b.id,p_action:action,p_game:b.game||null,p_stake:b.stake||null,p_revision:b.revision??null,p_status:status,p_state:state})});
   const data=await r.json();if(!r.ok)throw Error(data?.message||'সার্ভারের হিসাব পাওয়া যায়নি।');return data;
  }
  if(b.action==='terms')return reply(await store('terms'));
  if(b.action==='start'){
   if(!['ludo','chess'].includes(b.game)||![50,100,150,200,300,500].includes(b.stake))return reply({},400);
   return reply(await store('start',{...(b.game==='ludo'?initial():chess.start()),quote:b.terms}));
  }
  if(b.action==='forfeit')return reply(await store('forfeit'));
  const m=await store('read');
  if(!m||m.status!=='active'||m.revision!==b.revision||b.action==='read')return reply(m);
  let state=m.state,status='active';
  if(m.game==='ludo')status=advance(state,b.action,b.pawn);
  else{
   const computer=state.turn==='b';
   if(b.action!==(computer?'bot':'chess'))return reply({},400);
   const move=computer?chess.hardMove(state):b;
   const result=chess.move(state,move.from,move.to);
   if(!result.ok)return reply({message:'অবৈধ চাল।'},400);
   state=result.state;
   if(state.finished==='checkmate')status=state.turn==='b'?'won':'lost';
   else if(state.finished)status='draw';
  }
  return reply(await store('advance',state,status));
 }catch(e){return reply({message:e instanceof Error?e.message:'খেলা আপডেট হয়নি।'},400);}
});
