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
  def wallet_page(route):
   request=route.request.post_data_json
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
  page.locator('#p8MenuQuick [data-panel="wallet"]').click()
  assert page.locator('#screen-owner-wallet').is_visible()
  assert page.locator('.cloudStaffTabs').is_hidden()
  assert page.locator('.play80TopTabs').is_hidden()
  page.locator('#cloudStaffPin').fill('123456')
  page.locator('#cloudStaffUnlock').click()
  page.get_by_role('button',name='✓ অনুমোদন').click()
  assert staff_calls==[]
  page.locator('#play80ActionPinValue').fill('123456')
  page.locator('#play80ActionPin button[value="confirm"]').click()
  page.wait_for_function("() => !document.querySelector('#play80ActionPin').open")
  page.get_by_text('রিকোয়েস্ট অনুমোদিত হয়েছে।').wait_for()
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
  page.get_by_role('button',name='লগআউট',exact=True).click()
  assert page.locator('#screen-account').is_visible(),'Owner logout not returned to Sign In'
  assert page.locator('.play80TopTabs').is_hidden(),'Logout should lock gameplay'
  assert page.evaluate("()=>!localStorage.getItem('play80.secure_account.v1')"),'Logout must clear session'
  page.reload()
  assert page.locator('.play80TopTabs').is_hidden(),'Logout lock must persist after reload'
  current_role[0]='player'
  approved_credits=[]
  page.route('**/rest/v1/demo_wallet_requests?*status=eq.approved*',
             lambda route:route.fulfill(json=approved_credits))
  page.route('**/rest/v1/demo_wallets?*',lambda route:route.fulfill(json=[{'balance':0,'held_balance':0}]))
  page.route('**/rest/v1/profiles?*',lambda route:route.fulfill(json=[{'username':'example_player','display_name':'Player'}]))
  page.locator('#cloudLoginEmail').fill('testplayer@example.com')
  page.locator('#cloudLoginPassword').fill('123456')
  page.locator('#cloudLogin').click()
  page.wait_for_timeout(450)
  assert page.locator('.play80TopTabs').is_visible(),'Player login failed'
  assert page.locator('#screen-home').is_visible(),'Player should enter Games, not Owner'
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
  page.locator('#p8MenuQuick').get_by_role('button',name='ডিপোজিট',exact=True).click()
  page.locator('#p8FirstCreditOffer').wait_for(state='visible')
  assert 'প্রথম অনুমোদিত ডিপোজিট ঠিক ১,০০০' in page.locator('#p8FirstCreditOffer').inner_text()
  assert page.get_by_label('ডেমো সেন্ড মানি নম্বর').input_value()=='00000000000'
  assert not page.get_by_label('ডেমো সেন্ড মানি নম্বর').is_editable()
  page.get_by_role('button',name='অনুরোধ পাঠাও').click()
  page.get_by_text('ডেমো ট্রান্সেকশন নম্বর লিখুন।',exact=True).wait_for()
  page.get_by_label('ট্রান্সেকশন নম্বর',exact=True).fill('DEMO-1001')
  page.get_by_role('button',name='অনুরোধ পাঠাও').click()
  page.locator('#play80ActionPin').wait_for(state='visible')
  page.locator('#play80ActionPin button[value="cancel"]').click()
  approved_credits.append({'id':'already-approved'})
  page.locator('#cloudRefresh').click()
  page.locator('#p8FirstCreditOffer').wait_for(state='hidden')
  page.locator('.p8-request-toolbar').get_by_role('button',name='উইথড্র',exact=True).click()
  assert page.get_by_label('ট্রান্সেকশন নম্বর',exact=True).is_hidden()
  assert page.get_by_label('ডেমো সেন্ড মানি নম্বর').is_hidden()
  assert page.get_by_role('button',name='বিকাশ ডেমো',exact=True).is_visible()
  assert page.locator('#cloudRequestKind').input_value()=='demo_debit'
  assert page.locator('.p8-request-toolbar [data-kind="demo_debit"]').get_attribute('aria-pressed')=='true'
  page.locator('.p8-amount-grid [data-amount="500"]').click()
  assert page.locator('#cloudAmount').input_value()=='500'
  assert page.locator('.p8-amount-grid [data-amount="500"]').get_attribute('aria-pressed')=='true'
  page.get_by_role('button',name='অনুরোধ পাঠাও').click()
  assert page.locator('#play80ActionPin').is_visible()
  page.locator('#play80ActionPin button[value="cancel"]').click()
  assert page.locator('#play80ActionPin').is_hidden()
  page.locator('.footerNav [data-open="account"]').first.click()
  page.locator('#cloudSignOut').click()
  assert page.locator('.play80TopTabs').is_hidden(),'Player logout must lock gameplay'
  current_role[0]='dsr'
  page.locator('#cloudLoginEmail').fill('dsr@example.invalid')
  page.locator('#cloudLoginPassword').fill('123456')
  page.locator('#cloudLogin').click()
  page.locator('#screen-home').wait_for(state='visible')
  assert page.locator('#cloudOwnerEntry').is_hidden()
  page.locator('.footerNav [data-open="account"]').first.click()
  assert page.locator('#cloudRole').inner_text()=='DSR'
  assert not errors,'Unexpected JavaScript exceptions: '+str(errors)
  print('PASS: unified Sign In/Sign Up, small Owner creation, server-role Owner/Player routing, PIN gate and logout')
  browser.close()
finally:
 srv.shutdown();srv.server_close()
