from pathlib import Path
from playwright.sync_api import sync_playwright
import subprocess, time
html=Path(__file__).resolve().parent.parent/'assets'/'index.html'
server=subprocess.Popen(['python','-m','http.server','8765','--bind','127.0.0.1'],cwd=html.parent,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
 with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    errors=[]
    page.on('pageerror',lambda err: errors.append(str(err)))
    page.set_content(html.read_text(),wait_until='load')
    for asset in ['play80_online.js','play80_tournament.js','play80_practice_2048.js']:
        page.add_script_tag(content=html.parent.joinpath(asset).read_text())
    assert page.locator('#screen-home').is_visible()
    assert page.locator('[data-main-tab="tournament"]').count()==1
    page.locator('[data-main-tab="tournament"]').click()
    assert page.locator('#screen-tournament').is_visible()
    page.locator('#screen-tournament [data-open="2048"]').click()
    assert page.locator('#screen-2048').is_visible()
    assert page.locator('#practice2048Grid .p2048Tile').count()==16
    assert page.locator('#practice2048Grid .filled').count()==2
    assert page.locator('#practice2048Status').inner_text().startswith('Join')
    state=page.evaluate('() => [...document.querySelectorAll("#practice2048Grid .p2048Tile")].map(x=>Number(x.dataset.value))')
    for key in ['ArrowUp','ArrowRight','ArrowDown','ArrowLeft']:
        page.keyboard.press(key)
    after=page.evaluate('() => [...document.querySelectorAll("#practice2048Grid .p2048Tile")].map(x=>Number(x.dataset.value))')
    assert state!=after or sum(x!=0 for x in after)>2
    assert page.locator('[data-main-tab="tournament"]').get_attribute('class').find('active')>=0
    page.screenshot(path='/mnt/data/play80_v4_work/tests/screenshot_2048.png',full_page=True)
    page.locator('#practice2048New').click()
    assert page.locator('#practice2048Grid .filled').count()==2
    page.locator('#screen-2048 [data-open="tournament"]').first.click()
    assert page.locator('#screen-tournament').is_visible()
    # Legacy Casino and Ludo retained
    page.locator('[data-main-tab="home"]').click()
    assert page.locator('#screen-home').is_visible()
    page.locator('[data-main-tab="bet"]').click()
    assert page.locator('#screen-bet').is_visible()
    page.locator('#screen-bet [data-open="ludo"]').click()
    assert page.locator('#screen-ludo').is_visible()
    assert page.locator('#ludoBoard').count()==1
    assert not errors,errors
    print('PASS browser: 3 tabs, 2048 board/buttons/keys/restart, retained Ludo, 0 JS errors')
    b.close()
finally:
 server.terminate()
