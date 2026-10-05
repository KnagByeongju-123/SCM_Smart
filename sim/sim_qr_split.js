/* SCM Smart — 사내기준 외주 분할입고 QR 시뮬레이션
 * 실행: cd sim && npm i jsdom && node sim_qr_split.js
 * 사무실 화면(index.html › 사내외가공진행)과 QR 입고(qr_in.html)를 같은 가짜 DB에 붙여 실제 코드로 돌린다.
 *
 * [입고 기준 — 2026-10-05 확정]
 *  1. 초과입고 금지: 공정 미입고(발주−입고) 또는 업체별 미입고를 넘는 입고는 QR·사무실 모두 막는다. 더 들어오면 추가발주 후 입고.
 *  2. 다음 공정 발주: 입고된 양품(입고−불량)만큼 바로 가능 (확정 전이라도 분할 흐름 허용).
 *  3. 확정 후 추가입고: 확정이 풀리고(본사입고) 다시 입고확정해야 한다.
 *  4. 입고확정: 사무실에서만. QR 화면은 입고만 한다.
 *  A 미입고 마감(사유 필수, 입고·불량으로 처리) · B·C 불량 처리/원인 필수 · D 직송(사무실, 입고+확정+다음공정 발주)
 *  E 로트 분할(발주 전 수량, 이력 승계) · F 사내투입 이동기록 · G 입고지연 표시 · H 사내 실적(작업자·설비·시간) · J 확정 후 수량수정 금지 */
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
 order:async(seq,site,q,due,o={})=>{const d=await win(seq);set(d,'w_site',site);set(d,'w_oqty',q);if(due)set(d,'w_due',due);if(o.noShip)d.getElementById('w_shipnow').checked=false;await click(d,'w_order')},
 ship:async(seq,q,to)=>{const d=await win(seq);if(to)set(d,'w_ssite',to);set(d,'w_sq2',q);await click(d,'w_ship')},
 rwOut:async(seq,site,q)=>{const d=await win(seq);set(d,'rw_osite',site);set(d,'rw_oq',q);await click(d,'rw_out')},
 rwIn:async(seq,site,q,ng=0)=>{const d=await win(seq);set(d,'rw_isite',site);set(d,'rw_iq',q);set(d,'rw_ing',ng);if(ng){set(d,'rw_cause','가공');set(d,'rw_act','폐기')}await click(d,'rw_in')},
 shipCancel:async(seq)=>{const d=await win(seq);await click(d,'w_shipc')},
 addOrderNoShip:async(seq,site,q)=>{const d=await win(seq);set(d,'w_asite',site);set(d,'w_aqty',q);d.getElementById('w_ashipnow').checked=false;await click(d,'w_add')},
 addOrder:async(seq,site,q)=>{const d=await win(seq);set(d,'w_asite',site);set(d,'w_aqty',q);await click(d,'w_add')},
 in:async(seq,q,ng=0,o={})=>{const d=await win(seq);set(d,'w_iqty',q);set(d,'w_ng',ng);if(ng&&!o.noCause){set(d,'w_cause','가공');set(d,'w_act','폐기')}if(o.eq){set(d,'w_eq',o.eq);set(d,'w_ws','2026-10-05T08:00');set(d,'w_we','2026-10-05T12:00')}await click(d,'w_in')},
 close:async(seq,q,why='분실')=>{const d=await win(seq);set(d,'w_cq',q);set(d,'w_cwhy',why);await click(d,'w_close')},
 direct:async(seq,to,q,ng=0)=>{const d=await win(seq);set(d,'w_dsite',to);set(d,'w_dq',q);set(d,'w_dng',ng);if(ng){set(d,'wd_cause','가공');set(d,'wd_act','폐기')}await click(d,'w_direct')},
 split:async(seq,q)=>{const d=await win(seq);set(d,'w_sq',q);await click(d,'w_split')},
 cancelOrder:async(seq)=>{const d=await win(seq);await click(d,'w_ocancel')},
 btn:async(seq,id)=>{const d=await win(seq);const b=d.getElementById(id);return b?(b.disabled?'잠김':'사용가능'):'없음'},
 addIn:async(seq,q,ng=0,o={})=>{const d=await win(seq);set(d,'w_aiq',q);set(d,'w_ang',ng);if(ng){set(d,'wa_cause','소재');set(d,'wa_act','반품')}if(o.eq){set(d,'wa_eq',o.eq);set(d,'wa_ws','2026-10-05T08:00');set(d,'wa_we','2026-10-05T12:00')}const b=d.getElementById('w_ain');if(!b||b.disabled)throw new Error('버튼 사용불가: w_ain');await b.onclick();await wait(300)},
 confirm:async(seq)=>{const d=await win(seq);await click(d,'w_conf')},
 cancelIn:async(seq)=>{const d=await win(seq);await click(d,'w_icancel')},
 avail:async(seq)=>{await reload();const d=await win(seq);const x=d.getElementById('w_oqty');return x?Number(x.value):null}};
