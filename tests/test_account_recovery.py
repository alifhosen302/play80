from pathlib import Path
from playwright.sync_api import sync_playwright

assets = Path(__file__).resolve().parents[1] / "assets"
calls = []

def mock(route):
    request = route.request
    path = request.url.split("/auth/v1/")[-1].split("?")[0]
    calls.append(path)
    if path == "verify":
        assert request.post_data_json == {"type": "recovery", "token_hash": "test-proof"}
        route.fulfill(json={"access_token": "recovery-only"})
    elif path == "user":
        assert request.method == "PUT"
        assert request.headers["authorization"] == "Bearer recovery-only"
        assert request.post_data_json == {"password": "204680"}
        route.fulfill(json={})
    else:
        route.fulfill(json={})

with sync_playwright() as driver:
    browser = driver.chromium.launch(args=["--no-sandbox"])
    page = browser.new_page()
    page.route("**/auth/v1/**", mock)
    page.goto((assets / "index.html").as_uri())
    page.locator("#cloudLoginEmail").fill("qa@example.invalid")
    page.locator("#cloudRecover").click()
    page.locator('input[name="proof"]').fill("https://suhpmjqrcqkzaslptpca.supabase.co/auth/v1/verify?type=recovery&token=test-proof")
    page.locator('input[name="repeatPin"]').fill("204680")
    page.locator('input[name="pin"]:visible').fill("204681")
    page.get_by_role("button", name="PIN সংরক্ষণ").click()
    assert calls == ["recover"]
    page.locator('input[name="pin"]:visible').fill("204680")
    page.get_by_role("button", name="PIN সংরক্ষণ").click()
    page.get_by_text("PIN বদলেছে। নতুন PIN দিয়ে লগইন করো।").wait_for()
    assert calls == ["recover", "verify", "user", "logout"]
    assert page.locator("#cloudSignedOut").is_visible()
    assert page.evaluate("localStorage.getItem('play80.secure_account.v1')") is None
    browser.close()
print("PASS recovery proof, repeated PIN validation and fresh sign-in")
