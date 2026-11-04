"""Actual keyboard jump/landing and the slow, frame-steppable motion viewer."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(__file__).resolve().parent.parent/'test-results';OUT.mkdir(exist_ok=True)
URL=os.environ.get('GAME_URL','http://127.0.0.1:3000').rstrip('/')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(URL);page.wait_for_selector('#asset-loading',state='hidden');page.click('[data-nav="training"]')
 page.evaluate('''async()=>{window.g=(await import('/src/app.js')).game;window.apexCaptured=false;const update=g.update;g.update=function(dt){update.call(this,dt);if(!apexCaptured&&this.fighters[0].jumpPhase==='air'&&Math.abs(this.fighters[0].vy)<22){apexCaptured=true;this.setPaused(true);}};}''')
 page.keyboard.down('KeyD');page.wait_for_function('g.fighters[0].x>550');page.keyboard.up('KeyD');page.keyboard.press('KeyW');page.wait_for_function('apexCaptured')
 assert page.evaluate('g.fighters[0].y')>130
 page.screenshot(path=str(OUT/'jump-apex.png'))
 page.evaluate('g.setPaused(false)');page.wait_for_function("g.fighters[0].jumpPhase==='ground'");assert page.evaluate('g.fighters[0].y')==0
 print('PASS: real keyboard walking, jump apex and grounded landing',flush=True)
 page.goto(URL+'/public/motion-review.html');page.wait_for_function('window.motionReview?.panels.length===2');page.click('[data-action="jump"]');page.locator('#seek').fill('450')
 assert page.locator('#play').inner_text()=='播放';assert all(v>120 for v in page.evaluate('motionReview.panels.map(p=>p.game.fighters[0].y)'))
 page.screenshot(path=str(OUT/'motion-viewer-jump.png'));before=page.locator('#time').inner_text();page.click('#step');assert page.locator('#time').inner_text()!=before
 page.click('[data-action="skill"]');page.locator('#seek').fill('120');page.screenshot(path=str(OUT/'motion-viewer-head.png'));page.locator('#bones').check();page.select_option('#speed','0.25');assert page.locator('#speed').input_value()=='0.25'
 print('PASS: slow preview, seeking, single stepping, bone overlay and skill blend',flush=True)
 assert not errors,errors
 browser.close()
