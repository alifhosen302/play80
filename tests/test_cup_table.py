from pathlib import Path
from playwright.sync_api import sync_playwright

assets = Path(__file__).resolve().parents[1] / "assets"
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 360, "height": 720}, has_touch=True)
    page.set_content('<meta name="viewport" content="width=device-width"><main></main>')
    page.add_script_tag(path=str(assets / "play80_cup_table.js"))
    page.evaluate("window.table = createCupTable(document.querySelector('main'))")
    assert page.locator('[data-cup]:disabled').count() == 3
    # Move physical cup zero to the right once, then perform five swaps of cups 1 and 2.
    page.evaluate("""async () => {
        const moves = [0,1, 1,0, 1,0, 1,0, 1,0, 1,0];
        if (!await table.shuffle(0, () => true, () => moves.shift())) throw Error('Aborted round');
    }""")
    assert page.locator('[data-cup]:enabled').count() == 3
    assert page.locator('[data-cup="0"]').get_attribute('aria-label') == 'Cup 3'
    assert page.evaluate("table.reveal(1, () => true)") == 3
    assert page.locator('[data-cup]:disabled').count() == 3
    assert not page.evaluate("table.shuffle(2, () => false, () => 0)")
    browser.close()
