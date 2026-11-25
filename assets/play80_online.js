/* play80 online account — independent of the offline local-coins simulation.
 * Public client key only; never put service_role keys in Android or web files.
 */
(() => {
  'use strict';
  const BASE = 'https://suhpmjqrcqkzaslptpca.supabase.co';
  const KEY = 'sb_publishable_8VvDZLfwAeztWeDS2EqNBQ_nlYFwFyK';
  const STORAGE = 'play80.secure_account.v1';
  const $ = (id) => document.getElementById(id);
  let session = null, profile = null, balance = null, verifiedAuth = false;
  let staffPinToken = null, staffPinExpires = 0, activeGameCode = null;
  const escDate = (d) => { try { return new Date(d).toLocaleString(); } catch (_) {return '—';} };
  const status = (message, error=false) => {
    const e = $('cloudNotice');
    if(e){e.textContent=String(message);e.style.color=error?'#ffb8b8':'#c5eeff';}
  };
  const ownerStatus = (message, error=false) => {
    const e = $('cloudOwnerNotice');
    if(e){e.textContent=String(message);e.style.color=error?'#ffb8b8':'#c5eeff';}
  };
  const show = (id,on) => { const e=$(id);if(e)e.classList.toggle('hidden',!on); };
  const stamp = () => Math.floor(Date.now()/1000);
  const persist = () => { try{if(session)localStorage.setItem(STORAGE,JSON.stringify(session));else localStorage.removeItem(STORAGE);}catch(_){} };
  try { const data=JSON.parse(localStorage.getItem(STORAGE)||'null');if(data&&data.access_token&&data.refresh_token)session=data; }catch(_){}
  const isOwner = () => session?.user?.app_metadata?.role === 'owner';
  const isStaff = () => ['owner','admin'].includes(session?.user?.app_metadata?.role);
  async function raw(path,method='GET',payload=null,token=null){
    const headers={apikey:KEY};
    if(payload!==null)headers['Content-Type']='application/json';
    if(token)headers.Authorization='Bearer '+token;
    const res=await fetch(BASE+path,{method,headers,body:payload!==null?JSON.stringify(payload):undefined});
    let data;try{data=await res.json();}catch(_){data=null;}
    if(!res.ok){let err=new Error(data?.msg||data?.message||data?.error_description||data?.error||('Request failed ('+res.status+')'));err.code=data?.code||'';throw err;}
    return data;
  }
  async function auth(path,method,payload){return raw('/auth/v1/'+path,method,payload);}
  function saveSession(data){
    if(!data?.access_token||!data?.refresh_token)throw Error('No session returned');
    session={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:stamp()+Number(data.expires_in||3600),user:data.user||session?.user||null};
    verifiedAuth=!!session.user?.email_confirmed_at;
    persist();renderAuth();
  }
  async function token(){
    if(!session?.access_token)throw Error('Please sign in first');
    if(Number(session.expires_at||0) < stamp()+70){
      try{const data=await auth('token?grant_type=refresh_token','POST',{refresh_token:session.refresh_token});saveSession(data);}
      catch(e){session=null;persist();renderAuth();throw Error('Your session expired. Please sign in again.');}
    }
    return session.access_token;
  }
  async function db(path,method='GET',payload=null){return raw('/rest/v1/'+path,method,payload,await token());}
  function renderAuth(){
    const on=!!session?.access_token && verifiedAuth;
    document.body.classList.toggle('p8-auth-locked',!on);
    document.getElementById('screen-account')?.classList.toggle('hidden',!on?false:document.getElementById('screen-account')?.classList.contains('hidden'));
    if(!on)window.scrollTo(0,0);
    show('cloudSignedOut',!on);show('cloudSignedIn',on);
    show('cloudOwnerEntry',on&&isStaff());show('cloudOwnerAuthBlocked',!on||!isStaff());show('cloudStaffPinGate',on&&isStaff()&&!staffPinToken);show('cloudOwnerContent',on&&isStaff()&&!!staffPinToken);
    if(on){$('cloudEmail').textContent=session.user?.email||'Signed in';$('cloudRole').textContent=isOwner()?'Verified Owner':(isStaff()?'Verified Admin':'Player');}
    else {$('cloudBalance').textContent='—';$('cloudRequests').replaceChildren();}
  }
  async function loadAccount(){
    if(!session||!verifiedAuth)return;
    try{
      const id=session.user?.id;
      if(!id)throw Error('User account is missing from the session');
      const profiles=await db('profiles?select=username,display_name&id=eq.'+encodeURIComponent(id)+'&limit=1');
      profile=profiles?.[0]||{};
      $('cloudUsername').value=profile.username||'';
      $('cloudUsername').readOnly=!!profile.username;
      $('cloudSaveUsername').disabled=!!profile.username;
      $('cloudSaveUsername').textContent=profile.username?'USERNAME LOCKED':'SAVE USERNAME';
      const wallets=await db('demo_wallets?select=balance,held_balance&user_id=eq.'+encodeURIComponent(id)+'&limit=1');
      balance=wallets?.[0]||{balance:0,held_balance:0};
      $('cloudBalance').textContent=String(Number(balance.balance)-Number(balance.held_balance));
      try{
        const bonusRows=await db('bonus_transactions?select=amount&user_id=eq.'+encodeURIComponent(id)+'&limit=2');
        const turnover=await db('turnover_records?select=required,completed&user_id=eq.'+encodeURIComponent(id)+'&limit=1');
        const earned=(bonusRows||[]).reduce((s,b)=>s+Number(b.amount||0),0);
        $('cloudBonusEarned').textContent=earned.toLocaleString();
        const required=Number(turnover?.[0]?.required||0),completed=Number(turnover?.[0]?.completed||0);
        $('cloudTurnoverRequired').textContent=required.toLocaleString();
        $('cloudTurnoverCompleted').textContent=completed.toLocaleString();
        $('cloudTurnoverRemaining').textContent=Math.max(0,required-completed).toLocaleString();
      }catch(e){$('cloudTurnoverRemaining').textContent='Server unavailable';}

      $('cloudHeld').textContent=String(balance.held_balance||0);
      const requests=await db('demo_wallet_requests?select=id,request_kind,amount,status,created_at,review_note&user_id=eq.'+encodeURIComponent(id)+'&order=created_at.desc&limit=25');
      const list=$('cloudRequests');list.replaceChildren();
      if(!requests?.length)list.textContent='No online requests yet.';
      (requests||[]).forEach(r=>{
        const item=document.createElement('div');item.className='cloudRequestItem';
        const title=document.createElement('strong');title.textContent=(r.request_kind==='demo_credit'?'➕ Request coins':'➖ Remove coins')+' • '+r.amount;
        const sub=document.createElement('small');sub.textContent=r.status+' • '+escDate(r.created_at)+(r.review_note?' • '+r.review_note:'');
        item.append(title,sub);list.append(item);
      });
      status('Online account synced. Demo coins are separate from offline game coins.');
    }catch(e){status(e.message,true);}
  }
  const busy = async (button,fn,writeStatus=status) => {
    if(button.disabled)return;
    button.disabled=true;const before=button.textContent;
    button.textContent='Please wait…';
    try{await fn();}catch(e){writeStatus(e.message||String(e),true);}
    finally{button.disabled=false;button.textContent=before;}
  };
  $('cloudRegister').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const email=$('cloudLoginEmail').value.trim().toLowerCase();
    const password=$('cloudLoginPassword').value;
    if(!email||!/^[0-9]{6}$/.test(password))throw Error('Enter your email and a six-digit PIN');
    const username=$('cloudRegistrationUsername')?.value.trim().toLowerCase();
    if(!/^[a-z0-9_]{3,24}$/.test(username||''))throw Error('Choose a unique username of 3–24 English letters, digits or _');
    const phone=$('p8SignupPhone').value.trim().replace(/[\s-]/g,'');
    const fullName=$('p8SignupFullName').value.trim();
    const address=$('p8SignupAddress').value.trim();
    if(!/^\+?[0-9]{10,15}$/.test(phone))throw Error('Enter a valid mobile number, 10–15 digits');
    if(fullName.length<3||fullName.length>100)throw Error('Enter your full name');
    if(address.length<8||address.length>250)throw Error('Enter your full address');
    if($('p8SignupConfirmPIN').value!==password)throw Error('PIN entries do not match');
    const data=await auth('signup','POST',{email,password,data:{username,display_name:fullName,full_name:fullName,phone_number:phone,address}});
    if(data?.access_token){saveSession(data);await loadAccount();status(verifiedAuth?'Account created and verified. You may play.':'Account created. Verify your email to activate play.');}
    else status('Registration requested. Open your email and verify it, then sign in.');
    $('cloudLoginPassword').value='';
  }));
  $('cloudLogin').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const email=$('cloudLoginEmail').value.trim().toLowerCase();const password=$('cloudLoginPassword').value;
    if(!email||!/^[0-9]{6}$/.test(password))throw Error('Enter email and your six-digit PIN');
    const data=await auth('token?grant_type=password','POST',{email,password});
    saveSession(data);$('cloudLoginPassword').value='';if(!verifiedAuth)throw Error('Please verify your email before playing.');await loadAccount();
  }));
  $('cloudRecover').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const email=$('cloudLoginEmail').value.trim().toLowerCase();
    if(!email)throw Error('Enter your email above to request password reset');
    await auth('recover','POST',{email});
    status('If that account exists, a PIN recovery email was sent. Follow the email instructions to reset your sign-in code.');
  }));
  $('cloudSaveUsername').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const username=$('cloudUsername').value.trim().toLowerCase();
    if(!/^[a-z0-9_]{3,24}$/.test(username))throw Error('Username: 3–24 English letters, digits or underscore');
    await db('profiles?id=eq.'+encodeURIComponent(session.user.id),'PATCH',{username});
    await loadAccount();status('Unique username saved.');
  }));
  $('cloudSubmit').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    if(!profile?.username)throw Error('First save your unique username');
    const type=$('cloudRequestKind').value;
    const amount=Number($('cloudAmount').value);
    const note=$('cloudNote').value.trim();
    if(!Number.isSafeInteger(amount)||amount<1)throw Error('Enter a whole number of coins');
    if(type==='demo_credit'&&(amount<100||amount>20000))throw Error('Request between 100 and 20,000 coins');
    if(type==='demo_debit'&&(amount<200||amount>1000000))throw Error('Remove between 200 and 1,000,000 coins');
    if(type==='demo_debit'&&(!confirm('Demo removal only. No cash or real money can be paid. Proceed?')))return;
    await db('rpc/submit_demo_wallet_request','POST',{p_kind:type,p_amount:amount,p_note:note||null});
    $('cloudNote').value='';await loadAccount();status('Demo coin request was sent to the secure Owner account.');
  }));
  $('cloudRefresh').addEventListener('click',e=>busy(e.currentTarget,loadAccount));
  $('cloudSignOut').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    try{await raw('/auth/v1/logout','POST',null,await token());}catch(_){}
    session=null;profile=null;balance=null;staffPinToken=null;staffPinExpires=0;persist();renderAuth();status('Signed out.');
  }));
  async function staffRpc(name, data={}) {
    if(!isStaff()) throw Error('Verified Owner / Admin login required');
    if(!staffPinToken || Date.now()>=staffPinExpires) {
      staffPinToken=null;show('cloudOwnerContent',false);show('cloudStaffPinGate',true);
      throw Error('Staff PIN expired. Enter PIN to unlock again.');
    }
    return db('rpc/'+name,'POST',{p_pin_token:staffPinToken,...data});
  }
  const createText=(tag,content,cls='')=>{const el=document.createElement(tag);el.textContent=String(content??'');if(cls)el.className=cls;return el;};
  const makeButton=(title,fn,secondary=false)=>{
    const b=document.createElement('button');b.type='button';b.className='action'+(secondary?' secondary':'');
    b.textContent=title;b.addEventListener('click',()=>busy(b,fn,ownerStatus));return b;
  };
  function staffOpenGate() {
    staffPinToken=null; staffPinExpires=0;
    show('cloudOwnerContent',false);show('cloudStaffPinGate',isStaff());
    $('cloudStaffPin').value='';
    ownerStatus(isStaff()?'Enter your secure 6-digit PIN to enter the panel.':'Please sign in as verified staff.',!isStaff());
  }
  $('cloudStaffCreatePin').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const pin=$('cloudStaffPin').value;
    if(!/^[0-9]{6}$/.test(pin))throw Error('Set a six-digit numeric PIN');
    if(!confirm('Set this 6-digit Owner/Admin PIN? You must remember it.'))return;
    await db('rpc/staff_set_pin','POST',{p_pin:pin});
    $('cloudStaffPin').value='';ownerStatus('PIN created securely. Enter it again and choose Unlock.');
  },ownerStatus));
  $('cloudStaffUnlock').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const pin=$('cloudStaffPin').value;
    if(!/^[0-9]{6}$/.test(pin))throw Error('Please enter a 6-digit PIN');
    $('cloudStaffPin').value='';
    const data=await db('rpc/staff_unlock_pin','POST',{p_pin:pin});
    if(!data?.ok)throw Error(data?.message||'Incorrect PIN');
    staffPinToken=data.token;staffPinExpires=Date.now()+Math.max(0,Number(data.expires_in||180)-8)*1000;
    show('cloudStaffPinGate',false);show('cloudOwnerContent',true);
    ownerStatus('Panel unlocked for about 3 minutes. Virtual coins only.');
    await switchStaffTab('wallet');
  },ownerStatus));
  function makeOwnerItem(r){
    const el=document.createElement('div');el.className='cloudRequestItem';
    el.append(createText('strong',(r.request_kind==='demo_credit'?'➕ Add coins':'➖ Remove coins')+' • '+r.amount+' demo coins'));
    el.append(createText('small',(r.username||r.email||r.user_id)+' • '+escDate(r.created_at)+(r.user_note?' • '+r.user_note:'')));
    const note=document.createElement('input');note.placeholder='Rejection reason (required)';note.maxLength=500;
    const actions=document.createElement('div');actions.className='cloudActions';
    for(const decision of ['approved','rejected']){
      actions.append(makeButton(decision==='approved'?'✓ APPROVE':'✕ REJECT',async()=>{
        if(decision==='rejected'&&!note.value.trim())throw Error('Rejection reason required');
        if(!confirm('Confirm '+decision.toUpperCase()+' '+r.amount+' DEMO coins for '+(r.username||r.email||r.user_id)+'? No real-money transfer.'))return;
        await staffRpc('staff_review_demo_request',{p_request_id:r.id,p_decision:decision,p_review_note:note.value.trim()||null});
        ownerStatus('Demo coin request '+decision+'.');await loadOwnerRequests();await loadAccount();
      },decision==='rejected'));
    }
    el.append(note,actions);return el;
  }
  async function loadOwnerRequests(){
    const requests=await staffRpc('staff_list_demo_requests',{p_status:'pending'});
    const list=$('cloudOwnerRequests');list.replaceChildren();
    if(!requests.length)list.textContent='No pending online DEMO coin requests.';
    requests.forEach(r=>list.append(makeOwnerItem(r)));
    $('cloudOwnerCount').textContent=String(requests.length);
    ownerStatus('Deposit / Withdraw approval queue. All amounts are virtual coins.');
  }
  async function loadStaffUsers(){
    const rows=await staffRpc('staff_list_users',{p_search:$('cloudStaffSearch').value.trim(),p_limit:80});
    const list=$('cloudStaffUsers');list.replaceChildren();
    if(!rows.length)list.textContent='No matching users.';
    rows.forEach(u=>{
      const card=document.createElement('div');card.className='cloudRequestItem';
      card.append(createText('strong',(u.username?'@'+u.username+' • ':'')+(u.email||u.id)));
      card.append(createText('small','ID: '+u.id+' | Display name: '+(u.display_name||'—')+' | Joined: '+escDate(u.created_at)));
      card.append(createText('small','Role: '+u.role+' | Email verified: '+(u.email_verified?'YES':'NO')+' | Suspended: '+(u.suspended?'YES':'NO')));
      card.append(createText('small','Balance: '+u.balance+' | Held: '+u.held_balance+' | Available: '+(Number(u.balance)-Number(u.held_balance))));
      if(isOwner() && u.role==='player'){
      const amount=document.createElement('input');amount.type='number';amount.min='1';amount.max='1000000';amount.placeholder='Demo coins to send (1–1000000)';
      const grantNote=document.createElement('input');grantNote.maxLength=200;grantNote.placeholder='Optional note to this player (delivery notification)';
      card.append(amount,grantNote);
      card.append(makeButton('➕ SEND DEMO COINS',async()=>{
        const num=Number(amount.value);
        if(!Number.isSafeInteger(num)||num<1||num>1000000)throw Error('Enter a valid whole coin amount');
        if(!confirm('Send '+num+' VIRTUAL coins to '+(u.email||u.id)+'? Confirm?'))return;
        const operation=crypto.randomUUID?crypto.randomUUID():([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
        const result=await staffRpc('staff_send_demo_coins',{p_target_user:u.id,p_amount:num,p_operation_id:operation,p_note:grantNote.value.trim()||'Owner manually credited virtual Demo Coins'});
        ownerStatus(result?.duplicate?'Already processed this request.':'Sent '+num+' virtual coins. New total '+result.balance_after);
        amount.value='';await loadStaffUsers();
      }));
      }
      if(isOwner())attachOwnerUserTools(card,u);
      if(isOwner() && u.role!=='owner'){
        card.append(makeButton(u.role==='admin'?'REMOVE ADMIN ROLE':'MAKE ADMIN',async()=>{
          const action=u.role==='admin'?'revoke':'grant';
          if(!confirm((action==='revoke'?'Remove ADMIN permissions from ':'Grant ADMIN permissions to ')+(u.email||u.id)+'? The user account will NOT be deleted.'))return;
          await staffRpc('staff_manage_admin',{p_target_user:u.id,p_action:action});
          ownerStatus('Admin '+(action==='grant'?'created':'permissions revoked')+' for '+(u.email||u.id)+'. Ask this user to sign in again.');
          await loadStaffUsers();
        },true));
      }
      list.append(card);
    });
  }
  async function loadAdmins(){
    const staff=await staffRpc('staff_list_admins');const list=$('cloudStaffAdmins');list.replaceChildren();
    if(!staff.length)list.textContent='No registered Admin/Owner yet.';
    staff.forEach(u=>{
      const card=document.createElement('div');card.className='cloudRequestItem';
      card.append(createText('strong',u.role.toUpperCase()+' • '+(u.username||u.email)));
      card.append(createText('small',u.email+' • Joined '+escDate(u.created_at)));
      if(u.role==='admin'&&isOwner())card.append(makeButton('REVOKE ADMIN ROLE',async()=>{
        if(!confirm('Remove ADMIN rights of '+u.email+'? This will NOT delete the account.'))return;
        await staffRpc('staff_manage_admin',{p_target_user:u.id,p_action:'revoke'});await loadAdmins();
        ownerStatus('Admin role removed for '+u.email);
      },true));
      list.append(card);
    });
  }
  async function loadActivity(){
    const rows=await staffRpc('staff_active_games');const list=$('cloudStaffActivity');list.replaceChildren();
    if(!rows.length)list.textContent='No signed-in users reporting active play right now.';
    rows.forEach(a=>{
      const card=document.createElement('div');card.className='cloudRequestItem';
      card.append(createText('strong',(a.username||a.email||a.user_id)+' • '+(a.title||a.game_code)));
      card.append(createText('small','Started: '+escDate(a.started_at)+' | Last signal: '+escDate(a.last_seen)));
      list.append(card);
    });
  }
  async function loadStats(){
    const stats=await staffRpc('staff_dashboard');const list=$('cloudStaffStats');list.replaceChildren();
    list.append(createText('strong','Registered users: '+stats.users+' | Admins: '+stats.admins));
    list.append(createText('small','Players active in last 2 minutes: '+stats.active_players+' | Total started game sessions: '+stats.total_game_sessions));
    list.append(createText('small','Virtual coins in wallets: '+stats.demo_coin_total+' | Pending add: '+stats.pending_demo_credit+' | Pending remove: '+stats.pending_demo_debit));
    list.append(createText('strong','Most popular games (tracked starts):'));
    if(!stats.top_games?.length)list.append(createText('small','No tracked game sessions yet.'));
    (stats.top_games||[]).forEach((g,i)=>list.append(createText('small',(i+1)+'. '+g.title+' — '+g.sessions+' plays from '+g.distinct_players+' users')));
  }

  async function loadBotOwner(){
    const info=await staffRpc('play80_owner_bot_dashboard');
    $('cloudBotsSummary').textContent='AI profiles: '+info.total+' · active: '+info.active+' · daily limit 8 hours · three-day limit 24 hours';
    const list=$('cloudBotsList');list.replaceChildren();
    for(const bot of (info.bots||[])){
      const card=document.createElement('div');card.className='cloudRequestItem';
      card.append(createText('strong',bot.avatar+' '+bot.username+' • AI Player • '+bot.skill));
      card.append(createText('small','Total: '+bot.total_score+' pts · Games: '+bot.games_played+' · Today: '+Math.floor(bot.today_seconds/60)+' min · Total: '+Math.floor(bot.all_seconds/60)+' min · Virtual prizes: '+bot.virtual_rewards));
      card.append(makeButton('EDIT FOR FUTURE EVENTS',()=>{
        $('cloudBotId').value=bot.id;$('cloudBotUsername').value=bot.username;
        $('cloudBotAvatar').value=bot.avatar;$('cloudBotSkill').value=bot.skill;
        $('cloudBotActive').checked=bot.active;
        $('cloudBotUsername').scrollIntoView({block:'center',behavior:'smooth'});
      },true));list.append(card);
    }
  }
  async function loadTournamentOwner(){
    const data=await staffRpc('play80_owner_tournament_dashboard');
    const list=$('cloudTournamentOwner');list.replaceChildren();
    list.append(createText('strong','Human awards: '+data.human_reward_total+' · AI virtual ledger: '+data.ai_reward_total));
    (data.tournaments||[]).forEach(t=>{
      const card=document.createElement('div');card.className='cloudRequestItem';
      card.append(createText('strong',t.title+' • '+t.status));
      card.append(createText('small','Start: '+escDate(t.starts_at)+' · End: '+escDate(t.ends_at)+' · Allocated AI: '+t.bot_count));list.append(card);
    });
    list.append(createText('strong','Scheduler log (most recent 20):'));
    (data.scheduler||[]).forEach(l=>list.append(createText('small',escDate(l.occurred_at)+' • '+l.event)));
  }
  $('cloudBotNew').addEventListener('click',()=>{
    $('cloudBotId').value='';$('cloudBotUsername').value='';$('cloudBotAvatar').value='🤖';
    $('cloudBotSkill').value='medium';$('cloudBotActive').checked=true;
  });
  $('cloudBotSave').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const username=$('cloudBotUsername').value.trim(),avatar=$('cloudBotAvatar').value.trim(),
      skill=$('cloudBotSkill').value,id=$('cloudBotId').value||null;
    if(username.length<3||!avatar)throw Error('Enter a name and an avatar');
    if(!confirm('Save AI profile for future tournaments only? Live tournament scores and rewards will not change.'))return;
    await staffRpc('play80_owner_bot_upsert',{p_bot_id:id,p_username:username,p_avatar:avatar,
      p_skill:skill,p_active:$('cloudBotActive').checked});
    ownerStatus('AI profile saved for future tournaments.');await loadBotOwner();
  },ownerStatus));
  $('cloudBotsRefresh').addEventListener('click',e=>busy(e.currentTarget,loadBotOwner,ownerStatus));
  $('cloudTournamentRefresh').addEventListener('click',e=>busy(e.currentTarget,loadTournamentOwner,ownerStatus));
  async function switchStaffTab(tab){
    if(!['wallet','users','admins','activity','stats','bots','tournaments'].includes(tab))return;
    document.querySelectorAll('[data-staff-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.staffTab===tab));
    document.querySelectorAll('.cloudStaffPane').forEach(el=>el.classList.toggle('hidden',el.id!=='cloudStaffTab-'+tab));
    if(tab==='wallet')await loadOwnerRequests();
    if(tab==='users')await loadStaffUsers();
    if(tab==='admins')await loadAdmins();
    if(tab==='activity')await loadActivity();
    if(tab==='stats')await loadStats();
    if(tab==='bots')await loadBotOwner();
    if(tab==='tournaments')await loadTournamentOwner();
  }
  document.querySelectorAll('[data-staff-tab]').forEach(btn=>btn.addEventListener('click',()=>busy(btn,()=>switchStaffTab(btn.dataset.staffTab),ownerStatus)));
  $('cloudOwnerRefresh').addEventListener('click',e=>busy(e.currentTarget,loadOwnerRequests,ownerStatus));
  $('cloudStaffSearchButton').addEventListener('click',e=>busy(e.currentTarget,loadStaffUsers,ownerStatus));
  $('cloudStaffActivityRefresh').addEventListener('click',e=>busy(e.currentTarget,loadActivity,ownerStatus));
  $('cloudStaffStatsRefresh').addEventListener('click',e=>busy(e.currentTarget,loadStats,ownerStatus));
  document.querySelectorAll('[data-open="account"],[data-open="remote-owner"]').forEach(b=>{
    b.addEventListener('click',()=>{if(b.dataset.open==='account')loadAccount();else staffOpenGate();});
  });

  // Best-effort presence reports, only for authenticated online accounts.
  // Offline games remain playable without sign-in; online demo coins do not change game coins.
  const KNOWN_GAMES=new Set(['wheel','dice','flight','ludo','carnival','cups','apples','slots','roulette','blackjack','plinko','mines','keno','scratch','crazyshow']);
  function reportGame(game,event){
    if(!session || !KNOWN_GAMES.has(game))return;
    db('rpc/report_game_session','POST',{p_game_code:game,p_action:event}).catch(()=>{});
  }
  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-open],[data-arcade]');if(!btn)return;
    const g=btn.dataset.arcade||btn.dataset.open;
    if(KNOWN_GAMES.has(g)){
      if(activeGameCode&&activeGameCode!==g)reportGame(activeGameCode,'finish');
      activeGameCode=g;reportGame(g,'start');
    } else if(activeGameCode && ['home','account','owner','wallet','ludo','remote-owner'].indexOf(g)<0){
      reportGame(activeGameCode,'finish');activeGameCode=null;
    } else if(activeGameCode && ['home','account','owner','wallet','remote-owner'].includes(g)){
      reportGame(activeGameCode,'finish');activeGameCode=null;
    }
  },true);
  setInterval(()=>{
    if(activeGameCode&&session&&document.visibilityState!=='hidden') reportGame(activeGameCode,'heartbeat');
  },40000);
  window.Play80Cloud=Object.freeze({
    user:()=>verifiedAuth?session?.user||null:null,
    rpc:async(name,payload={})=>db('rpc/'+encodeURIComponent(name),'POST',payload),
    reloadAccount:loadAccount
  });

  // V4.3 customer + owner tools. Every sensitive owner RPC also validates auth, Owner role and 3-minute PIN server-side.
  const regName=document.createElement('div');
  regName.className='formGroup';
  regName.innerHTML='<label for="cloudRegistrationUsername">Unique Username (required at signup)</label><input id="cloudRegistrationUsername" type="text" maxlength="24" minlength="3" autocomplete="off" autocapitalize="none" placeholder="e.g. player80" pattern="[a-zA-Z0-9_]{3,24}"><small>This username is permanent; it can never be reused by another player.</small>';
  $('cloudLoginEmail').closest('.formGroup').after(regName);

  // Two modes: Email + PIN login, or Email -> Username -> Phone -> Name -> Address -> PIN signup.
  const cloudSignedOut=$('cloudSignedOut');
  const modePanel=document.createElement('div');
  modePanel.className='p8AuthModes';
  modePanel.innerHTML='<button type="button" id="p8ModeLogin" class="selected">SIGN IN</button><button type="button" id="p8ModeSignup">CREATE ACCOUNT</button>';
  cloudSignedOut.querySelector('.sectionTitle').after(modePanel);
  function selectAuthMode(signup){
    const emailGroup=$('cloudLoginEmail').closest('.formGroup'),pinGroup=$('cloudLoginPassword').closest('.formGroup');
    if(signup&&$('p8SignupConfirmPIN'))$('p8SignupConfirmPIN').closest('.formGroup').before(pinGroup);
    else emailGroup.after(pinGroup);
    regName.classList.toggle('hidden',!signup);
    $('cloudRegister').classList.toggle('hidden',!signup);
    $('cloudLogin').classList.toggle('hidden',signup);
    $('p8ModeSignup').classList.toggle('selected',signup);
    $('p8ModeLogin').classList.toggle('selected',!signup);
    $('cloudLoginPassword').autocomplete=signup?'new-password':'current-password';
  }
  $('p8ModeLogin').addEventListener('click',()=>selectAuthMode(false));
  $('p8ModeSignup').addEventListener('click',()=>selectAuthMode(true));
  selectAuthMode(false);
  const regFields=document.createElement('div');
  regFields.id='p8RegistrationFields';
  regFields.innerHTML=`<div class="formGroup"><label for="p8SignupPhone">Mobile number</label><input id="p8SignupPhone" inputmode="tel" autocomplete="tel" maxlength="18" placeholder="01XXXXXXXXX" required></div>
    <div class="formGroup"><label for="p8SignupFullName">Full name</label><input id="p8SignupFullName" maxlength="100" autocomplete="name" placeholder="Full legal name" required></div>
    <div class="formGroup"><label for="p8SignupAddress">Address</label><textarea id="p8SignupAddress" maxlength="250" autocomplete="street-address" placeholder="Full address" rows="3" required></textarea></div>
    <div class="formGroup"><label for="p8SignupConfirmPIN">Confirm six-digit PIN</label><input id="p8SignupConfirmPIN" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" placeholder="●●●●●●" required></div>`;
  $('cloudLoginPassword').closest('.formGroup').after(regFields);
  // signup state is driven from the visible tabs
  $('p8ModeLogin').addEventListener('click',()=>regFields.classList.add('hidden'));
  $('p8ModeSignup').addEventListener('click',()=>regFields.classList.remove('hidden'));
  regFields.classList.add('hidden');
  $('cloudSignedIn').querySelectorAll('.p8PlayerPinPanel').forEach(x=>x.remove());
  const passwordField=$('cloudLoginPassword');
  passwordField.inputMode='numeric';passwordField.pattern='[0-9]{6}';passwordField.maxLength=6;
  passwordField.placeholder='6-digit PIN';passwordField.autocomplete='off';
  passwordField.closest('.formGroup').querySelector('label').textContent='Six-digit PIN';
  document.querySelectorAll('[data-open="account"]').forEach(b=>b.addEventListener('click',()=>window.scrollTo(0,0)));
  const ownerKeyNote=document.createElement('p');
  ownerKeyNote.className='tiny';
  ownerKeyNote.textContent='Owner has an unlimited authorised DEMO-COIN ISSUANCE capability (1–1,000,000 per audited operation), not cash. Other players have finite server balances.';
  $('cloudStaffTab-users').prepend(ownerKeyNote);
  const accountSupport=document.createElement('div');
  accountSupport.className='play80Surface';
  accountSupport.style.marginTop='12px';
  accountSupport.innerHTML='<h3>💬 My Support & Account Requests</h3><p>Send the Owner a message, or request account deletion. A request NEVER automatically deletes the account.</p><textarea id="p8SupportText" rows="3" maxlength="1000" placeholder="Message to Owner" style="width:100%;min-height:75px"></textarea><div class="cloudActions"><button class="action" type="button" id="p8SendMessage">SEND MESSAGE</button><button class="action secondary" type="button" id="p8RequestDeletion">REQUEST ACCOUNT DELETION</button><button class="action secondary" type="button" id="p8MyMessagesRefresh">REFRESH</button></div><div id="p8MyMessages" class="cloudList" style="margin-top:9px"></div>';
  $('cloudRequests').parentElement.append(accountSupport);
  async function loadMyMessages(){
    if(!session)return;
    const rows=await db('rpc/play80_my_support_messages','POST',{});
    const list=$('p8MyMessages');list.replaceChildren();
    if(!rows?.length)list.textContent='No support messages.';
    (rows||[]).forEach(r=>{
      const card=document.createElement('div');card.className='cloudRequestItem';
      card.append(createText('strong',(r.sender==='owner'?'🛡 Owner':'👤 You')+' • '+escDate(r.at)));
      card.append(createText('small',r.category+' — '+r.body));
      list.append(card);
    });
  }
  $('p8SendMessage').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const body=$('p8SupportText').value.trim();
    if(body.length<1)throw Error('Write a message first');
    await db('rpc/play80_send_support_message','POST',{p_body:body,p_category:'general'});
    $('p8SupportText').value='';await loadMyMessages();status('Message delivered to Owner inbox.');
  }));
  $('p8RequestDeletion').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const body=$('p8SupportText').value.trim()||'I request review and deletion of my PLAY80 account.';
    if(!confirm('Submit an account deletion REQUEST to Owner? Your account will not be deleted automatically.'))return;
    await db('rpc/play80_send_support_message','POST',{p_body:body,p_category:'account_deletion'});
    $('p8SupportText').value='';await loadMyMessages();status('Account deletion request recorded. Owner will review it.');
  }));
  $('p8MyMessagesRefresh').addEventListener('click',e=>busy(e.currentTarget,loadMyMessages));
  document.querySelectorAll('[data-open="account"]').forEach(b=>b.addEventListener('click',()=>loadMyMessages().catch(()=>{})));
  const inbox=document.createElement('div');
  inbox.className='cloudStaffPane hidden';
  inbox.id='cloudStaffTab-inbox';
  inbox.innerHTML='<h3>💬 Secure Owner Inbox</h3><p class="tiny">Messages from registered players, including deletion requests. Customer passwords are never visible.</p><input id="p8InboxSearch" maxlength="80" placeholder="Search by user ID / username / email" class="cloudSelect" style="width:100%;margin-bottom:9px"><button class="action secondary" id="p8InboxRefresh" type="button">SEARCH MESSAGES</button><div id="p8OwnerInboxList" class="cloudList"></div>';
  $('cloudStaffTab-users').parentNode.append(inbox);
  const inboxTab=document.createElement('button');inboxTab.type='button';inboxTab.className='cloudStaffTab';inboxTab.dataset.staffTab='inbox';inboxTab.textContent='💬 Messages / Deletion';
  document.querySelector('.cloudStaffTabs')?.append(inboxTab);
  async function loadOwnerInbox(){
    if(!isOwner())throw Error('Owner only');
    const rows=await staffRpc('play80_owner_support_messages',{p_search:$('p8InboxSearch').value.trim()});
    const list=$('p8OwnerInboxList');list.replaceChildren();
    if(!rows.length)list.textContent='No incoming messages.';
    rows.forEach(r=>{
      const card=document.createElement('div');card.className='cloudRequestItem';
      card.append(createText('strong',(r.username||r.email||r.user_id)+' • '+r.category));
      card.append(createText('small','User ID: '+r.user_id+' | '+escDate(r.created_at)+' | '+r.sender_role));
      card.append(createText('small',r.body));
      const reply=document.createElement('input');reply.maxLength=1000;reply.placeholder='Send Owner reply to this player';card.append(reply);
      card.append(makeButton('SEND REPLY',async()=>{
        if(!reply.value.trim())throw Error('Write a reply');
        if(!confirm('Send this reply to '+r.user_id+'?'))return;
        await staffRpc('play80_owner_send_message',{p_user:r.user_id,p_note:reply.value.trim()});
        reply.value='';await loadOwnerInbox();
      }));
      list.append(card);
    });
  }
  inboxTab.addEventListener('click',()=>busy(inboxTab,async()=>{
    document.querySelectorAll('[data-staff-tab]').forEach(b=>b.classList.toggle('selected',b===inboxTab));
    document.querySelectorAll('.cloudStaffPane').forEach(p=>p.classList.toggle('hidden',p!==inbox));
    await loadOwnerInbox();
  },ownerStatus));
  $('p8InboxRefresh').addEventListener('click',e=>busy(e.currentTarget,loadOwnerInbox,ownerStatus));
  function newId(){return crypto.randomUUID?crypto.randomUUID():('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx').replace(/[xy]/g,c=>{const n=crypto.getRandomValues(new Uint8Array(1))[0]&15;return(c==='x'?n:(n&3|8)).toString(16)});}
  function attachOwnerUserTools(card,u){
    if(!isOwner()||u.role!=='player')return;
    const note=document.createElement('input');note.maxLength=200;note.placeholder='Required reason/note (at least 5 characters)';card.append(note);
    const num=document.createElement('input');num.type='number';num.min='1';num.max='1000000';num.placeholder='Demo Coins to reclaim';card.append(num);
    card.append(makeButton('↩ RECLAIM COINS',async()=>{
      const amount=Number(num.value),reason=note.value.trim();
      if(!Number.isSafeInteger(amount)||amount<1||amount>1000000||reason.length<5)throw Error('Enter 1–1,000,000 coins and a correction reason (5+ chars)');
      if(!confirm('Take back '+amount+' DEMO Coins from '+u.id+'? Reason: '+reason+'. No real money.'))return;
      const result=await staffRpc('play80_owner_reclaim_coins',{p_target_user:u.id,p_amount:amount,p_note:reason,p_operation_id:newId()});
      ownerStatus('Owner correction recorded. Remaining wallet balance: '+result.balance_after);await loadStaffUsers();
    },true));
    card.append(makeButton('💬 SEND USER NOTICE',async()=>{
      if(!note.value.trim())throw Error('Type a message');
      if(!confirm('Send this message to User ID '+u.id+'?'))return;
      await staffRpc('play80_owner_send_message',{p_user:u.id,p_note:note.value.trim()});
      ownerStatus('Message delivered to user.');
    },true));
    const suspend=makeButton('⛔ SUSPEND PLAYER',async()=>{
      const reason=note.value.trim();if(reason.length<5)throw Error('Reason required (5+ chars)');
      if(!confirm('SUSPEND Account ID '+u.id+'?\nEmail: '+u.email+'\nReason: '+reason+'\nThis blocks new sign-ins. Existing active sessions may remain until token expiry. No permanent deletion.'))return;
      await staffRpc('play80_owner_account_control',{p_target_user:u.id,p_action:'suspend',p_note:reason});
      ownerStatus('Account suspended; full account deletion was NOT performed.');
    },true);card.append(suspend);
    card.append(makeButton('✅ RESTORE PLAYER',async()=>{
      const reason=note.value.trim();if(reason.length<5)throw Error('Reason required (5+ chars)');
      if(!confirm('RESTORE player '+u.id+'?'))return;
      await staffRpc('play80_owner_account_control',{p_target_user:u.id,p_action:'restore',p_note:reason});
      ownerStatus('Account restored.');
    },true));
  }

  async function verifySavedSession(){
    if(!session)return;
    try{
      const id=session.user?.id;
      const u=await raw('/auth/v1/user','GET',null,await token());
      if(!id||!u?.id||u.id!==id||!u.email_confirmed_at)throw Error('Email verification or login expired');
      session.user=u;verifiedAuth=true;persist();renderAuth();
      await loadAccount();await loadMyMessages().catch(()=>{});
    }catch(e){
      session=null;verifiedAuth=false;profile=null;balance=null;
      persist();renderAuth();status('Sign in with your email and six-digit PIN. Email verification is required.',true);
    }
  }
  renderAuth();
  if(session)verifySavedSession();
})();
