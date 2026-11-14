// Node.js 22以上。依存パッケージなし。CHROME_BINでChromium系ブラウザを指定できます。
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile, mkdtemp, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
console.log('Starting browser tests');
let boardMode=false;
const server=createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target=path.resolve(root,'.'+pathname);
    if(!target.startsWith(root)) throw Error('Invalid path');
    let data=await readFile(target);
    if(boardMode&&pathname==='/poyomaru/editor.js') data=Buffer.from(data.toString().replace("const BOARD_URL = '';","const BOARD_URL = 'https://example.org/class-board';"));
    res.setHeader('Content-Type',({'html':'text/html; charset=utf-8','js':'text/javascript; charset=utf-8','svg':'image/svg+xml'})[target.split('.').pop()]||'application/octet-stream');
    res.setHeader('Cache-Control','no-store'); res.end(data);
  } catch {res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
console.log('Test server',origin);
const candidates=[process.env.CHROME_BIN,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium','/usr/bin/google-chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
let executable;
for(const candidate of candidates) {try {await access(candidate);executable=candidate;break;}catch{}}
if(!executable) {server.close();throw Error('CHROME_BINにChromium系ブラウザのパスを指定してください');}
const profile=await mkdtemp(path.join(tmpdir(),'poyomaru-test-'));
const browser=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let socket;
try {
  const endpoint=await new Promise((resolve,reject)=>{
    let logs='';const timer=setTimeout(()=>reject(Error('Browser startup timed out')),20000);
    browser.once('error',reject);
    browser.stderr.on('data',d=>{logs+=d;const match=logs.match(/DevTools listening on (ws:\/\/\S+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
    browser.stdout.on('data',d=>console.log(d.toString()));
    browser.once('exit',code=>{clearTimeout(timer);reject(Error(`Browser exited: ${code}\n${logs}`));});
  });
  socket=new WebSocket(endpoint);
  console.log('Browser started');
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let serial=0;const pending=new Map();const errors=[];
  socket.addEventListener('message',e=>{
    const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
    else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
  });
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout: ${method}`));},15000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});socket.send(JSON.stringify({id,method,params,sessionId}));});
  const {targetInfos}=await call('Target.getTargets');
  const {sessionId}=await call('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true});
  const cdp=(method,params)=>call(method,params,sessionId);
  await cdp('Runtime.enable');await cdp('Page.enable');
  console.log('Browser connected');
  const evaluate=async expression=>{
    const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,replMode:true});
    if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;
  };
  const ready=async()=>{
    for(let n=0;n<100;n++) {
      if(await evaluate("typeof state!=='undefined' && typeof assets!=='undefined' && layers().every(p=>assets.has(p.itemId))")) {await evaluate('renderStage()');return;}
      await new Promise(r=>setTimeout(r,100));
    }
    throw Error('Application did not finish loading');
  };
  const reload=async()=>{await cdp('Page.navigate',{url:'about:blank'});await cdp('Page.navigate',{url:origin+'/poyomaru/index.html'});await ready();};
  await reload();
  const check=async(label,expression)=>{assert.equal(await evaluate(`await (${expression})`),true,label);console.log('PASS',label);};
  await check('初期パーツ5個・旧座標・画像表示',"state.instances.length===5 && state.instances.every(p=>p.x===0&&p.y===0&&p.scale===1&&p.rotate===0) && assets.size>=6 && document.querySelector('#character').getContext('2d').getImageData(600,600,1,1).data[3]>0");
  await evaluate("selectPart(state.instances.find(p=>p.itemId==='eyes_cute').id);window.original=clone(selected());$('duplicate-part').click();window.copyId=selectedId; $('part-x').value=110;$('part-x').dispatchEvent(new Event('input'));$('part-y').value=-55;$('part-y').dispatchEvent(new Event('input'));$('part-scale').value=150;$('part-scale').dispatchEvent(new Event('input'));$('part-rotate').value=35;$('part-rotate').dispatchEvent(new Event('input'));");
  await check('複製した目の独立した移動・拡大・回転',"state.instances.length===6&&selected().x===110&&selected().y===-55&&selected().scale===1.5&&selected().rotate===35&&JSON.stringify(state.instances.find(p=>p.id===original.id))===JSON.stringify(original)");
  await evaluate("selectPart(state.instances.find(p=>p.itemId==='tail_curl').id);selected().x=140;selected().y=-90;$('send-back').click();window.behind=await (await createPNG()).arrayBuffer();$('bring-front').click();window.front=await (await createPNG()).arrayBuffer();");
  await check('しっぽを素体より前面へ・PNGの描画順も変化',"selected().z>0&&Math.max(...state.instances.map(p=>p.z))===selected().z&&new Uint8Array(front).some((v,i)=>v!==new Uint8Array(behind)[i])");
  await evaluate("window.beforeDelete=JSON.stringify(state.instances.filter(p=>p.id!==copyId));selectPart(copyId);$('delete-part').click();");
  await check('削除が他のインスタンスに影響しない',"JSON.stringify(state.instances)===beforeDelete&&state.instances.length===5");
  await evaluate("selectPart(state.instances.find(p=>p.itemId==='tail_curl').id);$('reset-position').click();");
  await check('選択中パーツのリセット・前後順維持',"selected().x===0&&selected().y===0&&selected().scale===1&&selected().rotate===0&&selected().z>0");
  // 実際のマウス入力・タッチ入力も送ります。
  await evaluate("selectPart(state.instances.find(p=>p.itemId==='eyes_cute').id);await renderStage();");
  const point=await evaluate("(()=>{const r=$('character').getBoundingClientRect();return {x:r.left+(160-view.x)*r.width/view.size,y:r.top+(181-view.y)*r.height/view.size};})()");
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+25,y:point.y+20,button:'left',buttons:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+25,y:point.y+20,button:'left',clickCount:1});
  await check('描画中のパーツをクリック選択・ドラッグ',"selected().itemId==='eyes_cute'&&selected().x>0&&selected().y>0&&dragStart===null");
  const stored=await evaluate("$('character-name').value='テスト作品';$('character-name').dispatchEvent(new Event('input'));JSON.stringify(state)");
  await reload();assert.equal(await evaluate('JSON.stringify(state)'),stored);console.log('PASS 再読み込みで編集状態・名前復元');
  await evaluate("$('videos').value=5;$('score').value=100;$('study-form').requestSubmit();window.previousRandom=Math.random;Math.random=()=>0;$('draw').click();$('draw-close').click();$('study-form').requestSubmit();$('draw').click();Math.random=previousRandom;");
  await check('100pt獲得・100pt消費・重複獲得・中央演出',"state.points===0&&state.owned.base_devil===2&&!$('draw-modal').hidden&&$('draw-title').textContent==='デビルぽよまる'&&$('draw-svg').children.length===1");
  await evaluate("$('draw-equip').click();$('unlock-all').click();");
  await check('素体は1体のみ・全解放',"state.bodyId==='base_devil'&&!state.instances.some(p=>ALL.get(p.itemId).category==='body')&&ITEMS.every(item=>has(item,state))");
  await check('PNG形式・透明背景・キャラクター名をファイル名へ反映',"(async()=>{const blob=await createPNG();const bitmap=await createImageBitmap(blob);const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);return blob.type==='image/png'&&blob.size>1000&&ctx.getImageData(0,0,1,1).data[3]===0&&imageFilename(state.characterName)==='テスト作品.png';})()");
  await cdp('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.join(profile,'downloads')});
  await evaluate("$('save-image').click()");
  for(let i=0;i<50&&await evaluate("$('save-image').disabled");i++)await new Promise(r=>setTimeout(r,100));
  for(let i=0;i<50;i++){try{await access(path.join(profile,'downloads','テスト作品.png'));break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.equal((await readFile(path.join(profile,'downloads','テスト作品.png'))).subarray(1,4).toString(),'PNG');console.log('PASS 作品を保存ボタンでPNGをダウンロード');
  await check('未設定掲示板は画面遷移せず案内',"(()=>{let count=0;window.open=()=>count++;$('open-board').click();return count===0&&$('toast').textContent.includes('準備中');})()");
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true});
  await evaluate("window.scrollTo(0,0);selectPart(state.instances.find(p=>p.itemId==='mouth_smile').id);await renderStage();");
  const touch=await evaluate("(()=>{const r=$('character').getBoundingClientRect();return {x:r.left+15,y:r.top+15};})()");
  const xBefore=await evaluate('selected().x');
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x,y:touch.y}]});
  await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x+35,y:touch.y+25}]});
  await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(await evaluate(`selected().x>${xBefore}&&dragStart===null`));
  await check('390px幅で横はみ出しなし・タッチ編集',"document.documentElement.scrollWidth<=innerWidth");
  if(process.env.SCREENSHOT_DIR) {
    const {data}=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    await import('node:fs/promises').then(f=>f.writeFile(path.join(process.env.SCREENSHOT_DIR,'mobile.png'),Buffer.from(data,'base64')));
  }
  await cdp('Emulation.clearDeviceMetricsOverride');
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
  if(process.env.SCREENSHOT_DIR) {
    await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
    const {data}=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    await import('node:fs/promises').then(f=>f.writeFile(path.join(process.env.SCREENSHOT_DIR,'desktop.png'),Buffer.from(data,'base64')));
  }
  await evaluate("localStorage.clear();localStorage.setItem('poyomarumaker-v2',JSON.stringify({points:250.5,owned:{base_dragon:2,eyes_dragon:3},bodyId:'base_dragon',equipped:{eyes:'eyes_dragon'},transform:{eyes:{x:75,y:-36,scale:1.4,rotate:-20}},lastDraw:'eyes_dragon'}))");
  await reload();
  await check('v2からポイント・所持品・素体・変形を移行',"state.points===250.5&&state.owned.eyes_dragon===3&&state.bodyId==='base_dragon'&&state.instances.some(p=>p.itemId==='eyes_dragon'&&p.x===75&&p.y===-36&&p.scale===1.4&&p.rotate===-20)&&localStorage.getItem('poyomarumaker-v2')!==null");
  await evaluate("state.instances=[];save()");await reload();
  await check('全パーツ削除後の再読み込み・素体操作',"state.instances.length===0&&$('position-controls').hidden&&layers().length===1");
  await evaluate("localStorage.setItem('poyomarumaker-v3','invalid JSON')");await reload();
  await check('壊れた最新保存から旧データへ復旧',"state.points===250.5&&state.instances.length===5");
  boardMode=true;await reload();
  await check('設定済み掲示板のURL・別タブ・noopener',"(()=>{let args;window.open=(...a)=>args=a;$('open-board').click();return args[0]==='https://example.org/class-board'&&args[1]==='_blank'&&args[2]==='noopener,noreferrer';})()");
  await cdp('Page.navigate',{url:new URL('../poyomaru/index.html',import.meta.url).href});await ready();
  await check('file://でもプレビュー・一覧編集を維持',"state.instances.length===5&&assets.size>=6&&$('instance-list').options.length===6");
  if(await evaluate("layers().some(p=>!assets.get(p.itemId).pixels)")) {
    await evaluate("$('save-image').click()");
    for(let i=0;i<50&&await evaluate("$('save-image').disabled");i++)await new Promise(r=>setTimeout(r,100));
    await check('file://のPNG制限を案内',"$('toast').textContent.includes('HTTP')");
  }
  assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS JavaScript実行時エラーなし');
} finally {
  socket?.close();browser.kill();server.close();
  await new Promise(r=>setTimeout(r,700));
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:500}).catch(()=>{});
}
