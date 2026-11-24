from pathlib import Path
from playwright.sync_api import sync_playwright
s=Path(__file__).parent.joinpath('assets/index.html').read_text()
names=['carnival','cups','apples','slots','roulette','blackjack','plinko','mines','keno','scratch']
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 issues=[]
 for key in names:
  page=browser.new_page(viewport={'width':390,'height':844})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   page.set_content(s)
   page.locator('[data-arcade="'+key+'"]').first.click(force=True)
   assert page.locator('#screen-arcade').is_visible()
   if key in ['cups','apples','blackjack','plinko','mines','scratch']:
    page.locator('[data-arc-action="start"]').click()
   elif key in ['carnival','slots','roulette']:
    page.locator('[data-arc-action="spin"]').click()
   else:
    for i in range(1,5):page.locator(f'[data-keno="{i}"]').click()
    page.locator('[data-arc-action="draw"]').click()
   page.wait_for_timeout(240 if key!='slots' else 2100)
   if key=='apples':page.locator('[data-apple="0"]').click()
   if key=='plinko':page.wait_for_timeout(1100)
   assert not errors,errors
   print('PASS',key,page.locator('#arcadeTitle').inner_text(), 'coins',page.locator('#points').inner_text() if page.locator('#points').count() else 'visible')
  except Exception as e:
   print('FAIL',key,str(e)[:400],errors);issues.append(key)
  finally:page.close()
 browser.close()
 assert not issues,issues
