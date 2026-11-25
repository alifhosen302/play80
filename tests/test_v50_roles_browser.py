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
  assert page.locator('#p8ModeOwner').is_visible()
  assert page.locator('#p8ModeLogin').is_visible()
  assert page.locator('#p8ModeSignup').is_visible()
  assert page.locator('#p8FirstOwnerSignup').is_hidden()
  page.locator('#p8ModeOwner').click()
  assert page.locator('#p8FirstOwnerSignup').is_visible()
  assert page.locator('#cloudRegister').is_hidden()
  page.locator('#p8FirstOwnerSignup').click()
  assert page.locator('#p8RegistrationFields').is_visible()
  order=page.evaluate("""()=>['cloudLoginEmail','cloudRegistrationUsername','p8SignupPhone','p8SignupFullName','p8SignupAddress','cloudLoginPassword','p8SignupConfirmPIN'].map(id=>document.getElementById(id).getBoundingClientRect().top)""")
  assert order==sorted(order),'Registration field order is incorrect'
  page.locator('#p8ModeOwner').click()
  assert page.locator('#p8RegistrationFields').is_hidden()
  # Someone attempting to enter Owner dashboard using a player token is refused.
  current_role[0]='player'
  page.locator('#cloudLoginEmail').fill('testplayer@example.com')
  page.locator('#cloudLoginPassword').fill('123456')
  page.locator('#cloudLogin').click()
  page.wait_for_timeout(250)
  assert page.locator('.play80TopTabs').is_hidden(),'Player must not use owner entry'
  assert 'Owner নয়' in page.locator('#cloudNotice').inner_text(),'Clear role error missing'
  # Verified owner login grants owner-only entry
  current_role[0]='owner'
  page.locator('#cloudLoginEmail').fill('play80.management@gmail.com')
  page.locator('#cloudLoginPassword').fill('123456')
  page.locator('#cloudLogin').click()
  page.wait_for_timeout(350)
  assert page.locator('.play80TopTabs').is_visible(),'Verified owner login failed'
  assert page.locator('#screen-remote-owner').is_visible(),'Owner dashboard not opened'
  assert page.locator('#cloudStaffPinGate').is_visible(),'Admin action PIN gate missing'
  assert page.locator('#p8OwnerLogout').is_visible()
  page.locator('#p8OwnerLogout').click()
  assert page.locator('#screen-account').is_visible(),'Owner logout not returned to sign in'
  assert page.locator('.play80TopTabs').is_hidden(),'Owner logout should lock gameplay'
  assert page.evaluate("()=>!localStorage.getItem('play80.secure_account.v1')"),'Logout should clear session'
  page.reload()
  assert page.locator('.play80TopTabs').is_hidden(),'Logout must remain locked after reload'
  current_role[0]='player'
  page.locator('#p8ModeLogin').click()
  page.locator('#cloudLoginEmail').fill('testplayer@example.com')
  page.locator('#cloudLoginPassword').fill('123456')
  page.locator('#cloudLogin').click()
  page.wait_for_timeout(350)
  assert page.locator('.play80TopTabs').is_visible(),'Player login failed'
  assert page.locator('#cloudOwnerEntry').is_hidden(),'Player must not access owner dashboard'
  page.locator('#cloudSignOut').click()
  assert page.locator('.play80TopTabs').is_hidden(),'Player logout must lock gameplay'
  assert not errors,'Unexpected JavaScript exceptions: '+str(errors)
  print('PASS: separate Player/Owner sign-in, owner role rejection, owner dashboard PIN, first-time signup, player login, owner/player logout and persistent lock')
  browser.close()
finally:
 srv.shutdown();srv.server_close()
