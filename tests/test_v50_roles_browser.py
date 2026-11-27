from pathlib import Path
from playwright.sync_api import sync_playwright
import http.server,socketserver,threading,json

ROOT=Path(__file__).resolve().parent.parent/'assets'
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
 def log_message(self,*args): pass
class Server(socketserver.TCPServer): allow_reuse_address=True
srv=Server(('127.0.0.1',0),Handler)
threading.Thread(target=srv.serve_forever,daemon=True).start()
url='http://127.0.0.1:%s/index.html'%srv.server_address[1]
uid='00000000-0000-4000-8000-000000000001'
def user(role,email):
 return {'id':uid,'email':email,'email_confirmed_at':'2026-11-25T00:00:00Z','app_metadata':{'role':role}}
def mocked_signin(route):
 body=route.request.post_data_json
 if body.get('password')!='123456':return route.fulfill(status=400,content_type='application/json',body='{"msg":"Invalid login credentials"}')
 email=body.get('email','')
 role='owner' if email=='play80.management@gmail.com' else 'player'
 response={'access_token':'mock-server-token','refresh_token':'mock-refresh-token','expires_in':3600,'user':user(role,email)}
 route.fulfill(status=200,content_type='application/json',body=json.dumps(response))
def mocked_user(route):
 auth=route.request.headers.get('authorization','')
 email='play80.management@gmail.com' if 'mock-server-token' in auth and current_role[0]=='owner' else 'testplayer@example.com'
 route.fulfill(status=200,content_type='application/json',body=json.dumps(user(current_role[0],email)))
