/* play80 online account — independent of the offline local-coins simulation.
 * Public client key only; never put service_role keys in Android or web files.
 */
(() => {
  'use strict';
  const BASE = 'https://suhpmjqrcqkzaslptpca.supabase.co';
  const KEY = 'sb_publishable_8VvDZLfwAeztWeDS2EqNBQ_nlYFwFyK';
  const STORAGE = 'play80.secure_account.v1';
  const $ = (id) => document.getElementById(id);
  let menuReady=false;
  let session = null, profile = null, balance = null, verifiedAuth = false, signupRoleIntent = 'player';
  let staffPinToken = null, staffPinExpires = 0, activeGameCode = null;
  const escDate = (d) => { try { return new Date(d).toLocaleString(); } catch (_) {return '—';} };
  const status = (message, error=false) => {
    const e = $('cloudNotice');
    if(!e)return;
    e.textContent=String(message);
    e.style.color=error?'#ffb8b8':'#c5eeff';
    e.classList.toggle('p8AuthError',!!error);
    e.classList.toggle('p8AuthSuccess',!error&&!!message);
    if(message){
      e.hidden=false;
      e.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  };
  const ownerStatus = (message, error=false) => {
    const e = $('cloudOwnerNotice');
    if(e){e.textContent=String(message);e.style.color=error?'#ffb8b8':'#c5eeff';}
  };
  const show = (id,on) => { const e=$(id);if(e)e.classList.toggle('hidden',!on); };
  const stamp = () => Math.floor(Date.now()/1000);
  const persist = () => { try{if(session)localStorage.setItem(STORAGE,JSON.stringify(session));else localStorage.removeItem(STORAGE);}catch(_){} };
  try { const data=JSON.parse(localStorage.getItem(STORAGE)||'null');if(data&&data.access_token&&data.refresh_token)session=data; }catch(_){}
  const isDsr = () => session?.user?.app_metadata?.role === 'dsr';
  const isOwner = () => session?.user?.app_metadata?.role === 'owner';
  const isStaff = () => ['owner','admin'].includes(session?.user?.app_metadata?.role);
  async function raw(path,method='GET',payload=null,token=null){
    const headers={apikey:KEY};
    if(payload!==null)headers['Content-Type']='application/json';
    if(token)headers.Authorization='Bearer '+token;
    const res=await fetch(BASE+path,{method,headers,body:payload!==null?JSON.stringify(payload):undefined});
    let data;try{data=await res.json();}catch(_){data=null;}
    if(!res.ok){let err=new Error(data?.msg||data?.message||data?.error_description||data?.error||('Request failed ('+res.status+')'));err.code=data?.code||data?.error_code||'';err.status=res.status;throw err;}
    return data;
  }
  async function auth(path,method,payload){return raw('/auth/v1/'+path,method,payload);}
  function saveSession(data){
    if(!data?.access_token||!data?.refresh_token)throw Error('No session returned');
    session={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:stamp()+Number(data.expires_in||3600),user:data.user||session?.user||null};
    verifiedAuth=!!session.user?.email_confirmed_at;
    persist();renderAuth();
  }
  let refreshPending=null;
  async function token(){
    if(!session?.access_token)throw Error('Please sign in first');
    if(Number(session.expires_at||0)>=stamp()+70)return session.access_token;
    if(!refreshPending){
      const current=session;
      refreshPending=auth('token?grant_type=refresh_token','POST',{refresh_token:current.refresh_token})
        .then(data=>{
          if(session!==current)throw Error('Account changed');
          saveSession(data);
          return session.access_token;
        }).catch(e=>{
          if(session===current && (e.status===401 || ['refresh_token_not_found','refresh_token_already_used','session_not_found'].includes(e.code))){
            session=null;verifiedAuth=false;persist();renderAuth();
          }
          throw e;
        }).finally(()=>{refreshPending=null;});
    }
    return refreshPending;
  }
  async function db(path,method='GET',payload=null){return raw('/rest/v1/'+path,method,payload,await token());}
  function renderAuth(){
    const on=!!session?.access_token && verifiedAuth;
    document.body.classList.toggle('p8-auth-locked',!on);
    document.getElementById('screen-account')?.classList.toggle('hidden',!on?false:document.getElementById('screen-account')?.classList.contains('hidden'));
    if(!on)window.scrollTo(0,0);
    show('cloudSignedOut',!on);show('cloudSignedIn',on);
    show('cloudOwnerEntry',on&&isStaff());show('cloudOwnerAuthBlocked',!on||!isStaff());show('cloudStaffPinGate',on&&isStaff()&&!staffPinToken);show('cloudOwnerContent',on&&isStaff()&&!!staffPinToken);
    if(menuReady && on) renderMenu();
    if(menuReady && !on) setMenuCounts(0,0);
    if(on){$('cloudEmail').textContent=session.user?.email||'Signed in';$('cloudRole').textContent=isOwner()?'Owner':(isStaff()?'Admin':isDsr()?'DSR':'Player');}
    else {$('cloudBalance').textContent='—';$('cloudRequests').replaceChildren();}
    const ownerBadge=$('p8AccountIdentity');
    if(ownerBadge)ownerBadge.textContent=on?(isOwner()?'🛡️ Owner account':isStaff()?'🛡️ Staff account':isDsr()?'DSR account':'🎮 Player account'):'🔐 PLAY80 · Secure sign in';
    document.querySelectorAll('[data-p8-owner-only]').forEach(el=>el.classList.toggle('hidden',!on||!isOwner()));
  }
  async function loadAccount(){
    if(!session||!verifiedAuth)return;
    void refreshMenuCounts();
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
        const title=document.createElement('strong');title.textContent=(r.request_kind==='demo_credit'?'➕ ডিপোজিট':'➖ উইথড্র')+' • '+r.amount;
        const sub=document.createElement('small');const states={pending:'অপেক্ষমাণ',approved:'সফল',rejected:'প্রত্যাখ্যাত'};sub.textContent=(states[r.status]||r.status)+' • '+escDate(r.created_at)+(r.review_note?' • '+r.review_note:'');
        item.append(title,sub);list.append(item);
      });
      status('PLAY80 অ্যাকাউন্ট সিঙ্ক হয়েছে। ভার্চুয়াল কয়েনের নগদ মূল্য নেই।');
    }catch(e){status(e.message,true);}
  }
  const busy = async (button,fn,writeStatus=status) => {
    if(button.disabled)return;
    button.disabled=true;const before=button.textContent;
    button.textContent='Please wait…';
    try{await fn();}catch(e){writeStatus(e.message||String(e),true);}
    finally{
      button.disabled=false;button.textContent=before;
      if(writeStatus===status && $('cloudNotice')?.textContent) $('cloudNotice').scrollIntoView({block:'nearest',behavior:'smooth'});
    }
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
    let data;
    try{
      data=await auth('signup','POST',{email,password,data:{username,display_name:fullName,full_name:fullName,phone_number:phone,address}});
    }catch(e){
      if(e.message?.includes('45 seconds')||e.message?.includes('rate limit')||e.code==='over_email_send_rate_limit'){
        throw Error('Verification Email ইতিমধ্যে অনুরোধ করা হয়েছে। কিছুক্ষণ পরে Inbox/Spam দেখো। বারবার CREATE ACCOUNT চাপবে না।');
      }
      throw e;
    }
    if(data?.access_token && data.user?.email_confirmed_at){
      selectAuthMode(false);status('অ্যাকাউন্ট তৈরি হয়েছে। এখন ইমেইল ও PIN দিয়ে লগইন করো।');return;
    }
    $('cloudLoginPassword').value='';
    $('p8SignupConfirmPIN').value='';
    const result=$('p8SignupResult');
    if(result){result.hidden=false;result.textContent='✅ Registration অনুরোধ সফল। এখন ইমেইলের Verification Link খুলে অ্যাকাউন্ট চালু করো। পুনরায় Create Account চাপবে না।';}
    status('✅ Registration অনুরোধ সফল! '+email+'-এর Inbox এবং Spam-এ Verification Email দেখো।');
  }));
  $('cloudLogin').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const email=$('cloudLoginEmail').value.trim().toLowerCase();const password=$('cloudLoginPassword').value;
    if(!email||!/^[0-9]{6}$/.test(password))throw Error('Enter email and your six-digit PIN');
    let data;
    try{data=await auth('token?grant_type=password','POST',{email,password});}
    catch(e){
      if(e.code==='email_not_confirmed')throw Error('প্রথমে ইমেইল যাচাই করো। দরকার হলে যাচাই ইমেইল আবার পাঠাও।');
      if(e.code==='invalid_credentials')throw Error('ইমেইল বা PIN মেলেনি। ভুলে গেলে PIN রিসেট করো।');
      throw e;
    }
    const remote=await raw('/auth/v1/user','GET',null,data.access_token);
    if(!remote?.id||remote.id!==data.user?.id||!remote.email_confirmed_at)throw Error('প্রথমে ইমেইল Verify করতে হবে।');
    staffPinToken=null;staffPinExpires=0;
    saveSession({...data,user:remote});$('cloudLoginPassword').value='';
    await loadAccount();
    if(isStaff())document.querySelector('[data-open="remote-owner"]')?.click();
    else document.querySelector('[data-open="home"]')?.click();
    status('স্বাগতম! '+(isOwner()?'Owner':isStaff()?'Staff / Admin':isDsr()?'DSR':'Player')+' অ্যাকাউন্টে লগইন সফল।');
  }));
  const recovery=document.createElement('details');
  recovery.innerHTML='<summary>ইমেইল পেয়েছ? নতুন PIN সেট করো</summary><form><label>ইমেইলের রিসেট লিংক (লিংক কপি করো) অথবা কোড<input name="proof" required autocomplete="off"></label><label>নতুন ছয় সংখ্যার PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" required autocomplete="new-password"></label><label>আবার PIN লিখো<input name="repeatPin" type="password" required autocomplete="new-password"></label><button>PIN সংরক্ষণ</button></form>';
  $('cloudRecover').after(recovery);
  const resend=document.createElement('button');
  resend.type='button';resend.textContent='যাচাই ইমেইল আবার পাঠাও';
  recovery.after(resend);
  resend.onclick=()=>busy(resend,async()=>{
    const email=$('cloudLoginEmail').value.trim();
    if(!email)throw Error('প্রথমে ইমেইল লিখো।');
    await auth('resend','POST',{email,type:'signup'});
    status('ইমেইল যাচাই বাকি থাকলে Inbox ও Spam দেখো।');
  });
  $('cloudRecover').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const email=$('cloudLoginEmail').value.trim().toLowerCase();
    if(!email)throw Error('PIN রিসেটের জন্য প্রথমে ইমেইল লিখো');
    await auth('recover','POST',{email});
    recovery.open=true;
    status('ইমেইলের রিসেট লিংকটি খোলার আগে কপি করে নিচে বসাও। কোড থাকলে সেটিও ব্যবহার করা যাবে।');
  }));
  const resetForm=recovery.querySelector('form');
  let recoveryGrant=null;
  resetForm.onsubmit=e=>{
    e.preventDefault();
    busy(resetForm.querySelector('button'),async()=>{
      const fields=resetForm.elements;
      const proof=fields.proof.value.trim(),pin=fields.pin.value;
      if(!/^[0-9]{6}$/.test(pin)||pin!==fields.repeatPin.value)throw Error('দুই ঘরে একই ছয় সংখ্যার PIN দাও।');
      const email=$('cloudLoginEmail').value.trim().toLowerCase();
      if(!recoveryGrant||recoveryGrant.proof!==proof||recoveryGrant.email!==email){
        let payload;
        if(/^[0-9]{6,10}$/.test(proof))payload={email,token:proof,type:'recovery'};
        else{
          const link=new URL(proof);
          if(link.origin!==BASE||link.pathname!=='/auth/v1/verify'||link.searchParams.get('type')!=='recovery'||!link.searchParams.get('token'))throw Error('সর্বশেষ PLAY80 রিসেট ইমেইলের মূল লিংক কপি করো।');
          payload={token_hash:link.searchParams.get('token'),type:'recovery'};
        }
        const grant=await auth('verify','POST',payload);
        if(!grant?.access_token)throw Error('নতুন রিসেট ইমেইল চাও।');
        recoveryGrant={proof,email,token:grant.access_token};
      }
      try{await raw('/auth/v1/user','PUT',{password:pin},recoveryGrant.token);}
      catch(e){if(e.status===401||e.status===403)recoveryGrant=null;throw e;}
      const old=recoveryGrant.token;
      recoveryGrant=null;resetForm.reset();recovery.open=false;
      await raw('/auth/v1/logout?scope=local','POST',null,old).catch(()=>{});
      selectAuthMode(false);status('PIN বদলেছে। নতুন PIN দিয়ে লগইন করো।');
    });
  };
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
    dsrForm.reset();
    showStaffPinSetup(false);
    const oldAccessToken=session?.access_token;
    session=null;profile=null;balance=null;staffPinToken=null;staffPinExpires=0;verifiedAuth=false;
    persist();renderAuth();
    document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('hidden',el.id!=='screen-account'));
    selectAuthMode(false);
    status('এই ডিভাইস থেকে লগআউট হয়েছে।');
    // Clear local access immediately; separately attempt GoTrue token revocation.
    if(oldAccessToken){
      try{await raw('/auth/v1/logout','POST',null,oldAccessToken);}
      catch(_){status('এই ডিভাইস থেকে লগআউট হয়েছে; সার্ভারের Session বাতিল নিশ্চিত করা যায়নি।',true);}
    }
  }));
  $('p8OwnerLogout')?.addEventListener('click',()=>$('cloudSignOut').click());
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
  function showStaffPinSetup(setup) {
    show('cloudStaffPinSetup',setup);
    show('cloudStaffUnlockField',!setup);
    show('cloudStaffUnlockActions',!setup);
    for(const id of ['cloudStaffPin','cloudStaffNewPin','cloudStaffConfirmPin'])$(id).value='';
    if(setup)$('cloudStaffNewPin').focus();
  }
  function staffOpenGate() {
    staffPinToken=null;staffPinExpires=0;
    show('cloudOwnerContent',false);show('cloudStaffPinGate',isStaff());
    showStaffPinSetup(false);
    ownerStatus(isStaff()?'Staff PIN লিখুন। প্রথমবার হলে PIN সেট করুন।':'যাচাইকৃত Owner বা Admin অ্যাকাউন্টে লগইন করুন।',!isStaff());
  }
  $('cloudStaffCreatePin').addEventListener('click',()=>{
    showStaffPinSetup(true);
    ownerStatus('নতুন Staff PIN লিখুন এবং একই PIN আবার দিন।');
  });
  $('cloudStaffCancelPin').addEventListener('click',staffOpenGate);
  async function unlockStaffPanel(pin) {
    let data;
    try{data=await db('rpc/staff_unlock_pin','POST',{p_pin:pin});}
    catch(e){
      if(e.message==='PIN not set yet'){
        showStaffPinSetup(true);
        ownerStatus('Staff PIN এখনও সেট হয়নি। নিচের দুই ঘরে নতুন PIN লিখুন।');
        return;
      }
      throw e;
    }
    if(!data?.ok||!data.token)throw Error(data?.message||'Staff PIN যাচাই করা যায়নি।');
    staffPinToken=data.token;staffPinExpires=Date.now()+Math.max(0,Number(data.expires_in||180)-8)*1000;
    showStaffPinSetup(false);
    show('cloudStaffPinGate',false);show('cloudOwnerContent',true);
    ownerStatus('Owner প্যানেল খুলেছে।');
    await switchStaffTab(requestedStaffTab);await refreshMenuCounts();
  }
  $('cloudStaffSavePin').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const pin=$('cloudStaffNewPin').value;
    if(!/^[0-9]{6}$/.test(pin))throw Error('নতুন Staff PIN-এ ইংরেজি ৬টি সংখ্যা দিন।');
    if(pin!==$('cloudStaffConfirmPin').value)throw Error('দুই ঘরের PIN মিলছে না।');
    try{await db('rpc/staff_set_pin','POST',{p_pin:pin});}
    catch(e){
      if(!e.message.startsWith('PIN already configured'))throw e;
      showStaffPinSetup(false);
      ownerStatus('Staff PIN আগে থেকেই সেট আছে। সেই PIN দিয়ে প্যানেল খুলুন।',true);
      return;
    }
    showStaffPinSetup(false);
    ownerStatus('Staff PIN সেভ হয়েছে। প্যানেল খুলছে…');
    await unlockStaffPanel(pin);
  },ownerStatus));
  $('cloudStaffUnlock').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const pin=$('cloudStaffPin').value;
    if(!/^[0-9]{6}$/.test(pin))throw Error('Staff PIN-এ ইংরেজি ৬টি সংখ্যা দিন।');
    $('cloudStaffPin').value='';
    await unlockStaffPanel(pin);
  },ownerStatus));
  function makeOwnerItem(r){
    const el=document.createElement('div');el.className='cloudRequestItem';
    el.append(createText('strong',(r.request_kind==='demo_credit'?'➕ ডিপোজিট':'➖ উইথড্র')+' • '+r.amount+' demo coins'));
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
    await refreshMenuCounts();
  }
  let userPage=0, selectedUser=null;
  async function loadStaffUsers(){
    const search=$('cloudStaffSearch').value.trim();
    const rows=await staffRpc('play80_staff_user_page',{p_search:search,p_offset:userPage*50});
    const extra=rows.length>50;
    const list=$('cloudStaffUsers');list.replaceChildren();
    if(!rows.length)list.textContent='No matching users.';
    const viewed=rows.slice(0,50).find(u=>u.id===selectedUser);
    if(viewed){renderProfile(viewed);return;}
    selectedUser=null;
    rows.slice(0,50).forEach(u=>{
      const row=document.createElement('div');row.className='cloudRequestItem';
      row.append(createText('strong',u.display_name||u.username||u.email||u.id));
      row.append(createText('small',u.email||u.id));
      row.append(makeButton('প্রোফাইল দেখুন',async()=>renderProfile(u)));
      list.append(row);
    });
    const pager=document.createElement('div');pager.className='cloudActions';
    if(userPage) pager.append(makeButton('আগের পাতা',async()=>{userPage--;await loadStaffUsers();}));
    if(extra) pager.append(makeButton('পরের পাতা',async()=>{userPage++;await loadStaffUsers();}));
    list.append(pager);
    function renderProfile(u){
      selectedUser=u.id;list.replaceChildren();
      list.append(makeButton('← ইউজার তালিকা',async()=>{selectedUser=null;await loadStaffUsers();}));
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
    }
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
    if(tab==='inbox'){inboxTab.click();return;}
    if(!['wallet','users','admins','activity','stats','bots','tournaments'].includes(tab))return;
    document.querySelectorAll('[data-staff-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.staffTab===tab));
    document.querySelectorAll('.cloudStaffPane').forEach(el=>el.classList.toggle('hidden',el.id!=='cloudStaffTab-'+tab));
    if(tab==='wallet')await loadOwnerRequests();
    if(tab==='users'){selectedUser=null;await loadStaffUsers();}
    if(tab==='admins')await loadAdmins();
    if(tab==='activity')await loadActivity();
    if(tab==='stats')await loadStats();
    if(tab==='bots')await loadBotOwner();
    if(tab==='tournaments')await loadTournamentOwner();
  }
  document.querySelectorAll('[data-staff-tab]').forEach(btn=>btn.addEventListener('click',()=>busy(btn,()=>switchStaffTab(btn.dataset.staffTab),ownerStatus)));
  $('cloudOwnerRefresh').addEventListener('click',e=>busy(e.currentTarget,loadOwnerRequests,ownerStatus));
  $('cloudStaffSearchButton').addEventListener('click',e=>busy(e.currentTarget,async()=>{userPage=0;selectedUser=null;await loadStaffUsers();},ownerStatus));
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
  modePanel.className='p8AuthModes p8AuthModesSimple';
  modePanel.innerHTML='<button type="button" id="p8ModeLogin" class="selected">SIGN IN</button><button type="button" id="p8ModeSignup">SIGN UP</button>';
  cloudSignedOut.querySelector('.sectionTitle').after(modePanel);
  const modeHelp=document.createElement('p');modeHelp.id='p8ModeHelp';modeHelp.className='tiny';
  modePanel.after(modeHelp);
  const firstOwner=document.createElement('button');
  firstOwner.type='button';firstOwner.id='p8FirstOwnerSignup';firstOwner.className='p8OwnerCreateLink';
  firstOwner.textContent='🛡️ Create Owner Account';
  // Distinct signup *entry*, not a client-assigned privileged role.
  cloudSignedOut.append(firstOwner);
  firstOwner.addEventListener('click',()=>{
    selectAuthMode(true,true);
    status('Owner Role কেবল সার্ভারে অনুমোদিত ও ভেরিফাইড ইমেইল পাবে। অ্যাপের এই বাটন নিজে Owner অনুমতি দেয় না।');
  });
  function selectAuthMode(signup=false,owner=false){
    recoveryGrant=null;resetForm.reset();recovery.open=false;recovery.hidden=signup;resend.hidden=signup;
    signupRoleIntent=owner?'owner':'player';
    const emailGroup=$('cloudLoginEmail').closest('.formGroup'),pinGroup=$('cloudLoginPassword').closest('.formGroup');
    if(signup&&$('p8SignupConfirmPIN')){emailGroup.after(regName);$('p8SignupConfirmPIN').closest('.formGroup').before(pinGroup);}
    else emailGroup.after(pinGroup);
    regName.classList.toggle('hidden',!signup);
    $('p8RegistrationFields')?.classList.toggle('hidden',!signup);
    $('cloudRegister').classList.toggle('hidden',!signup);
    $('cloudLogin').classList.toggle('hidden',signup);
    $('p8ModeSignup').classList.toggle('selected',signup);
    $('p8ModeLogin').classList.toggle('selected',!signup);
    $('cloudLoginPassword').autocomplete=signup?'new-password':'current-password';
    $('cloudLoginPassword').value='';
    modeHelp.textContent=signup?(owner?'Owner Account: শুধু সার্ভারে অনুমোদিত ইমেইল Owner হতে পারবে।':'নতুন Player Account: Email, User ID, Mobile, Name, Address ও ৬ সংখ্যার PIN দাও।'):'একই Email ও PIN দিয়ে Owner, Staff/DSR অথবা Player লগইন করো। সার্ভার Role অনুযায়ী সঠিক প্যানেল খুলবে।';
    firstOwner.classList.toggle('hidden',signup);
    signupResult.hidden=true;
    status('');
    $('cloudNotice').hidden=true;
    window.scrollTo(0,0);
  }
  $('p8ModeLogin').addEventListener('click',()=>selectAuthMode(false));
  $('p8ModeSignup').addEventListener('click',()=>selectAuthMode(true));
  const signupResult=document.createElement('div');
  signupResult.id='p8SignupResult';signupResult.hidden=true;
  signupResult.setAttribute('role','status');
  $('cloudRegister').after(signupResult);
  $('cloudLogin').after($('cloudNotice'));
  $('cloudNotice').hidden=true;
  selectAuthMode(false,false);
  const regFields=document.createElement('div');
  regFields.id='p8RegistrationFields';
  regFields.innerHTML=`<div class="formGroup"><label for="p8SignupPhone">Mobile number</label><input id="p8SignupPhone" inputmode="tel" autocomplete="tel" maxlength="18" placeholder="01XXXXXXXXX" required></div>
    <div class="formGroup"><label for="p8SignupFullName">Full name</label><input id="p8SignupFullName" maxlength="100" autocomplete="name" placeholder="Full legal name" required></div>
    <div class="formGroup"><label for="p8SignupAddress">Address</label><textarea id="p8SignupAddress" maxlength="250" autocomplete="street-address" placeholder="Full address" rows="3" required></textarea></div>
    <div class="formGroup"><label for="p8SignupConfirmPIN">Confirm six-digit PIN</label><input id="p8SignupConfirmPIN" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" placeholder="●●●●●●" required></div>`;
  $('cloudLoginPassword').closest('.formGroup').after(regFields);
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
      if(r.sender_role==='player'&&!r.owner_read_at){
        card.append(makeButton('পড়া হয়েছে চিহ্নিত করুন',async()=>{
          await staffRpc('play80_mark_support_read',{p_message:r.id});
          await loadOwnerInbox();await refreshMenuCounts();
        }));
      }
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

  const dsrPanel=document.createElement('details');
  dsrPanel.dataset.p8OwnerOnly='';
  dsrPanel.innerHTML='<summary>DSR অ্যাকাউন্ট তৈরি</summary><form></form>';
  const dsrForm=dsrPanel.querySelector('form');
  for(const [name,label,type] of [
    ['email','DSR ইমেইল','email'],['username','User ID','text'],['phone_number','মোবাইল','tel'],
    ['full_name','পূর্ণ নাম','text'],['address','ঠিকানা','text'],['pin','প্রাথমিক ছয় সংখ্যার PIN','password']]){
    const wrapper=document.createElement('label'),input=document.createElement('input');
    wrapper.textContent=label;input.type=type;input.name=name;input.required=true;
    if(name==='pin'){input.pattern='[0-9]{6}';input.inputMode='numeric';input.autocomplete='new-password';}
    wrapper.append(input);dsrForm.append(wrapper);
  }
  const createDsr=document.createElement('button');createDsr.textContent='DSR তৈরি করে যাচাই ইমেইল পাঠাও';
  dsrForm.append(createDsr);$('cloudStaffTab-admins').prepend(dsrPanel);
  dsrForm.onsubmit=e=>{
    e.preventDefault();
    busy(createDsr,async()=>{
      if(!isOwner()||!staffPinToken)throw Error('Owner action PIN required');
      const fields=Object.fromEntries(new FormData(dsrForm));
      fields.email=fields.email.trim().toLowerCase();fields.username=fields.username.trim().toLowerCase();
      const result=await raw('/functions/v1/play80-create-dsr','POST',{...fields,pin_token:staffPinToken},await token());
      dsrForm.reset();ownerStatus(result.message);
    },ownerStatus);
  };
  let requestedStaffTab='stats';
  const signedIn=$('cloudSignedIn');
  const ownProfile=document.createElement('section');
  const ownWallet=document.createElement('section');
  const ownBonus=document.createElement('section');
  const referral=document.createElement('section');
  const profileField=$('cloudUsername').closest('.formGroup');
  const bonusCard=$('cloudBonusEarned').closest('.play80Surface');
  const requestTitle=bonusCard.nextElementSibling;
  const requestFields=[];
  for(let field=requestTitle;field&&field!==$('cloudRefresh');field=field.nextElementSibling)requestFields.push(field);
  ownProfile.append(profileField);
  ownWallet.append($('cloudBalance').closest('.hubStat'),...requestFields,$('cloudRefresh'));
  ownBonus.append(bonusCard);
  referral.append(createText('h2','রেফার বোনাস'),createText('p','বন্ধুকে PLAY80-এর আমন্ত্রণ লিংক পাঠাও। রেফার বোনাসের নিয়ম এখনো চালু হয়নি।'));
  referral.append(makeButton('আমন্ত্রণ লিংক দেখুন',async()=>{
    if(referral.querySelector('input'))return;
    const url=document.createElement('input');
    url.readOnly=true;url.value='https://github.com/alifhosen302/play80/releases/download/qa-v5.2-unified-login-20261125/PLAY80_V5_2_GitHub_QA.apk';
    url.setAttribute('aria-label','PLAY80 আমন্ত্রণ লিংক');referral.append(url);url.select();
  }));
  const accountSections={profile:ownProfile,wallet:ownWallet,bonus:ownBonus,referral,support:accountSupport};
  for(const section of Object.values(accountSections)){
    section.classList.add('p8-menu-section');signedIn.append(section);
  }
  function selectAccountSection(name){
    for(const [key,section] of Object.entries(accountSections))section.hidden=key!==name;
  }
  selectAccountSection('profile');
  const accountLinks=[...document.querySelectorAll('.footerNav [data-open="account"]')];
  accountLinks[0]?.addEventListener('click',()=>selectAccountSection('wallet'));
  accountLinks[1]?.addEventListener('click',()=>selectAccountSection('support'));
  $('cloudRequestKind').addEventListener('change',()=>{
    const debit=$('cloudRequestKind').value==='demo_debit';
    $('cloudAmount').min=debit?'200':'100';
    $('cloudAmount').max=debit?'1000000':'20000';
  });
  const dot=(element,on)=>element?.toggleAttribute('data-alert',on);
  let pendingRequests=0, unreadSupport=0;
  function setMenuCounts(requests,support){
    pendingRequests=requests;unreadSupport=support;
    dot($('p8MenuButton'),requests>0||support>0);
    for(const key of ['wallet','inbox']){
      const active=(key==='wallet'?requests:support)>0;
      dot($('p8MenuItems').querySelector('[data-panel="'+key+'"]'),active);
      dot(document.querySelector('[data-staff-tab="'+key+'"]'),active);
    }
  }
  let countsPending=false;
  async function refreshMenuCounts(){
    if(!verifiedAuth||!isStaff()||countsPending)return;
    const id=session?.user?.id;
    countsPending=true;
    try{
      const result=await db('rpc/play80_menu_counts','POST',{});
      if(verifiedAuth&&session?.user?.id===id)setMenuCounts(Number(result?.requests||0),Number(result?.support||0));
    }catch(_){/* Keep the previous count until the connection recovers. */}
    finally{countsPending=false;}
  }
  function renderMenu(){
    const root=$('p8MenuItems');
    root.replaceChildren();
    const add=(label,action,panel)=>{
      const button=makeButton(label,action,true);
      if(panel){button.dataset.panel=panel;button.classList.add('p8-menu-item');}
      root.append(button);
    };
    const account=(section,kind)=>async()=>{
      document.dispatchEvent(new CustomEvent('play80:menu-navigate',{detail:'account'}));selectAccountSection(section);
      if(kind){
        $('cloudRequestKind').value=kind;
        $('cloudRequestKind').dispatchEvent(new Event('change'));
        $('cloudAmount').value=$('cloudAmount').min;
      }
      if(section==='support')await loadMyMessages();
      else if(section!=='referral')await loadAccount();
    };
    const staff=tab=>async()=>{
      requestedStaffTab=tab;
      document.dispatchEvent(new CustomEvent('play80:menu-navigate',{detail:'remote-owner'}));
      if(staffPinToken&&Date.now()<staffPinExpires)await switchStaffTab(tab);
      else if(staffPinToken){staffPinToken=null;renderAuth();}
    };
    add('প্রোফাইল',account('profile'));
    if(isStaff()){
      add('ড্যাশবোর্ড',staff('stats'));
      add('ইউজার দেখুন',staff('users'));
      add('ডিপোজিট ও উইথড্র রিকোয়েস্ট',staff('wallet'),'wallet');
      add('বোনাস',account('bonus'));
      if(isOwner())add('সাপোর্ট',staff('inbox'),'inbox');
      add('স্টাফ অ্যাকাউন্ট',staff('admins'));
      add('লাইভ গেম',staff('activity'));
      add('টুর্নামেন্ট',staff('tournaments'));
      add('কম্পিউটার প্লেয়ার',staff('bots'));
    }else{
      add('ডিপোজিট',account('wallet','demo_credit'));
      add('উইথড্র',account('wallet','demo_debit'));
      add('কয়েনের হিসাব ও রিকোয়েস্ট',account('wallet'));
      add('বোনাস',account('bonus'));
      add('রেফার বোনাস',account('referral'));
      add('সাপোর্ট',account('support'));
    }
    add('লগআউট',async()=>$('cloudSignOut').click());
    setMenuCounts(pendingRequests,unreadSupport);
  }
  document.querySelectorAll('[data-staff-tab="wallet"],[data-staff-tab="inbox"]').forEach(el=>el.classList.add('p8-menu-item'));
  $('p8MenuButton').addEventListener('click',()=>{renderMenu();void refreshMenuCounts();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshMenuCounts();});
  setInterval(()=>{if(!document.hidden)void refreshMenuCounts();},20000);
  menuReady=true;
  async function verifySavedSession(){
    if(!session)return;
    try{
      const id=session.user?.id;
      const u=await raw('/auth/v1/user','GET',null,await token());
      if(!id||!u?.id||u.id!==id||!u.email_confirmed_at)throw Object.assign(Error('Email verification or login expired'),{status:401});
      session.user=u;verifiedAuth=true;persist();renderAuth();
      await loadAccount();await loadMyMessages().catch(()=>{});
      if(isStaff())$('cloudOwnerEntry')?.click();
    }catch(e){
      if(session && e.status!==401 && e.status!==403){
        verifiedAuth=false;renderAuth();status('সংযোগ যাচাই করা যায়নি। ইন্টারনেট ফিরলে আবার চেষ্টা করো।',true);return;
      }
      session=null;verifiedAuth=false;profile=null;balance=null;
      persist();renderAuth();status('Sign in with your email and six-digit PIN. Email verification is required.',true);
    }
  }
  renderAuth();
  window.addEventListener('online',()=>{if(session&&!verifiedAuth)verifySavedSession();});
  if(session)verifySavedSession();
})();