async function qrOpen(org='HQ'){const dom=new JSDOM(QRIN,{runScripts:'dangerously',url:'https://x.github.io/SCM_Smart/qr_in.html?lot='+LOT,virtualConsole:vc,beforeParse(w){common(w);w.Html5Qrcode=class{};try{w.localStorage.setItem('scm_qr_worker',org==='HQ'?'현장작업자':'협력사담당');w.localStorage.setItem('scm_qr_org',org)}catch(e){}}});
 await wait(250);return dom.window}
async function QRrcv(org,qs){const w=await qrOpen(org),d=w.document;const out={org:d.getElementById('orgTxt').textContent,cards:['inCard','shipCard','rcvCard'].filter(i=>!d.getElementById(i).classList.contains('hide')),items:d.querySelectorAll('#rcvList .rb').length,msg:d.getElementById('msg').textContent.slice(0,60)};
 for(const q of (qs||[])){const inp=d.querySelector('#rcvList .rq');if(!inp)break;inp.value=q;d.querySelector('#rcvList .rb').onclick();await wait(200)}return out}
async function QR(q,ng=0,o={}){const w=o.win||await qrOpen(),d=w.document;
 if(o.seq){const st=d.querySelector('.step.pick[data-id="'+LOT+'-P'+o.seq+'"]');if(!st)return {ok:false,msg:'공정 '+o.seq+' 선택불가(입고대상 아님)'};st.onclick();await wait(30)}
 if(d.getElementById('inCard').classList.contains('hide'))return {ok:false,msg:d.getElementById('msg').textContent};
 const info={proc:d.getElementById('vProc').textContent,qty:d.getElementById('vOut').textContent,def:d.getElementById('inQty').value,sites:[...d.querySelectorAll('#fromSel option')].map(x=>x.textContent)};
 if(o.site){const s=d.getElementById('fromSel');s.value=o.site;s.onchange()}
 d.getElementById('inQty').value=q;d.getElementById('ngQty').value=ng;
 if(ng&&!o.noCause){d.getElementById('ngCause').value='취급';d.getElementById('ngAct').value='재작업'}
 if(o.eq){d.getElementById('equip').value=o.eq;d.getElementById('wStart').value='2026-10-05T13:00';d.getElementById('wEnd').value='2026-10-05T17:30'}
 d.getElementById('saveBtn').onclick();await wait(200);
 return {ok:/완료/.test(d.getElementById('msg').textContent),msg:d.getElementById('msg').textContent.replace(/\s+/g,' ').slice(0,90),...info}}
async function QRship(q,o={}){const w=await qrOpen(),d=w.document;
 if(o.seq){const st=d.querySelector('.step.pick[data-id="'+LOT+'-P'+o.seq+'"]');if(!st)return {ok:false,msg:'선택불가'};st.onclick();await wait(30)}
 if(d.getElementById('shipCard').classList.contains('hide'))return {ok:false,msg:'출고 카드 없음',inCard:!d.getElementById('inCard').classList.contains('hide')};
 const def=d.getElementById('shipQty').value;if(o.to)d.getElementById('shipTo').value=o.to;d.getElementById('shipQty').value=q;d.getElementById('shipBtn').onclick();await wait(200);
 return {ok:/출고 /.test(d.getElementById('msg').textContent)&&/✔/.test(d.getElementById('msg').textContent),def,msg:d.getElementById('msg').textContent.slice(0,80)}}
