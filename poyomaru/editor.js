// 外部掲示板の公開URLを設定。空欄のままでも保存・編集できます。
const BOARD_URL = '';
const STORE = 'poyomarumaker-v3';
const LEGACY_STORES = ['poyomarumaker-v2', 'giga-chimera-miniproto-v1'];
const DEFAULT_Z = {tail:-2, ears:-1, limbs:1, eyes:2, mouth:3};
const $ = id => document.getElementById(id);
const file = item => `assets/${item.asset || item.id}.svg`;
const clone = x => JSON.parse(JSON.stringify(x));
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const fmt = n => n.toLocaleString('ja-JP',{maximumFractionDigits:1});
const uid = () => globalThis.crypto?.randomUUID?.() || `part-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const has = (item,s) => item.starter || s.owned[item.id] > 0;
function newPart(itemId) {
  return {id:uid(),itemId,x:0,y:0,scale:1,rotate:0,z:DEFAULT_Z[ALL.get(itemId).category]};
}
function starterParts() { return Object.values(STARTEQUIP).map(newPart); }
function initialState() {
  return {version:3,points:0,owned:{},bodyId:'base',instances:starterParts(),characterName:'',lastDraw:null};
}
function validateSaved(data) {
  const s=initialState();
  if(Number.isFinite(data?.points)) s.points=clamp(data.points,0,10000000);
  for(const item of ITEMS) {
    const n=data?.owned?.[item.id];
    if(Number.isInteger(n)&&n>0) s.owned[item.id]=clamp(n,1,100000);
  }
  if(BASES.some(b=>b.id===data?.bodyId&&has(b,s))) s.bodyId=data.bodyId;
  const normalize=(itemId,t={})=>{
    if(!t||typeof t!=='object') t={};
    const p=newPart(itemId);
    for(const [key,min,max] of [['x',-400,400],['y',-400,400],['scale',.2,3],['rotate',-180,180],['z',-100000,100000]]) {
      if(Number.isFinite(t[key])) p[key]=clamp(t[key],min,max);
    }
    return p;
  };
  if(Array.isArray(data?.instances)) {
    const ids=new Set();
    s.instances=data.instances.flatMap(t=>{
      const item=ALL.get(t?.itemId);
      if(!item||item.category==='body'||!has(item,s)) return [];
      const p=normalize(item.id,t);
      if(typeof t.id==='string'&&t.id.length<=100&&!ids.has(t.id)&&t.id) p.id=t.id;
      ids.add(p.id);
      return [p];
    });
  } else {
    // v2以前のカテゴリ単位の装着・変形を、そのまま1個ずつ移行します。
    s.instances=Object.entries(STARTEQUIP).map(([category,starter])=>{
      const item=ALL.get(data?.equipped?.[category]);
      return normalize(item?.category===category&&has(item,s)?item.id:starter,data?.transform?.[category]);
    });
  }
  if(typeof data?.characterName==='string') s.characterName=data.characterName.slice(0,40);
  if(ITEMS.some(item=>item.id===data?.lastDraw)) s.lastDraw=data.lastDraw;
  return s;
}
function loadState() {
  for(const key of [STORE,...LEGACY_STORES]) {
    try { const data=JSON.parse(localStorage.getItem(key)||'null'); if(data&&typeof data==='object') return validateSaved(data); } catch { /* 次の旧形式も確認 */ }
  }
  return initialState();
}
let state=loadState();
let selectedId=state.instances.find(p=>ALL.get(p.itemId).category==='mouth')?.id || state.instances[0]?.id || null;
let currentCategory='mouth';
let toastTimer, dragStart=null, saveWarning=false;
function selected() { return state.instances.find(p=>p.id===selectedId); }
function save() {
  try { localStorage.setItem(STORE,JSON.stringify(state)); }
  catch { if(!saveWarning) { saveWarning=true; toast('このブラウザでは編集内容を記録できません。作品を画像で保存してください。'); } }
}
function toast(message) {
  $('toast').textContent=message; $('toast').classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);
}

// 元SVGを画像として読み込むだけ。透明部分の計測は素体の輪郭に依存しません。
const assets=new Map(), pendingAssets=new Map();
function loadAsset(itemId) {
  if(pendingAssets.has(itemId)) return pendingAssets.get(itemId);
  const promise=new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>{
      try {
        const c=document.createElement('canvas'); c.width=c.height=400;
        const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.drawImage(image,0,0,400,400);
        let pixels;
        try {pixels=ctx.getImageData(0,0,400,400).data;}
        catch(error) {
          // file:// のCanvas制限時も、一覧選択による表示・編集は維持します。
          if(error.name!=='SecurityError') throw error;
          const asset={image,pixels:null,bounds:{left:0,top:0,right:400,bottom:400}};
          assets.set(itemId,asset);resolve(asset);return;
        }
        let left=400,top=400,right=0,bottom=0;
        for(let y=0;y<400;y++) for(let x=0;x<400;x++) {
          if(pixels[(y*400+x)*4+3]>0) { left=Math.min(left,x); top=Math.min(top,y); right=Math.max(right,x+1); bottom=Math.max(bottom,y+1); }
        }
        const asset={image,pixels,bounds:right?{left,top,right,bottom}:{left:0,top:0,right:400,bottom:400}};
        assets.set(itemId,asset); resolve(asset);
      } catch(error) { reject(error); }
    };
    image.onerror=()=>reject(new Error(`画像を読み込めません: ${itemId}`));
    image.src=file(ALL.get(itemId));
  });
  pendingAssets.set(itemId,promise);
  promise.catch(()=>{ pendingAssets.delete(itemId); });
  return promise;
}
function layers(s=state) {
  return [{id:null,itemId:s.bodyId,x:0,y:0,scale:1,rotate:0,z:0},...s.instances].sort((a,b)=>a.z-b.z);
}
function transformedBounds(p) {
  const b=assets.get(p.itemId)?.bounds || {left:0,top:0,right:400,bottom:400};
  const r=p.rotate*Math.PI/180, cos=Math.cos(r), sin=Math.sin(r);
  const corners=[[b.left,b.top],[b.right,b.top],[b.left,b.bottom],[b.right,b.bottom]].map(([x,y])=>({
    x:200+p.x+((x-200)*cos-(y-200)*sin)*p.scale,
    y:200+p.y+((x-200)*sin+(y-200)*cos)*p.scale
  }));
  return {left:Math.min(...corners.map(c=>c.x)),top:Math.min(...corners.map(c=>c.y)),right:Math.max(...corners.map(c=>c.x)),bottom:Math.max(...corners.map(c=>c.y))};
}
function sceneBounds(s=state) {
  const boxes=layers(s).map(transformedBounds);
  return {left:Math.min(...boxes.map(b=>b.left)),top:Math.min(...boxes.map(b=>b.top)),right:Math.max(...boxes.map(b=>b.right)),bottom:Math.max(...boxes.map(b=>b.bottom))};
}
function fitView() {
  const b=sceneBounds();
  const size=Math.max(400,b.right-b.left+64,b.bottom-b.top+64);
  return {x:(b.left+b.right-size)/2,y:(b.top+b.bottom-size)/2,size};
}
let view={x:0,y:0,size:400}, paintVersion=0;
function drawScene(ctx,s,selection=false) {
  for(const p of layers(s)) {
    const asset=assets.get(p.itemId); if(!asset) continue;
    ctx.save(); ctx.translate(200+p.x,200+p.y); ctx.rotate(p.rotate*Math.PI/180); ctx.scale(p.scale,p.scale);
    ctx.drawImage(asset.image,-200,-200,400,400);
    ctx.restore();
  }
  // 選択枠は全レイヤーの描画後に重ね、PNGには渡しません。
  if(selection&&selected()) {
    const b=transformedBounds(selected());
    ctx.save(); ctx.strokeStyle='#65439b'; ctx.lineWidth=view.size/300; ctx.setLineDash([view.size/70,view.size/100]);
    ctx.strokeRect(b.left-5,b.top-5,b.right-b.left+10,b.bottom-b.top+10); ctx.restore();
  }
}
async function renderStage() {
  const version=++paintVersion;
  try { await Promise.all(layers().map(p=>loadAsset(p.itemId))); }
  catch { if(version===paintVersion) toast('画像を読み込めませんでした。ページを開き直してください。'); return; }
  if(version!==paintVersion) return;
  if(!dragStart) view=fitView();
  const canvas=$('character'), ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save(); ctx.scale(canvas.width/view.size,canvas.height/view.size); ctx.translate(-view.x,-view.y);
  drawScene(ctx,state,true); ctx.restore();
  $('monster-name').textContent=state.characterName.trim() || ALL.get(state.bodyId).name;
  $('character-name').placeholder=ALL.get(state.bodyId).name;
  $('stage').classList.toggle('editable',!!selected());
}
function selectPart(id) {
  selectedId=id;
  currentCategory=selected()?ALL.get(selected().itemId).category:'body';
  renderEditor(); renderStage();
}
function makeTab(cat) {
  const el=document.createElement('button'); el.type='button'; el.className='tab'+(cat.id===currentCategory?' active':'');
  el.setAttribute('aria-pressed',String(cat.id===currentCategory));
  el.innerHTML=`<span aria-hidden="true">${cat.icon}</span>${cat.name}`;
  el.onclick=()=>{currentCategory=cat.id;renderEditor();}; return el;
}
function equip(item) {
  if(!has(item,state)) return;
  if(item.category==='body') {state.bodyId=item.id;selectedId=null;}
  else {const p=newPart(item.id); state.instances.push(p);selectedId=p.id;}
  currentCategory=item.category; save();
}
function card(item) {
  const owned=has(item,state), count=state.instances.filter(p=>p.itemId===item.id).length;
  const active=item.category==='body'?item.id===state.bodyId:count>0;
  const b=document.createElement('button'); b.type='button'; b.className='part-card'+(active?' selected':'')+(!owned?' locked':''); b.disabled=!owned;
  b.setAttribute('aria-label',`${item.name}：${item.category==='body'?'装着':'追加'}${!owned?'（未獲得）':''}`);
  const thumb=document.createElement('div'); thumb.className='part-thumb'; const img=document.createElement('img'); img.src=file(item);img.alt='';thumb.append(img);
  const name=document.createElement('div');name.className='part-name';name.textContent=item.name;
  const desc=document.createElement('div');desc.className='part-desc';desc.textContent=item.desc||`${item.theme}シリーズ`;
  const pill=document.createElement('span');pill.className='pill'+(active?' purple':!owned?' gray':'');
  pill.textContent=active?(item.category==='body'?'装着中':`配置中 ×${count} · 追加`):!owned?'未獲得':item.category==='body'?'装着する':'＋ 追加する';
  const stock=document.createElement('small');stock.className='part-stock';stock.textContent=item.starter?'初期アイテム':owned?`所持 ×${state.owned[item.id]}`:'';
  b.append(thumb,name,desc,pill,stock);
  b.onclick=()=>{equip(item);render();}; return b;
}
function partLabel(p) {
  const copies=state.instances.filter(q=>q.itemId===p.itemId);
  return `${ALL.get(p.itemId).name}${copies.length>1?` (${copies.indexOf(p)+1})`:''}`;
}
function renderControls() {
  const p=selected(); $('position-controls').hidden=!p;
  if(!p) return;
  $('selected-part').textContent=`選択中：${partLabel(p)}`;
  for(const [id,key,mult,suffix] of [['part-x','x',1,''],['part-y','y',1,''],['part-scale','scale',100,'%'],['part-rotate','rotate',1,'°']]) {
    const v=Math.round(p[key]*mult); $(id).value=v; $(`${id}-value`).textContent=`${v}${suffix}`;
  }
}
function renderEditor() {
  const options=layers().reverse().map(p=>{
    const option=document.createElement('option'); option.value=p.id||'';
    option.textContent=p.id?partLabel(p):`${ALL.get(p.itemId).name}（素体・複製不可）`; return option;
  });
  $('instance-list').replaceChildren(...options); $('instance-list').value=selectedId||'';
  $('category-tabs').replaceChildren(...CATEGORIES.map(makeTab));
  const items=currentCategory==='body'?BASES.map(b=>({...b,category:'body'})):PARTS.filter(p=>p.category===currentCategory);
  $('collection').replaceChildren(...items.map(card));
  $('inventory-hint').textContent=`獲得済み：${ITEMS.filter(p=>state.owned[p.id]>0).length} / ${ITEMS.length} 種類`;
  renderControls();
}
function earned() {
  const videos=Number($('videos').value),score=Number($('score').value);
  if(!Number.isInteger(videos)||videos<0||videos>999||!Number.isInteger(score)||score<0||score>100) return null;
  return {points:videos*10+score*.5};
}
function updateEstimate() {const e=earned();$('estimate').textContent=e?`${fmt(e.points)}pt`:'入力を確認してください';}
function renderResult() {
  const area=$('result');area.replaceChildren();
  if(!state.lastDraw) {area.className='result blank';area.textContent='抽選したアイテムがここに表示されます';return;}
  area.className='result';const item=ALL.get(state.lastDraw);
  const row=document.createElement('div');row.className='won';const thumb=document.createElement('div');thumb.className='result-illu';
  const img=document.createElement('img');img.src=file(item);img.alt='';thumb.append(img);
  const txt=document.createElement('div'),name=document.createElement('strong'),count=document.createElement('small'),btn=document.createElement('button');
  name.textContent=item.name;count.textContent=`所持数 ${state.owned[item.id]||0}`;btn.type='button';btn.textContent='エディターで装着';
  btn.onclick=()=>{equip(item);render();};txt.append(name,count,btn);row.append(thumb,txt);area.append(row);
}
function render() {
  $('point-balance').textContent=fmt(state.points);$('draw').disabled=state.points<100;
  renderStage();renderEditor();renderResult();updateEstimate();
}
function commitEdit() {save();render();}
function reorder(front) {
  const p=selected(); if(!p) return;
  const ordered=layers().filter(q=>q.id!==p.id);
  if(front) ordered.push(p);else ordered.unshift(p);
  const bodyIndex=ordered.findIndex(q=>q.id===null);
  for(const [i,layer] of ordered.entries()) if(layer.id) state.instances.find(q=>q.id===layer.id).z=i-bodyIndex;
  commitEdit();
}
const FOCUS={body:'62 38 278 348',ears:'80 0 260 165',eyes:'105 120 185 125',mouth:'120 186 175 104',limbs:'18 195 370 200',tail:'15 164 385 225'};
function showDraw(item) {
  $('draw-title').textContent=item.name;$('draw-kind').textContent=item.category==='body'?'素体':'パーツ';
  const preview=$('draw-svg');preview.setAttribute('viewBox',FOCUS[item.category]);preview.replaceChildren();
  const image=document.createElementNS('http://www.w3.org/2000/svg','image');
  image.setAttribute('href',file(item));image.setAttribute('width','400');image.setAttribute('height','400');preview.append(image);
  $('draw-modal').hidden=false;$('draw-close').focus();
}
function hideDraw() {$('draw-modal').hidden=true;$('draw').focus();}

// プレビューと同じ描画順・変換で、透明背景のPNGを端末内で作成します。
async function createPNG(snapshot=clone(state)) {
  await Promise.all(layers(snapshot).map(p=>loadAsset(p.itemId)));
  if(layers(snapshot).some(p=>!assets.get(p.itemId).pixels)) throw new Error('PNG保存はGitHub PagesまたはHTTPでページを開いてお試しください。');
  const b=sceneBounds(snapshot),padding=24,width=b.right-b.left+padding*2,height=b.bottom-b.top+padding*2;
  const resolution=Math.min(2,2400/Math.max(width,height));
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*resolution);canvas.height=Math.ceil(height*resolution);
  const ctx=canvas.getContext('2d');ctx.scale(resolution,resolution);ctx.translate(padding-b.left,padding-b.top);drawScene(ctx,snapshot);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNGの作成に失敗しました')),'image/png'));
}
function imageFilename(name) {
  const safe=name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'').slice(0,80);
  return `${safe||'ぽよまる'}.png`;
}
function boardURL() {try {const url=new URL(BOARD_URL);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}}
$('board-hint').textContent=boardURL()?'作品を保存してから掲示板を開き、画像・作品名・任意のニックネームを投稿できます。':'掲示板は準備中です。作品はPNG画像として保存できます。';
$('open-board').addEventListener('click',()=>{
  const url=boardURL();if(!url) {toast('掲示板は準備中です。先に作品を保存できます。');return;}
  window.open(url,'_blank','noopener,noreferrer');
});
$('save-image').addEventListener('click',async()=>{
  const button=$('save-image'),snapshot=clone(state);button.disabled=true;button.textContent='画像を作成中…';
  try {
    const blob=await createPNG(snapshot),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=imageFilename(snapshot.characterName||ALL.get(snapshot.bodyId).name);document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);toast('PNG画像を作成しました。ダウンロードした作品を掲示板に投稿できます。');
  } catch(error) {toast(error.message.startsWith('PNG保存は')?error.message:'画像を保存できませんでした。ページを開き直して、もう一度お試しください。');}
  finally {button.disabled=false;button.textContent='作品を保存';}
});
$('character-name').value=state.characterName;
$('character-name').addEventListener('input',()=>{state.characterName=$('character-name').value.slice(0,40);save();renderStage();});
$('instance-list').addEventListener('change',()=>selectPart($('instance-list').value||null));
$('duplicate-part').addEventListener('click',()=>{
  const p=selected();if(!p)return;
  const copy={...p,id:uid(),x:clamp(p.x+20,-400,400),y:clamp(p.y+20,-400,400)};
  state.instances.push(copy);selectedId=copy.id;reorder(true);toast('パーツを複製しました。選択中のパーツを動かせます。');
});
$('delete-part').addEventListener('click',()=>{
  const index=state.instances.findIndex(p=>p.id===selectedId);if(index<0)return;
  state.instances.splice(index,1);selectedId=state.instances[Math.min(index,state.instances.length-1)]?.id||null;commitEdit();
});
$('bring-front').addEventListener('click',()=>reorder(true));$('send-back').addEventListener('click',()=>reorder(false));
$('reset-position').addEventListener('click',()=>{const p=selected();if(!p)return;Object.assign(p,{x:0,y:0,scale:1,rotate:0});commitEdit();});
$('reset-outfit').addEventListener('click',()=>{
  if(!confirm('配置したパーツと素体を初期状態に戻しますか？ ポイント・所持品・作品名は残ります。'))return;
  state.instances=starterParts();state.bodyId='base';selectedId=state.instances.find(p=>ALL.get(p.itemId).category==='mouth').id;commitEdit();
});
for(const [id,key,convert] of [['part-x','x',v=>v],['part-y','y',v=>v],['part-scale','scale',v=>v/100],['part-rotate','rotate',v=>v]]) {
  $(id).addEventListener('input',()=>{const p=selected();if(!p)return;p[key]=convert(Number($(id).value));renderControls();renderStage();save();});
}
function pointerPosition(ev) {
  const rect=$('character').getBoundingClientRect();
  return {x:view.x+(ev.clientX-rect.left)*view.size/rect.width,y:view.y+(ev.clientY-rect.top)*view.size/rect.height};
}
function hitPart(point) {
  for(const p of layers().reverse()) {
    const asset=assets.get(p.itemId);if(!asset?.pixels)continue;
    const r=-p.rotate*Math.PI/180,dx=(point.x-200-p.x)/p.scale,dy=(point.y-200-p.y)/p.scale;
    const x=Math.floor(dx*Math.cos(r)-dy*Math.sin(r)+200),y=Math.floor(dx*Math.sin(r)+dy*Math.cos(r)+200);
    if(x>=0&&x<400&&y>=0&&y<400&&asset.pixels[(y*400+x)*4+3]>20) return p.id;
  }
  return null;
}
const stage=$('stage');
stage.addEventListener('pointerdown',ev=>{
  if(ev.button!==0||dragStart)return;
  const pos=pointerPosition(ev),hit=hitPart(pos);
  if(hit) {selectedId=hit;currentCategory=ALL.get(selected().itemId).category;renderEditor();}
  const p=selected();if(!p)return;
  dragStart={pointerId:ev.pointerId,partId:p.id,point:pos,start:{x:p.x,y:p.y}};
  stage.setPointerCapture(ev.pointerId);stage.classList.add('dragging');renderStage();ev.preventDefault();
});
stage.addEventListener('pointermove',ev=>{
  if(!dragStart||ev.pointerId!==dragStart.pointerId)return;
  const p=state.instances.find(p=>p.id===dragStart.partId);if(!p)return;
  const point=pointerPosition(ev);
  p.x=clamp(dragStart.start.x+point.x-dragStart.point.x,-400,400);p.y=clamp(dragStart.start.y+point.y-dragStart.point.y,-400,400);
  renderStage();renderControls();
});
function endDrag(ev) {
  if(!dragStart||ev.pointerId!==dragStart.pointerId)return;
  dragStart=null;stage.classList.remove('dragging');save();renderStage();
}
for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,endDrag);
$('study-form').addEventListener('submit',ev=>{
  ev.preventDefault();const e=earned();if(!e) {toast('入力内容を確認してください');return;}
  if(e.points<=0){toast('獲得ポイントは0ptです');return;}
  state.points+=e.points;save();render();toast(`${fmt(e.points)}ptを獲得しました`);
});
$('videos').addEventListener('input',updateEstimate);$('score').addEventListener('input',updateEstimate);
$('draw').addEventListener('click',()=>{
  if(state.points<100)return;state.points-=100;
  const item=ITEMS[Math.floor(Math.random()*ITEMS.length)];state.owned[item.id]=(state.owned[item.id]||0)+1;state.lastDraw=item.id;
  currentCategory=item.category;save();render();showDraw(item);
});
$('draw-close').addEventListener('click',hideDraw);$('draw-modal').addEventListener('click',ev=>{if(ev.target===$('draw-modal'))hideDraw();});
$('draw-equip').addEventListener('click',()=>{const item=ALL.get(state.lastDraw);if(item){equip(item);render();}hideDraw();});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!$('draw-modal').hidden)hideDraw();});
$('unlock-all').addEventListener('click',()=>{for(const item of ITEMS)state.owned[item.id]=Math.max(1,state.owned[item.id]||0);commitEdit();toast('すべてのアイテムを解放しました');});
$('wipe').addEventListener('click',()=>{
  if(!confirm('ポイント・アイテム・編集内容を初期化しますか？'))return;
  state=initialState();selectedId=state.instances.find(p=>ALL.get(p.itemId).category==='mouth').id;currentCategory='mouth';$('character-name').value='';commitEdit();toast('初期化しました');
});
render();save();
