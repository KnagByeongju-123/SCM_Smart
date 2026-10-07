/* SCM Smart — 협력사 1곳 × 품번 10개 동시 입출고 시뮬레이션
 * 실행: cd sim && npm i jsdom && node sim_vendor_multi.js
 * 신성금속(V026) 한 곳에 품번 10개(IT-01~IT-10)의 가공로트(PL-M01~M10)가 동시에 나가고 들어올 때
 * 로트끼리 수량이 섞이지 않는지, 협력사·본사 QR 목록과 업체별재고현황이 품번·로트를 제대로 구분하는지 확인한다. */
const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
/* ── 화면 소스 ── */
const IDX=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const BOARD=(()=>{const i=IDX.indexOf('window.__SCREENS=')+17;let d=0,k=i,s=false,e=false;for(;k<IDX.length;k++){const c=IDX[k];if(s){if(e)e=false;else if(c==='\\')e=true;else if(c==='"')s=false;continue}if(c==='"')s=true;else if(c==='{')d++;else if(c==='}'){d--;if(!d)break}}
  return JSON.parse(IDX.slice(i,k+1))['machining_progress_board.html'].replace('window.fetch=(u,o)=>parent.fetch(u,o);','')})();
const RTCJ=(()=>{const i=IDX.indexOf('window.__SCREENS=')+17;let d=0,k=i,s=false,e=false;for(;k<IDX.length;k++){const c=IDX[k];if(s){if(e)e=false;else if(c==='\\')e=true;else if(c==='"')s=false;continue}if(c==='"')s=true;else if(c==='{')d++;else if(c==='}'){d--;if(!d)break}}
  return JSON.parse(IDX.slice(i,k+1))['rtcj_status.html'].replace('window.fetch=(u,o)=>parent.fetch(u,o);','')})();
const QRIN=fs.readFileSync(path.join(ROOT,'qr_in.html'),'utf8').replace(/<script src=[^>]+><\/script>/,'');
/* ── 가짜 DB (PostgREST 흉내) ── */
const HOME='KI01';let LOT='PL-M01';
const NI=10,IT=i=>'IT-'+String(i).padStart(2,'0'),PL=i=>'PL-M'+String(i).padStart(2,'0'),QTY=i=>100*i;   /* 로트수량 100~1000, 합 5500 */
let DB;
function seed(){const R=[['밀링','V026','외주',3],['열처리','V009','외주',4],['평면연마',HOME,'사내',1]],is=[...Array(NI)].map((_,k)=>k+1);DB={
 items:is.map(i=>({item_cd:IT(i),item_nm:'시험품'+i})),
 process_route:[].concat(...is.map(i=>R.map(([proc_nm,site_cd,inout_type,lead_days],k)=>({route_id:'R'+i+'-'+(k+1),item_cd:IT(i),seq:k+1,proc_nm,site_cd,inout_type,lead_days,use_yn:true})))),
 process_site:[['V026','신성금속','외주','밀링'],['V001','성광정밀','외주','밀링'],['V009','대경진공열처리','외주','열처리'],['V023','미래써모텍','외주','열처리'],[HOME,'경일FB 사내가공','사내']].map(([site_cd,site_nm,site_type,proc_type])=>({site_cd,site_nm,site_type,proc_type,use_yn:true})),
 prod_std_type:[['ML','밀링'],['HT','열처리'],['PY','평면연마']].map(([a,b])=>({prod_std_type_cd:a,prod_std_type_ggjr:b})),
 prod_lot:is.map(i=>({lot_no:PL(i),result_no:'PR-'+i,item_cd:IT(i),lot_qty:QTY(i),remain_qty:QTY(i),cur_seq:0,cur_site:HOME,status:'대기',travel_print_cnt:1})),
 lot_process:[].concat(...is.map(i=>R.map(([proc_nm,site_cd,inout_type],k)=>({proc_id:PL(i)+'-P'+(k+1),lot_no:PL(i),route_id:'R'+i+'-'+(k+1),seq:k+1,proc_nm,site_cd,inout_type,status:'대기',lead_days:3})))),
 lot_move:[]}}
const PK={lot_process:'proc_id',prod_lot:'lot_no',lot_move:'move_no',process_route:'route_id',items:'item_cd',lot_ship:'ship_no',scm_customer:'cust_cd'};
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