async function officeErr(fn){const n=ASK.length;try{await fn()}catch(e){return e.message}const a=ASK.slice(n).find(x=>/^ALERT/.test(x));return a||''}
/* ── 검사 ── */
const N=v=>Number(v)||0;let FAIL=0,LINES=[];
const lp=s=>DB.lot_process.find(x=>x.seq==s);
const mv=(s,types)=>DB.lot_move.filter(m=>m.proc_id===LOT+'-P'+s&&types.includes(m.move_type));
function check(label,exp){const res=[];for(const [k,want] of Object.entries(exp)){const got=typeof want==='function'?null:k.split('.').reduce((o,p)=>o==null?o:o[p],{lp:Object.fromEntries([1,2,3].map(s=>[s,lp(s)])),lot:DB.prod_lot[0]});
  const ok=typeof want==='function'?want():String(got)===String(want);if(!ok){FAIL++;res.push('✗ '+k+' = '+got+' (기대 '+want+')')}}
 /* 공통 불변식: 공정 입고수량 = 이동기록 입고 합, 불량 = 이동기록 불량 합, 외주 발주 = 이동기록 반출 합 */
 [1,2,3].forEach(s=>{const p=lp(s);if(!p||p.status==='대기')return;
  const RC=['본사입고','사내완료','미입고마감','직송입고'],ri=mv(s,RC).reduce((a,m)=>a+N(m.move_qty),0),rn=mv(s,RC).reduce((a,m)=>a+N(m.ng_qty),0)-mv(s,['재작업입고']).reduce((a,m)=>a+N(m.move_qty)-N(m.ng_qty),0);
  if(ri!==N(p.in_qty)){FAIL++;res.push('✗ '+s+'공정 입고 '+N(p.in_qty)+' ≠ 이동기록 '+ri)}
  if(rn!==N(p.ng_qty)){FAIL++;res.push('✗ '+s+'공정 불량 '+N(p.ng_qty)+' ≠ 이동기록 '+rn)}
  {const so=mv(s,['반출','사내투입']).reduce((a,m)=>a+N(m.move_qty),0),sh=p.ship_qty==null?N(p.out_qty):N(p.ship_qty);if(so!==sh){FAIL++;res.push('✗ '+s+'공정 출고 '+sh+' ≠ 반출·사내투입 기록 '+so)}
   if(sh>N(p.out_qty)){FAIL++;res.push('✗ '+s+'공정 출고 '+sh+' > 발주 '+N(p.out_qty))}if(N(p.in_qty)>sh){FAIL++;res.push('✗ '+s+'공정 입고 '+N(p.in_qty)+' > 출고 '+sh)}}});
 LINES.push((res.length?'  ❌ ':'  ✅ ')+label+(res.length?'\n     '+res.join('\n     '):''))}
const show=()=>[1,2,3].map(s=>{const p=lp(s);return s+'.'+p.proc_nm+'['+p.status+'] 발주'+N(p.out_qty)+(p.ship_qty!=null&&N(p.ship_qty)!==N(p.out_qty)?' 출고'+N(p.ship_qty):'')+' 입고'+N(p.in_qty)+(N(p.ng_qty)?'(불'+N(p.ng_qty)+')':'')}).join('  ');
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
await scenario('F. [기준] 초과입고 막기 — QR 650 / 사무실 추가입고 300(미입고 200)',async()=>{
 await O.order(1,'V026',600);let r=await QR(650);check('QR 650 → '+(r.ok?'저장됨(문제)':'막힘'),{ok:()=>!r.ok,'lp.1.in_qty':'undefined'});
 await QR(400);await O.addOrder(1,'V001',0).catch(()=>{});
 const e=await officeErr(()=>O.addIn(1,300));check('사무실 입고 300 (미입고 200) → '+(e?'막힘: '+e.slice(0,60):'저장됨(문제)'),{ok:()=>!!e,'lp.1.in_qty':400});
 await O.addIn(1,200);check('사무실 추가입고 정상 200',{'lp.1.in_qty':600})});
