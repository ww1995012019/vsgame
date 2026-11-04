"""Real Chromium interaction checks. Start `npm run dev` before running this file.

Requires Python Playwright and Chromium; the game itself has no dependencies.
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ.get('GAME_URL', 'http://127.0.0.1:3000')
OUTPUT = Path(__file__).resolve().parent.parent / 'test-results'
OUTPUT.mkdir(exist_ok=True)


def bind_game(page):
    page.evaluate("async () => { window.testGame = (await import('/src/app.js')).game; }")


def wait_playing(page):
    page.wait_for_function("window.testGame.state === 'playing'", timeout=10000)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
    desktop = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    page = desktop.new_page()
    errors, bad_responses = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: bad_responses.append(response.url) if response.status >= 400 else None)
    page.goto(URL, wait_until='networkidle')
    page.wait_for_selector('#asset-loading', state='hidden')
    bind_game(page)
    assert page.title() == '街头对决 · STREET DUEL'
    page.screenshot(path=str(OUTPUT / 'desktop.png'), full_page=True)
    print('PASS: artwork loaded and desktop rendered', flush=True)

    page.click('#start-button')
    wait_playing(page)
    start_x = page.evaluate('testGame.fighters[0].x')
    page.keyboard.down('KeyD')
    page.wait_for_timeout(350)
    page.keyboard.up('KeyD')
    assert page.evaluate('testGame.fighters[0].x') > start_x + 50
    page.keyboard.press('KeyW')
    page.wait_for_function('testGame.fighters[0].y > 20')
    assert page.evaluate('testGame.fighters[0].jumpPhase') == 'air'
    print('PASS: enter battle, keyboard movement, jump', flush=True)

    page.click('[data-nav="training"]')
    assert page.evaluate('testGame.training')
    page.keyboard.down('KeyD')
    page.wait_for_function('testGame.fighters[0].x > 975')
    page.keyboard.up('KeyD')
    page.keyboard.press('KeyJ')
    page.wait_for_function('testGame.fighters[1].hp < 100')
    assert page.evaluate('testGame.matchStats.hits') == 1
    page.wait_for_timeout(250)
    page.keyboard.press('KeyK')
    page.wait_for_timeout(220)
    page.screenshot(path=str(OUTPUT / 'combat.png'), full_page=True)
    page.wait_for_function('testGame.matchStats.hits >= 2')
    page.wait_for_function('testGame.fighters[0].attack === null')
    page.keyboard.press('KeyL')
    page.wait_for_function('testGame.matchStats.hits >= 3')
    assert page.locator('#training-readout').is_visible()
    assert page.locator('#timer').inner_text() == '∞'
    print('PASS: real punch, kick, projectile hits and training stats', flush=True)

    page.keyboard.press('Escape')
    page.wait_for_selector('#pause-dialog[open]')
    elapsed = page.evaluate('testGame.elapsed')
    page.wait_for_timeout(250)
    assert page.evaluate('testGame.elapsed') == elapsed
    page.keyboard.press('Escape')
    page.wait_for_selector('#pause-dialog', state='hidden')
    page.wait_for_function(f'testGame.elapsed > {elapsed}')
    print('PASS: pause freezes simulation and Escape resumes', flush=True)

    page.click('#settings-button')
    page.select_option('#difficulty-select', 'hard')
    page.locator('#volume-input').fill('20')
    page.locator('#shake-input').uncheck()
    page.click('#settings-form button[type=submit]')
    assert page.evaluate('testGame.difficulty') == 'hard'
    assert page.evaluate("JSON.parse(localStorage.getItem('street-duel-settings')).volume") == 20
    page.click('[data-nav="characters"]')
    page.click('[data-character="hanfeng"]')
    page.click('#confirm-character')
    assert page.evaluate('testGame.fighters[0].id') == 'hanfeng'
    assert page.locator('#player-name').inner_text() == '寒锋'
    assert page.locator('#enemy-name').inner_text() == '烈影'
    print('PASS: settings persist and character selection swaps the fighters', flush=True)

    page.click('[data-nav="arena"]')
    wait_playing(page)
    # Arrange a nearly finished round; damage and all settlement logic still run
    # through actual keyboard input and the production attack update.
    for round_number in (1, 2):
        page.evaluate("() => { testGame.fighters[0].x=650; testGame.fighters[1].x=805; testGame.fighters[1].hp=1; testGame.fighters[1].attack=null; testGame.fighters[1].blocking=false; testGame.fighters[1].aiTimer=2; }")
        page.keyboard.press('KeyJ')
        page.wait_for_selector('#result-dialog[open]', timeout=10000)
        assert page.locator('#result-score').inner_text() == f'{round_number} : 0'
        if round_number == 1:
            assert page.locator('#result-title').inner_text() == '回合胜利'
            page.click('#next-round-button')
            wait_playing(page)
        else:
            assert page.locator('#result-title').inner_text() == '全场制霸'
            page.screenshot(path=str(OUTPUT / 'victory.png'), full_page=True)
    page.click('#next-round-button')
    page.click('[data-nav="leaderboard"]')
    assert page.locator('#stat-matches').inner_text() == '1'
    assert page.locator('#stat-wins').inner_text() == '1'
    assert page.locator('.history-result').inner_text() == '胜利'
    print('PASS: two actual knockouts, next round, match victory and local record', flush=True)
    page.click('[data-close="leaderboard-dialog"]')
    page.reload(wait_until='networkidle')
    page.wait_for_selector('#asset-loading', state='hidden')
    bind_game(page)
    assert page.evaluate('testGame.difficulty') == 'hard'
    page.click('[data-nav="leaderboard"]')
    assert page.locator('#stat-wins').inner_text() == '1'
    assert not errors, errors
    assert not bad_responses, bad_responses
    print('PASS: reload preserves settings and match history, no page errors or failed requests', flush=True)

    mobile = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
    phone = mobile.new_page()
    phone.on('pageerror', lambda error: errors.append(str(error)))
    phone.goto(URL, wait_until='networkidle')
    phone.wait_for_selector('#asset-loading', state='hidden')
    bind_game(phone)
    assert phone.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert phone.locator('#touch-controls').is_visible()
    phone.screenshot(path=str(OUTPUT / 'mobile.png'), full_page=True)
    phone.click('[data-nav="training"]')
    start_x = phone.evaluate('testGame.fighters[0].x')
    box = phone.locator('[data-control="right"]').bounding_box()
    phone.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    phone.mouse.down()
    phone.wait_for_timeout(450)
    phone.mouse.up()
    assert phone.evaluate('testGame.fighters[0].x') > start_x + 60
    phone.locator('[data-control="jump"]').tap()
    phone.wait_for_function('testGame.fighters[0].y > 20')
    assert phone.evaluate('testGame.fighters[0].jumpPhase') == 'air'
    phone.screenshot(path=str(OUTPUT / 'mobile-training.png'), full_page=True)
    assert not errors, errors
    print('PASS: 390px layout, on-screen movement, on-screen jump', flush=True)
    browser.close()
    print(f'All browser checks passed. Screenshots: {OUTPUT}', flush=True)
