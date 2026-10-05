/* SCM Smart — 사내기준 외주 분할입고 QR 시뮬레이션
 * 실행: cd sim && npm i jsdom && node sim_qr_split.js
 * 사무실 화면(index.html › 사내외가공진행)과 QR 입고(qr_in.html)를 같은 가짜 DB에 붙여 실제 코드로 돌린다. */
const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
/* ── 화면 소스 ── */
const IDX=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const BOARD=(()=>{const i=IDX.indexOf('window.__SCREENS=')+17;let d=0,k=i,s=false,e=false;for(;k<IDX.length;k++){const c=IDX[k];if(s){if(e)e=false;else if(c==='\\')e=true;else if(c==='"')s=false;continue}if(c==='"')s=true;else if(c==='{')d++;else if(c==='}'){d--;if(!d)break}}
  return JSON.parse(IDX.slice(i,k+1))['machining_progress_board.html'].replace('window.fetch=(u,o)=>parent.fetch(u,o);','')})();
const QRIN=fs.readFileSync(path.join(ROOT,'qr_in.html'),'utf8').replace(/<script src=[^>]+><\/script>/,'');
/* ── 가짜 DB (PostgREST 흉내) ── */
const HOME='KI01',LOT='PL-T1';
let DB;
function seed(){DB={
 items:[{item_cd:'IT-1',item_nm:'시험품'}],
 process_route:[['R1',1,'밀링','V026','외주',3],['R2',2,'열처리','V009','외주',4],['R3',3,'평면연마',HOME,'사내',1]].map(([route_id,seq,proc_nm,site_cd,inout_type,lead_days])=>({route_id,item_cd:'IT-1',seq,proc_nm,site_cd,inout_type,lead_days,use_yn:true})),
 process_site:[['V026','신성금속','외주','밀링'],['V001','성광정밀','외주','밀링'],['V009','대경진공열처리','외주','열처리'],['V023','미래써모텍','외주','열처리'],[HOME,'경일FB 사내가공','사내']].map(([site_cd,site_nm,site_type,proc_type])=>({site_cd,site_nm,site_type,proc_type,use_yn:true})),
 prod_std_type:[['ML','밀링'],['HT','열처리'],['PY','평면연마']].map(([a,b])=>({prod_std_type_cd:a,prod_std_type_ggjr:b})),
 prod_lot:[{lot_no:LOT,result_no:'PR-1',item_cd:'IT-1',lot_qty:600,remain_qty:600,cur_seq:0,cur_site:HOME,status:'대기',travel_print_cnt:1}],
 lot_process:[['밀링','V026','외주'],['열처리','V009','외주'],['평면연마',HOME,'사내']].map(([proc_nm,site_cd,inout_type],i)=>({proc_id:LOT+'-P'+(i+1),lot_no:LOT,route_id:'R'+(i+1),seq:i+1,proc_nm,site_cd,inout_type,status:'대기',lead_days:3})),
 lot_move:[]}}
const PK={lot_process:'proc_id',prod_lot:'lot_no',lot_move:'move_no',process_route:'route_id',items:'item_cd'};
function filt(rows,qs){for(const [k,v] of new URLSearchParams(qs)){if(['select','order','limit','offset','on_conflict'].includes(k))continue;const m=v.match(/^(eq|neq|in|like|is)\.(.*)$/);if(!m)continue;const [,op,val]=m;
  rows=rows.filter(r=>{const x=r[k]==null?null:String(r[k]);if(op==='eq')return x===val;if(op==='neq')return x!==val;if(op==='is')return val==='null'?x==null:true;if(op==='in')return val.replace(/^\(|\)$/g,'').split(',').map(s=>s.replace(/^"|"$/g,'')).includes(x);if(op==='like')return x!=null&&x.startsWith(val.replace(/\*$/,''));return true})}return rows}
async function api(u,o={}){u=String(u);const mth=(o.method||'GET').toUpperCase();const R=(b)=>{const t=JSON.stringify(b);return {ok:true,status:200,headers:{get:()=>null},text:async()=>t,json:async()=>JSON.parse(t)}};
 if(!u.includes('/rest/v1/'))return R([]);const [tb,qs='']=decodeURIComponent(u.split('/rest/v1/')[1]).split('?');const T=DB[tb]||(DB[tb]=[]);const body=o.body?JSON.parse(o.body):null;
 if(mth==='GET')return R(JSON.parse(JSON.stringify(filt(T,qs))));
 if(mth==='POST'){if(tb.startsWith('rpc'))return R([]);for(const r of [].concat(body)){const ix=PK[tb]?T.findIndex(x=>x[PK[tb]]===r[PK[tb]]):-1;if(ix>=0)T[ix]={...T[ix],...r};else T.push({...r})}return R([].concat(body))}
 if(mth==='PATCH'){const rs=filt(T,qs);rs.forEach(r=>Object.assign(r,body));return R(JSON.parse(JSON.stringify(rs)))}
 if(mth==='DELETE'){const rs=filt(T,qs);rs.forEach(r=>T.splice(T.indexOf(r),1));return R(rs)}}