await scenario('F2. [기준] 업체별 미입고 초과 막기 — 신성 400 + 성광 추가 200, 성광분 250 입력',async()=>{
 await O.order(1,'V026',400);await O.addOrder(1,'V001',200);
 const r=await QR(250,0,{site:'V001'});check('성광정밀 250 (미입고 200) → '+(r.ok?'저장됨(문제)':'막힘'),{ok:()=>!r.ok,'lp.1.in_qty':'undefined'})});
await scenario('J. [기준] QR은 입고만 · 확정은 사무실 — 전 공정 진행 → 가공완료',async()=>{
 await O.order(1,'V026',600);await QR(600);const w=await qrOpen(),d=w.document;
 check('전량 입고 후 QR 화면: 확정 버튼 없음·입고 대상 없음',{ok:()=>!d.getElementById('confBtn')&&d.getElementById('inCard').classList.contains('hide')});
 await O.confirm(1);check('사무실 1공정 확정',{'lp.1.status':'완료','lp.1.confirm_by':'사무실','lot.cur_seq':1});
 await O.order(2,'V009',600);await QR(600,10,{seq:2});await O.confirm(2);check('2공정 불량10 확정 → 양품 590',{'lp.2.status':'완료','lot.remain_qty':590});
 await O.order(3,HOME,590);await QR(590,0,{seq:3});await O.confirm(3);check('3공정(사내) 확정 → 로트 가공완료',{'lp.3.status':'완료','lot.status':'가공완료','lot.cur_seq':3,'lot.remain_qty':590})});
await scenario('K. [기준] 부분 확정(사무실) → 나머지 QR 입고 시 확정 해제 → 사무실 재확정',async()=>{
 await O.order(1,'V026',600);await QR(400);await O.confirm(1);check('400 상태에서 사무실 확정',{'lp.1.status':'완료','lot.remain_qty':400});
 await O.order(2,'V009',400);await QR(200,0,{seq:1});check('나머지 200 QR 입고 → 확정 해제',{'lp.1.status':'본사입고','lp.1.confirm_yn':false,'lp.2.status':'반출'});
 await O.confirm(1);check('사무실 재확정 → 양품 600',{'lp.1.status':'완료'});await reload();
 OF.openWin(LOT,2);await wait(50);const aq=OF.document.getElementById('w_aqty');check('2공정 추가발주 가능 '+(aq?aq.value:'없음'),{ok:()=>aq&&aq.value==='200'})});
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
await scenario('L. [A] 미입고 마감 — 600 중 580 입고, 20 분실 마감 → 재확정 → 다음공정 580',async()=>{
 await O.order(1,'V026',600);await QR(580);await O.confirm(1);await O.close(1,20,'분실');
 const m=mv(1,['미입고마감'])[0];check('마감 20 (입고·불량 처리, 사유 '+(m&&m.ng_cause)+')',{'lp.1.in_qty':600,'lp.1.ng_qty':20,'lp.1.status':'본사입고',ok:()=>m&&m.ng_cause==='분실'&&m.move_qty===20});
 const r=await QR(1);check('QR에 입고대상 없음',{ok:()=>!r.ok});await O.confirm(1);const a=await O.avail(2);check('재확정 → 2공정 발주가능 '+a,{ok:()=>a===580,'lot.remain_qty':580})});