current_role=['player']
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/auth/v1/token?*',mocked_signin)
  page.route('**/auth/v1/user',mocked_user)
  page.route('**/auth/v1/logout',lambda route:route.fulfill(status=204,body=''))
  page.route('**/rest/v1/**',lambda route:route.fulfill(status=200,content_type='application/json',body='[]'))
  page.goto(url,wait_until='load')
  assert page.locator('#screen-account').is_visible()
  assert page.locator('.play80TopTabs').is_hidden()
  assert page.locator('#p8ModeLogin').is_visible()
  assert page.locator('#p8ModeSignup').is_visible()
  assert page.locator('#p8ModeOwner').count()==0,'Separate Owner Login tab must be removed'
  assert page.locator('#p8FirstOwnerSignup').is_visible(),'Small Create Owner Account link'
  assert 'SIGN IN' in page.locator('#p8ModeLogin').inner_text()
  assert 'SIGN UP' in page.locator('#p8ModeSignup').inner_text()
  page.locator('#p8ModeSignup').click()
  assert page.locator('#p8RegistrationFields').is_visible()
  order=page.evaluate("""()=>['cloudLoginEmail','cloudRegistrationUsername','p8SignupPhone','p8SignupFullName','p8SignupAddress','cloudLoginPassword','p8SignupConfirmPIN'].map(id=>document.getElementById(id).getBoundingClientRect().top)""")
  assert order==sorted(order),'Registration field order is incorrect'
  page.locator('#p8ModeLogin').click()
  assert page.locator('#p8RegistrationFields').is_hidden()
  assert page.locator('#p8FirstOwnerSignup').is_visible()
  page.locator('#p8FirstOwnerSignup').click()
  assert page.locator('#p8RegistrationFields').is_visible()
  assert 'Owner' in page.locator('#p8ModeHelp').inner_text()
  page.locator('#p8ModeLogin').click()
  # Same Sign In form must automatically route server-verified Owner to Owner dashboard.
  current_role[0]='owner'
  page.route('**/rest/v1/rpc/play80_staff_overview',lambda route:route.fulfill(json={
    'users':2,'today_deposit':100,'today_withdraw':20,'total_deposit':160,'total_withdraw':50,
    'deposit_users':1,'withdraw_users':1,'player_coins':110,'games':[{'username':'example_player','title':'Ludo'}]
  }))
  page.route('**/rest/v1/rpc/play80_staff_user_page',lambda route:route.fulfill(json=[{
    'id':'mock-player-uuid','username':'example_player','email':'player@example.invalid',
    'full_name':'Example Player','balance':200,'held_balance':0,'role':'player','email_verified':True
  }]))
  page.route('**/rest/v1/demo_wallets?*',lambda route:route.fulfill(json=[{'balance':50000,'held_balance':0}]))
  page.route('**/rest/v1/profiles?*',lambda route:route.fulfill(json=[{'username':'play80','display_name':'Owner','address_text':'Owner QA address'}]))
  page.locator('#cloudLoginEmail').fill('play80.management@gmail.com')
  page.locator('#cloudLoginPassword').fill('123456')
  page.locator('#cloudLogin').click()
  page.wait_for_timeout(450)
  assert page.locator('.play80TopTabs').is_hidden(),'Game tabs must stay off the Owner page'
  assert page.locator('#screen-remote-owner').is_visible(),'Owner dashboard not opened'
  assert page.locator('#cloudStaffPinGate').is_hidden(),'Owner dashboard should open directly'
  page.get_by_text('এখন কে কী খেলছেন').wait_for()
  page.route('**/rest/v1/rpc/play80_menu_counts',lambda route:route.fulfill(json={'requests':1,'support':1}))
  page.locator('#p8MenuButton').click()
  page.locator('#p8MenuButton[data-alert]').wait_for(state='visible')
  assert page.locator('#p8MenuQuick [data-panel="wallet"][data-alert]').is_visible()
  assert page.locator('#p8MenuItems [data-panel="inbox"][data-alert]').is_visible()
  assert page.locator('.footerNav [data-p8-footer="support"][data-alert]').is_visible()
  assert page.locator('.footerNav [data-p8-footer="bonus"]').is_hidden()
  page.locator('.footerNav [data-p8-footer="support"]').click()
  page.get_by_text('কোনো কথোপকথন নেই।',exact=True).wait_for()
  thread={'user_id':'mock-player-uuid','username':'example_player','preview':'Hello','message_count':1}
  page.route('**/rest/v1/rpc/play80_owner_threads',lambda route:route.fulfill(json=[thread]))
  page.route('**/rest/v1/rpc/play80_owner_open_thread',lambda route:route.fulfill(json=[]))
  replies=[]
  def send_reply(route):
   replies.append(route.request.post_data_json)
   route.fulfill(json={'ok':True})
  page.route('**/rest/v1/rpc/play80_owner_reply_support',send_reply)
  page.locator('#p8InboxSearch').fill('mock-player')
  page.get_by_role('button',name='@example_player · mock-player-uuid',exact=True).click()
  page.get_by_label('প্লেয়ারকে উত্তর লিখুন').fill('সাপোর্ট পরীক্ষা')
  page.get_by_role('button',name='উত্তর পাঠান',exact=True).click()
  page.wait_for_function("() => document.querySelector('#p8OwnerInboxList textarea')?.value === ''")
  assert replies==[{'p_user':'mock-player-uuid','p_note':'সাপোর্ট পরীক্ষা'}]
  assert not page.locator('#play80ActionPin').is_visible()
  assert page.locator('.footerNav [aria-current="page"]').get_attribute('data-p8-footer')=='support'
  assert page.locator('.footerNav .active').count()==1
  page.locator('#globalBack').click()
  assert page.locator('#screen-menu').is_visible()
  assert page.locator('#p8MenuItems .p8-menu-icon').count()>=5
  assert page.locator('#p8MenuItems').evaluate("(grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length")==4
  assert page.locator('#p8MenuAvatar').is_visible()
  assert page.locator('#p8MenuUserId').inner_text()=='@play80'
  assert page.locator('#headerPoints').count()==0
  assert page.locator('#p8MenuBalance').inner_text()==page.locator('#headerCoins').inner_text()=='৫০,০০০'
  page.get_by_role('button',name='প্রোফাইল',exact=True).click()
  page.get_by_text('Owner QA address',exact=True).wait_for()
  assert page.locator('#cloudStaffPinGate').is_hidden()
  page.locator('#p8MenuButton').click()
  page.get_by_role('button',name='ইউজার দেখুন').click()
  assert page.locator('#cloudStaffPinGate').is_hidden()
  page.get_by_role('button',name='প্রোফাইল দেখুন').click()
  page.get_by_text('player@example.invalid',exact=True).wait_for()
  assert page.get_by_role('button',name='কয়েন পাঠান').is_visible()
  page.locator('#cloudStaffUsers').get_by_label('কয়েনের পরিমাণ',exact=True).fill('25')
  page.get_by_role('button',name='কয়েন নিন').click()
  assert page.locator('#play80ActionPin').is_visible()
  page.locator('#play80ActionPin button[value="cancel"]').click()

  page.route('**/rest/v1/rpc/play80_open_owner_panel',lambda route:route.fulfill(json={
   'ok':True,'token':'mock-staff-session','expires_in':180
  }))
  wallet_calls=[]
  def wallet_page(route):
   request=route.request.post_data_json
   wallet_calls.append(request)
   done=request['p_view']=='history'
   route.fulfill(json={
    'rows':[{'id':'mock-wallet-request','request_kind':'demo_credit','status':'approved' if done else 'pending',
             'amount':100,'username':'example_player','created_at':'2026-11-26T00:00:00Z'}],
    'summary':{'deposit_amount':100,'deposit_count':1,'withdraw_amount':0,'withdraw_count':0},
    'owner_available':50000,
   })
  page.route('**/rest/v1/rpc/play80_owner_wallet_page',wallet_page)
  staff_calls=[]
  def mock_review(route):
   staff_calls.append(route.request.post_data_json)
   route.fulfill(json={'ok':True})
  page.route('**/rest/v1/rpc/play80_confirm_staff_action',mock_review)
  page.locator('#p8MenuButton').click()
  page.locator('.footerNav [data-p8-footer="wallet"]').click()
  assert page.locator('#screen-owner-wallet').is_visible()
  assert page.locator('.cloudStaffTabs').is_hidden()
  assert page.locator('.play80TopTabs').is_hidden()
  page.get_by_role('button',name='✓ অনুমোদন').wait_for()
  assert wallet_calls[0]['p_pin_token'] is None
  assert not page.locator('#play80ActionPin').is_visible()
  page.locator('.footerNav [data-p8-footer="wallet"]').click()
  assert page.locator('#cloudStaffPinGate').is_hidden()
  page.get_by_role('button',name='✓ অনুমোদন').click()
  assert staff_calls==[]
  page.locator('#play80ActionPinValue').fill('123456')
  page.locator('#play80ActionPin button[value="confirm"]').click()
  page.wait_for_function("() => !document.querySelector('#play80ActionPin').open")
  page.get_by_text('রিকোয়েস্ট অনুমোদিত হয়েছে।').wait_for()
  assert staff_calls[0]['p_panel_token'] is None
  assert staff_calls[0]['p_action']=='staff_review_demo_request'
  assert staff_calls[0]['p_payload']['p_decision']=='approved'
  assert page.locator('#play80OwnerAvailable').inner_text()=='৫০,০০০'
  page.locator('#play80WalletView').select_option('history')
  page.locator('.wallet-state[data-status="approved"]').wait_for()
  assert page.get_by_role('button',name='✓ অনুমোদন').count()==0
  page.locator('#p8MenuButton').click()
  page.get_by_role('button',name='ড্যাশবোর্ড',exact=True).click()
  assert page.locator('#cloudStaffPinGate').is_hidden()
  page.locator('#p8MenuButton').click()
  page.get_by_role('button',name='স্টাফ অ্যাকাউন্ট',exact=True).click()
  page.get_by_role('button',name='Admin অ্যাকাউন্ট তৈরি').wait_for()
  assert page.get_by_role('button',name='DSR অ্যাকাউন্ট তৈরি').is_visible()
  page.get_by_role('button',name='Admin অ্যাকাউন্ট তৈরি').click()
  assert page.get_by_role('heading',name='Admin অ্যাকাউন্টের তথ্য').is_visible()
  created=[]
  def create_staff(route):
   created.append(route.request.post_data_json)
   route.fulfill(json={'message':'Admin তৈরি হয়েছে।'})
  page.route('**/functions/v1/play80-create-dsr',create_staff)
  form=page.locator('#p8StaffCreate form')
  for field,value in {'email':'new-admin@example.invalid','username':'new_admin','phone_number':'01700000001',
                      'full_name':'Test Admin','address':'Test address','pin':'654321'}.items():
   form.locator(f'input[name="{field}"]').fill(value)
  form.get_by_role('button',name='অ্যাকাউন্ট তৈরি ও যাচাই ইমেইল পাঠান').click()
  page.locator('#play80ActionPinValue').fill('123456')
  page.locator('#play80ActionPin button[value="confirm"]').click()
  page.get_by_text('Admin তৈরি হয়েছে।',exact=True).wait_for()
  assert created[0]['account_role']=='admin' and created[0]['pin_token']=='mock-staff-session'
  page.get_by_role('button',name='DSR অ্যাকাউন্ট তৈরি').click()
  assert page.get_by_role('heading',name='DSR অ্যাকাউন্টের তথ্য').is_visible()
  page.locator('#p8MenuButton').click()
  page.get_by_role('button',name='লগআউট',exact=True).click()
  assert page.locator('#screen-account').is_visible(),'Owner logout not returned to Sign In'
  assert page.locator('.play80TopTabs').is_hidden(),'Logout should lock gameplay'
  assert page.evaluate("()=>!localStorage.getItem('play80.secure_account.v1')"),'Logout must clear session'
  page.reload()
  assert page.locator('.play80TopTabs').is_hidden(),'Logout lock must persist after reload'
  current_role[0]='player'
  turnover={'withdrawal_guard_enabled':True,'items':[],'withdrawable_coins':0}
  player_wallet={'balance':0,'held_balance':0}
  page.route('**/rest/v1/rpc/play80_my_turnover',lambda route:route.fulfill(json=turnover))
  approved_credits=[]
  page.route('**/rest/v1/demo_wallet_requests?*status=eq.approved*',
             lambda route:route.fulfill(json=approved_credits))
  page.route('**/rest/v1/demo_wallets?*',lambda route:route.fulfill(json=[player_wallet]))
  page.route('**/rest/v1/profiles?*',lambda route:route.fulfill(json=[{'username':'example_player','display_name':'Player'}]))
  page.locator('#cloudLoginEmail').fill('testplayer@example.com')
  page.locator('#cloudLoginPassword').fill('123456')
  page.locator('#cloudLogin').click()
  page.wait_for_timeout(450)
  assert page.locator('.play80TopTabs').is_visible(),'Player login failed'
  assert page.locator('#screen-home').is_visible(),'Player should enter Games, not Owner'
  home=page.locator('#screen-home')
  catalog=home.locator('.homeGameGrid')
  games=catalog.locator('.gameTile')
  assert games.count()==14
  assert page.locator('#screen-bet .gameTile[data-game-id="ludo"]').count()==1
  assert home.locator('.hero, #p8RealAccountCTA').count()==0
  for width,height in [(360,720),(390,844)]:
   page.set_viewport_size({'width':width,'height':height})
   first_three=[games.nth(index).bounding_box() for index in range(3)]
   assert len({box['y'] for box in first_three})==1,'Mobile catalog should have three columns'
   assert games.nth(5).bounding_box()['y']+games.nth(5).bounding_box()['height'] < page.locator('.footerNav').bounding_box()['y']
   assert home.locator('.homeTournament').bounding_box()['height']<=48
  home.get_by_role('button',name='PLAY80 টুর্নামেন্ট').click()
  page.locator('#screen-tournament').wait_for(state='visible')
  page.locator('[data-main-tab="home"]').click()
  home.locator('#gameSearch').fill('dice')
  assert games.filter(visible=True).count()==1
  home.locator('#gameSearch').fill('')
  catalog.locator('[data-favorite="dice"]').click()
  home.locator('#favoritesOnly').click()
  assert games.filter(visible=True).count()==1
  catalog.locator('[data-favorite="dice"]').click()
  home.locator('#favoritesOnly').click()
  assert games.filter(visible=True).count()==14
  assert page.locator('#cloudOwnerEntry').is_hidden(),'Player must not access Owner panel'
  page.locator('#p8MenuButton').click()
  assert page.locator('#p8MenuQuick [data-panel="wallet"]').count()==0
  assert page.locator('#p8MenuBalance').inner_text()==page.locator('#headerCoins').inner_text()=='০'
  assert page.locator('#p8MenuName').inner_text()=='Player'
  assert page.locator('#p8MenuQuick .p8-menu-label').all_text_contents()==['ডিপোজিট','উইথড্র']
  assert page.locator('#p8MenuItems .p8-menu-label').all_text_contents()[:3]==['বোনাস','রেফার বোনাস','সাপোর্ট']
  tiles=page.locator('#p8MenuItems button')
  assert tiles.nth(0).bounding_box()['y']==tiles.nth(1).bounding_box()['y']
  assert tiles.nth(3).bounding_box()['y']==tiles.nth(0).bounding_box()['y']
  assert tiles.nth(4).bounding_box()['y']>tiles.nth(0).bounding_box()['y']
  assert page.get_by_role('button',name='রেফার বোনাস').is_visible()
  pending_periods=['2026-11-24T12:00:00Z','2026-11-25T12:00:00Z','2026-11-26T11:59:59Z']
  daily_claims=[]
  def reward_response():
   return {'server_at':'2026-11-26T12:00:00Z','next_at':'2026-11-27T11:59:59Z',
           'referral_code':'example_player','referral_count':2,'first_claimed':True,
           'pending_periods':pending_periods[:]}
  def capture_daily_claim(route):
   due=route.request.post_data_json['p_due_at']
   daily_claims.append(due)
   claimed=50 if due in pending_periods else 0
   if claimed: pending_periods.remove(due)
   route.fulfill(json={'claimed':claimed,'rewards':reward_response()})
  page.route('**/rest/v1/rpc/play80_my_rewards',lambda route:route.fulfill(json=reward_response()))
  page.route('**/rest/v1/rpc/play80_claim_daily_bonus',capture_daily_claim)
  page.get_by_role('button',name='রেফার বোনাস',exact=True).click()
  page.get_by_text('সফল রেফার ২টি').wait_for()
  assert page.get_by_label('PLAY80 আমন্ত্রণ লিংক').input_value().endswith('?ref=example_player')
  page.locator('#p8MenuButton').click()
  page.locator('.footerNav [data-p8-footer="bonus"]').click()
  page.get_by_text('৫,০০০ কয়েন · ক্লেম ✓ পাওয়া হয়েছে').wait_for()
  assert page.locator('.p8-countdown').inner_text().startswith('23:59:')
  assert page.locator('#cloudSignOut').is_hidden()
  rows=page.locator('.p8-daily-row')
  assert rows.count()==3
  assert rows.locator('strong').all_text_contents()==['৫০ কয়েন']*3
  rows.nth(1).get_by_role('button',name='ক্লেইম',exact=True).click()
  page.wait_for_function("document.querySelectorAll('.p8-daily-row').length === 2")
  assert daily_claims==['2026-11-25T12:00:00Z']
  assert rows.locator('button').evaluate_all("(buttons)=>buttons.map(b=>b.dataset.dueAt)")==pending_periods
  assert page.locator('.p8-countdown').inner_text().startswith('23:59:')
  sent=[]
  def capture_support(route):
   sent.append(route.request.post_data_json)
   route.fulfill(json={'ok':True})
  page.route('**/rest/v1/rpc/play80_send_support_message',capture_support)
  page.locator('#p8MenuButton').click()
  page.locator('.footerNav [data-p8-footer="support"]').click()
  page.locator('#p8WithdrawSupport').click()
  assert 'উইথড্র' in page.locator('#p8SupportPrompt').inner_text()
  page.locator('#p8DepositSupport').click()
  assert 'ডেমো' in page.locator('#p8SupportPrompt').inner_text()
  page.locator('#p8SupportText').fill('Demo reference 101')
  page.locator('#p8SendMessage').click()
  page.locator('#p8SupportReceipt').wait_for(state='visible')
  assert sent[0]['p_body']=='[ডেমো ডিপোজিট সমস্যা]\nDemo reference 101'
  page.locator('#p8MenuButton').click()
  page.locator('#p8MenuQuick').get_by_role('button',name='ডিপোজিট',exact=True).click()
  page.locator('#p8FirstCreditOffer').wait_for(state='visible')
  assert 'প্রথম অনুমোদিত ডিপোজিট ঠিক ১,০০০' in page.locator('#p8FirstCreditOffer').inner_text()
  assert page.get_by_label('ডেমো সেন্ড মানি নম্বর').input_value()=='00000000000'
  assert not page.get_by_label('ডেমো সেন্ড মানি নম্বর').is_editable()
  page.get_by_role('button',name='রিকোয়েস্টের ইতিহাস',exact=True).click()
  assert page.locator('#cloudSignedIn').get_attribute('data-section')=='history', page.locator('#cloudSignedIn').get_attribute('data-section')
  assert page.locator('#screen-account').is_visible()
  page.locator('#cloudRequests').wait_for(state='visible')
  assert page.locator('#cloudSubmit').is_hidden()
  assert page.locator('.footerNav [aria-current="page"]').get_attribute('data-p8-footer')=='wallet'
  page.locator('#globalBack').click()
  assert page.locator('#cloudSubmit').is_visible()
  page.get_by_role('button',name='অনুরোধ পাঠাও').click()
  page.get_by_text('ডেমো ট্রান্সেকশন নম্বর লিখুন।',exact=True).wait_for()
  page.get_by_label('ট্রান্সেকশন নম্বর',exact=True).fill('DEMO-1001')
  page.get_by_role('button',name='অনুরোধ পাঠাও').click()
  page.locator('#play80ActionPin').wait_for(state='visible')
  page.locator('#play80ActionPin button[value="cancel"]').click()
  approved_credits.append({'id':'already-approved'})
  page.locator('#cloudRefresh').click()
  page.locator('#p8FirstCreditOffer').wait_for(state='hidden')
  page.locator('#p8MenuButton').click()
  page.get_by_role('button',name='টার্নওভার',exact=True).click()
  page.get_by_text('বাকি টার্নওভার নেই।',exact=True).wait_for()
  page.locator('#p8MenuButton').click()
  turnover['items']=[{'source':'deposit','required':500,'completed':250}]
  page.locator('#p8MenuQuick').get_by_role('button',name='উইথড্র',exact=True).click()
  page.get_by_text('মোট বাকি ২৫০ কয়েন',exact=True).wait_for()
  assert page.locator('#cloudSignedIn').get_attribute('data-section')=='turnover'
  assert page.get_by_role('button',name='উইথড্র ফর্ম খুলুন').count()==0
  turnover['withdrawal_guard_enabled']=False
  page.get_by_role('button',name='হিসাব রিফ্রেশ করুন').click()
  page.get_by_role('button',name='উইথড্র ফর্ম খুলুন').click()
  assert page.locator('#cloudRequestKind').input_value()=='demo_debit'
  turnover['withdrawal_guard_enabled']=True
  page.get_by_role('button',name='অনুরোধ পাঠাও').click()
  page.get_by_text('মোট বাকি ২৫০ কয়েন',exact=True).wait_for()
  assert not page.locator('#play80ActionPin').is_visible()
  # An empty wallet must not open an action PIN for a 500-coin debit.
  turnover['items']=[]
  page.locator('#p8MenuButton').click()
  page.locator('#p8MenuQuick').get_by_role('button',name='ডিপোজিট',exact=True).click()
  page.locator('.p8-request-toolbar').get_by_role('button',name='উইথড্র',exact=True).click()
  page.locator('.p8-amount-grid [data-amount="500"]').click()
  page.get_by_role('button',name='অনুরোধ পাঠাও').click()
  page.get_by_text('উইথড্রযোগ্য ডেমো কয়েন: ০',exact=True).wait_for()
  assert not page.locator('#play80ActionPin').is_visible()
  # A completed deposit unlocks 500 demo coins even with an older source pending.
  player_wallet['balance']=6500
  turnover['items']=[{'source':'first_deposit_bonus','required':18000,'completed':0}]
  turnover['withdrawable_coins']=500
  page.locator('#p8MenuButton').click()
  page.locator('#p8MenuQuick').get_by_role('button',name='ডিপোজিট',exact=True).click()
  page.locator('.p8-request-toolbar').get_by_role('button',name='উইথড্র',exact=True).click()
  page.get_by_label('ট্রান্সেকশন নম্বর',exact=True).wait_for(state='hidden')
  assert page.get_by_label('ডেমো সেন্ড মানি নম্বর').is_hidden()
  assert page.get_by_role('button',name='বিকাশ ডেমো',exact=True).is_visible()
  assert page.locator('#cloudRequestKind').input_value()=='demo_debit'
  assert page.locator('.p8-request-toolbar [data-kind="demo_debit"]').get_attribute('aria-pressed')=='true'
  page.locator('.p8-amount-grid [data-amount="500"]').click()
  assert page.locator('#cloudAmount').input_value()=='500'
  assert page.locator('.p8-amount-grid [data-amount="500"]').get_attribute('aria-pressed')=='true'
  page.get_by_role('button',name='অনুরোধ পাঠাও').click()
  page.locator('#play80ActionPin').wait_for(state='visible')
  page.locator('#play80ActionPin button[value="cancel"]').click()
  assert page.locator('#play80ActionPin').is_hidden()
  page.locator('.footerNav [data-p8-footer="wallet"]').first.click()
  assert page.locator('#cloudSignOut').is_hidden()
  page.locator('#p8MenuButton').click()
  page.locator('#p8MenuItems').get_by_role('button',name='লগআউট',exact=True).click()
  assert page.locator('.play80TopTabs').is_hidden(),'Player logout must lock gameplay'
  current_role[0]='dsr'
  page.locator('#cloudLoginEmail').fill('dsr@example.invalid')
  page.locator('#cloudLoginPassword').fill('123456')
  page.locator('#cloudLogin').click()
  page.locator('#screen-home').wait_for(state='visible')
  assert page.locator('#cloudOwnerEntry').is_hidden()
  page.locator('.footerNav [data-p8-footer="wallet"]').first.click()
  assert page.locator('#cloudRole').inner_text()=='DSR'
  assert page.locator('.footerNav [data-p8-footer="bonus"]').is_hidden()
  page.locator('#p8MenuButton').click()
  assert page.locator('#p8MenuItems').get_by_role('button',name='রেফার বোনাস').count()==0
  page.locator('#p8MenuItems').get_by_role('button',name='লগআউট').click()
  current_role[0]='admin'
  page.locator('#cloudLoginEmail').fill('admin@example.invalid')
  page.locator('#cloudLoginPassword').fill('123456')
  page.locator('#cloudLogin').click()
  page.locator('#screen-remote-owner').wait_for(state='visible')
  page.locator('#p8MenuButton').click()
  assert page.locator('.footerNav [data-p8-footer="support"]').is_visible()
  assert page.locator('#p8MenuItems').get_by_role('button',name='কম্পিউটার প্লেয়ার').is_visible()
  assert page.locator('#p8MenuItems').get_by_role('button',name='টুর্নামেন্ট').is_visible()
  page.get_by_role('button',name='স্টাফ অ্যাকাউন্ট',exact=True).click()
  page.get_by_role('button',name='DSR অ্যাকাউন্ট তৈরি').wait_for()
  assert page.get_by_role('button',name='Admin অ্যাকাউন্ট তৈরি').count()==0
  assert not errors,'Unexpected JavaScript exceptions: '+str(errors)
  print('PASS: unified Sign In/Sign Up, small Owner creation, server-role Owner/Player routing, wallet without entry PIN, action PIN, staff creation and logout')
  browser.close()
finally:
 srv.shutdown();srv.server_close()
