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
  page.locator('#cloudLoginEmail').fill('play80.management@gmail.com')
  page.locator('#cloudLoginPassword').fill('123456')
  page.locator('#cloudLogin').click()
  page.wait_for_timeout(450)
  assert page.locator('.play80TopTabs').is_visible(),'Verified Owner login failed'
  assert page.locator('#screen-remote-owner').is_visible(),'Owner dashboard not opened'
  assert page.locator('#cloudStaffPinGate').is_visible(),'Owner action PIN gate missing'
  page.route('**/rest/v1/rpc/play80_menu_counts',lambda route:route.fulfill(json={'requests':1,'support':1}))
  page.locator('#p8MenuButton').click()
  page.locator('#p8MenuButton[data-alert]').wait_for(state='visible')
  assert page.locator('#p8MenuItems [data-panel="wallet"][data-alert]').is_visible()
  assert page.locator('#p8MenuItems [data-panel="inbox"][data-alert]').is_visible()
  page.get_by_role('button',name='ইউজার দেখুন').click()
  assert page.locator('#cloudStaffPinGate').is_visible()
  assert page.locator('#p8OwnerLogout').is_visible()
  page.locator('#p8OwnerLogout').click()
  assert page.locator('#screen-account').is_visible(),'Owner logout not returned to Sign In'
  assert page.locator('.play80TopTabs').is_hidden(),'Logout should lock gameplay'
  assert page.evaluate("()=>!localStorage.getItem('play80.secure_account.v1')"),'Logout must clear session'
  page.reload()
  assert page.locator('.play80TopTabs').is_hidden(),'Logout lock must persist after reload'
  current_role[0]='player'
  page.locator('#cloudLoginEmail').fill('testplayer@example.com')
  page.locator('#cloudLoginPassword').fill('123456')
  page.locator('#cloudLogin').click()
  page.wait_for_timeout(450)
  assert page.locator('.play80TopTabs').is_visible(),'Player login failed'
  assert page.locator('#screen-home').is_visible(),'Player should enter Games, not Owner'
  assert page.locator('#cloudOwnerEntry').is_hidden(),'Player must not access Owner panel'
  page.locator('#p8MenuButton').click()
  assert page.locator('#p8MenuItems [data-panel="wallet"]').count()==0
  assert page.get_by_role('button',name='রেফার বোনাস').is_visible()
  page.get_by_role('button',name='উইথড্র',exact=True).click()
  assert page.locator('#cloudRequestKind').input_value()=='demo_debit'
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