await scenario('M. [B·C] 불량 원인·처리 필수 — QR / 사무실',async()=>{
 await O.order(1,'V026',600);let r=await QR(300,5,{noCause:true});check('QR 불량 원인 없이 → '+(r.ok?'저장됨(문제)':'막힘'),{ok:()=>!r.ok,'lp.1.in_qty':'undefined'});
 r=await QR(300,5);const m=mv(1,['본사입고'])[0];check('QR 원인·처리 기록 ('+m.ng_cause+'/'+m.ng_action+')',{ok:()=>m.ng_cause==='취급'&&m.ng_action==='재작업'});
 await O.addIn(1,300,3);const m2=mv(1,['본사입고'])[1];check('사무실 추가입고 원인·처리 ('+(m2&&m2.ng_cause)+'/'+(m2&&m2.ng_action)+')',{'lp.1.ng_qty':8,ok:()=>m2&&m2.ng_cause==='소재'})});
await scenario('N. [D] 직송 — 신성금속 600 발주, 300 입고 후 나머지 300 은 대경진공열처리로 직송',async()=>{
 await O.order(1,'V026',600);await QR(300);
 let e=await officeErr(()=>O.direct(1,HOME,300));check('사내로 직송 → '+(e?'막힘':'처리됨(문제)'),{ok:()=>!!e});
 await O.direct(1,'V009',300,10);const dm=mv(1,['직송입고'])[0],nm=mv(2,['반출'])[0];
 check('1공정 입고 600·확정, 2공정 발주 290 (신성→대경)',{'lp.1.in_qty':600,'lp.1.status':'완료','lp.2.status':'반출','lp.2.out_qty':290,ok:()=>dm&&dm.to_site==='V009'&&nm&&nm.from_site==='V026'&&nm.to_site==='V009'});
 const a=await O.avail(2);check('본사 입고분 300 → 2공정 추가발주 가능',{ok:()=>{const d=OF.document.getElementById('w_aqty');return d&&d.value==='300'}});
 const r=await QR(290,0,{seq:2});check('QR 2공정 직송분 입고',{'lp.2.in_qty':290})});
await scenario('O. [E] 로트 분할 — 1공정 600 확정 후 2공정에서 100 분할 → 새 로트 PL-T1-1',async()=>{
 await O.order(1,'V026',600);await QR(600);await O.confirm(1);await O.split(2,100);
 const c=DB.prod_lot.find(x=>x.lot_no==='PL-T1-1'),cp=DB.lot_process.filter(x=>x.lot_no==='PL-T1-1').sort((a,b)=>a.seq-b.seq);
 check('새 로트 100 · 소재이력·원로트 승계 · 1공정 완료 이력',{ok:()=>c&&c.lot_qty===100&&c.split_from===LOT&&cp.length===3&&cp[0].status==='완료'&&cp[0].in_qty===100&&cp[1].status==='대기','lp.1.split_qty':100});
 let a=await O.avail(2);check('원 로트 2공정 발주가능 '+a+' (600−100)',{ok:()=>a===500,'lot.remain_qty':500});
 const e=await officeErr(()=>O.order(2,'V009',550));check('원 로트 550 발주 → '+(e?'막힘':'처리됨(문제)'),{ok:()=>!!e});
 await O.order(2,'V009',500);check('원 로트 500 발주',{'lp.2.out_qty':500})});
await scenario('O2. [E] 1공정 전 분할 — 로트 600 중 200 분할 → 원 로트 400',async()=>{
 await O.split(1,200);const c=DB.prod_lot.find(x=>x.lot_no==='PL-T1-1');check('원 로트 400 · 새 로트 200',{'lot.lot_qty':400,ok:()=>c&&c.lot_qty===200&&c.status==='대기'});
 const a=await O.avail(1);check('원 로트 1공정 발주가능 '+a,{ok:()=>a===400})});
await scenario('P. [F] 사내 공정 첫 투입도 사내투입 기록 → 발주취소 시 삭제',async()=>{
 await O.order(1,'V026',600);await QR(600);await O.confirm(1);await O.order(2,'V009',600);await QR(600,0,{seq:2});await O.confirm(2);
 await O.order(3,HOME,590);check('사내투입 기록 590',{ok:()=>mv(3,['사내투입']).reduce((a,m)=>a+m.move_qty,0)===590});
 await O.cancelOrder(3);check('발주취소 → 기록 삭제',{'lp.3.status':'대기',ok:()=>mv(3,['사내투입']).length===0})});
