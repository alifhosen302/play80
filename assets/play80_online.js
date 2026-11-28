/* play80 online account — independent of the offline local-coins simulation.
 * Public client key only; never put service_role keys in Android or web files.
 */
(() => {
  'use strict';
  const BASE = 'https://suhpmjqrcqkzaslptpca.supabase.co';
  const KEY = 'sb_publishable_8VvDZLfwAeztWeDS2EqNBQ_nlYFwFyK';
  const STORAGE = 'play80.secure_account.v1';
  const APK_DOWNLOAD = 'https://github.com/alifhosen302/play80/releases/download/qa-v5.2-unified-login-20261125/PLAY80.apk';
  const $ = (id) => document.getElementById(id);
  let menuReady=false;
  let session = null, profile = null, balance = null, verifiedAuth = false, signupRoleIntent = 'player';
  let activeGameCode = null;
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
    const e = $(walletOpen()?'play80WalletNotice':'cloudOwnerNotice');
    if(e){e.textContent=String(message);e.style.color=error?'#ffb8b8':'#c5eeff';}
  };
  const show = (id,on) => { const e=$(id);if(e)e.classList.toggle('hidden',!on); };
  const walletOpen=()=>$('screen-owner-wallet')&&!$('screen-owner-wallet').classList.contains('hidden');
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
    show('cloudOwnerEntry',on&&isStaff());show('cloudOwnerAuthBlocked',!on||!isStaff());show('cloudOwnerContent',on&&isStaff());show('play80OwnerWalletContent',on&&isStaff());
    if(menuReady && on){renderMenu();syncFooter();}
    if(menuReady)renderIdentity();
    if(menuReady && !on){
      setMenuCounts(0,0);turnoverList.replaceChildren();rewardData=null;referralLink.value='';referralTotal.textContent='';
      copyNote.textContent='';countdown.textContent='—';claim.textContent='৫,০০০ কয়েন · ক্লেম —';
      dailyStatus.textContent='';referralStatus.textContent='';nextRewardCheck=0;renderDailyClaim();renderReferralClaims();
      $('p8MyMessages').replaceChildren();$('p8OwnerInboxList').replaceChildren();
      $('p8SupportText').value='';supportReceipt.hidden=true;
      supportSignature='';activeOwnerThread=null;
    }
    if(on){$('cloudEmail').textContent=session.user?.email||'Signed in';$('cloudRole').textContent=isOwner()?'Owner':(isStaff()?'Admin':isDsr()?'DSR':'Player');}
    else {$('cloudBalance').textContent='—';$('cloudRequests').replaceChildren();}
    const ownerBadge=$('p8AccountIdentity');
    if(ownerBadge)ownerBadge.textContent=on?(isOwner()?'🛡️ Owner account':isStaff()?'🛡️ Staff account':isDsr()?'DSR account':'🎮 Player account'):'🔐 PLAY80 · Secure sign in';
    show('p8StaffCreate',on&&isStaff());
    show('p8CreateAdmin',on&&isOwner());
    if(!on||!isOwner()&&staffCreateForm.dataset.role==='admin')hideStaffForm();
  }
  let accountLoadVersion=0, firstCreditEligible=false;
  async function loadAccount(){
    if(!session||!verifiedAuth)return;
    const version=++accountLoadVersion;
    const id=session.user?.id;
    const stillCurrent=()=>version===accountLoadVersion&&verifiedAuth&&session?.user?.id===id;
    void refreshMenuCounts();
    try{
      if(!id)throw Error('User account is missing from the session');
      const key=encodeURIComponent(id);
      const [profiles,wallets]=await Promise.all([
        db('profiles?select=username,display_name,full_name,phone_number,address_text,created_at&id=eq.'+key+'&limit=1'),
        db('demo_wallets?select=balance,held_balance&user_id=eq.'+key+'&limit=1')
      ]);
      if(!stillCurrent())return;
      profile=profiles?.[0]||{};
      $('cloudUsername').value=profile.username||'';
      $('cloudUsername').readOnly=!!profile.username;
      $('cloudSaveUsername').disabled=!!profile.username;
      $('cloudSaveUsername').textContent=profile.username?'USERNAME LOCKED':'SAVE USERNAME';
      balance=wallets?.[0]||{balance:0,held_balance:0};
      $('cloudBalance').textContent=String(Number(balance.balance)-Number(balance.held_balance));
      renderIdentity();
      try{
        const approvedCredits=await db('demo_wallet_requests?select=id&user_id=eq.'+key+'&request_kind=eq.demo_credit&status=eq.approved&limit=1');
        if(!stillCurrent())return;
        firstCreditEligible=Array.isArray(approvedCredits)&&approvedCredits.length===0;
        showFirstCreditOffer();
      }catch(_){if(stillCurrent()){firstCreditEligible=false;showFirstCreditOffer();}}
      try{
        const bonusRows=await db('bonus_transactions?select=amount&user_id=eq.'+encodeURIComponent(id)+'&limit=2');
        if(!stillCurrent())return;
        const earned=(bonusRows||[]).reduce((s,b)=>s+Number(b.amount||0),0);
        $('cloudBonusEarned').textContent=earned.toLocaleString();
      }catch(_){if(stillCurrent())$('cloudBonusEarned').textContent='—';}

      if(!stillCurrent())return;
      $('cloudHeld').textContent=String(balance.held_balance||0);
      const requests=await db('demo_wallet_requests?select=id,request_kind,amount,status,created_at,review_note&user_id=eq.'+encodeURIComponent(id)+'&order=created_at.desc&limit=25');
      if(!stillCurrent())return;
      const list=$('cloudRequests');list.replaceChildren();
      if(!requests?.length)list.textContent='No online requests yet.';
      (requests||[]).forEach(r=>{
        const item=document.createElement('div');item.className='cloudRequestItem';
        const title=document.createElement('strong');title.textContent=(r.request_kind==='demo_credit'?'➕ ডিপোজিট':'➖ উইথড্র')+' • '+r.amount;
        const sub=document.createElement('small');const states={pending:'অপেক্ষমাণ',approved:'সফল',rejected:'প্রত্যাখ্যাত'};sub.textContent=(states[r.status]||r.status)+' • '+escDate(r.created_at)+(r.review_note?' • '+r.review_note:'');
        item.append(title,sub);list.append(item);
      });
    }catch(e){if(stillCurrent())status(e.message,true);}
  }
  const busy = async (button,fn,writeStatus=status) => {
    if(button.disabled)return;
    const label=button.querySelector('.p8-menu-label')||button;
    button.disabled=true;const before=label.textContent;
    label.textContent='অপেক্ষা করুন…';
    try{await fn();}catch(e){writeStatus(e.message||String(e),true);}
    finally{
      button.disabled=false;label.textContent=before;
      if(writeStatus===status && $('cloudNotice')?.textContent) $('cloudNotice').scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  };
  $('cloudRegister').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const email=$('cloudLoginEmail').value.trim().toLowerCase();
    const password=$('cloudLoginPassword').value;
    if(!email||!/^[0-9]{6}$/.test(password))throw Error('Enter your email and a six-digit PIN');
    const username=$('cloudRegistrationUsername')?.value.trim().toLowerCase();
    if(!/^[a-z0-9_]{3,24}$/.test(username||''))throw Error('Choose a unique username of 3–24 English letters, digits or _');
    const referralInput=signupRoleIntent==='player'?$('p8SignupReferral').value.trim():'';
    let referralCode=referralInput.toLowerCase();
    if(referralInput.startsWith('https://')){
      try{referralCode=new URL(referralInput).searchParams.get('ref')?.toLowerCase()||'';}catch(_){referralCode='';}
    }
    if(referralInput&&!/^[a-z0-9_]{3,24}$/.test(referralCode))throw Error('সঠিক রেফার কোড বা আমন্ত্রণ লিংক লিখুন।');
    const phone=$('p8SignupPhone').value.trim().replace(/[\s-]/g,'');
    const fullName=$('p8SignupFullName').value.trim();
    const address=$('p8SignupAddress').value.trim();
    if(!/^\+?[0-9]{10,15}$/.test(phone))throw Error('Enter a valid mobile number, 10–15 digits');
    if(fullName.length<3||fullName.length>100)throw Error('Enter your full name');
    if(address.length<8||address.length>250)throw Error('Enter your full address');
    if($('p8SignupConfirmPIN').value!==password)throw Error('PIN entries do not match');
    let data;
    try{
      data=await auth('signup','POST',{email,password,data:{username,display_name:fullName,full_name:fullName,phone_number:phone,address,...(referralCode?{play80_referral:referralCode}:{})}});
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
    const pin=await askLoginPin('ইউজারনেম সেভ করুন');
    if(pin===null)return;
    requirePinSuccess(await db('rpc/play80_confirm_username','POST',{p_pin:pin,p_username:username}));
    await loadAccount();status('Unique username saved.');
  }));
  $('cloudSubmit').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    if(!profile?.username)throw Error('First save your unique username');
    const type=$('cloudRequestKind').value;
    const amount=Number($('cloudAmount').value);
    const reference=$('cloudNote').value.trim();
    if(type==='demo_credit'&&!reference)throw Error('ডেমো ট্রান্সেকশন নম্বর লিখুন।');
    if(!Number.isSafeInteger(amount)||amount<1)throw Error('Enter a whole number of coins');
    if(type==='demo_credit'&&(amount<100||amount>20000))throw Error('Request between 100 and 20,000 coins');
    if(type==='demo_debit'&&(amount<200||amount>1000000))throw Error('Remove between 200 and 1,000,000 coins');
    if(type==='demo_debit'){
      const viewer=session?.user?.id;
      const record=await readTurnover();
      if(!verifiedAuth||session?.user?.id!==viewer||signedIn.dataset.section!=='wallet')return;
      if(!record||record.withdrawal_guard_enabled&&amount>record.withdrawable){
        showTurnover(record);
        return;
      }
    }
    try{
      if(type==='demo_credit'){
        requirePinSuccess(await db('rpc/play80_submit_demo_credit','POST',{p_amount:amount,p_reference:reference}));
      }else{
        const pin=await askLoginPin('উইথড্র রিকোয়েস্ট · '+amount+' ভার্চুয়াল কয়েন');
        if(pin===null)return;
        requirePinSuccess(await db('rpc/play80_confirm_wallet_request','POST',{p_pin:pin,p_kind:type,p_amount:amount,p_note:null}));
      }
    }catch(error){
      if(type!=='demo_debit'||!error.message.includes('PLAY80_TURNOVER_PENDING'))throw error;
      await openAccountPage('turnover');
      return;
    }
    $('cloudNote').value='';await loadAccount();
    showWalletResponse('রিকোয়েস্ট পাঠানো হয়েছে। সিদ্ধান্ত রিকোয়েস্টের ইতিহাসে দেখাবে।');
  },showWalletResponse));
  $('cloudRefresh').addEventListener('click',e=>busy(e.currentTarget,loadAccount));
  $('cloudSignOut').hidden=true;
  $('cloudSignOut').style.setProperty('display','none','important');
  $('cloudSignOut').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    hideStaffForm();
    if(pinDialog.open)pinDialog.close('cancel');
    const oldAccessToken=session?.access_token;
    ++accountLoadVersion;
    firstCreditEligible=false;
    showFirstCreditOffer();
    session=null;profile=null;balance=null;verifiedAuth=false;
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
  async function staffRpc(name, data={}) {
    if(!isStaff()) throw Error('Verified Owner / Admin login required');
    return db('rpc/'+name,'POST',{p_pin_token:null,...data});
  }
  const createText=(tag,content,cls='')=>{const el=document.createElement(tag);el.textContent=String(content??'');if(cls)el.className=cls;return el;};
  const makeButton=(title,fn,secondary=false,writeStatus=ownerStatus)=>{
    const b=document.createElement('button');b.type='button';b.className='action'+(secondary?' secondary':'');
    b.textContent=title;b.addEventListener('click',()=>busy(b,fn,writeStatus));return b;
  };
  const pinDialog=$('play80ActionPin');
  function askLoginPin(title){
    return new Promise(resolve=>{
      if(pinDialog.open){resolve(null);return;}
      $('play80ActionTitle').textContent=title;
      const field=$('play80ActionPinValue');
      field.value='';pinDialog.returnValue='';
      pinDialog.addEventListener('close',()=>{
        const pin=pinDialog.returnValue==='confirm'?field.value:null;
        field.value='';resolve(pin);
      },{once:true});
      pinDialog.showModal();field.focus();
    });
  }
  function requirePinSuccess(response){
    if(!response?.ok)throw Error('লগইনের PIN মেলেনি বা সাময়িকভাবে লক আছে।');
    return response;
  }
  async function confirmStaffAction(name,payload,title){
    const pin=await askLoginPin(title);
    if(pin===null)return null;
    const result=requirePinSuccess(await db('rpc/play80_confirm_staff_action','POST',{
      p_panel_token:null,p_pin:pin,p_action:name,p_payload:payload
    }));
    return result.result??true;
  }
  let walletPage=0, walletLoadVersion=0;
  const walletMoney=value=>Number(value||0).toLocaleString('bn-BD');
  function makeOwnerItem(r){
    const el=createText('article','','p8-wallet-entry');
    const kind=r.request_kind==='demo_credit'?'ডিপোজিট':'উইথড্র';
    const badge=createText('span',({pending:'অপেক্ষমাণ',approved:'অনুমোদিত',rejected:'বাতিল'})[r.status]||r.status,'wallet-state');
    badge.dataset.status=r.status;
    const header=document.createElement('header');
    header.append(createText('h3',kind+' · '+walletMoney(r.amount)+' কয়েন'),badge);
    const player=r.username||r.email||r.user_id;
    el.append(header,createText('strong',player),createText('small',escDate(r.created_at)));
    if(r.user_note)el.append(createText('p',r.user_note));
    if(r.status!=='pending'){
      if(r.reviewed_at)el.append(createText('small','সিদ্ধান্ত: '+escDate(r.reviewed_at)));
      if(r.review_note)el.append(createText('p',r.review_note));
      return el;
    }
    const note=document.createElement('input');
    note.placeholder='বাতিলের কারণ (বাতিল করলে লিখুন)';note.maxLength=500;
    note.setAttribute('aria-label','বাতিলের কারণ');
    const actions=document.createElement('div');actions.className='cloudActions';
    for(const decision of ['approved','rejected']){
      const approved=decision==='approved';
      actions.append(makeButton(approved?'✓ অনুমোদন':'✕ বাতিল',async()=>{
        if(!approved&&!note.value.trim())throw Error('বাতিলের কারণ লিখুন।');
        const result=await confirmStaffAction('staff_review_demo_request',{
          p_request_id:r.id,p_decision:decision,p_review_note:note.value.trim()||null
        },(approved?'অনুমোদন':'বাতিল')+' · '+kind+' · '+walletMoney(r.amount)+' কয়েন · '+player);
        if(result===null)return;
        ownerStatus(approved?'রিকোয়েস্ট অনুমোদিত হয়েছে।':'রিকোয়েস্ট বাতিল হয়েছে।');
        await loadOwnerRequests();
        await refreshMenuCounts();
      },!approved));
    }
    el.append(note,actions);
    return el;
  }
  async function loadOwnerRequests(){
    const version=++walletLoadVersion;
    const view=$('play80WalletView').value, kind=$('play80WalletKind').value;
    const result=await staffRpc('play80_owner_wallet_page',{p_view:view,p_kind:kind,p_offset:walletPage*30});
    if(version!==walletLoadVersion||!walletOpen())return;
    const {rows,summary,owner_available:available}=result;
    if(walletPage&&!rows.length){walletPage--;return loadOwnerRequests();}
    show('play80OwnerReserve',available!=null);
    $('play80OwnerAvailable').textContent=walletMoney(available);
    for(const [id,key] of [['Deposit','deposit'],['Withdraw','withdraw']]){
      $('play80'+id+'Total').textContent=walletMoney(summary[key+'_amount'])+' কয়েন';
      $('play80'+id+'Count').textContent=walletMoney(summary[key+'_count'])+'টি রিকোয়েস্ট';
    }
    const list=$('cloudOwnerRequests');
    list.replaceChildren(...rows.slice(0,30).map(makeOwnerItem));
    if(!rows.length)list.append(createText('p',view==='pending'?'এই ফিল্টারে অপেক্ষমাণ রিকোয়েস্ট নেই।':'এই ফিল্টারে কোনো রিকোয়েস্টের ইতিহাস নেই।','p8-wallet-empty'));
    const pager=$('play80WalletPager');pager.replaceChildren();
    if(walletPage)pager.append(makeButton('আগের পাতা',async()=>{walletPage--;await loadOwnerRequests();},true));
    if(rows.length>30)pager.append(makeButton('পরের পাতা',async()=>{walletPage++;await loadOwnerRequests();},true));
  }
  for(const id of ['play80WalletKind','play80WalletView'])$(id).addEventListener('change',async()=>{
    walletPage=0;
    try{await loadOwnerRequests();}catch(e){ownerStatus(e.message,true);}
  });
  let userPage=0, selectedUser=null;
  addUserSuggestions('cloudStaffSearch','cloudStaffSearchButton',
    search=>staffRpc('play80_staff_user_page',{p_search:search,p_offset:0}),
    async user=>{userPage=0;selectedUser=user.id;await loadStaffUsers();});
  async function loadStaffUsers(){
    const search=$('cloudStaffSearch').value.trim();
    const rows=await staffRpc('play80_staff_user_page',{p_search:search,p_offset:userPage*50});
    const extra=rows.length>50;
    const list=$('cloudStaffUsers');list.replaceChildren();
    if(!rows.length)list.textContent='মিলে এমন ইউজার নেই।';
    const overview=await db('rpc/play80_staff_overview','POST',{});
    $('p8UserCount').textContent='মোট '+walletMoney(overview.users)+' জন';
    const viewed=rows.slice(0,50).find(u=>u.id===selectedUser);
    if(viewed){renderProfile(viewed);return;}
    selectedUser=null;
    rows.slice(0,50).forEach(u=>{
      const row=document.createElement('div');row.className='cloudRequestItem';
      row.append(createText('strong',u.display_name||u.username||u.email||u.id));
      row.append(createText('small','আইডি '+u.id));
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
      const card=createText('div','','p8-user-profile');
      card.append(createText('h2',u.full_name||u.display_name||u.username||'ইউজার প্রোফাইল'));
      card.append(identityDetails([
        ['ইউজারনেম',u.username],['ইউজার আইডি',u.id],['ইমেইল',u.email],
        ['মোবাইল',u.phone_number],['ঠিকানা',u.address_text],['যোগ দিয়েছেন',escDate(u.created_at)],
        ['মোট কয়েন',walletMoney(u.balance)],['ব্যবহারযোগ্য কয়েন',walletMoney(Number(u.balance)-Number(u.held_balance))],
        ['আটকে রাখা কয়েন',walletMoney(u.held_balance)]
      ]));
      attachOwnerUserTools(card,u);
      if(isOwner() && u.role!=='owner'){
        card.append(makeButton(u.role==='admin'?'REMOVE ADMIN ROLE':'MAKE ADMIN',async()=>{
          const action=u.role==='admin'?'revoke':'grant';

          if(await confirmStaffAction('staff_manage_admin',{p_target_user:u.id,p_action:action},'Admin অনুমতি পরিবর্তন')===null)return;
          ownerStatus('Admin '+(action==='grant'?'created':'permissions revoked')+' for '+(u.email||u.id)+'. Ask this user to sign in again.');
          await loadStaffUsers();
        },true));
      }
      list.append(card);
    }
  }
  async function loadAdmins(){
    const staff=await staffRpc('staff_list_admins');const list=$('cloudStaffAdmins');list.replaceChildren();
    if(!staff.length)list.textContent='কোনো স্টাফ অ্যাকাউন্ট পাওয়া যায়নি।';
    staff.forEach(u=>{
      const card=document.createElement('div');card.className='cloudRequestItem';
      card.append(createText('strong',u.role.toUpperCase()+' • '+(u.username||u.email)));
      card.append(createText('small',u.email+' · '+(u.email_verified?'ইমেইল যাচাই হয়েছে':'ইমেইল যাচাই বাকি')));
      if(u.role==='admin'&&isOwner())card.append(makeButton('Admin অনুমতি সরান',async()=>{

        if(await confirmStaffAction('staff_manage_admin',{p_target_user:u.id,p_action:'revoke'},'Admin অনুমতি পরিবর্তন')===null)return;
        await loadAdmins();
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
    const stats=await db('rpc/play80_staff_overview','POST',{});
    const list=$('cloudStaffStats');list.replaceChildren();
    const metrics=createText('div','','p8-metrics');
    for(const [label,value] of [
      ['মোট ইউজার',stats.users],['এখন খেলছেন',stats.games?.length],
      ['আজ অনুমোদিত ডিপোজিট',stats.today_deposit],['আজ অনুমোদিত উইথড্র',stats.today_withdraw],
      ['মোট অনুমোদিত ডিপোজিট',stats.total_deposit],['মোট অনুমোদিত উইথড্র',stats.total_withdraw],
      ['ডিপোজিট করেছেন (ইউজার)',stats.deposit_users],['উইথড্র করেছেন (ইউজার)',stats.withdraw_users],
      ['নিট ডিপোজিট (ডিপোজিট − উইথড্র)',Number(stats.total_deposit)-Number(stats.total_withdraw)],
      ['Player ওয়ালেটে বর্তমান কয়েন',stats.player_coins]
    ]){
      const tile=createText('div','','p8-metric');
      tile.append(createText('small',label),createText('strong',walletMoney(value)));
      metrics.append(tile);
    }
    list.append(metrics,createText('small','আজকের হিসাব বাংলাদেশ সময়ে। সব হিসাব ভার্চুয়াল কয়েনের।'));
    list.append(createText('h3','এখন কে কী খেলছেন'));
    if(!stats.games?.length)list.append(createText('p','এখন কোনো সক্রিয় প্লেয়ার দেখা যাচ্ছে না।'));
    for(const g of stats.games||[]){
      const row=createText('div','','cloudRequestItem');
      row.append(createText('strong',g.username||g.email||g.user_id),createText('small',g.title||g.game_code));
      list.append(row);
    }
  }

  async function loadBotOwner(){
    const info=await staffRpc('play80_owner_bot_dashboard');
    const activity=await db('rpc/play80_owner_ai_activity','POST',{}).catch(()=>[]);
    $('cloudBotsSummary').textContent='AI profiles: '+info.total+' · active: '+info.active+' · daily limit 8 hours · three-day limit 24 hours';
    const list=$('cloudBotsList');list.replaceChildren();
    for(const bot of (info.bots||[])){
      const card=document.createElement('div');card.className='cloudRequestItem';
      card.append(createText('strong',bot.avatar+' '+bot.username+' • AI Player • '+bot.skill));
      card.append(createText('small','Total: '+bot.total_score+' pts · Games: '+bot.games_played+' · Today: '+Math.floor(bot.today_seconds/60)+' min · Total: '+Math.floor(bot.all_seconds/60)+' min · Virtual prizes: '+bot.virtual_rewards));
      for(const event of (Array.isArray(activity)?activity:[]).filter(a=>a.bot_id===bot.id))card.append(createText('small','গেম: '+event.game+' · '+event.event_status+' · স্কোর '+event.total_score+' · শেষ খেলা '+(event.last_play_at?escDate(event.last_play_at):'এখনো খেলেনি')+' · '+Math.floor(event.event_seconds/60)+' মিনিট'));
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

    if(await confirmStaffAction('play80_owner_bot_upsert',{p_bot_id:id,p_username:username,p_avatar:avatar,
      p_skill:skill,p_active:$('cloudBotActive').checked},'কম্পিউটার প্লেয়ারের তথ্য সেভ')===null)return;
    ownerStatus('AI profile saved for future tournaments.');await loadBotOwner();
  },ownerStatus));
  $('cloudBotsRefresh').addEventListener('click',e=>busy(e.currentTarget,loadBotOwner,ownerStatus));
  $('cloudTournamentRefresh').addEventListener('click',e=>busy(e.currentTarget,loadTournamentOwner,ownerStatus));
  async function switchStaffTab(tab){
    if(!staffTitles[tab]||!isStaff())return;
    staffSection=tab;
    syncFooter();
    $('p8StaffHeading').textContent=staffTitles[tab];
    ownerStatus('');
    document.querySelectorAll('.cloudStaffPane').forEach(el=>el.classList.toggle('hidden',el.id!=='cloudStaffTab-'+tab));
    if(tab==='users'){userPage=0;selectedUser=null;await loadStaffUsers();}
    if(tab==='inbox')await loadOwnerInbox();
    if(tab==='admins')await loadAdmins();
    if(tab==='activity')await loadActivity();
    if(tab==='stats')await loadStats();
    if(tab==='bots')await loadBotOwner();
    if(tab==='tournaments')await loadTournamentOwner();
  }
  let staffSection='stats';
  const staffTitles={stats:'ড্যাশবোর্ড',users:'ইউজার দেখুন',admins:'স্টাফ অ্যাকাউন্ট',activity:'লাইভ গেম',bots:'AI প্লেয়ার',tournaments:'টুর্নামেন্ট',inbox:'সাপোর্ট'};
  $('cloudOwnerRefresh').addEventListener('click',e=>busy(e.currentTarget,loadOwnerRequests,ownerStatus));
  $('cloudStaffSearchButton').addEventListener('click',e=>busy(e.currentTarget,async()=>{userPage=0;selectedUser=null;await loadStaffUsers();},ownerStatus));
  $('cloudStaffActivityRefresh').addEventListener('click',e=>busy(e.currentTarget,loadActivity,ownerStatus));
  $('cloudStaffStatsRefresh').addEventListener('click',e=>busy(e.currentTarget,loadStats,ownerStatus));
  document.querySelectorAll('[data-open="account"],[data-open="remote-owner"]').forEach(b=>{
    b.addEventListener('click',()=>{if(b.dataset.open==='account')loadAccount();else if(isStaff())switchStaffTab('stats').catch(e=>ownerStatus(e.message,true));});
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
    botArena:async(payload)=>raw('/functions/v1/bot-arena','POST',payload,await token()),
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
    $('p8SignupReferral')?.closest('.formGroup').classList.toggle('hidden',!signup||owner);
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
    <div class="formGroup"><label for="p8SignupReferral">রেফার কোড বা আমন্ত্রণ লিংক (ঐচ্ছিক)</label><input id="p8SignupReferral" maxlength="240" autocapitalize="none" autocomplete="off"></div>
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
  accountSupport.classList.add('p8-chat');
  accountSupport.innerHTML=`<small>স্বয়ংক্রিয় সহায়তা ও ওনারের উত্তর</small>
    <div id="p8MyMessages" class="p8-chat-log" role="log" aria-label="সাপোর্ট কথোপকথন"></div>
    <form id="p8ChatForm" class="p8-chat-composer"><textarea id="p8SupportText" rows="2" maxlength="950" aria-label="মেসেজ লিখুন" placeholder="মেসেজ লিখুন"></textarea>
    <button class="action" type="submit" id="p8SendMessage">পাঠান</button></form>
    <p id="p8SupportReceipt" role="status" hidden></p>
    <button class="smallAction" type="button" id="p8MyMessagesRefresh">রিফ্রেশ</button>
    <button class="smallAction" type="button" id="p8RequestDeletion">অ্যাকাউন্ট মুছতে অনুরোধ</button>`;
  $('cloudRequests').parentElement.append(accountSupport);
  let supportSignature='',supportLoading=false, supportSending=false,activeOwnerThread=null;
  const supportReceipt=$('p8SupportReceipt');
  function supportMessage(sender,at,body,outgoing=false){
    const card=document.createElement('div');card.className='p8-chat-bubble'+(outgoing?' p8-chat-outgoing':'');
    card.append(createText('small',sender+' · '+escDate(at)),createText('p',body,'p8-support-body'));
    return card;
  }
  async function sendChatMessage(body){
    if(!verifiedAuth||supportSending)return;
    const viewer=session.user.id;
    const field=$('p8SupportText');
    const button=$('p8SendMessage');
    body=String(body).trim();
    if(!body)return;
    supportSending=true;button.disabled=true;supportReceipt.hidden=true;
    try{
      await db('rpc/play80_send_support_message','POST',{p_body:body,p_category:'general'});
      if(!verifiedAuth||session?.user?.id!==viewer)return;
      if(field.value.trim()===body)field.value='';
      supportSignature='';
      await loadMyMessages();
    }catch(e){supportReceipt.textContent=e.message;supportReceipt.hidden=false;}
    finally{supportSending=false;button.disabled=false;}
  }
  async function loadMyMessages(){
    if(!verifiedAuth||isStaff()||supportLoading)return;
    const viewer=session.user.id;
    supportLoading=true;
    try{
      const rows=await db('rpc/play80_my_support_messages','POST',{});
      if(!verifiedAuth||session?.user?.id!==viewer)return;
      const list=$('p8MyMessages');
      const ordered=[...(rows||[])].reverse();
      const signature=JSON.stringify(ordered);
      if(supportSignature===signature)return;
      supportSignature=signature;
      const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<80;
      const first=!list.children.length;
      list.replaceChildren();
      if(!ordered.length)list.append(createText('p','হ্যালো বা যেকোনো মেসেজ লিখে কথোপকথন শুরু করুন।'));
      for(const r of ordered){
        const bubble=supportMessage(r.sender==='owner'?(r.automatic_step?'ওনার · স্বয়ংক্রিয় উত্তর':'ওনার'):'আপনি',r.at,r.body,r.sender==='player');
        if(r===ordered.at(-1)&&r.automatic_step==='choose'){
          const options=createText('div','','p8-chat-options');
          for(const topic of ['ডিপোজিট সমস্যা','উইথড্র সমস্যা']){
            const option=makeButton(topic,()=>sendChatMessage(topic),true);
            options.append(option);
          }
          bubble.append(options);
        }
        list.append(bubble);
      }
      if(first||nearBottom||supportSending)list.scrollTop=list.scrollHeight;
    }finally{supportLoading=false;}
  }
  $('p8ChatForm').addEventListener('submit',e=>{e.preventDefault();void sendChatMessage($('p8SupportText').value);});
  $('p8SupportText').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();void sendChatMessage(e.currentTarget.value);}});
  $('p8RequestDeletion').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const body=$('p8SupportText').value.trim()||'আমার PLAY80 অ্যাকাউন্ট মুছে দেওয়ার অনুরোধ করছি।';
    const pin=await askLoginPin('অ্যাকাউন্ট মুছতে সাপোর্ট রিকোয়েস্ট পাঠান');
    if(pin===null)return;
    requirePinSuccess(await db('rpc/play80_request_account_review','POST',{p_pin:pin,p_body:body}));
    $('p8SupportText').value='';await loadMyMessages();status('ওনার আপনার অনুরোধটি যাচাই করবেন।');
  }));
  $('p8MyMessagesRefresh').addEventListener('click',e=>busy(e.currentTarget,loadMyMessages));
  const inbox=document.createElement('div');
  inbox.className='cloudStaffPane hidden';
  inbox.id='cloudStaffTab-inbox';
  inbox.innerHTML=`<input id="p8InboxSearch" type="search" maxlength="80" aria-label="ইউজার আইডি বা নাম" placeholder="ইউজার আইডি বা নাম দিয়ে খুঁজুন" class="cloudSelect"><div id="p8OwnerInboxList" class="cloudList"></div>`;
  $('cloudStaffTab-users').parentNode.append(inbox);
  async function getOwnerThreads(search=''){
    if(!isStaff())throw Error('Owner বা Admin অ্যাকাউন্টে লগইন করুন।');
    return db('rpc/play80_owner_threads','POST',{p_search:search});
  }
  let inboxRevision=0;
  async function loadOwnerInbox(){
    const revision=++inboxRevision;
    activeOwnerThread=null;
    const wasThread=inbox.classList.contains('p8-thread-open');
    inbox.classList.remove('p8-thread-open');
    const list=$('p8OwnerInboxList');
    if(wasThread)list.replaceChildren();
    const viewer=session?.user?.id;
    const rows=await getOwnerThreads($('p8InboxSearch').value.trim());
    if(revision!==inboxRevision||activeOwnerThread||!verifiedAuth||session?.user?.id!==viewer)return;
    list.replaceChildren();
    if(!rows.length)list.textContent='কোনো কথোপকথন নেই।';
    for(const r of rows){
      const card=makeButton('',()=>openOwnerThread(r),true);
      card.classList.add('p8-menu-item','p8-thread-preview');
      dot(card,r.needs_attention);
      card.append(createText('strong',r.username?'@'+r.username:'ইউজার'),
        createText('span',r.preview));
      if(r.needs_attention)card.append(createText('small','ওনারের মনোযোগ প্রয়োজন'));
      list.append(card);
    }
  }
  async function openOwnerThread(thread){
    const {user_id,username}=thread;
    const revision=++inboxRevision;
    activeOwnerThread=thread;
    const viewer=session.user.id;
    const messages=await db('rpc/play80_owner_open_thread','POST',{p_user:user_id});
    const latest=messages.at(-1)?.id;
    const fresh=(await getOwnerThreads(user_id))[0];
    if(!verifiedAuth||!isStaff()||session?.user?.id!==viewer||revision!==inboxRevision||activeOwnerThread!==thread)return;
    const list=$('p8OwnerInboxList');list.replaceChildren();
    inbox.classList.add('p8-thread-open');
    list.append(createText('h4',username?'@'+username:'ইউজার','p8-thread-name'));
    const chat=createText('div','','p8-chat-log');chat.id='p8OwnerChatLog';
    for(const r of messages)chat.append(supportMessage(r.sender_role==='owner'?(r.automatic_step?'ওনার · স্বয়ংক্রিয় উত্তর':'ওনার'):'প্লেয়ার',r.created_at,r.body,r.sender_role==='owner'));
    chat.dataset.signature=JSON.stringify(messages);
    list.append(chat);
    const reply=document.createElement('textarea');reply.maxLength=1000;reply.rows=2;
    reply.placeholder='প্লেয়ারকে উত্তর লিখুন';reply.setAttribute('aria-label',reply.placeholder);
    const composer=createText('div','','p8-chat-composer p8-owner-composer');
    list.append(composer);
    composer.append(reply,makeButton('উত্তর পাঠান',async()=>{
      if(!reply.value.trim())throw Error('উত্তর লিখুন।');
      await db('rpc/play80_owner_reply_support','POST',{p_user:user_id,p_note:reply.value.trim()});
      if(activeOwnerThread===thread)await openOwnerThread(thread);
    }));
    chat.scrollTop=chat.scrollHeight;
    if(fresh&&!fresh.needs_attention&&fresh.latest_id===latest){
      list.append(makeButton('কথোপকথন স্থায়ীভাবে মুছুন',async()=>{
        const title='আইডি '+user_id+'-এর সব '+fresh.message_count+'টি সাপোর্ট মেসেজ স্থায়ীভাবে মুছতে PIN দিন।';
        const pin=await askLoginPin(title);
        if(pin===null)return;
        requirePinSuccess(await db('rpc/play80_owner_delete_thread','POST',{
          p_user:user_id,p_latest:latest,p_count:fresh.message_count,p_pin:pin
        }));
        await loadOwnerInbox();
        await refreshMenuCounts();
      },true));
    }
    await refreshMenuCounts();
  }
  addUserSuggestions('p8InboxSearch',null,getOwnerThreads,openOwnerThread,loadOwnerInbox);
  $('p8InboxSearch').addEventListener('search',()=>{void loadOwnerInbox().catch(e=>ownerStatus(e.message,true));});

  function addUserSuggestions(inputId,submitId,findUsers,selectUser,onSearch){
    const input=$(inputId), submit=submitId?$(submitId):null;
    const list=document.createElement('div');
    list.className='p8-user-suggestions';
    list.setAttribute('role','group');
    list.setAttribute('aria-label','ইউজার আইডি সাজেশন');
    input.after(list);
    input.autocomplete='off';
    let timer, revision=0;
    function clear(){
      clearTimeout(timer);
      revision++;
      list.replaceChildren();
    }
    input.addEventListener('input',()=>{
      clear();
      const search=input.value.trim();
      if(search.length<2||!verifiedAuth)return;
      const version=revision, viewer=session?.user?.id;
      timer=setTimeout(async()=>{
        try{
          const users=await findUsers(search);
          if(version!==revision||search!==input.value.trim()||!verifiedAuth||viewer!==session?.user?.id||!input.getClientRects().length)return;
          for(const user of users.slice(0,5)){
            const id=user.user_id||user.id;
            list.append(makeButton(user.username?'@'+user.username+(onSearch?'':' · '+id):id,async()=>{
              input.value=onSearch?(user.username||id):id;
              clear();
              await selectUser(user);
            },true));
          }
        }catch(_){/* The search button remains available if suggestions fail. */}
      },250);
    });
    input.addEventListener('keydown',event=>{
      if(event.key==='Escape')clear();
      if(event.key==='Enter'){event.preventDefault();if(submit)submit.click();else{clear();void onSearch().catch(e=>ownerStatus(e.message,true));}}
    });
    submit?.addEventListener('click',clear);
    document.addEventListener('play80:screen-changed',clear);
  }
  function newId(){return crypto.randomUUID?crypto.randomUUID():('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx').replace(/[xy]/g,c=>{const n=crypto.getRandomValues(new Uint8Array(1))[0]&15;return(c==='x'?n:(n&3|8)).toString(16)});}
  function attachOwnerUserTools(card,u){
    if(!isStaff()||u.role!=='player')return;
    const note=document.createElement('input');note.maxLength=200;note.placeholder='নোট';
    note.setAttribute('aria-label','লেনদেনের নোট');card.append(note);
    const amountField=document.createElement('input');amountField.type='number';amountField.min='1';
    amountField.placeholder='কয়েনের পরিমাণ';amountField.setAttribute('aria-label','কয়েনের পরিমাণ');card.append(amountField);
    const actions=createText('div','','cloudActions');
    for(const [direction,label] of [['send','কয়েন পাঠান'],['receive','কয়েন নিন']]){
      actions.append(makeButton(label,async()=>{
        const amount=Number(amountField.value);
        if(!Number.isSafeInteger(amount)||amount<1)throw Error('সঠিক পূর্ণসংখ্যায় কয়েনের পরিমাণ লিখুন।');
        const pin=await askLoginPin(label+' · '+walletMoney(amount)+' · '+(u.username||u.email||u.id));
        if(pin===null)return;
        requirePinSuccess(await db('rpc/play80_owner_transfer','POST',{
          p_pin:pin,p_player:u.id,p_direction:direction,p_amount:amount,p_note:note.value.trim(),p_operation:newId()
        }));
        ownerStatus('কয়েন লেনদেন সম্পন্ন হয়েছে।');
        await Promise.all([loadStaffUsers(),loadAccount()]);
      },direction==='receive'));
    }
    card.append(actions);
    card.append(makeButton('💬 SEND USER NOTICE',async()=>{
      if(!note.value.trim())throw Error('Type a message');

      await db('rpc/play80_owner_reply_support','POST',{p_user:u.id,p_note:note.value.trim()});
      ownerStatus('Message delivered to user.');
    },true));
    const suspend=makeButton('⛔ SUSPEND PLAYER',async()=>{
      const reason=note.value.trim();if(reason.length<5)throw Error('Reason required (5+ chars)');

      if(await confirmStaffAction('play80_owner_account_control',{p_target_user:u.id,p_action:'suspend',p_note:reason},'ইউজারের অ্যাকাউন্ট স্ট্যাটাস পরিবর্তন')===null)return;
      ownerStatus('Account suspended; full account deletion was NOT performed.');
    },true);card.append(suspend);
    card.append(makeButton('✅ RESTORE PLAYER',async()=>{
      const reason=note.value.trim();if(reason.length<5)throw Error('Reason required (5+ chars)');

      if(await confirmStaffAction('play80_owner_account_control',{p_target_user:u.id,p_action:'restore',p_note:reason},'ইউজারের অ্যাকাউন্ট স্ট্যাটাস পরিবর্তন')===null)return;
      ownerStatus('Account restored.');
    },true));
  }

  const staffCreate=document.createElement('div');
  staffCreate.id='p8StaffCreate';
  staffCreate.className='hidden';
  const staffCreateForm=document.createElement('form');
  staffCreateForm.className='hidden';
  const staffFormTitle=createText('h3','');
  staffCreateForm.append(staffFormTitle);
  function hideStaffForm(){
    staffCreateForm.reset();
    staffCreateForm.classList.add('hidden');
    delete staffCreateForm.dataset.role;
  }
  const staffChoices=createText('div','','cloudActions');
  for(const [role,label] of [['admin','Admin'],['dsr','DSR']]){
    const button=makeButton(label+' অ্যাকাউন্ট তৈরি',async()=>{
      hideStaffForm();
      staffCreateForm.dataset.role=role;
      staffFormTitle.textContent=label+' অ্যাকাউন্টের তথ্য';
      staffCreateForm.classList.remove('hidden');
      staffCreateForm.elements.email.focus();
    },true);
    button.id=role==='admin'?'p8CreateAdmin':'p8CreateDsr';
    staffChoices.append(button);
  }
  for(const [name,label,type] of [
    ['email','ইমেইল','email'],['username','User ID','text'],['phone_number','মোবাইল','tel'],
    ['full_name','পূর্ণ নাম','text'],['address','ঠিকানা','text'],['pin','প্রাথমিক ছয় সংখ্যার PIN','password']]){
    const wrapper=createText('label',label,'formGroup'),input=document.createElement('input');
    input.type=type;input.name=name;input.required=true;
    if(name==='pin'){input.pattern='[0-9]{6}';input.maxLength=6;input.inputMode='numeric';input.autocomplete='new-password';}
    wrapper.append(input);staffCreateForm.append(wrapper);
  }
  const createStaff=createText('button','অ্যাকাউন্ট তৈরি ও যাচাই ইমেইল পাঠান','action');
  createStaff.type='submit';
  staffCreateForm.append(createStaff,makeButton('ফর্ম বন্ধ করুন',async()=>hideStaffForm(),true));
  staffCreate.append(staffChoices,staffCreateForm);
  $('cloudStaffTab-admins').prepend(staffCreate);
  staffCreateForm.addEventListener('submit',event=>{
    event.preventDefault();
    busy(createStaff,async()=>{
      const role=staffCreateForm.dataset.role;
      if(!isStaff()||!['admin','dsr'].includes(role)||role==='admin'&&!isOwner())throw Error('অ্যাকাউন্ট তৈরির অনুমতি নেই।');
      const fields=Object.fromEntries(new FormData(staffCreateForm));
      fields.email=fields.email.trim().toLowerCase();fields.username=fields.username.trim().toLowerCase();
      const pin=await askLoginPin((role==='admin'?'Admin':'DSR')+' অ্যাকাউন্ট তৈরি ও যাচাই ইমেইল পাঠানো');
      if(pin===null)return;
      const confirmation=requirePinSuccess(await db('rpc/play80_open_owner_panel','POST',{p_pin:pin,p_scope:role}));
      const result=await raw('/functions/v1/play80-create-dsr','POST',{...fields,account_role:role,pin_token:confirmation.token},await token());
      hideStaffForm();
      ownerStatus(result.message);
      await loadAdmins();
    },ownerStatus);
  });
  const walletStyle=document.createElement('style');
  walletStyle.textContent='#cloudSignedIn[data-section="wallet"]>.sectionTitle,#screen-account:has(.p8-deposit-view:not([hidden]))>.back,.p8-deposit-view>.hubStat,.p8-wallet-form [hidden]{display:none!important}.p8-deposit-view{gap:6px!important;padding-top:0!important}.p8-deposit-view>h2{margin:0 0 3px!important}.p8-demo-number-row input{width:0}.p8-deposit-view button{margin-top:0}';
  document.head.append(walletStyle);
  const signedIn=$('cloudSignedIn');
  const ownProfile=document.createElement('section');
  const ownWallet=document.createElement('section');
  const ownBonus=document.createElement('section');
  const referral=document.createElement('section');
  const profileField=$('cloudUsername').closest('.formGroup');
  const bonusEarned=$('cloudBonusEarned');
  bonusEarned.parentElement.replaceChildren('পাওয়া বোনাস ',bonusEarned);
  const bonusCard=bonusEarned.closest('.play80Surface');
  const requestTitle=bonusCard.nextElementSibling;
  const requestFields=[];
  for(let field=requestTitle;field&&field!==$('cloudRefresh');field=field.nextElementSibling)requestFields.push(field);
  const profileSummary=createText('div','');
  ownProfile.append(createText('h2','আমার প্রোফাইল'),profileSummary,profileField);
  function identityDetails(rows){
    const details=createText('dl','','p8-identity-details');
    for(const [label,value] of rows){
      const row=document.createElement('div');
      row.append(createText('dt',label),createText('dd',value||'—'));
      details.append(row);
    }
    return details;
  }
  function renderIdentity(){
    const account=verifiedAuth?session?.user:null;
    const name=account?(profile?.full_name||profile?.display_name||profile?.username||account.email||'PLAY80'):'—';
    const coins=account&&balance?walletMoney(balance.balance):'—';
    $('p8MenuAvatar').textContent='';
    $('p8MenuName').textContent=name;
    $('p8MenuUserId').textContent=account&&profile?.username?'@'+profile.username:'—';
    $('p8MenuBalance').textContent=coins;
    $('headerCoins').textContent=coins;
    profileField.hidden=!account||!!profile?.username;
    if(!account){profileSummary.replaceChildren();return;}
    profileSummary.replaceChildren(identityDetails([
      ['নাম',name],['ইউজারনেম',profile?.username],['ইউজার আইডি',account.id],['ইমেইল',account.email],
      ['মোবাইল',profile?.phone_number],['ঠিকানা',profile?.address_text],
      ['যোগ দিয়েছি',account.created_at||profile?.created_at?escDate(account.created_at||profile?.created_at):null],
      ['অ্যাকাউন্ট',isOwner()?'Owner':isStaff()?'Admin':isDsr()?'DSR':'Player'],['মোট কয়েন',coins]
    ]));
  }

  const walletHeading=createText('h2','কয়েন ডিপোজিট');
  const requestToolbar=createText('div','','p8-request-toolbar');
  const amountGrid=createText('div','','p8-amount-grid');
  const amountInput=$('cloudAmount');
  const referenceField=$('play80DemoReferenceField');
  const referenceInput=$('cloudNote');
  const kindField=$('cloudRequestKind');
  const methods={send:'সেন্ড মানি',cashout:'ক্যাশ আউট'};
  const providers={bkash:'বিকাশ',nagad:'নগদ'};
  function paymentProviderIcon(key){
    if(key==='bkash'){const img=document.createElement('img');img.src='bkash-demo-mark.webp';img.alt='';img.className='p8-payment-icon';img.setAttribute('aria-hidden','true');return img;}
    const icon=createText('span','ন','p8-payment-icon p8-nagad-mark');icon.setAttribute('aria-hidden','true');return icon;
  }
  let method='send',provider='bkash',numbers={},readSerial=0;
  const walletControls=makeButton('রিকোয়েস্টের ইতিহাস',()=>openAccountPage('history',null,true),true);
  const paymentMethod=createText('div','','p8-demo-method');
  const methodName=createText('strong','');
  const providerBar=createText('div','','p8-request-toolbar');
  const demoNumberRow=createText('div','','p8-demo-number-row');
  const demoNumber=document.createElement('input');
  demoNumber.type='text';demoNumber.readOnly=true;demoNumber.id='p8DepositNumber';
  const copyMessage=createText('small','');copyMessage.setAttribute('role','status');
  const copyNumber=createText('button','কপি','smallAction');copyNumber.type='button';
  copyNumber.addEventListener('click',async()=>{
    if(!demoNumber.value)return;
    try{await navigator.clipboard.writeText(demoNumber.value);copyMessage.textContent='নম্বর কপি হয়েছে।';}
    catch{demoNumber.select();copyMessage.textContent=document.execCommand('copy')?'নম্বর কপি হয়েছে।':'নির্বাচিত নম্বরটি কপি করুন।';}
  });
  demoNumberRow.append(demoNumber,copyNumber);
  paymentMethod.append(providerBar,methodName,demoNumberRow,copyMessage);
  function drawNumber(){
    for(const b of requestToolbar.children)b.setAttribute('aria-pressed',String(b.dataset.key===method));
    for(const b of providerBar.children)b.setAttribute('aria-pressed',String(b.dataset.key===provider));
    methodName.textContent=providers[provider]+' '+methods[method];
    demoNumber.setAttribute('aria-label',methodName.textContent+' নম্বর');
    demoNumber.value=numbers[method+provider]||'';
    demoNumber.placeholder='নম্বর সেট করা হয়নি';copyNumber.disabled=!demoNumber.value;copyMessage.textContent='';
  }
  for(const [bar,options,select] of [[requestToolbar,methods,k=>method=k],[providerBar,providers,k=>provider=k]]){
    for(const [key,label] of Object.entries(options)){
      const b=createText('button',label);b.type='button';b.dataset.key=key;if(bar===providerBar){b.classList.add('p8-provider-option');b.prepend(paymentProviderIcon(key));}b.onclick=()=>{select(key);drawNumber();};bar.append(b);
    }
  }
  async function readNumbers(){
    const rev=++readSerial;
    const rows=await db('play80_deposit_numbers?select=method,provider,number');
    if(rev!==readSerial)return;
    numbers=Object.fromEntries(rows.map(r=>[r.method+r.provider,r.number]));drawNumber();
  }
  const numberEditor=document.createElement('section');numberEditor.className='p8-number-editor';
  const editorStatus=createText('p','','p8-number-status');editorStatus.setAttribute('role','status');
  async function editNumbers(){
    if(!isOwner())return;
    numberEditor.replaceChildren(createText('h2','ডিপোজিটের নম্বর চেঞ্জ করুন'),editorStatus);editorStatus.textContent='';
    await readNumbers();
    for(const [m,title] of Object.entries(methods))for(const [p,name] of Object.entries(providers)){
      const row=createText('div','','p8-number-row'),field=createText('label','','p8-number-label'),input=document.createElement('input');
      field.append(paymentProviderIcon(p),createText('span',title+' · '+name));
      input.id='p8-number-'+m+'-'+p;field.htmlFor=input.id;
      let previous=numbers[m+p]||null;
      input.type='tel';input.maxLength=11;input.inputMode='numeric';input.value=previous||'';
      const save=makeButton('সেভ করুন',async()=>{
        const value=input.value.trim().replace(/[০-৯]/g,d=>String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
        if(!/^01[0-9]{9}$/.test(value))throw Error('১১ সংখ্যার মোবাইল নম্বর লিখুন।');
        await db('rpc/play80_set_deposit_number','POST',{p_method:m,p_provider:p,p_number:value,p_previous:previous});
        previous=value;input.value=value;await readNumbers();editorStatus.textContent=title+' · '+name+' নম্বর সেভ হয়েছে।';
      },true,s=>editorStatus.textContent=s);
      const controls=createText('div','','p8-number-controls');controls.append(input,save);row.append(field,controls);numberEditor.append(row);
    }
  }
  let watch=null,heartbeat=null,refreshTimer=null,watchEpoch=0;
  function stopNumberWatch(){watchEpoch++;clearInterval(refreshTimer);clearInterval(heartbeat);watch?.close();watch=null;}
  async function watchNumbers(){
    stopNumberWatch();const epoch=watchEpoch;
    const refresh=()=>readNumbers().catch(()=>{if(epoch===watchEpoch){numbers={};drawNumber();demoNumber.placeholder='নম্বর লোড করা যায়নি';}});
    refresh();refreshTimer=setInterval(refresh,10000);
    try{
      const jwt=await token();if(epoch!==watchEpoch)return;
      const ws=new WebSocket(BASE.replace('https:','wss:')+'/realtime/v1/websocket?apikey='+encodeURIComponent(KEY)+'&vsn=1.0.0');watch=ws;
      let ref=0;
      const send=(topic,event,payload)=>ws.send(JSON.stringify({topic,event,payload,ref:String(++ref)}));
      ws.onopen=()=>{if(epoch!==watchEpoch)return;send('realtime:deposit-numbers','phx_join',{access_token:jwt,config:{postgres_changes:[{event:'UPDATE',schema:'public',table:'play80_deposit_numbers'}]}});
        heartbeat=setInterval(()=>{if(ws.readyState===1)send('phoenix','heartbeat',{});},25000);};
      ws.onmessage=e=>{if(epoch!==watchEpoch)return;const m=JSON.parse(e.data);if(m.event==='postgres_changes'||m.event==='phx_reply'&&m.ref==='1')refresh();};
    }catch{ /* Periodic reads continue when Realtime is unavailable. */ }
  }
  const firstCreditOffer=createText('p','প্রথম অনুমোদিত ডিপোজিট ঠিক ১,০০০ কয়েন হলে একবার ৫,০০০ বোনাস। অন্য পরিমাণে বা পরের ডিপোজিটে এই বোনাস প্রযোজ্য নয়।');
  firstCreditOffer.id='p8FirstCreditOffer';firstCreditOffer.hidden=true;
  function showFirstCreditOffer(){
    firstCreditOffer.hidden=!firstCreditEligible||kindField.value!=='demo_credit';
  }
  const walletResponse=createText('p','');
  walletResponse.setAttribute('role','status');
  walletResponse.hidden=true;
  function showWalletResponse(message,error=false){
    walletResponse.hidden=!message;
    walletResponse.textContent=message;
    walletResponse.style.color=error?'#ffb8b8':'#a7e8c0';
  }
  const requestList=$('cloudRequests');
  ownWallet.classList.add('p8-wallet-form');
  ownWallet.append(walletHeading,$('cloudBalance').closest('.hubStat'),requestToolbar,walletControls,paymentMethod,firstCreditOffer,...requestFields,$('cloudRefresh'));
  ownWallet.querySelector('#cloudSubmit').after(walletResponse);
  const historyPage=document.createElement('section');
  historyPage.append(createText('h2','রিকোয়েস্টের ইতিহাস'),requestList,
    makeButton('ইতিহাস রিফ্রেশ',loadAccount,true));
  requestTitle.hidden=true;
  kindField.closest('.formGroup').hidden=true;
  amountInput.closest('.formGroup').before(amountGrid);
  const amountHint=createText('small','');
  amountInput.closest('.formGroup').append(amountHint);
  function updatePresetSelection(){
    for(const button of amountGrid.children)button.setAttribute('aria-pressed',String(amountInput.value===button.dataset.amount));
  }
  function renderWalletKind(){
    const debit=kindField.value==='demo_debit';
    const label=debit?'উইথড্র':'ডিপোজিট';
    amountInput.min=debit?'200':'100';
    amountInput.max=debit?'1000000':'20000';
    walletHeading.textContent='কয়েন '+label;
    ownWallet.classList.toggle('p8-deposit-view',!debit);
    requestToolbar.hidden=debit;paymentMethod.hidden=debit;drawNumber();
    showWalletResponse('');
    referenceField.hidden=debit;
    referenceInput.required=!debit;
    showFirstCreditOffer();
    amountHint.textContent=walletMoney(amountInput.min)+' থেকে '+walletMoney(amountInput.max)+' ভার্চুয়াল কয়েন';
    amountGrid.replaceChildren();
    const presets=debit?[200,500,1000,3000,5000,10000]:[100,200,500,1000,3000,5000];
    for(const value of presets){
      const button=createText('button',walletMoney(value));
      button.type='button';button.dataset.amount=String(value);
      button.addEventListener('click',()=>{amountInput.value=String(value);updatePresetSelection();});
      amountGrid.append(button);
    }
    updatePresetSelection();
  }
  function selectWalletKind(kind){
    kindField.value=kind;
    amountInput.value=kind==='demo_debit'?'200':'100';
    renderWalletKind();
    if(kind==='demo_credit')watchNumbers();else stopNumberWatch();
  }
  amountInput.addEventListener('input',updatePresetSelection);
  renderWalletKind();
  const daily=document.createElement('div');daily.className='play80Surface p8-daily-reward';
  daily.style.cssText='margin-top:0;padding:6px 10px;min-height:0;border:1px solid #cba65e;box-shadow:0 0 12px #d8ad5326;background:linear-gradient(155deg,#28203e,#171b35);max-width:100%';
  const countdown=createText('output','—','p8-countdown');
  countdown.style.cssText='display:block;padding:3px 8px;line-height:1.15;text-align:center;font-size:1.65rem;font-weight:800;border:0;background:transparent;color:#ffe29c';
  const dailyList=createText('div','','p8-daily-list');
  dailyList.style.cssText='display:grid;gap:8px;margin-top:10px';
  const dailyStatus=createText('p','');dailyStatus.setAttribute('role','status');
  const dailyTitle=createText('h3','প্রতি ২৪ ঘণ্টায় ৫০ ভার্চুয়াল কয়েন');dailyTitle.style.cssText='margin:14px 0 6px;font-size:1rem';
  daily.append(countdown);
  dailyStatus.style.cssText='margin:0;font-size:.85rem';
  const claim=createText('p','৫,০০০ কয়েন · ক্লেম —','p8-claim');
  bonusCard.append(claim);ownBonus.append(bonusCard,dailyTitle,daily,dailyList,dailyStatus);
  const referralLink=document.createElement('input');referralLink.readOnly=true;
  referralLink.setAttribute('aria-label','PLAY80 আমন্ত্রণ লিংক');
  const copyNote=createText('p','');copyNote.setAttribute('role','status');
  const referralTotal=createText('p','');
  const referralList=createText('div','','p8-referral-list');
  referralList.style.cssText='display:grid;gap:6px';
  const referralStatus=createText('p','');referralStatus.setAttribute('role','status');
  const shareButton=makeButton('আমন্ত্রণ শেয়ার করুন',async()=>{
    if(!referralLink.value)return;
    const message='PLAY80 অ্যাকাউন্ট খুলতে সাইন আপে রেফার কোড '+rewardData.referral_code+' লিখুন।';
    if(/\bwv\b/.test(navigator.userAgent)&&location.protocol==='file:'){
      location.href='play80-share://invite?text='+encodeURIComponent(message+'\n'+referralLink.value);
      return;
    }
    if(navigator.share){
      try{await navigator.share({title:'PLAY80',text:message,url:referralLink.value});return;}
      catch(error){if(error.name==='AbortError')return;}
    }
    await copyReferral(message+'\n'+referralLink.value);
  });
  async function copyReferral(value){
    if(!value)return;
    try{
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);}
      else throw Error('Clipboard unavailable');
      copyNote.textContent='কপি হয়েছে।';
    }catch(_){
      referralLink.select();
      copyNote.textContent='আমন্ত্রণ লিংকটি চেপে ধরে কপি করুন।';
    }
  }
  const copyButton=makeButton('লিংক কপি করুন',()=>copyReferral(referralLink.value),true);
  referral.append(createText('h2','রেফার বোনাস'),createText('p','আপনার লিংক বা কোড দিয়ে নতুন প্লেয়ার অ্যাকাউন্ট খুলে ইমেইল যাচাই করলে আপনি ৫০০ ভার্চুয়াল কয়েন পাবেন।'),
    referralLink,shareButton,copyButton,copyNote,referralTotal,referralList,referralStatus);
  let rewardData=null, rewardRefresh=false, dailyClaimBusy=false, referralClaimBusy=false, nextRewardCheck=0, serverOffset=0;
  function renderDailyClaim(){
    const periods=Array.isArray(rewardData?.pending_periods)?rewardData.pending_periods:[];
    dailyList.replaceChildren();
    for(const dueAt of periods){
      if(typeof dueAt!=='string'||!Number.isFinite(Date.parse(dueAt)))continue;
      const row=createText('div','','p8-daily-row');
      row.style.cssText='display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:6px;padding:4px 8px;border:1px solid #514265;border-radius:12px;background:#28233f';
      const icon=createText('span','🎁');icon.setAttribute('aria-hidden','true');
      const amount=createText('strong','৫০ কয়েন');
      amount.style.cssText='text-align:center;color:#ffe29c;font-size:1.15rem';
      const button=createText('button','ক্লেইম','smallAction p8-daily-claim-button');
      button.type='button';button.dataset.dueAt=dueAt;
      button.style.cssText='width:auto;min-height:32px;margin:0;padding:4px 9px;background:linear-gradient(135deg,#ffe29c,#c99b42);color:#21182c;font-weight:800;border:1px solid #ffe29c;border-radius:9px';
      button.disabled=dailyClaimBusy||referralClaimBusy||rewardRefresh||!verifiedAuth;
      button.addEventListener('click',()=>{void claimDailyBonus(dueAt);});
      row.append(icon,amount,button);dailyList.append(row);
    }
  }
  function renderReferralClaims(){
    referralList.replaceChildren();
    for(const award of (Array.isArray(rewardData?.pending_referrals)?rewardData.pending_referrals:[])){
      if(typeof award!=='string')continue;
      const row=createText('div','','p8-referral-row');
      row.style.cssText='display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:6px;padding:4px 8px;border:1px solid #514265;border-radius:10px;background:#28233f';
      const gift=createText('span','🎁');gift.setAttribute('aria-hidden','true');
      const amount=createText('strong','৫০০ কয়েন');amount.style.cssText='text-align:center;color:#ffe29c';
      const button=makeButton('ক্লেইম',()=>claimReferral(award),true);button.dataset.award=award;
      button.style.cssText='width:auto;min-height:32px;margin:0;padding:4px 9px;font-size:.85rem';
      button.disabled=referralClaimBusy||dailyClaimBusy||rewardRefresh||!verifiedAuth;
      row.append(gift,amount,button);referralList.append(row);
    }
    updateRewardDots();
  }
  function updateRewardDots(){
    const player=verifiedAuth&&!isStaff()&&!isDsr();
    const daily=!!(player&&rewardData?.pending_periods?.length);
    const refer=!!(player&&rewardData?.pending_referrals?.length);
    dot(document.querySelector('[data-p8-footer="bonus"]'),daily);
    dot($('p8MenuItems').querySelector('[data-panel="bonus"]'),daily);
    dot($('p8MenuItems').querySelector('[data-panel="referral"]'),refer);
    dot($('p8MenuButton'),pendingRequests>0||unreadSupport>0||daily||refer);
    dot(document.querySelector('[data-p8-footer="menu"]'),daily||refer);
  }
  async function claimReferral(award){
    if(!verifiedAuth||isStaff()||isDsr()||dailyClaimBusy||referralClaimBusy||rewardRefresh||!rewardData?.pending_referrals?.includes(award))return;
    const viewer=session.user.id;referralClaimBusy=true;renderReferralClaims();renderDailyClaim();
    try{
      const result=await db('rpc/play80_claim_referral_bonus','POST',{p_new_player:award});
      if(!verifiedAuth||session?.user?.id!==viewer)return;
      applyRewardData(result.rewards);
      referralStatus.textContent=Number(result.claimed)===500?'৫০০ কয়েন ব্যালান্সে যোগ হয়েছে।':'এই বোনাসটি আর ক্লেইম করা যাবে না।';
      await loadAccount();
    }catch(_){if(verifiedAuth&&session?.user?.id===viewer)referralStatus.textContent='ক্লেইম যাচাই করা যায়নি।';}
    finally{referralClaimBusy=false;renderReferralClaims();renderDailyClaim();}
  }
  function applyRewardData(data){
    rewardData=data;
    if(data){
      referralLink.value=data.referral_code?APK_DOWNLOAD+'?ref='+encodeURIComponent(data.referral_code):'';
      referralTotal.textContent='সফল রেফার '+Number(data.referral_count||0).toLocaleString('bn-BD')+'টি';
      claim.textContent='৫,০০০ কয়েন · ক্লেম '+(data.first_claimed?'✓ পাওয়া হয়েছে':'✕ পাওয়া যায়নি');
      const serverTime=Date.parse(data.server_at);
      serverOffset=Number.isFinite(serverTime)?serverTime-Date.now():0;
    }
    renderDailyClaim();renderReferralClaims();renderRewardClock();
  }
  async function loadRewards(){
    if(!verifiedAuth||isStaff()||isDsr()||rewardRefresh||dailyClaimBusy||referralClaimBusy)return;
    const id=session.user.id;
    rewardRefresh=true;renderDailyClaim();renderReferralClaims();
    try{
      const data=await db('rpc/play80_my_rewards','POST',{});
      if(!verifiedAuth||session?.user?.id!==id)return;
      applyRewardData(data);
    }finally{rewardRefresh=false;renderDailyClaim();renderReferralClaims();}
  }
  async function claimDailyBonus(dueAt){
    if(!verifiedAuth||isStaff()||isDsr()||dailyClaimBusy||referralClaimBusy||rewardRefresh||!rewardData?.pending_periods?.includes(dueAt))return;
    const id=session.user.id;
    const stillCurrent=()=>verifiedAuth&&session?.user?.id===id;
    dailyClaimBusy=true;renderDailyClaim();renderReferralClaims();
    dailyStatus.textContent='ক্লেইম যাচাই হচ্ছে…';
    try{
      const result=await db('rpc/play80_claim_daily_bonus','POST',{p_due_at:dueAt});
      if(!stillCurrent())return;
      applyRewardData(result.rewards);
      dailyStatus.textContent=Number(result.claimed)===50?'৫০ কয়েন ব্যালান্সে যোগ হয়েছে।':'এই বোনাসটি ইতিমধ্যে ক্লেইম হয়েছে বা এখনো প্রস্তুত নয়।';
      await loadAccount();
    }catch(_){
      if(stillCurrent())dailyStatus.textContent='ক্লেইম যাচাই করা যায়নি। আবার চেষ্টা করুন।';
    }finally{
      dailyClaimBusy=false;renderDailyClaim();renderReferralClaims();
      if(stillCurrent())void loadRewards().catch(()=>{});
    }
  }
  function renderRewardClock(){
    const end=Date.parse(rewardData?.next_at);
    if(!Number.isFinite(end)){countdown.textContent='—';return;}
    const seconds=Math.max(0,Math.ceil((end-Date.now()-serverOffset)/1000));
    countdown.textContent=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
    if(!seconds&&!dailyClaimBusy&&!rewardRefresh&&Date.now()>=nextRewardCheck){
      nextRewardCheck=Date.now()+15000;
      void loadRewards().catch(()=>{});
    }
  }
  setInterval(()=>{
    if(verifiedAuth&&!document.hidden&&signedIn.dataset.section==='bonus'&&!ownBonus.hidden)renderRewardClock();
  },1000);
  const turnoverPage=document.createElement('section');turnoverPage.className='p8-compact-turnover';
  const turnoverList=createText('div','','cloudList');
  turnoverList.setAttribute('aria-live','polite');
  turnoverPage.append(createText('h2','টার্নওভার'),turnoverList,
    makeButton('হিসাব রিফ্রেশ করুন',refreshTurnover,true));
  const turnoverLabels={
    legacy:'আগের হিসাব',deposit:'ডিপোজিট',first_deposit_bonus:'প্রথম ডিপোজিট + বোনাস',
    daily_bonus:'২৪ ঘণ্টার বোনাস',referral_bonus:'রেফার বোনাস'
  };
  async function readTurnover(){
    try{
      const data=await db('rpc/play80_my_turnover','POST',{});
      if(!Array.isArray(data?.items)||typeof data.withdrawal_guard_enabled!=='boolean')return null;
      const remaining=data.items.reduce((total,item)=>total+Math.max(0,Number(item.required)-Number(item.completed)),0);
      const withdrawable=Number(data.withdrawable_coins??(remaining?0:Math.max(0,Number(balance?.balance||0)-Number(balance?.held_balance||0))));
      return Number.isSafeInteger(remaining)&&Number.isSafeInteger(withdrawable)&&withdrawable>=0?{...data,remaining,withdrawable}:null;
    }catch(_){return null;}
  }
  async function refreshTurnover(){
    const viewer=session?.user?.id;
    turnoverList.replaceChildren(createText('p','টার্নওভারের হিসাব দেখা হচ্ছে…'));
    const record=await readTurnover();
    if(verifiedAuth&&session?.user?.id===viewer&&signedIn.dataset.section==='turnover'
      &&document.body.dataset.play80Screen==='account')showTurnover(record);
  }
  function showTurnover(record){
    turnoverList.replaceChildren();
    if(!record){
      turnoverList.append(createText('p','টার্নওভারের হিসাব এখন পাওয়া যাচ্ছে না। রিফ্রেশ করে আবার দেখুন।'));
    }else{
      turnoverList.append(createText('p',record.remaining?'মোট বাকি '+walletMoney(record.remaining)+' কয়েন':'বাকি টার্নওভার নেই।'));
      for(const item of record.items){
        const card=createText('article','','cloudRequestItem');
        const progress=document.createElement('progress');
        progress.max=Number(item.required);progress.value=Number(item.completed);
        progress.style.width='100%';progress.setAttribute('aria-label','টার্নওভার অগ্রগতি');
        card.append(createText('strong',turnoverLabels[item.source]||'টার্নওভার'),progress,
          createText('span',walletMoney(item.completed)+' / '+walletMoney(item.required)+' কয়েন'),
          createText('small','বাকি '+walletMoney(Number(item.required)-Number(item.completed))+' কয়েন'));
        turnoverList.append(card);
      }
      turnoverList.append(createText('p','উইথড্রযোগ্য ডেমো কয়েন: '+walletMoney(record.withdrawable)));
      if(record.remaining&&!record.withdrawal_guard_enabled){
        turnoverList.append(createText('p','উইথড্রের টার্নওভার লক এখনো চালু হয়নি।'));
      }
      if(record.withdrawable>=200||!record.remaining||!record.withdrawal_guard_enabled){
        turnoverList.append(makeButton('উইথড্র ফর্ম খুলুন',()=>openAccountPage('wallet','demo_debit'),true));
      }
    }
    if(verifiedAuth&&(turnoverPage.hidden||document.body.dataset.play80Screen!=='account')){
      selectAccountSection('turnover');
      document.dispatchEvent(new CustomEvent('play80:menu-navigate',{detail:'account'}));
    }
  }
  async function openWithdraw(){
    const viewer=session?.user?.id;
    const fromScreen=document.body.dataset.play80Screen, fromSection=signedIn.dataset.section;
    const record=await readTurnover();
    if(!verifiedAuth||session?.user?.id!==viewer||document.body.dataset.play80Screen!==fromScreen
      ||signedIn.dataset.section!==fromSection)return;
    if(!record||record.remaining>0&&record.withdrawable<200)showTurnover(record);
    else if(fromScreen==='account'&&fromSection==='wallet')selectWalletKind('demo_debit');
    else await openAccountPage('wallet','demo_debit');
  }

  const accountSections={profile:ownProfile,wallet:ownWallet,history:historyPage,bonus:ownBonus,
    numbers:numberEditor,referral,support:accountSupport,turnover:turnoverPage};
  for(const section of Object.values(accountSections)){
    section.classList.add('p8-menu-section');signedIn.append(section);
  }
  let historyFromWallet=false;
  function selectAccountSection(name){
    if(name!=='history')historyFromWallet=false;
    stopNumberWatch();
    signedIn.dataset.section=name;
    for(const [key,section] of Object.entries(accountSections))section.hidden=key!==name;
    syncFooter();
  }
  selectAccountSection('profile');

  async function openAccountPage(section,kind,fromWallet=false){
    historyFromWallet=section==='history'&&fromWallet;
    selectAccountSection(section);
    document.dispatchEvent(new CustomEvent('play80:menu-navigate',{detail:'account'}));
    if(kind)selectWalletKind(kind);
    else if(section==='wallet'&&kindField.value==='demo_credit')watchNumbers();
    if(section==='numbers')await editNumbers();
    else if(section==='turnover')await refreshTurnover();
    else if(section==='support')await loadMyMessages();
    else if(section==='bonus'||section==='referral')await loadRewards();
    else await loadAccount();
  }
  async function openStaffPage(tab){
    if(tab==='wallet'){
      document.dispatchEvent(new CustomEvent('play80:menu-navigate',{detail:'owner-wallet'}));
      walletPage=0;$('play80WalletView').value='pending';$('play80WalletKind').value='all';
      ownerStatus('');
      await loadOwnerRequests();
      return;
    }
    document.dispatchEvent(new CustomEvent('play80:menu-navigate',{detail:'remote-owner'}));
    await switchStaffTab(tab);
  }
  function syncFooter(){
    const screen=document.body.dataset.play80Screen;
    const section=signedIn.dataset.section;
    document.body.classList.toggle('p8-support-view',verifiedAuth&&((screen==='remote-owner'&&staffSection==='inbox')||(screen==='account'&&section==='support')));
    const active=screen==='menu'?'menu':
      screen==='owner-wallet'?'wallet':
      screen==='remote-owner'?(staffSection==='inbox'?'support':'menu'):
      screen==='account'?({wallet:'wallet',history:'wallet',support:'support',bonus:'bonus'}[section]||'menu'):
      document.body.classList.contains('play80-game-section')?'home':null;
    for(const button of document.querySelectorAll('.footerNav .navBtn')){
      const key=button.dataset.p8Footer||button.dataset.open;
      const selected=active===key;
      button.hidden=verifiedAuth&&key==='bonus'&&(isStaff()||isDsr());
      button.classList.toggle('active',selected&&!button.hidden);
      if(selected&&!button.hidden)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    }
  }
  function navigationStatus(message,error){
    const screen=document.body.dataset.play80Screen;
    (screen==='owner-wallet'||screen==='remote-owner'?ownerStatus:status)(message,error);
  }
  const footerActions={
    wallet:()=>isStaff()?openStaffPage('wallet'):openAccountPage('wallet','demo_credit'),
    bonus:()=>openAccountPage('bonus'),
    support:()=>isStaff()?openStaffPage('inbox'):openAccountPage('support')
  };
  for(const button of document.querySelectorAll('[data-p8-footer]')){
    const action=footerActions[button.dataset.p8Footer];
    button.addEventListener('click',()=>{
      if(!verifiedAuth||button.hidden)return;
      if(button.hasAttribute('aria-current')&&
        !(button.dataset.p8Footer==='wallet'&&signedIn.dataset.section==='history'&&!isStaff()))return;
      action().catch(error=>navigationStatus(error.message,true));
    });
  }
  document.addEventListener('play80:before-back',event=>{
    if(document.body.dataset.play80Screen==='remote-owner'&&staffSection==='inbox'&&activeOwnerThread){
      event.preventDefault();
      $('p8InboxSearch').value='';
      void loadOwnerInbox().catch(e=>ownerStatus(e.message,true));
      return;
    }
    if(historyFromWallet&&document.body.dataset.play80Screen==='account'&&signedIn.dataset.section==='history'){
      event.preventDefault();
      void openAccountPage('wallet');
    }
  });
  document.addEventListener('play80:screen-changed',()=>{
    if(document.body.dataset.play80Screen!=='account')stopNumberWatch();
    syncFooter();
    if(activeGameCode&&!document.body.classList.contains('play80-game-section')){
      reportGame(activeGameCode,'finish');
      activeGameCode=null;
    }
  });
  kindField.addEventListener('change',renderWalletKind);
  const dot=(element,on)=>element?.toggleAttribute('data-alert',on);
  let pendingRequests=0, unreadSupport=0;
  function setMenuCounts(requests,support){
    pendingRequests=requests;unreadSupport=support;
    dot($('p8MenuButton'),requests>0||support>0);
    dot(document.querySelector('[data-p8-footer="wallet"]'),requests>0);
    dot(document.querySelector('[data-p8-footer="support"]'),support>0);
    for(const key of ['wallet','inbox']){
      const active=(key==='wallet'?requests:support)>0;
      dot($('screen-menu').querySelector('[data-panel="'+key+'"]'),active);
      dot(document.querySelector('[data-staff-tab="'+key+'"]'),active);
    }
  }
  let countsPending=false;
  async function refreshMenuCounts(){
    if(!verifiedAuth||countsPending)return;
    if(!isStaff()){await loadRewards().catch(()=>{});return;}
    const id=session?.user?.id;
    countsPending=true;
    try{
      const result=await db('rpc/play80_menu_counts','POST',{});
      if(verifiedAuth&&session?.user?.id===id)setMenuCounts(Number(result?.requests||0),Number(result?.support||0));
    }catch(_){/* Keep the previous count until the connection recovers. */}
    finally{countsPending=false;}
  }
  const menuIcons={
    'ডিপোজিটের নম্বর চেঞ্জ করুন':'✎','প্রোফাইল':'👤','ড্যাশবোর্ড':'▥','ইউজার দেখুন':'👥','ডিপোজিট ও উইথড্র রিকোয়েস্ট':'⇄',
    'বোনাস':'🎁','সাপোর্ট':'💬','স্টাফ অ্যাকাউন্ট':'🛡','লাইভ গেম':'🎮','টুর্নামেন্ট':'🏆',
    'গেম পরীক্ষা':'🎮','AI':'🤖','কম্পিউটার প্লেয়ার':'🤖','ডিপোজিট':'⬇','উইথড্র':'⬆','রিকোয়েস্টের ইতিহাস':'◉',
    'রেফার বোনাস':'🔗','টার্নওভার':'▤','লগআউট':'↪'
  };
  function renderMenu(){
    const root=$('p8MenuItems');
    const quick=$('p8MenuQuick');
    root.replaceChildren();quick.replaceChildren();
    const add=(label,action,panel,area=root)=>{
      const button=makeButton(label,action,true,navigationStatus);
      const icon=createText('span',menuIcons[label],'p8-menu-icon');icon.setAttribute('aria-hidden','true');
      button.replaceChildren(icon,createText('span',label,'p8-menu-label'));
      if(panel){button.dataset.panel=panel;button.classList.add('p8-menu-item');}
      area.append(button);
    };
    const account=(section,kind)=>()=>openAccountPage(section,kind);
    const staff=tab=>()=>openStaffPage(tab);
    if(isStaff()){
      add('প্রোফাইল',account('profile'));
      add('ডিপোজিট ও উইথড্র রিকোয়েস্ট',staff('wallet'),'wallet',quick);
      if(isOwner())add('ডিপোজিটের নম্বর চেঞ্জ করুন',account('numbers'));
      add('ড্যাশবোর্ড',staff('stats'),null,quick);
      add('ইউজার দেখুন',staff('users'));
      add('সাপোর্ট',staff('inbox'),'inbox');
      add('স্টাফ অ্যাকাউন্ট',staff('admins'));
      add('লাইভ গেম',staff('activity'));
      add('গেম পরীক্ষা',async()=>{if(verifiedAuth&&isStaff())document.dispatchEvent(new CustomEvent('play80:menu-navigate',{detail:'tournament'}));});
      add('টুর্নামেন্ট',staff('tournaments'));
      add('AI',staff('bots'));
    }else{
      add('ডিপোজিট',account('wallet','demo_credit'),null,quick);
      add('উইথড্র',openWithdraw,null,quick);
      if(!isDsr()){
        add('বোনাস',account('bonus'),'bonus');
        add('রেফার বোনাস',account('referral'),'referral');
      }
      add('সাপোর্ট',account('support'));
      add('প্রোফাইল',account('profile'));
      add('রিকোয়েস্টের ইতিহাস',account('history'));
      add('টার্নওভার',account('turnover'));
    }
    add('লগআউট',async()=>$('cloudSignOut').click());
    setMenuCounts(pendingRequests,unreadSupport);updateRewardDots();
  }
  document.querySelectorAll('[data-staff-tab="wallet"],[data-staff-tab="inbox"]').forEach(el=>el.classList.add('p8-menu-item'));
  $('p8MenuButton').addEventListener('click',()=>{renderMenu();renderIdentity();void loadAccount();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshMenuCounts();});
  setInterval(()=>{if(!document.hidden)void refreshMenuCounts();},20000);
  // Refresh only the visible conversation. Never replace the owner's typed draft.
  let ownerPollPending=false;
  setInterval(async()=>{
    if(document.hidden||!verifiedAuth)return;
    if(!isStaff()&&signedIn.dataset.section==='support'&&document.body.dataset.play80Screen==='account'){
      await loadMyMessages().catch(()=>{});return;
    }
    if(!isStaff()||inbox.classList.contains('hidden')||ownerPollPending||document.body.dataset.play80Screen!=='remote-owner')return;
    ownerPollPending=true;
    try{
      if(activeOwnerThread){
        const thread=activeOwnerThread,viewer=session.user.id;
        const chat=$('p8OwnerChatLog');if(!chat)return;
        const messages=await db('rpc/play80_owner_open_thread','POST',{p_user:thread.user_id});
        if(!verifiedAuth||session?.user?.id!==viewer||activeOwnerThread!==thread||$('p8OwnerChatLog')!==chat)return;
        const signature=JSON.stringify(messages);
        if(chat.dataset.signature!==signature){
          const nearBottom=chat.scrollHeight-chat.scrollTop-chat.clientHeight<80;
          chat.replaceChildren(...messages.map(r=>supportMessage(r.sender_role==='owner'?(r.automatic_step?'ওনার · স্বয়ংক্রিয় উত্তর':'ওনার'):'প্লেয়ার',r.created_at,r.body,r.sender_role==='owner')));
          chat.dataset.signature=signature;if(nearBottom)chat.scrollTop=chat.scrollHeight;
        }
      }else if(document.activeElement!==$('p8InboxSearch'))await loadOwnerInbox();
    }catch(_){}finally{ownerPollPending=false;}
  },5000);
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
      else document.querySelector('.footerNav [data-open="home"]')?.click();
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
