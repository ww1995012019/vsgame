"""Real keyboard, production collision debug overlay and directional guarding.

Start `npm run dev` first. Captures exact simulation phases rather than relying
on wall-clock sleeps that can skip a short attack on slow software rendering.
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ.get('GAME_URL', 'http://127.0.0.1:3000').rstrip('/')
OUT = Path(__file__).resolve().parent.parent / 'test-results'
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
        args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_selector('#asset-loading', state='hidden')
    page.click('[data-nav="training"]')
    page.evaluate('''async()=>{
      window.g=(await import('/src/app.js')).game;
      g.fighters[0].x=550;g.fighters[1].x=1100;
      window.phases=[];window.captureActive=true;
      const update=g.update;
      g.update=function(dt){
        update.call(this,dt);
        const f=this.getDebugSnapshot().fighters[0];
        if(f.move==='punch'){
          phases.push({phase:f.activePhase,frame:f.moveFrame,boxes:f.hitboxes.length});
          if(captureActive&&f.activePhase==='active'){
            captureActive=false;this.setPaused(true);
          }
        }
      };
    }''')
    page.keyboard.press('F3')
    page.keyboard.down('KeyJ')
    page.wait_for_function('g.paused && phases.some(p=>p.phase==="active")')
    assert page.locator('.keyboard-guide kbd.pressed').filter(has_text='J').count() == 1
    page.keyboard.up('KeyJ')
    page.wait_for_function('document.querySelector("#debug-fighter-0").textContent.includes("active")')
    phases = page.evaluate('phases')
    assert any(x['phase'] == 'startup' and x['boxes'] == 0 for x in phases), phases
    assert any(x['phase'] == 'active' and x['boxes'] > 0 for x in phases), phases
    assert page.locator('#combat-debug-readout').is_visible()
    assert page.locator('#combat-debug-button').get_attribute('aria-pressed') == 'true'
    assert page.evaluate('g.fighters[1].hp') == 100
    page.screenshot(path=str(OUT / 'combat-debug-active.png'), full_page=True)
    page.evaluate('g.setPaused(false)')
    page.wait_for_function('!g.fighters[0].attack')
    phases = page.evaluate('phases')
    assert any(x['phase'] == 'recovery' and x['boxes'] == 0 for x in phases), phases
    assert page.evaluate('g.fighters[0].lastHit.result') == 'miss'
    print('PASS: actual keyboard attack, key highlight, F3 and active-frame boxes', flush=True)

    standing_top = page.evaluate('Math.min(...g.getDebugSnapshot().fighters[0].hurtboxes.map(b=>b.y))')
    page.keyboard.down('KeyS')
    page.wait_for_function('g.fighters[0].state === "Crouch"')
    assert page.evaluate('Math.min(...g.getDebugSnapshot().fighters[0].hurtboxes.map(b=>b.y))') > standing_top + 50
    assert page.evaluate('''async()=>{
      const {originalPoseFor}=await import('/src/rig.js');
      const f=g.fighters[0],head=originalPoseFor(f,g.elapsed).joints.head;
      const x=f.x+head.x*f.facing,y=688-f.y+head.y;
      return g.getDebugSnapshot().fighters[0].hurtboxes.some(b=>x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height);
    }''')
    assert not page.evaluate('g.fighters[0].blocking')
    page.screenshot(path=str(OUT / 'combat-debug-crouch.png'), full_page=True)
    page.keyboard.up('KeyS')
    page.wait_for_function('g.fighters[0].state === "Idle"')
    print('PASS: S crouches, changes hurtboxes and does not guard by itself', flush=True)

    for crossed, key, expected_facing in [(False, 'KeyA', 1), (True, 'KeyD', -1)]:
        page.evaluate('''crossed=>{
          g.start({training:true});
          g.fighters[0].x=crossed?805:650;
          g.fighters[1].x=crossed?650:805;
          g.fighters[0].facing=crossed?-1:1;
          g.fighters[1].facing=crossed?1:-1;
        }''', crossed)
        page.keyboard.down(key)
        assert page.evaluate('g.attack(1,"punch")')
        page.wait_for_function('g.fighters[0].lastHit?.result === "guarded"')
        assert page.evaluate('g.fighters[0].facing') == expected_facing
        assert page.evaluate('g.fighters[0].lastHit.damage') <= 2
        page.keyboard.up(key)
        page.wait_for_function('!g.fighters[1].attack && g.fighters[0].stun===0')
    print('PASS: actual relative-back keyboard guards correctly on both sides', flush=True)

    page.reload()
    page.wait_for_selector('#asset-loading', state='hidden')
    assert page.locator('#combat-debug-button').get_attribute('aria-pressed') == 'true'
    page = browser.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_selector('#asset-loading', state='hidden')
    page.click('[data-nav="training"]')
    page.evaluate('async()=>{window.g=(await import("/src/app.js")).game;}')
    right = page.locator('[data-control="right"]').bounding_box()
    page.mouse.move(right['x'] + right['width'] / 2, right['y'] + right['height'] / 2)
    page.keyboard.down('KeyD')
    page.mouse.down()
    page.keyboard.up('KeyD')
    assert page.evaluate('(window.g.input.right)')
    page.mouse.up()
    assert not page.evaluate('window.g.input.right')
    page.keyboard.down('KeyD')
    page.mouse.down()
    page.mouse.up()
    assert page.evaluate('window.g.input.right')
    page.keyboard.up('KeyD')
    assert not page.evaluate('window.g.input.right')
    assert not errors, errors
    browser.close()
    print('PASS: debug persists, mixed input releases correctly; no runtime errors', flush=True)
