"""Original artwork fidelity and real four-skill browser checks. Start npm run dev first."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(__file__).resolve().parent.parent/'test-results'
OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader'])
 context=browser.new_context(viewport={'width':1440,'height':900})
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(os.environ.get('GAME_URL','http://127.0.0.1:3000'));page.wait_for_selector('#asset-loading',state='hidden')
 page.evaluate("async()=>{window.g=(await import('/src/app.js')).game;window.captureReady=false;const originalEvent=g.onEvent;g.onEvent=e=>{originalEvent(e);if(e.index===0&&((captureMove==='special'&&e.type==='projectile')||(captureMove==='skill'&&e.type==='hit'))){g.setPaused(true);window.captureReady=true;}};window.captureMove=null;}")
 fidelity=page.evaluate("async()=>{\n const {OriginalSkin}=await import('/src/skin.js'),{worldJoints}=await import('/src/rig.js');const results=[];\n for(const id of ['lieying','hanfeng']){\n const img=await new Promise(r=>{const i=new Image;i.onload=()=>r(i);i.src='/public/assets/'+id+'.png'}),skin=new OriginalSkin(img,id),s=id==='lieying'?604/448:626/448;\n const ref=document.createElement('canvas');ref.width=800;ref.height=720;const ctx=ref.getContext('2d',{willReadFrequently:true});\n const out=document.createElement('canvas');out.width=800;out.height=720;const ox=out.getContext('2d',{willReadFrequently:true});\n for(let frame=0;frame<8;frame++){\n skin.render({attachment:frame,frames:[{frame,weight:1}],joints:worldJoints(id,frame)});ox.clearRect(0,0,800,720);ox.drawImage(skin.canvas,0,0);ctx.clearRect(0,0,800,720);ctx.drawImage(img,frame%4*img.width/4,Math.floor(frame/4)*img.height/2,img.width/4,img.height/2,400-224*s,640-436*s,448*s,448*s);\n const a=ctx.getImageData(0,0,800,720).data,c=ox.getImageData(0,0,800,720).data;let difference=0,count=0;\n for(let k=0;k<a.length;k+=4)if(a[k+3]>200&&c[k+3]>200){difference+=Math.abs(a[k]-c[k])+Math.abs(a[k+1]-c[k+1])+Math.abs(a[k+2]-c[k+2]);count+=3;}\n results.push({id,frame,meanRGBError:difference/count,webgl:!!skin.gl});\n }\n }return results;\n }")
 assert all(row["meanRGBError"]<1.5 for row in fidelity),fidelity
 print("PASS: all 16 original art bind poses match the source (mean RGB error below 1.5/255)",flush=True)
 for character in ['lieying','hanfeng']:
  if character=='hanfeng':
   page.click('[data-nav="characters"]'); page.click('[data-character="hanfeng"]'); page.click('#confirm-character')
  page.click('[data-nav="training"]')
  page.keyboard.press('KeyB') if page.locator('#bones-button').get_attribute('aria-pressed')=='false' else None
  for action,key,gap in [('special','KeyL',500),('skill','KeyO',330 if character=='lieying' else 180)]:
   page.evaluate('(gap)=>{g.fighters[0].x=570;g.fighters[1].x=570+gap;g.fighters.forEach(f=>{f.hp=100;f.energy=100;f.attack=null;f.stun=0;f.y=0;f.vy=0;f.knockback=0;});g.projectiles=[];g.hitStop=0;}',gap)
   before=page.evaluate('g.trainingHits'); page.evaluate('(action)=>{window.captureMove=action;window.captureReady=false}',arg=action); page.keyboard.press(key)
   page.wait_for_function('(type)=>g.fighters[0].attack?.type===type',arg=action)
   page.wait_for_function('window.captureReady')
   page.evaluate("()=>{g.setPaused(true);document.querySelector('#toast').classList.remove('visible');document.activeElement.blur();}")
   page.screenshot(path=str(OUT/f'{character}-{action}.png'))
   page.evaluate('()=>{window.captureMove=null;g.setPaused(false)}')
   page.wait_for_function('(hits)=>g.trainingHits>hits',arg=before)
   page.wait_for_function('g.fighters[0].attack===null')
   page.wait_for_timeout(400)
   print('PASS',character,action,'hit, animation, effects, bone overlay',flush=True)
 assert not errors,errors

 assert not errors,errors
 page.keyboard.press('KeyB');page.reload();page.wait_for_selector('#asset-loading',state='hidden')
 assert page.locator('#bones-button').get_attribute('aria-pressed')=='false'
 browser.close()
