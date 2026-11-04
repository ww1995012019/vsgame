"""Check nested paths, script-disabled previews, and the standalone download.

Run `npm run build` first. Requires Python Playwright and Chromium.
"""
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'test-results'
OUTPUT.mkdir(exist_ok=True)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT.parent)))
Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/{ROOT.name}'

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
        errors, failures = [], []
        context = browser.new_context(viewport={'width': 1440, 'height': 900})
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failures.append(response.url) if response.status >= 400 else None)
        page.goto(f'{base}/index.html', wait_until='networkidle')
        page.wait_for_function("!document.getElementById('start-button').disabled && document.getElementById('preview-fighters').hidden")
        assert page.locator('.app').evaluate("el => getComputedStyle(el).display") == 'flex'
        assert not page.locator('#preview-notice').is_visible()
        assert not failures, failures
        assert not errors, errors
        page.screenshot(path=str(OUTPUT / 'preview-fixed.png'), full_page=True)
        page.close()
        print('PASS: nested source entry loads CSS, modules, and artwork without 404s', flush=True)

        # Simulate a file viewer which renders the document but forbids scripts.
        for name, entry in [('source', 'index.html'), ('standalone', 'dist/street-duel.html')]:
            readonly = browser.new_context(viewport={'width': 1000, 'height': 700}, java_script_enabled=False)
            preview = readonly.new_page()
            preview.goto(f'{base}/{entry}', wait_until='networkidle')
            assert preview.locator('.app').evaluate("el => getComputedStyle(el).display") == 'flex'
            assert preview.locator('.arena-background').evaluate("el => getComputedStyle(el).backgroundImage") != 'none'
            assert preview.locator('.art-lieying').first.evaluate("el => getComputedStyle(el).backgroundImage") != 'none'
            assert preview.locator('.art-hanfeng').first.evaluate("el => getComputedStyle(el).backgroundImage") != 'none'
            assert preview.locator('#preview-fighters').is_visible()
            assert preview.locator('#preview-notice').is_visible()
            assert not preview.locator('#asset-loading').is_visible()
            assert preview.locator('dialog:visible').count() == 0
            assert preview.locator('#start-button').is_disabled()
            preview.screenshot(path=str(OUTPUT / f'preview-no-script-{name}.png'), full_page=True)
            readonly.close()
            print(f'PASS: {name} remains styled with background, fighters and a clear preview notice when scripts are disabled', flush=True)

        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.set_content(f'<iframe id="file-preview" sandbox src="{base}/dist/street-duel.html" style="position:fixed;inset:0;border:0;width:100%;height:100%"></iframe>')
        inner = page.frame_locator('#file-preview')
        inner.locator('#preview-fighters').wait_for(state='visible')
        assert inner.locator('.arena-background').evaluate("el => getComputedStyle(el).backgroundImage").startswith('url("data:image/png;base64,')
        assert not inner.locator('#asset-loading').is_visible()
        assert inner.locator('dialog:visible').count() == 0
        print('PASS: strict sandbox iframe displays the complete static interface without executing game scripts', flush=True)

        offline = browser.new_context(viewport={'width': 1440, 'height': 900}, offline=True)
        game = offline.new_page()
        external = []
        game.on('pageerror', lambda error: errors.append(str(error)))
        game.on('request', lambda request: external.append(request.url) if request.url.startswith(('http:', 'https:')) else None)
        game.set_content((ROOT / 'dist/street-duel.html').read_text(), wait_until='load')
        game.wait_for_function("!document.getElementById('start-button').disabled")
        game.click('[data-nav="training"]')
        game.keyboard.down('KeyD')
        game.wait_for_timeout(1950)
        game.keyboard.up('KeyD')
        game.keyboard.press('KeyK')
        game.wait_for_function("Number(document.getElementById('training-hits').textContent) > 0")
        assert not game.locator('#preview-fighters').is_visible()
        assert not errors, errors
        assert not external, external
        print('PASS: standalone game still plays offline with real attack hits and zero external requests', flush=True)
        browser.close()
finally:
    server.shutdown()
    server.server_close()
