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
  event={'id':'mock-event','game':'memory','status':'registration_open','server_time':'2026-11-27T12:00:00Z','registration_ends_at':'2026-11-27T15:00:00Z','human_count':1,'bot_count':0,'funded_pool':0,'my_score':0,'fee_mode':'per_round','joined':False,'rules':{'late_registration':True},'ends_at':'2026-11-30T15:00:00Z'}
  page.route('**/rest/v1/rpc/play80_tournament_public',lambda route:route.fulfill(json=event))
  page.route('**/rest/v1/rpc/play80_tournament_leaderboard',lambda route:route.fulfill(json=[{'rank':1,'username':'mock_registered','type':'human','total_score':0,'games_played':0}]))
  page.locator('[data-tour-choice="memory"]').click()
  page.locator('#tourLeaderboard').get_by_text('mock_registered',exact=True).wait_for()
  assert page.locator('#tourCountdown').inner_text()!='--:--:--'
  assert page.locator('#p8TourPrizeBreakdown').is_hidden()
  page.locator('#p8TourPrizeButton').click()
  assert page.locator('#p8TourPrizeBreakdown .p8PrizeRow').count()==8
  assert page.locator('#p8TourPrizeBreakdown').is_visible()
  page.locator('#p8TourPrizeButton').click()
  assert page.locator('#p8TourPrizeBreakdown').is_hidden()
  preview_calls=[]
  page.on('request',lambda req:preview_calls.append(req.url) if any(x in req.url for x in ['/rpc/play80_memory_start','/rpc/play80_tournament_join','/rpc/play80_memory_flip']) else None)
  page.locator('#p8TourPractice').click()
  page.locator('#p8RulesAccept').click()
  assert page.locator('#p8LocalMemoryGrid button').count()==16
  page.locator('#p8LocalMemoryGrid button').first.click()
  assert page.locator('#p8LocalMemoryGrid .show').count()==1
  page.locator('#p8PracticeBack').click()
  assert page.locator('#p8TournamentDetail').is_visible()
  assert preview_calls==[],'Preview must not join or debit a tournament'
  event['status']='running'
  page.locator('#tourRefresh').click()
  page.wait_for_function("document.getElementById('tourState').textContent==='খেলা চলছে'")
  assert page.locator('#tourJoin').is_enabled()
  assert page.locator('#tourPlay').is_hidden()
  assert page.locator('#tourLeaderboard').get_by_text('mock_registered',exact=True).is_visible()
  assert page.locator('#p8TourPractice').is_visible()
  page.locator('#p8TourBack').click()
  page.locator('[data-tour-choice="bubble"]').click()
  assert page.locator('#p8TourUpcoming').is_visible()
  assert page.locator('.p8TourOverview').is_visible()
  assert page.locator('#tourState').inner_text()=='এখনো চালু হয়নি'
  assert page.locator('#tourCountdown').inner_text()=='—'
  assert page.locator('#tourJoin').is_hidden()
  page.locator('#p8TourPrizeButton').click()
  assert page.locator('#p8TourPrizeBreakdown .p8PrizeRow').count()==8
  assert 'এখনো' in page.locator('#p8PrizeInfo').inner_text()
  page.locator('#p8TourPrizeButton').click()
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
  assert page.locator('#p8PracticeShapes button').evaluate_all('(buttons)=>buttons.every(b=>Math.abs(b.getBoundingClientRect().height-buttons[0].getBoundingClientRect().height)<1)')
  assert page.locator('#p8PracticeShapes .p8-block-mini i').evaluate_all('(tiles)=>tiles.every(t=>{const r=t.getBoundingClientRect();return Math.abs(r.width-r.height)<1&&r.width<=18})'),'Mini tiles are square and fixed-size'
  assert page.locator('#p8PracticeShapes .p8-block-mini').evaluate_all('(items)=>items.every(el=>{const a=[...el.children],n=Number(el.style.getPropertyValue("--cols")),w=a[0].getBoundingClientRect().width;return a.every((t,i)=>{const r=t.getBoundingClientRect(),o=a[0].getBoundingClientRect();return Math.abs(r.left-o.left-(i%n)*(w+2))<1&&Math.abs(r.top-o.top-Math.floor(i/n)*(w+2))<1})})'),'Shape geometry must match the fixed grid'
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
  assert page.locator('#p8OpenChess').is_disabled()
  page.locator('#arenaStake').select_option('500')
  state=page.evaluate('()=>PLAY80Chess.start()')
  calls=[]
  def bot_api(route):
   body=route.request.post_data_json
   calls.append(body['action'])
   if body['action']=='terms':
    route.fulfill(json={'win_percent':180,'draw_fee':10})
   else:
    route.fulfill(json={'id':body['id'],'game':'chess','revision':0,'stake':500,'win_amount':900,'draw_amount':490,'state':state,'status':'forfeit' if body['action']=='forfeit' else 'active'})
  page.route('**/functions/v1/bot-arena',bot_api)
  page.locator('#p8OpenChess').click()
  page.locator('#p8RulesAccept').click()
  page.locator('#screen-chess').wait_for(state='visible')
  assert page.locator('#p8ChessBoard button').count()==64
  page.locator('#p8ChessLeave').click()
  page.locator('#arenaNotice').get_by_text('বেট ফেরত নেই।',exact=False).wait_for()
  assert calls==['terms','start','forfeit'],calls
  assert not errors,'Uncaught JS errors: '+str(errors)
  print('PASS: account-first PIN registration, no blank gap, authenticated-game gate, Bubble cannon/swap/bomb, 4 tournaments, computer bet entry and forfeit')
  browser.close()
finally:
 server.shutdown();server.server_close()