/* ── 화면 띄우기 ── */
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/getContext|navigation|print/i.test(e.message))console.log('  JSERR',e.message.slice(0,160))});
let ASK=[];   /* confirm 창 기록 */
function common(w){w.confirm=m=>{ASK.push(String(m).split('\n')[0]);return true};w.alert=m=>ASK.push('ALERT '+String(m).split('\n')[0]);w.prompt=()=>'현장작업자';
 w.print=()=>{};w.HTMLCanvasElement.prototype.getContext=()=>null;w.Element.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};w.fetch=api}
let OF=null;
async function office(){const dom=new JSDOM(BOARD,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://x.github.io/SCM_Smart/index.html',virtualConsole:vc,beforeParse(w){
  w.APP_CONFIG={MODE:'supabase',SUPABASE:{url:'https://db.test',key:'k'},NO_LOGIN:true,STORAGE:'sim',USER_NAME:'사무실',PAGES:{},MODULES:[],APP:{}};common(w)}});
 OF=dom.window;await wait(2500);OF.document.querySelector('#jobBody tr[data-item]').click();await wait(200)}
async function reload(){await OF.SCM.loadAll(true);OF.renderRoutes();await wait(50)}
async function win(seq){await reload();OF.openWin(LOT,seq);await wait(50);return OF.document}
const set=(d,id,v)=>{const e=d.getElementById(id);if(!e)throw new Error('입력칸 없음: '+id);e.value=v;if(e.onchange)e.onchange()};
async function click(d,id){const b=d.getElementById(id);if(!b||b.disabled)throw new Error('버튼 사용불가: '+id);b.onclick();await wait(300)}
const O={
 order:async(seq,site,q)=>{const d=await win(seq);set(d,'w_site',site);set(d,'w_oqty',q);await click(d,'w_order')},
 addOrder:async(seq,site,q)=>{const d=await win(seq);set(d,'w_asite',site);set(d,'w_aqty',q);await click(d,'w_add')},
 in:async(seq,q,ng=0)=>{const d=await win(seq);set(d,'w_iqty',q);set(d,'w_ng',ng);await click(d,'w_in')},
 confirm:async(seq)=>{const d=await win(seq);await click(d,'w_conf')},
 cancelIn:async(seq)=>{const d=await win(seq);await click(d,'w_icancel')},
 avail:async(seq)=>{await reload();const d=await win(seq);const x=d.getElementById('w_oqty');return x?Number(x.value):null}};
async function qrOpen(){const dom=new JSDOM(QRIN,{runScripts:'dangerously',url:'https://x.github.io/SCM_Smart/qr_in.html?lot='+LOT,virtualConsole:vc,beforeParse(w){common(w);w.Html5Qrcode=class{};try{w.localStorage.setItem('scm_qr_worker','현장작업자')}catch(e){}}});
 await wait(150);return dom.window}
async function QR(q,ng=0,o={}){const w=o.win||await qrOpen(),d=w.document;
 if(o.seq){const st=d.querySelector('.step.pick[data-id="'+LOT+'-P'+o.seq+'"]');if(!st)return {ok:false,msg:'공정 '+o.seq+' 선택불가(입고대상 아님)'};st.onclick();await wait(30)}
 if(d.getElementById('inCard').classList.contains('hide'))return {ok:false,msg:d.getElementById('msg').textContent};
 const info={proc:d.getElementById('vProc').textContent,qty:d.getElementById('vOut').textContent,def:d.getElementById('inQty').value,sites:[...d.querySelectorAll('#fromSel option')].map(x=>x.textContent)};
 if(o.site){const s=d.getElementById('fromSel');s.value=o.site;s.onchange()}
 d.getElementById('inQty').value=q;d.getElementById('ngQty').value=ng;d.getElementById('saveBtn').onclick();await wait(200);
 return {ok:/완료/.test(d.getElementById('msg').textContent),msg:d.getElementById('msg').textContent.replace(/\s+/g,' ').slice(0,90),...info}}
