from pathlib import Path
from playwright.sync_api import sync_playwright
import http.server,socketserver,threading,time

ROOT=Path(__file__).resolve().parent.parent/'assets'
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kw):super().__init__(*args,directory=str(ROOT),**kw)
 def log_message(self,*args):pass
class Server(socketserver.TCPServer):allow_reuse_address=True
server=Server(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
url='http://127.0.0.1:%s/index.html'%server.server_address[1]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.on('dialog',lambda d:d.accept())
  page.goto(url,wait_until='load')
  page.wait_for_timeout(350)
  assert page.locator('#screen-account').is_visible(),'Login should be first page'
  assert page.locator('#screen-home').is_hidden(),'No game before login'
  assert page.locator('.play80TopTabs').is_hidden(),'Game tabs hidden before login'
  assert page.locator('#screen-account').bounding_box()['y'] < 60,'Account was pushed below the app; blank page bug'
  page.locator('#p8ModeSignup').click()
  for item in ['cloudRegistrationUsername','p8SignupPhone','p8SignupFullName','p8SignupAddress','p8SignupConfirmPIN']:
   assert page.locator('#'+item).is_visible(),item+' signup field'
  order=page.evaluate('''() => ['cloudLoginEmail','cloudRegistrationUsername','p8SignupPhone','p8SignupFullName','p8SignupAddress','cloudLoginPassword','p8SignupConfirmPIN'].map(id=>document.getElementById(id).getBoundingClientRect().top)''')
  assert order==sorted(order),'Signup fields should follow Email, User ID, Phone, Name, Address, PIN, Confirm'
  assert page.locator('#cloudLoginPassword').get_attribute('maxlength')=='6'
  assert 'PIN' in page.locator('label[for="cloudLoginPassword"]').inner_text()
  page.locator('#p8ModeLogin').click()
  assert page.locator('#p8RegistrationFields').is_hidden()
  # AUTH MOCK ONLY for UI testing. No actual Supabase account is created or authenticated here.
  page.route('**/rest/v1/**',lambda route:route.fulfill(status=200,content_type='application/json',body='[]'))
  page.route('**/auth/v1/user',lambda route:route.fulfill(status=200,content_type='application/json',body='{"id":"00000000-0000-4000-8000-000000000001","email":"mock@example.test","email_confirmed_at":"2026-11-25T00:00:00Z","app_metadata":{"role":"player"}}'))
  page.evaluate('''() => localStorage.setItem('play80.secure_account.v1',JSON.stringify({
   access_token:'mock-ui-test-jwt',refresh_token:'mock-ui-test-refresh',
   expires_at:Math.floor(Date.now()/1000)+999999,
   user:{id:'00000000-0000-4000-8000-000000000001',email:'mock@example.test',app_metadata:{role:'player'}}
  }))''')
  startup_errors=[]
  page.on('pageerror',lambda error:startup_errors.append(str(error)))
  page.reload(wait_until='load')
  try:
   page.locator('.play80TopTabs').wait_for(state='visible',timeout=5000)
  except Exception as error:
   raise AssertionError('Game tabs unavailable after session restore: '+str(startup_errors)) from error
  page.locator('[data-main-tab="tournament"]').click()
  assert page.locator('#p8TournamentCatalog').is_visible(),'Tournament selector visible'
  assert page.locator('.p8TourCard').count()==4
  page.locator('[data-tour-choice="bubble"]').click()
  assert page.locator('#p8TourUpcoming').is_visible()
  page.locator('#p8TourPractice').click()
  assert page.locator('#p8RulesOverlay').is_visible(),'Rules are before game'
  page.locator('#p8RulesAccept').click()
  assert page.locator('#p8BubbleCanvas').is_visible(),'Real aimable bubble cannon canvas'
  assert page.locator('#p8BubbleSwap').count()==0,'No separate swap button'
  assert page.locator('#p8BubbleBomb').is_visible()
  canvas=page.locator('#p8BubbleCanvas')
  def tap_canvas(x,y):
   canvas.evaluate("(el)=>el.scrollIntoView({block:'center',inline:'center'})")
   page.wait_for_timeout(100)
   point=canvas.evaluate("(el,p)=>{const r=el.getBoundingClientRect();return {x:r.left+r.width*p[0]/400,y:r.top+r.height*p[1]/590}}",[x,y])
   page.evaluate("(p)=>{if(p.y>innerHeight-90)window.scrollBy(0,p.y-innerHeight+100)}",point)
   point=canvas.evaluate("(el,p)=>{const r=el.getBoundingClientRect();return {x:r.left+r.width*p[0]/400,y:r.top+r.height*p[1]/590}}",[x,y])
   assert canvas.evaluate("(el,p)=>document.elementFromPoint(p.x,p.y)===el",point),'Canvas target covered or outside viewport'
   page.mouse.click(point['x'],point['y'])
  tap_canvas(341,545)
  assert 'swapped' in page.locator('#p8BubbleMessage').inner_text()
  tap_canvas(200,548)
  assert 'Score: 0' in page.locator('#p8BubbleScore').inner_text(),'Cannon tap must not fire'
  page.locator('#p8BubbleBomb').click()
  assert 'CANCEL' in page.locator('#p8BubbleBomb').inner_text()
  # Pointer aim and fire into upper field
  tap_canvas(200,147)
  page.wait_for_timeout(1250)
  assert 'Score:' in page.locator('#p8BubbleScore').inner_text()
  page.locator('#p8PracticeBack').click()
  page.locator('#p8TourBack').click()
  page.locator('[data-tour-choice="block"]').click()
  page.locator('#p8TourPractice').click()
  page.locator('#p8RulesAccept').click()
  assert page.locator('#p8PracticeShapes .p8-block-mini').count()==3
  assert page.locator('#p8PracticeShapes .p8-block-mini i').count()>=3
  piece=page.locator('#p8PracticeShapes button').first
  piece.evaluate("(el)=>el.scrollIntoView({block:'center',inline:'center'})")
  page.wait_for_timeout(150)
  pbox=piece.bounding_box()
  target=page.locator('#p8PracticeGrid button[data-cell="36"]').bounding_box()
  start={'x':pbox['x']+pbox['width']/2,'y':pbox['y']+pbox['height']/2}
  end={'x':target['x']+target['width']/2,'y':target['y']+target['height']/2}
  assert piece.evaluate("(el,p)=>el.contains(document.elementFromPoint(p.x,p.y))",start),'Piece must be visible above footer'
  assert page.locator('#p8PracticeGrid').evaluate("(el,p)=>el.contains(document.elementFromPoint(p.x,p.y))",end),'Board must be visible'
  page.mouse.move(start['x'],start['y'])
  page.mouse.down()
  page.mouse.move(end['x'],end['y'],steps=12)
  assert page.locator('#p8PracticeGrid .blockPreview').count()>0,'Valid drag preview'
  page.mouse.up()
  assert page.locator('#p8PracticeGrid .blockFilled').count()>0,'Dragging a shaped piece fills cells'
  assert page.locator('#p8PracticeScore').inner_text()!='Score: 0'
  page.locator('#p8PracticeBack').click()
  page.locator('[data-main-tab="bet"]').click()
  page.locator('#p8OpenChess').click()
  assert page.locator('#p8RulesOverlay').is_visible()
  page.locator('#p8RulesAccept').click()
  assert page.locator('#screen-chess').is_visible()
  def move(a,b):
   for cell in [a,b]:
    col=ord(cell[0])-97;row=8-int(cell[1])
    page.locator('#p8ChessBoard button[data-cell="%s"]'%(row*8+col)).click()
  move('f2','f3');move('e7','e5');move('g2','g4');move('d8','h4')
  assert 'CHECKMATE' in page.locator('#p8ChessStatus').inner_text()
  assert page.locator('#p8ChessBoard button:not([disabled])').count()==0
  page.locator('#p8ChessRestart').click()
  page.locator('#p8ChessResign').click()
  assert 'RESIGNATION' in page.locator('#p8ChessStatus').inner_text()
  assert not errors,'Uncaught JS errors: '+str(errors)
  print('PASS: account-first PIN registration, no blank gap, authenticated-game gate, Bubble cannon/swap/bomb, 4 tournaments, Chess checkmate')
  browser.close()
finally:
 server.shutdown();server.server_close()