/* 업체별재고현황 화면 */
const VSS=(()=>{const i=IDX.indexOf('window.__SCREENS=')+17;let d=0,k=i,s=false,e=false;for(;k<IDX.length;k++){const c=IDX[k];if(s){if(e)e=false;else if(c==='\\')e=true;else if(c==='"')s=false;continue}if(c==='"')s=true;else if(c==='{')d++;else if(c==='}'){d--;if(!d)break}}
  return JSON.parse(IDX.slice(i,k+1))['vendor_stock_status.html'].replace('window.fetch=(u,o)=>parent.fetch(u,o);','')})();
async function vendorStock(){const dom=new JSDOM(VSS,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://x.github.io/SCM_Smart/index.html',virtualConsole:vc,beforeParse(w){
  w.APP_CONFIG={MODE:'supabase',SUPABASE:{url:'https://db.test',key:'k'},NO_LOGIN:true,STORAGE:'sim',USER_NAME:'사무실',PAGES:{},MODULES:[],APP:{}};common(w)}});await wait(1500);return dom.window.document}
/* ── 검사 ── */
const N=v=>Number(v)||0;let FAIL=0,LINES=[];
const P=(i,s)=>DB.lot_process.find(x=>x.proc_id===PL(i)+'-P'+s),LOTR=i=>DB.prod_lot.find(x=>x.lot_no===PL(i));
const MV=(i,s,types)=>DB.lot_move.filter(m=>m.proc_id===PL(i)+'-P'+s&&types.includes(m.move_type));
function ok(label,cond,detail){if(!cond)FAIL++;LINES.push((cond?'  ✅ ':'  ❌ ')+label+(!cond&&detail?'\n     '+detail:''))}
/* 모든 로트 · 공정: 수량 = 자기 이동기록 합 (다른 로트 기록이 섞이지 않음) */
function inv(label){const bad=[];for(let i=1;i<=NI;i++)for(let s=1;s<=3;s++){const p=P(i,s);if(!p||p.status==='대기')continue;
  const RC=['본사입고','사내완료','미입고마감','직송입고'],ri=MV(i,s,RC).reduce((a,m)=>a+N(m.move_qty),0),rn=MV(i,s,RC).reduce((a,m)=>a+N(m.ng_qty),0)-MV(i,s,['재작업입고']).reduce((a,m)=>a+N(m.move_qty)-N(m.ng_qty),0);
  const so=MV(i,s,['반출','사내투입']).reduce((a,m)=>a+N(m.move_qty),0),sh=p.ship_qty==null?N(p.out_qty):N(p.ship_qty);
  if(ri!==N(p.in_qty))bad.push(PL(i)+' '+s+'공정 입고 '+N(p.in_qty)+'≠기록 '+ri);if(rn!==N(p.ng_qty))bad.push(PL(i)+' '+s+'공정 불량 '+N(p.ng_qty)+'≠기록 '+rn);
  if(so!==sh)bad.push(PL(i)+' '+s+'공정 출고 '+sh+'≠기록 '+so);if(sh>N(p.out_qty))bad.push(PL(i)+' 출고>발주');if(N(p.in_qty)>sh)bad.push(PL(i)+' 입고>출고');
  if(N(p.out_qty)>(s===1?QTY(i):N(P(i,s-1).in_qty)-N(P(i,s-1).ng_qty)))bad.push(PL(i)+' '+s+'공정 발주 '+N(p.out_qty)+' > 앞공정 양품');}
 const wrong=DB.lot_move.filter(m=>!String(m.proc_id||'').startsWith(m.lot_no+'-'));if(wrong.length)bad.push('로트번호·공정 안 맞는 이동기록 '+wrong.length+'건');
 ok(label+' — 로트별 수량 = 자기 이동기록',!bad.length,bad.slice(0,6).join(' / '))}
async function scenario(name,fn){seed();ASK=[];LINES=[];await office();console.log('\n■ '+name);
 try{await fn()}catch(e){FAIL++;LINES.push('  ❌ 예외: '+e.message)}LINES.forEach(l=>console.log(l));
 const a=ASK.filter(x=>!/진행할까요|등록할까요|발행할까요|수령 확인할까요/.test(x));if(a.length)console.log('   (확인창) '+[...new Set(a)].join(' / '))}