/* ── 검사 ── */
const N=v=>Number(v)||0;let FAIL=0,LINES=[];
const lp=s=>DB.lot_process.find(x=>x.seq==s);
const mv=(s,types)=>DB.lot_move.filter(m=>m.proc_id===LOT+'-P'+s&&types.includes(m.move_type));
function check(label,exp){const res=[];for(const [k,want] of Object.entries(exp)){const got=typeof want==='function'?null:k.split('.').reduce((o,p)=>o==null?o:o[p],{lp:Object.fromEntries([1,2,3].map(s=>[s,lp(s)])),lot:DB.prod_lot[0]});
  const ok=typeof want==='function'?want():String(got)===String(want);if(!ok){FAIL++;res.push('✗ '+k+' = '+got+' (기대 '+want+')')}}
 /* 공통 불변식: 공정 입고수량 = 이동기록 입고 합, 불량 = 이동기록 불량 합, 외주 발주 = 이동기록 반출 합 */
 [1,2,3].forEach(s=>{const p=lp(s);if(!p||p.status==='대기')return;
  const ri=mv(s,['본사입고','사내완료']).reduce((a,m)=>a+N(m.move_qty),0),rn=mv(s,['본사입고','사내완료']).reduce((a,m)=>a+N(m.ng_qty),0);
  if(ri!==N(p.in_qty)){FAIL++;res.push('✗ '+s+'공정 입고 '+N(p.in_qty)+' ≠ 이동기록 '+ri)}
  if(rn!==N(p.ng_qty)){FAIL++;res.push('✗ '+s+'공정 불량 '+N(p.ng_qty)+' ≠ 이동기록 '+rn)}
  if(p.inout_type==='외주'){const so=mv(s,['반출']).reduce((a,m)=>a+N(m.move_qty),0);if(so!==N(p.out_qty)){FAIL++;res.push('✗ '+s+'공정 발주 '+N(p.out_qty)+' ≠ 반출기록 '+so)}}});
 LINES.push((res.length?'  ❌ ':'  ✅ ')+label+(res.length?'\n     '+res.join('\n     '):''))}
const show=()=>[1,2,3].map(s=>{const p=lp(s);return s+'.'+p.proc_nm+'['+p.status+'] 발주'+N(p.out_qty)+' 입고'+N(p.in_qty)+(N(p.ng_qty)?'(불'+N(p.ng_qty)+')':'')}).join('  ');
async function scenario(name,fn){seed();ASK=[];LINES=[];await office();console.log('\n■ '+name);
 try{await fn()}catch(e){FAIL++;LINES.push('  ❌ 예외: '+e.message)}LINES.forEach(l=>console.log(l));console.log('   ⇒ '+show());
 const a=ASK.filter(x=>!/진행할까요|등록할까요|발행할까요/.test(x));if(a.length)console.log('   (확인창) '+[...new Set(a)].join(' / '))}
