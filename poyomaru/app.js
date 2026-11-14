// ぽよまるメーカー: ブラウザ内だけで動作する学習ポイント＋キャラクター編集アプリ。
const BASES = [
  {id:'base', name:'ぽよまる', desc:'基本のキャラクター', asset:'base', starter:true},
  {id:'base_devil', name:'デビルぽよまる', desc:'むらさき色の素体', asset:'base_devil'},
  {id:'base_dragon', name:'ドラゴンぽよまる', desc:'緑色の素体', asset:'base_dragon'},
  {id:'base_professor', name:'はかせぽよまる', desc:'きいろ色の素体', asset:'base_professor'},
  {id:'base_alien', name:'エイリアンぽよまる', desc:'みず色の素体', asset:'base_alien'},
];
const CATEGORIES = [
  {id:'body',name:'素体',icon:'◯'},
  {id:'ears',name:'耳・頭',icon:'⌒'},
  {id:'eyes',name:'目',icon:'◉'},
  {id:'mouth',name:'口',icon:'◡'},
  {id:'limbs',name:'手足',icon:'✳'},
  {id:'tail',name:'しっぽ',icon:'〰'}
];
const PARTS = [
  {id:'ears_round',category:'ears',name:'まる耳',theme:'ぽよまる',starter:true},
  {id:'eyes_cute',category:'eyes',name:'うるうる目',theme:'ぽよまる',starter:true},
  {id:'mouth_smile',category:'mouth',name:'にこにこ口',theme:'ぽよまる',starter:true},
  {id:'limbs_paws',category:'limbs',name:'ぽてぽて手足',theme:'ぽよまる',starter:true},
  {id:'tail_curl',category:'tail',name:'くるりしっぽ',theme:'ぽよまる',starter:true},
  ...[
    ['devil','デビル','デビル'],
    ['dragon','ドラゴン','ドラゴン'],
    ['professor','はかせ','はかせ'],
    ['alien','エイリアン','エイリアン']
  ].flatMap(([key,display,theme])=>[
    {id:`ears_${key}`,category:'ears',name:`${display}の耳・頭`,theme},
    {id:`eyes_${key}`,category:'eyes',name:`${display}の目`,theme},
    {id:`mouth_${key}`,category:'mouth',name:`${display}の口`,theme},
    {id:`limbs_${key}`,category:'limbs',name:`${display}の手足`,theme},
    {id:`tail_${key}`,category:'tail',name:`${display}のしっぽ`,theme}
  ])
];
const ITEMS = [...BASES.filter(b=>!b.starter).map(b=>({...b,category:'body'})),...PARTS.filter(p=>!p.starter)];
const ALL = new Map([...BASES.map(b=>[b.id,{...b,category:'body'}]),...PARTS.map(p=>[p.id,p])]);
const STARTEQUIP = Object.fromEntries(CATEGORIES.filter(c=>c.id!=='body').map(c=>[c.id,PARTS.find(p=>p.category===c.id&&p.starter).id]));
const STORE='poyomarumaker-v2';
const OLDSTORE='giga-chimera-miniproto-v1';
const $=id=>document.getElementById(id);
const file=item=>`assets/${item.asset||item.id}.svg`;
const clone=x=>JSON.parse(JSON.stringify(x));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const fmt=n=>n.toLocaleString('ja-JP',{maximumFractionDigits:1});
function initialState(){return {points:0,owned:{},bodyId:'base',equipped:{...STARTEQUIP},transform:{},lastDraw:null};}
function has(item,s){return item.starter||!!(s.owned[item.id]>0);}
function validateSaved(data){
  const s=initialState();
  if(data&&Number.isFinite(data.points))s.points=clamp(data.points,0,10000000);
  for(const item of ITEMS){const n=data?.owned?.[item.id];if(Number.isInteger(n)&&n>0)s.owned[item.id]=clamp(n,1,100000);}
  if(BASES.some(b=>b.id===data?.bodyId&&has(b,s)))s.bodyId=data.bodyId;
  for(const cat of CATEGORIES.filter(c=>c.id!=='body')){
    const id=data?.equipped?.[cat.id],item=ALL.get(id);
    if(item&&item.category===cat.id&&has(item,s))s.equipped[cat.id]=id;
    const tf=data?.transform?.[cat.id];
    if(tf&&['x','y','scale','rotate'].every(k=>Number.isFinite(tf[k]))){
      s.transform[cat.id]={x:clamp(tf.x,-180,180),y:clamp(tf.y,-180,180),scale:clamp(tf.scale,.45,2.5),rotate:clamp(tf.rotate,-180,180)};
    }
  }
  if(ALL.has(data?.lastDraw))s.lastDraw=data.lastDraw;
  return s;
}
function loadState(){
  try { const latest=JSON.parse(localStorage.getItem(STORE)||'null');if(latest)return validateSaved(latest);
    const old=JSON.parse(localStorage.getItem(OLDSTORE)||'null');return old?validateSaved(old):initialState();
  }catch{return initialState();}
}
let state=loadState();
let currentCategory='mouth';
let toastTimer;
let dragStart=null;
function save(){try{localStorage.setItem(STORE,JSON.stringify(state));}catch{}}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2300);}
function earned(){let videos=Number($('videos').value),score=Number($('score').value);
  if(!Number.isInteger(videos)||videos<0||videos>999||!Number.isInteger(score)||score<0||score>100)return null;
  return {videos,score,points:videos*10+score*.5};
}
function updateEstimate(){const e=earned();$('estimate').textContent=e?`${fmt(e.points)}pt`:'入力を確認してください';}
function transformFor(category){return state.transform[category]||{x:0,y:0,scale:1,rotate:0};}
function applyTransforms(){
  for(const cat of CATEGORIES.filter(c=>c.id!=='body')){
    const layer=document.querySelector(`[data-layer="${cat.id}"]`);
    const t=transformFor(cat.id);
    layer.style.transform=`translate(${t.x/4}%,${t.y/4}%) rotate(${t.rotate}deg) scale(${t.scale})`;
  }
}
function renderStage(){
  for(const cat of CATEGORIES.filter(c=>c.id!=='body')){
    document.querySelector(`[data-layer="${cat.id}"]`).src=file(ALL.get(state.equipped[cat.id]));
  }
  document.querySelector('[data-layer="body"]').src=file(ALL.get(state.bodyId));
  $('monster-name').textContent=ALL.get(state.bodyId).name;
  applyTransforms();
}
function makeTab(cat){const el=document.createElement('button');el.type='button';el.className='tab'+(cat.id===currentCategory?' active':'');el.setAttribute('aria-pressed',String(cat.id===currentCategory));el.innerHTML=`<span aria-hidden="true">${cat.icon}</span>${cat.name}`;el.onclick=()=>{currentCategory=cat.id;renderEditor();};return el;}
function card(item){
  const owned=has(item,state),active=item.category==='body'?item.id===state.bodyId:item.id===state.equipped[item.category];
  const b=document.createElement('button');b.type='button';b.className='part-card'+(active?' selected':'')+(!owned?' locked':'');b.disabled=!owned;
  const thumb=document.createElement('div');thumb.className='part-thumb';const img=document.createElement('img');img.src=file(item);img.alt='';thumb.append(img);
  const name=document.createElement('div');name.className='part-name';name.textContent=item.name;
  const description=document.createElement('div');description.className='part-desc';description.textContent=item.desc||`${item.theme}シリーズ`;
  const pill=document.createElement('span');pill.className='pill'+(active?' purple':!owned?' gray':'');pill.textContent=active?'装着中':item.starter?'初期装備':owned?`所持 ×${state.owned[item.id]}`:'未獲得';
  b.append(thumb,name,description,pill);
  if(owned)b.onclick=()=>{
    if(item.category==='body')state.bodyId=item.id;else state.equipped[item.category]=item.id;
    save();render();
  };
  return b;
}
function renderEditor(){
  $('category-tabs').replaceChildren(...CATEGORIES.map(makeTab));
  const items=currentCategory==='body'?BASES.map(b=>({...b,category:'body'})):PARTS.filter(p=>p.category===currentCategory);
  $('collection').replaceChildren(...items.map(card));
  const n=ITEMS.filter(p=>state.owned[p.id]>0).length;
  $('inventory-hint').textContent=`獲得済み：${n} / ${ITEMS.length} 種類`;
  const controls=$('position-controls');controls.hidden=currentCategory==='body';
  const current=transformFor(currentCategory);
  $('part-scale').value=Math.round(current.scale*100);
  $('part-rotate').value=current.rotate;
  $('part-scale-value').textContent=`${Math.round(current.scale*100)}%`;
  $('part-rotate-value').textContent=`${current.rotate}°`;
  $('stage').classList.toggle('editable',currentCategory!=='body');
}
function renderResult(){
  const area=$('result');area.replaceChildren();
  if(!state.lastDraw){area.className='result blank';area.textContent='抽選したアイテムがここに表示されます';return;}
  area.className='result';const item=ALL.get(state.lastDraw);
  const row=document.createElement('div');row.className='won';const thumb=document.createElement('div');thumb.className='result-illu';const img=document.createElement('img');img.src=file(item);img.alt='';thumb.append(img);
  const txt=document.createElement('div');const name=document.createElement('strong');name.textContent=item.name;const count=document.createElement('small');count.textContent=`所持数 ${state.owned[item.id]||0}`;
  const btn=document.createElement('button');btn.type='button';btn.textContent='エディターで装着';btn.onclick=()=>{equip(item);currentCategory=item.category;render();};
  txt.append(name,count,btn);row.append(thumb,txt);area.append(row);
}
function render(){
  $('point-balance').textContent=fmt(state.points);$('draw').disabled=state.points<100;
  renderStage();renderEditor();renderResult();updateEstimate();
}
function equip(item){if(!has(item,state))return;if(item.category==='body')state.bodyId=item.id;else state.equipped[item.category]=item.id;save();}
const FOCUS={body:'62 38 278 348',ears:'80 0 260 165',eyes:'105 120 185 125',mouth:'120 186 175 104',limbs:'18 195 370 200',tail:'15 164 385 225'};
function showDraw(item){
  $('draw-title').textContent=item.name;
  $('draw-kind').textContent=item.category==='body'?'素体':'パーツ';
  const preview=$('draw-svg');preview.setAttribute('viewBox',FOCUS[item.category]);
  preview.replaceChildren();const image=document.createElementNS('http://www.w3.org/2000/svg','image');
  image.setAttribute('href',file(item));image.setAttribute('width','400');image.setAttribute('height','400');image.setAttribute('x','0');image.setAttribute('y','0');
  preview.append(image);
  $('draw-modal').hidden=false;$('draw-close').focus();
}
function hideDraw(){$('draw-modal').hidden=true;}
$('study-form').addEventListener('submit',ev=>{ev.preventDefault();const e=earned();if(!e){toast('入力内容を確認してください');return;}
  if(e.points<=0){toast('獲得ポイントは0ptです');return;}state.points+=e.points;save();render();toast(`${fmt(e.points)}ptを獲得しました`);
});
$('videos').addEventListener('input',updateEstimate);$('score').addEventListener('input',updateEstimate);
$('draw').addEventListener('click',()=>{
  if(state.points<100)return;
  state.points-=100;
  const item=ITEMS[Math.floor(Math.random()*ITEMS.length)];state.owned[item.id]=(state.owned[item.id]||0)+1;state.lastDraw=item.id;
  currentCategory=item.category;save();render();showDraw(item);
});
$('draw-close').addEventListener('click',hideDraw);
$('draw-modal').addEventListener('click',ev=>{if(ev.target===$('draw-modal'))hideDraw();});
$('draw-equip').addEventListener('click',()=>{const item=ALL.get(state.lastDraw);if(item){equip(item);currentCategory=item.category;render();}hideDraw();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideDraw();});
$('reset-outfit').addEventListener('click',()=>{state.equipped={...STARTEQUIP};state.bodyId='base';state.transform={};save();render();});
$('reset-position').addEventListener('click',()=>{if(currentCategory==='body')return;delete state.transform[currentCategory];save();render();});
for(const [id,key,convert] of [['part-scale','scale',v=>v/100],['part-rotate','rotate',v=>v]]){
  $(id).addEventListener('input',()=>{if(currentCategory==='body')return;const tf=clone(transformFor(currentCategory));tf[key]=convert(Number($(id).value));state.transform[currentCategory]=tf;applyTransforms();
    $('part-scale-value').textContent=`${Math.round(tf.scale*100)}%`; $('part-rotate-value').textContent=`${tf.rotate}°`;
    save();
  });
}
const stage=$('stage');
stage.addEventListener('pointerdown',ev=>{
  if(currentCategory==='body'||ev.button!==0)return;
  dragStart={id:ev.pointerId,x:ev.clientX,y:ev.clientY,category:currentCategory,start:clone(transformFor(currentCategory))};
  stage.setPointerCapture(ev.pointerId);stage.classList.add('dragging');
});
stage.addEventListener('pointermove',ev=>{
  if(!dragStart||ev.pointerId!==dragStart.id)return;
  const w=stage.getBoundingClientRect().width;
  const t=clone(dragStart.start);
  t.x=clamp(t.x+(ev.clientX-dragStart.x)*400/w,-180,180);
  t.y=clamp(t.y+(ev.clientY-dragStart.y)*400/w,-180,180);
  state.transform[dragStart.category]=t;applyTransforms();
});
function endDrag(ev){if(dragStart&&ev.pointerId===dragStart.id){dragStart=null;stage.classList.remove('dragging');save();}}
stage.addEventListener('pointerup',endDrag);stage.addEventListener('pointercancel',endDrag);
$('unlock-all').addEventListener('click',()=>{for(const item of ITEMS)state.owned[item.id]=Math.max(1,state.owned[item.id]||0);save();render();toast('すべてのアイテムを解放しました');});
$('wipe').addEventListener('click',()=>{if(!confirm('ポイント・アイテム・編集内容を初期化しますか？'))return;state=initialState();currentCategory='mouth';save();render();toast('初期化しました');});
render();