const use=i=>{LOT=PL(i)};
const all=async fn=>{for(let i=1;i<=NI;i++){use(i);await fn(i)}};
const orderAll=async()=>all(i=>O.order(1,'V026',QTY(i)));
/* ── 시나리오 ── */
(async()=>{
await scenario('M1. 신성금속에 품번 10개 동시 발주·출고 (100~1000, 합 5,500)',async()=>{
 await orderAll();
 ok('10개 로트 모두 1공정 반출',[...Array(NI)].every((_,k)=>P(k+1,1).status==='반출'&&N(P(k+1,1).out_qty)===QTY(k+1)));
 ok('반출 기록 10건 · 로트마다 1건',DB.lot_move.filter(m=>m.move_type==='반출').length===NI&&[...Array(NI)].every((_,k)=>MV(k+1,1,['반출']).length===1));
 ok('반출 기록 번호 겹침 없음',new Set(DB.lot_move.map(m=>m.move_no)).size===DB.lot_move.length);
 await reload();const rows=OF.document.querySelectorAll('#jobBody tr[data-item]').length;ok('본사 품번 리스트 '+rows+'개',rows===NI);
 OF.document.querySelector('#jobBody tr[data-item="IT-05"]').click();await wait(150);const lots=[...OF.document.querySelectorAll('#routeBody td[data-lotcell]')].map(x=>x.dataset.lotcell);
 ok('IT-05 고르면 PL-M05 만 보임 ('+[...new Set(lots)].join(',')+')',[...new Set(lots)].join()==='PL-M05');
 inv('M1')});

await scenario('M2. 협력사(신성금속) 수령 대기 목록 10건 → 로트별 QR 수령확인 · IT-03만 290 수령(차이 10)',async()=>{
 await orderAll();
 const w=await qrOpen('V026'),d=w.document;d.getElementById('hamb').onclick();d.querySelector('#dNav .mi[data-k="lrcv"]').onclick();await wait(300);
 const rows=[...d.querySelectorAll('#listBody .lrow')],txt=rows.map(r=>r.textContent);
 ok('수령 대기 목록 '+rows.length+'건',rows.length===NI);
 ok('목록에 품번이 보임 (현장은 품번으로 찾음) — 예: 「'+(txt[0]||'').slice(0,40)+'」',txt.length&&txt.every((t,k)=>/IT-\d\d/.test(t)),'로트번호만 있고 품번이 없음');
 const tot=rows.reduce((a,r)=>a+N(r.querySelector('.q').textContent.replace(/,/g,'')),0);ok('목록 수량 합 '+tot.toLocaleString(),tot===5500);
 for(let i=1;i<=NI;i++){use(i);const r=await QRrcv('V026',[i===3?290:QTY(i)]);if(r.items!==1){ok(PL(i)+' 수령대기 '+r.items+'건 (1건이어야)',false);break}}
 const rc=DB.lot_move.filter(m=>m.move_type==='수령확인');ok('수령확인 10건 · 각자 자기 로트 출고건에 연결',rc.length===NI&&rc.every(m=>{const s=DB.lot_move.find(x=>x.move_no===m.ref_move);return s&&s.lot_no===m.lot_no}));
 await reload();OF.document.querySelector('#jobBody tr[data-item="IT-03"]').click();await wait(150);const t3=OF.document.querySelector('td.st[data-lot="PL-M03"][data-seq="1"]');
 OF.document.querySelector('#jobBody tr[data-item="IT-04"]').click();await wait(150);const t4=OF.document.querySelector('td.st[data-lot="PL-M04"][data-seq="1"]');
 ok('수령차이는 PL-M03 에만 (M03 「'+(t3?t3.textContent.replace(/\s+/g,' ').slice(0,30):'')+'」)',t3&&/수령차이 10/.test(t3.textContent)&&t4&&!/수령차이/.test(t4.textContent));
 const w2=await qrOpen('V026'),d2=w2.document;d2.getElementById('hamb').onclick();d2.querySelector('#dNav .mi[data-k="lrcv"]').onclick();await wait(300);
 ok('다 확인하면 수령 대기 0건',d2.querySelectorAll('#listBody .lrow').length===0);
 inv('M2')});

await scenario('M3. 본사 QR 미입고 현황 — 신성금속 묶음 10건 · 5,500 → 섞어서 분할입고',async()=>{
 await orderAll();
 const w=await qrOpen('HQ'),d=w.document;d.getElementById('hamb').onclick();d.querySelector('#dNav .mi[data-k="lin"]').onclick();await wait(300);
 const g=[...d.querySelectorAll('#listBody .lgrp')].map(x=>x.textContent);ok('미입고 묶음: '+g.join(' | '),g.length===1&&/신성금속/.test(g[0])&&/10건/.test(g[0])&&/5,500/.test(g[0]));
 const rows=[...d.querySelectorAll('#listBody .lrow')].map(x=>x.textContent);ok('행마다 로트·품번 같이 표시',rows.length===NI&&rows.every(t=>/PL-M\d\d/.test(t)&&/IT-\d\d/.test(t)));
 /* 순서 섞어 분할입고: 짝수 로트 절반 먼저, 그다음 홀수 전량, 마지막 짝수 나머지 */
 for(const i of [2,4,6,8,10]){use(i);const r=await QR(QTY(i)/2);if(!r.ok)ok(PL(i)+' 절반 입고 실패: '+r.msg,false)}
 for(const i of [9,7,5,3,1]){use(i);const r=await QR(QTY(i));if(!r.ok)ok(PL(i)+' 전량 입고 실패: '+r.msg,false)}
 use(2);let r=await QR(150);ok('PL-M02 미입고 100 인데 150 입고 → '+(r.ok?'들어감(문제)':'막힘'),!r.ok&&N(P(2,1).in_qty)===100);
 use(2);r=await QR(100);ok('PL-M02 기본값(남은 미입고) '+r.def,r.def==='100');
 for(const i of [10,8,6,4]){use(i);await QR(QTY(i)/2)}
 ok('10개 로트 모두 전량 입고',[...Array(NI)].every((_,k)=>N(P(k+1,1).in_qty)===QTY(k+1)));
 const w2=await qrOpen('HQ'),d2=w2.document;d2.getElementById('hamb').onclick();d2.querySelector('#dNav .mi[data-k="lin"]').onclick();await wait(300);
 ok('미입고 현황 비었음',/없습니다/.test(d2.getElementById('listBody').textContent));
 inv('M3')});

await scenario('M4. 업체별재고현황 — 신성금속 카드 품번 10 · 로트 10 · 수량 → 일부 입고 후 줄어듦',async()=>{
 await orderAll();let d=await vendorStock();
 const card=()=>{const c=[...d.querySelectorAll('#cards .vcard')].find(x=>/신성금속/.test(x.textContent));return c?c.textContent.replace(/\s+/g,' '):''};
 let c=card();ok('신성금속 카드 「'+c+'」',/5,500/.test(c)&&/품번 10/.test(c)&&/로트 10/.test(c));
 d.getElementById('q_site').value='V026';d.defaultView.draw();const n=d.querySelectorAll('#tbody tr[data-i]').length;ok('신성금속만 보기 → '+n+'행 (로트별 1행)',n===NI);
 for(const i of [1,5,10]){use(i);await QR(QTY(i))}
 d=await vendorStock();c=card();ok('3개 로트(100+500+1000) 입고 후 「'+c+'」',/3,900/.test(c)&&/품번 7/.test(c)&&/로트 7/.test(c));
 inv('M4')});

await scenario('M5. 10개 확정 → 2공정(대경진공열처리) 발주가능 = 각자 양품 · IT-07만 불량 7',async()=>{
 await orderAll();for(let i=1;i<=NI;i++){use(i);await QR(QTY(i),i===7?7:0)}
 await all(i=>O.confirm(1));ok('10개 1공정 입고확정',[...Array(NI)].every((_,k)=>P(k+1,1).status==='완료'));
 const av=[];for(let i=1;i<=NI;i++){use(i);av.push(await O.avail(2))}
 ok('2공정 발주가능 '+av.join('/'),av.every((a,k)=>a===QTY(k+1)-(k+1===7?7:0)));
 await all(i=>O.order(2,'V009',QTY(i)-(i===7?7:0)));ok('2공정 10개 발주 (IT-07 693)',N(P(7,2).out_qty)===693&&[...Array(NI)].every((_,k)=>P(k+1,2).status==='반출'));
 inv('M5')});

await scenario('M6. 직송 섞기 — IT-01·02·03 은 신성금속→대경진공 직송, 나머지는 본사 입고',async()=>{
 await orderAll();
 for(const i of [1,2,3]){use(i);await O.direct(1,'V009',QTY(i))}
 for(let i=4;i<=NI;i++){use(i);await QR(QTY(i))}
 ok('직송 3개: 1공정 확정 + 2공정 대경진공 반출',[1,2,3].every(i=>P(i,1).status==='완료'&&P(i,2).status==='반출'&&P(i,2).site_cd==='V009'&&N(P(i,2).out_qty)===QTY(i)));
 ok('나머지 7개: 1공정 입고, 2공정 대기',[4,5,6,7,8,9,10].every(i=>P(i,1).status==='본사입고'&&P(i,2).status==='대기'));
 const d=await vendorStock();const cs=[...d.querySelectorAll('#cards .vcard')].map(x=>x.textContent.replace(/\s+/g,' '));
 ok('업체별 카드: '+cs.join(' | '),cs.some(t=>/대경진공/.test(t)&&/600/.test(t)&&/품번 3/.test(t))&&!cs.some(t=>/신성금속/.test(t)));
 inv('M6')});

await scenario('M7. 품번 QR(로트 2개) — IT-04 에 로트 2개가 같은 협력사에 있을 때',async()=>{
 DB.prod_lot.push({lot_no:'PL-M04B',result_no:'PR-4B',item_cd:'IT-04',lot_qty:50,remain_qty:50,cur_seq:0,cur_site:HOME,status:'대기',travel_print_cnt:1});
 [['밀링','V026','외주'],['열처리','V009','외주'],['평면연마',HOME,'사내']].forEach(([proc_nm,site_cd,inout_type],k)=>DB.lot_process.push({proc_id:'PL-M04B-P'+(k+1),lot_no:'PL-M04B',route_id:'R4-'+(k+1),seq:k+1,proc_nm,site_cd,inout_type,status:'대기',lead_days:3}));
 use(4);await O.order(1,'V026',400);LOT='PL-M04B';await O.order(1,'V026',50);
 const mk=async org=>{const dom=new JSDOM(QRIN,{runScripts:'dangerously',url:'https://x.github.io/SCM_Smart/qr_in.html?item=IT-04',virtualConsole:vc,beforeParse(w){common(w);w.Html5Qrcode=class{};try{w.localStorage.setItem('scm_qr_worker','x');w.localStorage.setItem('scm_qr_org',org)}catch(e){}}});await wait(300);return dom.window.document};
 let d=await mk('V026');let L=[...d.querySelectorAll('#itemLots .step')].map(x=>x.dataset.lot);ok('협력사 품번 QR → 로트 고르기 '+L.join(','),L.length===2);
 d=await mk('HQ');L=[...d.querySelectorAll('#itemLots .step')].map(x=>x.dataset.lot);ok('본사 품번 QR → 로트 고르기 '+L.join(','),L.length===2);
 inv('M7')});


await scenario('M8. 재작업 섞기 — IT-05 불량 20 재작업 출고 → 신성금속 보유에 20 보임 → 회수',async()=>{
 await orderAll();for(let i=1;i<=NI;i++){use(i);await QR(QTY(i),i===5?20:0)}
 use(5);await O.rwOut(1,'V026',20);ok('IT-05 재작업 출고 20',MV(5,1,['재작업출고']).reduce((a,m)=>a+N(m.move_qty),0)===20);
 let d=await vendorStock();let c=[...d.querySelectorAll('#cards .vcard')].map(x=>x.textContent.replace(/\s+/g,' ')).find(t=>/신성금속/.test(t))||'';
 ok('업체별재고 신성금속 「'+c+'」 (재작업 20 · 품번 1)',/20 EA/.test(c)&&/품번 1/.test(c),'재작업으로 보낸 수량이 협력사 보유에 안 잡힘');
 const w=await qrOpen('V026'),dd=w.document;dd.getElementById('hamb').onclick();dd.querySelector('#dNav .mi[data-k="lrcv"]').onclick();await wait(300);
 const t=dd.getElementById('listBody').textContent;ok('협력사 수령 대기: 재작업 1건 + 일반 10건',/재작업/.test(t)&&dd.querySelectorAll('#listBody .lrow').length===NI+1);
 use(5);await O.rwIn(1,'V026',20);d=await vendorStock();c=[...d.querySelectorAll('#cards .vcard')].map(x=>x.textContent.replace(/\s+/g,' ')).find(t=>/신성금속/.test(t))||'';
 ok('회수 후 신성금속 보유 없음',!c);inv('M8')});

console.log('\n'+(FAIL?'❌ 실패 '+FAIL+'건':'✅ 전체 통과'));process.exit(FAIL?1:0)})();