await scenario('Q. [G] 입고지연 — 입고예정일 지난 공정 강조 + 상단 건수',async()=>{
 await O.order(1,'V026',600,'2026-10-01');await reload();const td=OF.document.querySelector('td.st[data-lot="'+LOT+'"][data-seq="1"]'),b=OF.document.getElementById('lateBadge');
 check('공정 칸 '+(td&&td.classList.contains('late')?'빨간 테두리':'표시 없음')+' · '+(td?td.querySelector('small').textContent.slice(0,12):'')+' · 배지 「'+(b&&b.textContent)+'」',{ok:()=>td&&td.classList.contains('late')&&b&&/1건/.test(b.textContent)});
 await QR(600);await reload();const td2=OF.document.querySelector('td.st[data-lot="'+LOT+'"][data-seq="1"]');check('전량 입고 → 지연 해제',{ok:()=>td2&&!td2.classList.contains('late')})});
await scenario('R. [H] 사내 실적 — QR·사무실 사내완료에 작업자·설비·시간',async()=>{
 await O.order(1,'V026',600);await QR(600);await O.confirm(1);await O.order(2,'V009',600);await QR(600,0,{seq:2});await O.confirm(2);await O.order(3,HOME,600);
 await QR(300,0,{seq:3,eq:'MCT-02'});await O.addIn(3,300,0,{eq:'평면연삭기 1호'});const ms=mv(3,['사내완료']);
 check('사내완료 2건: '+ms.map(m=>m.worker+'/'+m.equip+'/'+String(m.work_start||'').slice(11,16)).join(' , '),{ok:()=>ms.length===2&&ms[0].equip==='MCT-02'&&ms[0].work_start&&ms[1].equip==='평면연삭기 1호'&&ms[1].work_end})});
await scenario('S. [J] 입고확정 후 수량 수정 금지',async()=>{
 await O.order(1,'V026',600);await QR(600);check('확정 전 수량저장 '+await O.btn(1,'w_qty'),{ok:()=>true});await O.confirm(1);
 const s=await O.btn(1,'w_qty');check('확정 후 수량저장 버튼 '+s,{ok:()=>s!=='사용가능'})});
await scenario('T1. [1] 분할 출고 — 600 발주(바로출고 끔) → QR 출고 300 → QR 입고 300 → 사무실 출고 300 → QR 입고 300',async()=>{
 await O.order(1,'V026',600,null,{noShip:true});check('발주만 (출고 0, 이동기록 없음)',{'lp.1.out_qty':600,'lp.1.ship_qty':0,ok:()=>mv(1,['반출']).length===0});
 let r=await QR(100);check('출고 전 QR 입고 → '+(r.ok?'저장됨(문제)':'입고 대상 아님'),{ok:()=>!r.ok});
 let s=await QRship(300);check('QR 출고 300 (기본값 '+s.def+')',{ok:()=>s.ok&&s.def==='600','lp.1.ship_qty':300});
 r=await QR(300);check('QR 입고 300 (기본값 '+r.def+')',{ok:()=>r.ok&&r.def==='300','lp.1.in_qty':300});
 await O.ship(1,300);check('사무실 출고 300',{'lp.1.ship_qty':600});r=await QR(300);check('QR 입고 300',{'lp.1.in_qty':600});
 await O.confirm(1);const a=await O.avail(2);check('확정 → 2공정 발주가능 '+a,{ok:()=>a===600})});
await scenario('T2. [1] 입고 한도 = 출고 − 입고 (발주 600, 출고 300 에서 400 입고 시도)',async()=>{
 await O.order(1,'V026',600,null,{noShip:true});await O.ship(1,300);const r=await QR(400);check('QR 400 → '+(r.ok?'저장됨(문제)':'막힘'),{ok:()=>!r.ok,'lp.1.in_qty':'undefined'});
 const e=await officeErr(()=>O.in(1,400));check('사무실 400 → '+(e?'막힘':'저장됨(문제)'),{ok:()=>!!e})});
