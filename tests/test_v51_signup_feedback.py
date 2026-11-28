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
  # Login must fit in a compact mobile viewport even with a logout notice.
  page.locator('#p8ModeLogin').wait_for(state='visible')
  page.locator('#cloudNotice').evaluate("""el => {el.hidden=false;el.classList.add('p8AuthSuccess');el.textContent='এই ডিভাইস থেকে লগআউট হয়েছে।';}""")
  for width,height in [(360,680),(390,740)]:
   page.set_viewport_size({'width':width,'height':height})
   page.evaluate('window.scrollTo(0,0)')
   assert page.locator('#screen-account .p8AuthHero img').is_visible()
   assert not page.locator('#screen-account .p8AuthHero h1').is_visible()
   assert not page.locator('#screen-account .p8AuthHero p').is_visible()
   assert not page.locator('#screen-account .p8CoinDisclaimer').is_visible()
   for selector in ['#p8ModeLogin','#p8ModeSignup','#cloudLoginEmail','#cloudLoginPassword','#cloudLogin','#cloudNotice','#cloudRecover','#cloudSignedOut > details > summary','#cloudSignedOut > details + button','#p8FirstOwnerSignup']:
    element=page.locator(selector)
    assert element.is_visible(),selector+' not visible'
    rect=element.bounding_box()
    assert rect and rect['y']>=0 and rect['y']+rect['height']<=height+1,selector+' outside viewport at '+str((width,height))+': '+str(rect)
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),'Login horizontal overflow'
  page.set_viewport_size({'width':390,'height':844})
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
