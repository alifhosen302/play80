from pathlib import Path
from playwright.sync_api import sync_playwright
import http.server, socketserver, threading

ROOT=Path(__file__).resolve().parent.parent/'assets'
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def log_message(self,*args):pass
class Server(socketserver.TCPServer):allow_reuse_address=True
srv=Server(('127.0.0.1',0),Handler)
thread=threading.Thread(target=srv.serve_forever,daemon=True);thread.start()
URL='http://127.0.0.1:%s/index.html'%srv.server_address[1]

def click_square(page,algebra):
 col=ord(algebra[0])-ord('a');row=8-int(algebra[1]);idx=row*8+col
 page.locator('#p8ChessBoard button[data-cell="%s"]'%idx).click()

def move(page,a,b):click_square(page,a);click_square(page,b)

try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.on('dialog',lambda dialog:dialog.accept())
  page.goto(URL,wait_until='load')
  page.wait_for_timeout(500)
  assert page.locator('#p8RealAccountCTA').count()==0
  assert page.locator('#screen-account').is_visible(),'Real sign-in screen should be visible'
  assert page.locator('#cloudSignedOut').is_visible()
  page.locator('#p8ModeSignup').click()
  assert page.locator('#cloudRegistrationUsername').is_visible()
  assert page.locator('#cloudRegister').is_visible()
  page.locator('#p8ModeLogin').click()
  assert page.locator('#cloudLogin').is_visible()
  page.route('**/rest/v1/**',lambda route:route.fulfill(json=[]))
  test_user={'id':'00000000-0000-4000-8000-000000000001','email':'mock@example.test',
             'email_confirmed_at':'2026-11-25T00:00:00Z','app_metadata':{'role':'player'}}
  page.route('**/auth/v1/user',lambda route:route.fulfill(json=test_user))
  page.evaluate('''user => localStorage.setItem('play80.secure_account.v1',JSON.stringify({
   access_token:'mock-ui-test-jwt',refresh_token:'mock-ui-test-refresh',
   expires_at:Math.floor(Date.now()/1000)+3600,user
  }))''',test_user)
  page.reload(wait_until='load')
  page.locator('#screen-home').wait_for(state='visible')
  page.locator('[data-main-tab="tournament"]').click()
  assert page.locator('#p8TournamentCatalog').is_visible()
  assert page.locator('.p8TourCard').count()==4
  page.locator('[data-tour-choice="bubble"]').click()
  assert page.locator('#p8TourUpcoming').is_visible()
  page.locator('#p8TourPractice').click()
  assert page.locator('#p8RulesOverlay').is_visible(),'Pregame rules gate missing'
  page.locator('#p8RulesAccept').click()
  assert page.locator('#screen-p8-practice').is_visible()
  assert page.locator('#p8PracticeGrid button').count()==64
  page.locator('#p8PracticeBack').click()
  page.locator('[data-main-tab="tournament"]').click()
  page.locator('[data-tour-choice="memory"]').click()
  assert page.locator('#p8TourMemoryLive').is_visible()
  page.locator('[data-main-tab="bet"]').click()
  page.locator('#p8OpenChess').click()
  assert page.locator('#p8RulesOverlay').is_visible()
  page.locator('#p8RulesAccept').click()
  assert page.locator('#screen-chess').is_visible()
  assert page.locator('#p8ChessBoard button').count()==64
  assert page.locator('#p8BlackName').is_visible()
  assert page.locator('#p8WhiteName').is_visible()
  # Fool's mate: white f3, black e5, white g4, black Qh4#
  move(page,'f2','f3')
  move(page,'e7','e5')
  move(page,'g2','g4')
  move(page,'d8','h4')
  assert 'CHECKMATE' in page.locator('#p8ChessStatus').inner_text(),'Checkmate not detected'
  assert page.locator('#p8ChessBoard button:not([disabled])').count()==0,'Moves still enabled after checkmate'
  page.locator('#p8ChessRestart').click()
  page.locator('#p8ChessResign').click()
  assert 'RESIGNATION' in page.locator('#p8ChessStatus').inner_text()
  page.locator('#p8ChessRestart').click()
  page.locator('#p8ChessDraw').click()
  assert 'DRAW' in page.locator('#p8ChessStatus').inner_text()
  assert not errors,'Uncaught JavaScript errors: '+str(errors)
  print('PASS mobile browser: real signup/signin, four tournament cards, bubble practice, rules gate, Chess Fool\'s Mate, resignation/draw, 0 JS errors')
  browser.close()
finally:
 srv.shutdown();srv.server_close()