await scenario('T3. [1] 발주취소 — 미출고분부터 (600 발주, 200 출고 → 취소하면 발주 200)',async()=>{
 await O.order(1,'V026',600,null,{noShip:true});await O.ship(1,200);await O.cancelOrder(1);check('미출고 400 취소 → 발주 200',{'lp.1.out_qty':200,'lp.1.ship_qty':200,'lp.1.status':'반출'});
 await O.cancelOrder(1);check('다시 취소 → 전체 발주취소',{'lp.1.status':'대기',ok:()=>mv(1,['반출']).length===0})});
await scenario('T4. [1] 출고취소 — 200+200 출고, 100 입고 → 마지막 200 취소, 한 번 더는 막힘',async()=>{
 await O.order(1,'V026',600,null,{noShip:true});await O.ship(1,200);await O.ship(1,200);await QR(100);await O.shipCancel(1);
 check('마지막 출고 200 취소',{'lp.1.ship_qty':200,'lp.1.out_qty':600});const e=await officeErr(()=>O.shipCancel(1));check('한 번 더 취소(출고 0 < 입고 100) → '+(e?'막힘':'취소됨(문제)'),{ok:()=>!!e,'lp.1.ship_qty':200})});
await scenario('T5. [1] 추가발주(바로출고 끔) → 다른 업체로 출고 → 업체별 입고',async()=>{
 await O.order(1,'V026',400);await O.addOrderNoShip(1,'V026',200);check('추가발주 200 미출고',{'lp.1.out_qty':600,'lp.1.ship_qty':400});
 await O.ship(1,200,'V001');const r=await QR(200,0,{site:'V001'});check('QR 입고처 '+r.sites.join(' / '),{ok:()=>r.sites.length===2,'lp.1.in_qty':200})});
await scenario('T6. [1] 사내 공정 분할 투입 — 600 중 300 사내투입 후 QR 사내완료, 나머지 투입',async()=>{
 await O.order(1,'V026',600);await QR(600);await O.confirm(1);await O.order(2,'V009',600);await QR(600,0,{seq:2});await O.confirm(2);
 await O.order(3,HOME,600,null,{noShip:true});const s=await QRship(300,{seq:3});check('QR 사내투입 300',{ok:()=>s.ok&&mv(3,['사내투입']).length===1,'lp.3.ship_qty':300});
 await QR(300,0,{seq:3});await QRship(300,{seq:3});await QR(300,0,{seq:3});await O.confirm(3);check('사내 600 완료 → 가공완료',{'lp.3.status':'완료','lot.status':'가공완료'})});
await scenario('U1. [2] 재작업 — 600 입고 중 불량 20(재작업) → 원 협력사 재작업 출고 → 회수 20 중 2 여전히 불량',async()=>{
 await O.order(1,'V026',600);await QR(600,20);await O.confirm(1);let a=await O.avail(2);check('확정 → 2공정 발주가능 '+a,{ok:()=>a===580});
 const e=await officeErr(()=>O.rwOut(1,'V001',20));check('다른 업체로 재작업 → '+(e?'선택지에 없음':'처리됨(문제)'),{ok:()=>!!e});
 await O.rwOut(1,'V026',20);check('재작업 출고 20 → 신성금속',{ok:()=>mv(1,['재작업출고']).length===1&&mv(1,['재작업출고'])[0].to_site==='V026','lp.1.ng_qty':20});
 await O.rwIn(1,'V026',20,2);check('회수 20 (불량 2) → 양품 18 복귀, 확정 해제',{'lp.1.ng_qty':2,'lp.1.in_qty':600,'lp.1.status':'본사입고'});
 await O.confirm(1);a=await O.avail(2);check('재확정 → 2공정 발주가능 '+a,{ok:()=>a===598})});
