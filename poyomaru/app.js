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
