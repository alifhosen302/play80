from pathlib import Path
from playwright.sync_api import sync_playwright
import http.server,socketserver,threading,json
ROOT=Path(__file__).resolve().parent.parent/'assets'
class H(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def log_message(self,*args):pass
class S(socketserver.TCPServer):allow_reuse_address=True
sv=S(('127.0.0.1',0),H);threading.Thread(target=sv.serve_forever,daemon=True).start()
url='http://127.0.0.1:%s/index.html'%sv.server_address[1]
calls=[]
def signup(route):
 calls.append(route.request.post_data_json)
 if len(calls)==1:
  route.fulfill(status=200,content_type='application/json',body=json.dumps({'user':{'id':'00000000-0000-4000-8000-000000000001'}}))
 else:
  route.fulfill(status=429,content_type='application/json',body=json.dumps({'code':'over_email_send_rate_limit','msg':'For security purposes, you can only request this after 45 seconds.'}))
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
  page.route('**/auth/v1/signup',signup)
  page.goto(url,wait_until='load')
  page.locator('#p8ModeSignup').click()
  page.locator('#cloudLoginEmail').fill('example.signup@test.invalid')
  page.locator('#cloudRegistrationUsername').fill('unique_player45')
  page.locator('#p8SignupPhone').fill('01712345678')
  page.locator('#p8SignupFullName').fill('Example Player')
  page.locator('#p8SignupAddress').fill('Test address Singapore')
  page.locator('#cloudLoginPassword').fill('246810')
  page.locator('#p8SignupConfirmPIN').fill('246810')
  page.locator('#cloudRegister').click()
  page.locator('#p8SignupResult').wait_for(state='visible',timeout=7000)
  assert 'Verification' in page.locator('#p8SignupResult').inner_text()
  assert page.locator('#cloudNotice').is_visible()
  assert 'Inbox' in page.locator('#cloudNotice').inner_text()
  assert len(calls)==1,'Expected exactly one signup request'
  page.locator('#cloudLoginPassword').fill('246810')
  page.locator('#p8SignupConfirmPIN').fill('246810')
  page.locator('#cloudRegister').click()
  page.get_by_text('বারবার CREATE ACCOUNT',exact=False).wait_for(state='visible',timeout=7000)
  assert page.locator('#cloudNotice').is_visible()
  assert not errors,'Uncaught JS error: '+str(errors)
  print('PASS signup success confirmation and 429 rate-limit explanation visible beside Create Account')
  browser.close()
finally:
 sv.shutdown();sv.server_close()