await scenario('U2. [2] 처리=폐기는 재작업 대상 아님, 재작업·반품만 대기 · 재작업 기록 후 입고취소 막힘',async()=>{
 await O.order(1,'V026',600);await O.in(1,300,10);let d=await win(1);check('불량 10 (처리=폐기) → 재작업 구역 '+(d.getElementById('rw_out')?'있음(문제)':'없음'),{ok:()=>!d.getElementById('rw_out')});
 await QR(300,5);d=await win(1);const sel=d.getElementById('rw_osite');check('QR 불량 5 (처리=재작업) → 대기 '+(sel?sel.textContent.replace(/.*대기 /,''):'없음'),{ok:()=>sel&&/대기 5/.test(sel.textContent)});
 await O.rwOut(1,'V026',5);const e=await officeErr(()=>O.cancelIn(1));check('재작업 후 입고취소 → '+(e?'막힘':'취소됨(문제)'),{ok:()=>!!e})});
await scenario('V1. [3] 협력사 수령확인 — 신성금속에 600 출고, 신성이 590 수령 → 본사에 수령차이 10 → 운송차이 마감',async()=>{
 await O.order(1,'V026',600);let r=await QRrcv('V026',[590]);check('협력사 화면: 소속 '+r.org+' · 보이는 카드 '+r.cards.join(',')+' · 수령대기 '+r.items+'건',{ok:()=>r.org==='신성금속'&&r.cards.join()==='rcvCard'&&r.items===1});
 const rc=DB.lot_move.find(m=>m.move_type==='수령확인');check('수령확인 기록 590 (출고건 연결)',{ok:()=>rc&&rc.move_qty===590&&rc.ref_move===mv(1,['반출'])[0].move_no,'lp.1.in_qty':'undefined'});
 await reload();const td=OF.document.querySelector('td.st[data-lot="'+LOT+'"][data-seq="1"]');check('본사 목록 「'+(td?td.querySelector('small').textContent:'')+'」',{ok:()=>td&&/수령차이 10/.test(td.textContent)});
 r=await QRrcv('V026');check('다시 찍으면 수령할 것 없음',{ok:()=>r.items===0});
 await QR(590);await O.close(1,10,'운송차이');await reload();const td2=OF.document.querySelector('td.st[data-lot="'+LOT+'"][data-seq="1"]');check('590 입고 + 운송차이 10 마감 → 수령차이 표시 해제',{'lp.1.in_qty':600,'lp.1.ng_qty':10,ok:()=>td2&&!/수령차이/.test(td2.textContent)})});
await scenario('V2. [3] 나눠 출고 2건 → 협력사 2건 각각 확인 · 다른 협력사는 안 보임 · 확인된 출고는 취소 못 함',async()=>{
 await O.order(1,'V026',600,null,{noShip:true});await O.ship(1,300);await O.ship(1,300);
 let r=await QRrcv('V001');check('성광정밀 화면 → 수령대기 '+r.items+'건',{ok:()=>r.items===0});
 r=await QRrcv('V026',[300,300]);check('신성금속 2건 확인',{ok:()=>r.items===2&&DB.lot_move.filter(m=>m.move_type==='수령확인').length===2});
 const e=await officeErr(()=>O.shipCancel(1));check('수령확인된 출고 취소 → '+(e?'막힘':'취소됨(문제)'),{ok:()=>!!e,'lp.1.ship_qty':600})});
await scenario('V3. [3] 재작업 출고도 협력사 수령확인 대상',async()=>{
 await O.order(1,'V026',600);await QRrcv('V026',[600]);await QR(600,20);await O.rwOut(1,'V026',20);
 const r=await QRrcv('V026',[20]);check('재작업 20 수령확인',{ok:()=>r.items===1&&DB.lot_move.filter(m=>m.move_type==='수령확인').length===2})});
console.log('\n'+(FAIL?'❌ 실패 '+FAIL+'건':'✅ 전체 통과'));process.exit(FAIL?1:0)})();