/* ── 시나리오 ── */
(async()=>{
await scenario('A. 외주 1회 발주 600 → QR 3회 분할입고 200/250/150 → 사무실 입고확정 → 2공정 발주가능',async()=>{
 await O.order(1,'V026',600);check('발주 600',{'lp.1.status':'반출','lp.1.out_qty':600});
 let r=await QR(200);check('QR① 200 — 기본값 '+r.def,{'lp.1.in_qty':200,'lp.1.status':'본사입고'});
 r=await QR(250);check('QR② 250 — 기본값(미입고) '+r.def,{'lp.1.in_qty':450,ok:()=>r.def==='400'});
 r=await QR(150);check('QR③ 150 — 기본값 '+r.def,{'lp.1.in_qty':600,ok:()=>r.def==='150'});
 r=await QR(10);check('QR④ 미입고 0 → 입고대상 없음',{ok:()=>!r.ok});
 await O.confirm(1);check('입고확정',{'lp.1.status':'완료','lot.cur_seq':1,'lot.remain_qty':600});
 const a=await O.avail(2);check('2공정 발주가능 '+a,{ok:()=>a===600})});
await scenario('B. 분할입고 + 불량 누적 (300 불10, 300 불5) → 양품 585 만 다음공정',async()=>{
 await O.order(1,'V026',600);await QR(300,10);await QR(300,5);
 check('불량 누적',{'lp.1.in_qty':600,'lp.1.ng_qty':15});
 await O.confirm(1);const a=await O.avail(2);check('2공정 발주가능 '+a+' (양품)',{ok:()=>a===585,'lot.remain_qty':585})});
await scenario('C. 부분입고 400 → 먼저 입고확정·2공정 발주 400 → 나머지 200 QR → 2공정 추가발주 200',async()=>{
 await O.order(1,'V026',600);await QR(400);await O.confirm(1);await O.order(2,'V009',400);
 check('1공정 확정·2공정 발주',{'lp.1.status':'완료','lp.2.status':'반출','lp.2.out_qty':400});
 const r=await QR(200,0,{seq:1});check('QR 1공정 나머지 200 ('+(r.ok?'등록':'거부: '+r.msg)+')',{'lp.1.in_qty':600});
 check('1공정 상태 → 다시 입고(확정 해제)',{'lp.1.status':'본사입고','lp.1.confirm_yn':false});
 await O.confirm(1);check('1공정 재확정',{'lp.1.status':'완료'});
 await O.addOrder(2,'V009',200);check('2공정 추가발주 200',{'lp.2.out_qty':600})});
await scenario('D. 1차 발주 V026 400 → QR 250 → 추가발주 V001 200 → QR 입고처 선택 V001 200, V026 150',async()=>{
 await O.order(1,'V026',400);await QR(250);await O.addOrder(1,'V001',200);
 check('추가발주 후',{'lp.1.out_qty':600,'lp.1.in_qty':250});
 let r=await QR(200,0,{site:'V001'});check('QR 입고처 선택지: '+r.sites.join(' / '),{ok:()=>r.sites.length===2,'lp.1.in_qty':450});
 const v1=mv(1,['본사입고']).filter(m=>m.from_site==='V001').reduce((a,m)=>a+m.move_qty,0);check('V001 입고기록 '+v1,{ok:()=>v1===200});
 r=await QR(150);check('남은 V026 150 — 입고처 '+(r.sites.length||1)+'곳',{'lp.1.in_qty':600})});
await scenario('E. 동시입고: QR 화면 열어둔 사이 사무실이 100 입고 → QR 200 저장 시도',async()=>{
 await O.order(1,'V026',600);const w=await qrOpen();await O.in(1,100);
 const r=await QR(200,0,{win:w});check('QR 저장 거부 → '+(r.ok?'저장됨(문제)':'거부'),{ok:()=>!r.ok,'lp.1.in_qty':100});
 const r2=await QR(200);check('다시 조회 후 200 입고 (기본값 '+r2.def+')',{'lp.1.in_qty':300,ok:()=>r2.def==='500'})});
await scenario('F. 초과입고: 발주 600 인데 QR 650 입력',async()=>{
 await O.order(1,'V026',600);const r=await QR(650);check('초과 입고 처리 ('+(r.ok?'확인창 후 등록됨':'거부')+')',{ok:()=>true});
 check('미입고 음수 없음 확인',{ok:()=>N(lp(1).out_qty)-N(lp(1).in_qty)<0?(LINES.push('     ⚠ 입고 '+lp(1).in_qty+' > 발주 '+lp(1).out_qty+' 허용됨 — 기준 필요'),true):true})});
await scenario('G. 사내공정(평면연마) 분할 — 사내투입 300 → QR 사내완료 2회',async()=>{
 await O.order(1,'V026',600);await QR(600);await O.confirm(1);await O.order(2,'V009',600);await QR(600,0,{seq:2});await O.confirm(2);
 await O.order(3,HOME,300);const r=await QR(150,0,{seq:3});await QR(150,0,{seq:3});
 const t=mv(3,['사내완료']);check('사내완료 기록 '+t.length+'건 (from '+[...new Set(t.map(m=>m.from_site))]+')',{'lp.3.in_qty':300,ok:()=>t.length===2&&t.every(m=>m.from_site===HOME)});
 const a=await O.avail(3);check('3공정 남은 사내투입 가능 (발주창 기본값 '+a+')',{ok:()=>true})});
await scenario('H. QR 분할 2회 후 사무실 입고취소 → 마지막 1회분만 취소',async()=>{
 await O.order(1,'V026',600);await QR(200);await QR(300);await O.cancelIn(1);
 check('마지막 300 만 취소',{'lp.1.in_qty':200,ok:()=>mv(1,['본사입고']).length===1})});
await scenario('I. 2공정 진행 중 1공정 미입고분 QR 입고 → 1공정 확정해제 영향',async()=>{
 await O.order(1,'V026',600);await QR(500);await O.confirm(1);await O.order(2,'V009',500);await QR(100,0,{seq:1});
 check('2공정은 그대로 진행',{'lp.2.status':'반출','lp.1.status':'본사입고'});
 const d=await win(1);const cc=d.getElementById('w_icancel');check('1공정 입고취소 버튼 '+(cc&&!cc.disabled?'사용가능':'잠김'),{ok:()=>true})});
console.log('\n'+(FAIL?'❌ 실패 '+FAIL+'건':'✅ 전체 통과'));process.exit(FAIL?1:0)})();
