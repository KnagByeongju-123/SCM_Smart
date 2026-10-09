/* SCM Smart — 가공이동보드 점검 (2026-10-09)
 * 실행: cd sim && npm i jsdom && node sim_flow_board.js
 * 메뉴 '가공이동보드' = 사내외가공진행 화면을 window.SCREEN_VIEW='flow' 로 연 것.
 * 품번 1줄 × [사내 · 1차~N차] 칸 우클릭 → 이동 팝업(출고·입고·직송·입고확정)이 기존 처리와 같은 결과를 내는지,
 * 기준공정 등록, 마지막 공정 입고확정 = 가공완료, 종료까지 확인한다. */
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
const HOME='KI01';let LOT='';
let DB;
const PK={lot_process:'proc_id',prod_lot:'lot_no',lot_move:'move_no',process_route:'route_id',items:'item_cd',lot_ship:'ship_no',scm_customer:'cust_cd'};
function filt(rows,qs){for(const [k,v] of new URLSearchParams(qs)){if(['select','order','limit','offset','on_conflict'].includes(k))continue;const m=v.match(/^(eq|neq|in|like|is)\.(.*)$/);if(!m)continue;const [,op,val]=m;
  rows=rows.filter(r=>{const x=r[k]==null?null:String(r[k]);if(op==='eq')return x===val;if(op==='neq')return x!==val;if(op==='is')return val==='null'?x==null:true;if(op==='in')return val.replace(/^\(|\)$/g,'').split(',').map(s=>s.replace(/^"|"$/g,'')).includes(x);if(op==='like')return x!=null&&x.startsWith(val.replace(/\*$/,''));return true})}return rows}
async function api(u,o={}){u=String(u);const mth=(o.method||'GET').toUpperCase();const R=(b)=>{const t=JSON.stringify(b);return {ok:true,status:200,headers:{get:()=>null},text:async()=>t,json:async()=>JSON.parse(t)}};
 if(!u.includes('/rest/v1/'))return R([]);const [tb,qs='']=decodeURIComponent(u.split('/rest/v1/')[1]).split('?');const T=DB[tb]||(DB[tb]=[]);const body=o.body?JSON.parse(o.body):null;
 if(mth==='GET'){const sel=new URLSearchParams(qs).get('select'),rows=JSON.parse(JSON.stringify(filt(T,qs)));   /* select= 로 고른 칸만 (실제 DB 처럼) */
  if(!sel||sel==='*'||/[(*]/.test(sel))return R(rows);const cs=sel.split(',');return R(rows.map(r=>Object.fromEntries(cs.filter(c=>c in r).map(c=>[c,r[c]]))))}
 if(mth==='POST'){if(tb.startsWith('rpc'))return R([]);for(const r of [].concat(body)){const ix=PK[tb]?T.findIndex(x=>x[PK[tb]]===r[PK[tb]]):-1;if(ix>=0)T[ix]={...T[ix],...r};else T.push({...r})}return R([].concat(body))}
 if(mth==='PATCH'){const rs=filt(T,qs);rs.forEach(r=>Object.assign(r,body));return R(JSON.parse(JSON.stringify(rs)))}
 if(mth==='DELETE'){const rs=filt(T,qs);rs.forEach(r=>T.splice(T.indexOf(r),1));return R(rs)}}
/* ── 화면 띄우기 ── */
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/getContext|navigation|print|focus/i.test(e.message))console.log('  JSERR',e.message.slice(0,160))});
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
/* ── 가공이동보드 조작 ── */
async function flowOffice(){const dom=new JSDOM(BOARD,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://x.github.io/SCM_Smart/index.html',virtualConsole:vc,beforeParse(w){w.SCREEN_VIEW='flow';
  w.APP_CONFIG={MODE:'supabase',SUPABASE:{url:'https://db.test',key:'k'},NO_LOGIN:true,STORAGE:'sim',USER_NAME:'사무실',PAGES:{},MODULES:[],APP:{}};common(w)}});
 OF=dom.window;await wait(2500)}
const D=()=>OF.document;
async function rc(sel){await reload();const td=D().querySelector(sel);if(!td)throw new Error('칸 없음: '+sel);td.dispatchEvent(new OF.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));await wait(50)}
const cellSel=(cd,k)=>'td.fl-c[data-cd="'+cd+'"][data-k="'+k+'"]:not([data-lot])';
/* 품번 칸 우클릭 → 로트 고르고 → 방향 → 값 → 실행 */
async function move(cd,k,o){await rc(cellSel(cd,k));const d=D();
 if(o.lot){const s=d.getElementById('fl_lot');if(![...s.options].some(x=>x.value===o.lot))throw new Error('로트 목록에 없음: '+o.lot+' ('+[...s.options].map(x=>x.value).join(',')+')');s.value=o.lot;s.onchange();await wait(20)}
 const b=d.querySelector('.fl-dir[data-d="'+o.dir+'"]');if(!b)throw new Error('방향 없음: '+o.dir+' (있는 것: '+[...d.querySelectorAll('.fl-dir')].map(x=>x.dataset.d).join(',')+')');b.onclick();await wait(20);
 for(const [id,v] of Object.entries(o.v||{})){const e=d.getElementById(id);if(!e)throw new Error('입력칸 없음: '+id);if(e.type==='checkbox')e.checked=!!v;else{e.value=v;if(e.onchange)e.onchange()}}
 d.getElementById('fl_go').onclick();await wait(500)}
const dirs=async(cd,k,lot)=>{await rc(cellSel(cd,k));const d=D();if(lot){const s=d.getElementById('fl_lot');s.value=lot;s.onchange();await wait(20)}const r=[...d.querySelectorAll('.fl-dir')].map(x=>x.dataset.d);OF.closeAct();return r};
const cellTxt=(cd,k)=>{const td=D().querySelector(cellSel(cd,k));return td?td.textContent.replace(/\s+/g,' ').trim():''};
/* ── 검사 ── */
const N=v=>Number(v)||0;let FAIL=0,LINES=[];
const P=(lot,s)=>DB.lot_process.find(x=>x.proc_id===lot+'-P'+s),PLOT=lot=>DB.prod_lot.find(x=>x.lot_no===lot);
const MV=(lot,s,t)=>DB.lot_move.filter(m=>m.proc_id===lot+'-P'+s&&t.includes(m.move_type));
function ok(label,cond,detail){if(!cond)FAIL++;LINES.push((cond?'  ✅ ':'  ❌ ')+label+(!cond&&detail?'\n     '+detail:''))}
function inv(label){const bad=[];DB.lot_process.filter(p=>p.status&&p.status!=='대기').forEach(p=>{const lot=p.lot_no,s=p.seq,RC=['본사입고','사내완료','미입고마감','직송입고'];
  const ri=MV(lot,s,RC).reduce((a,m)=>a+N(m.move_qty),0),rn=MV(lot,s,RC).reduce((a,m)=>a+N(m.ng_qty),0),so=MV(lot,s,['반출','사내투입']).reduce((a,m)=>a+N(m.move_qty),0),sh=p.ship_qty==null?N(p.out_qty):N(p.ship_qty);
  if(ri!==N(p.in_qty))bad.push(lot+' '+s+'차 입고 '+N(p.in_qty)+'≠기록 '+ri);if(rn!==N(p.ng_qty))bad.push(lot+' '+s+'차 불량 '+N(p.ng_qty)+'≠기록 '+rn);
  if(so!==sh)bad.push(lot+' '+s+'차 출고 '+sh+'≠기록 '+so);if(sh>N(p.out_qty))bad.push(lot+' 출고>발주');if(N(p.in_qty)>sh)bad.push(lot+' 입고>출고')});
 ok(label+' — 공정 수량 = 이동기록',!bad.length,bad.slice(0,6).join(' / '))}
function seed(){DB={
 items:[{item_cd:'IT-1',item_nm:'시험품1'},{item_cd:'IT-2',item_nm:'시험품2'}],
 process_route:[['R1',1,'밀링','V026','외주',3],['R2',2,'열처리','V009','외주',4],['R3',3,'평면연마',HOME,'사내',1]].map(([route_id,seq,proc_nm,site_cd,inout_type,lead_days])=>({route_id,item_cd:'IT-1',seq,proc_nm,site_cd,inout_type,lead_days,use_yn:true})),
 process_site:[['V026','신성금속','외주','밀링'],['V001','성광정밀','외주','밀링'],['V009','대경진공열처리','외주','열처리'],['V023','미래써모텍','외주','열처리'],[HOME,'경일FB 사내가공','사내','평면연마']].map(([site_cd,site_nm,site_type,proc_type])=>({site_cd,site_nm,site_type,proc_type,use_yn:true})),
 prod_std_type:[['ML','밀링'],['HT','열처리'],['PY','평면연마']].map(([a,b])=>({prod_std_type_cd:a,prod_std_type_ggjr:b})),
 prod_result:[{result_no:'PR-1',work_date:'2026-10-01',item_cd:'IT-1',good_qty:600},{result_no:'PR-2',work_date:'2026-10-02',item_cd:'IT-1',good_qty:300}],
 prod_lot:[],lot_process:[],lot_move:[]}}
async function scenario(name,fn){seed();ASK=[];LINES=[];await flowOffice();console.log('\n■ '+name);
 try{await fn()}catch(e){FAIL++;LINES.push('  ❌ 예외: '+e.message)}LINES.forEach(l=>console.log(l));
 const a=ASK.filter(x=>/^ALERT/.test(x));if(a.length)console.log('   (알림) '+[...new Set(a)].join(' / '))}
const newLot=()=>DB.prod_lot.map(l=>l.lot_no).sort().slice(-1)[0];
/* ── 시나리오 ── */
(async()=>{
await scenario('F1. 화면 — 가공이동보드 제목 · 사내 + 1~5차 + 종료 열 · 품번 2줄 · 미가공 900',async()=>{
 await reload();const th=[...D().querySelectorAll('.fl-tbl th')].map(x=>x.textContent.trim());
 ok('제목 「'+D().querySelector('.screen>.title h1').textContent+'」',D().querySelector('.screen>.title h1').textContent==='가공이동보드');
 ok('열: '+th.join(' | '),/사내/.test(th[1])&&th[2]==='1차 가공'&&th[6]==='5차 가공'&&th[th.length-1]==='종료');
 ok('품번 줄 '+D().querySelectorAll('tr.fl-it').length+'개',D().querySelectorAll('tr.fl-it').length===2);
 ok('IT-1 사내 「'+cellTxt('IT-1',0)+'」',/미가공 900/.test(cellTxt('IT-1',0)));
 D().getElementById('flAdd').onclick();ok('＋ 누르면 6차 열 추가',[...D().querySelectorAll('.fl-tbl th')].some(x=>x.textContent.trim()==='6차 가공'))});
await scenario('F2. 기준공정 등록 — IT-2 (경로 없음) 품번 칸 우클릭 → 밀링·열처리·평면연마(사내) 등록',async()=>{
 await rc('td.fl-l[data-cd="IT-2"]');const d=D();const set1=async(i,nm,site)=>{const s=d.querySelectorAll('.sd_nm')[i];s.value=nm;s.onchange();await wait(10);const t=d.querySelectorAll('.sd_site')[i];t.value=site};
 await set1(0,'밀링','V001');d.getElementById('sd_add').onclick();await set1(1,'열처리','V023');d.getElementById('sd_add').onclick();await set1(2,'평면연마',HOME);
 d.getElementById('sd_save').onclick();await wait(400);
 const rs=DB.process_route.filter(r=>r.item_cd==='IT-2').sort((a,b)=>a.seq-b.seq);
 ok('경로 '+rs.map(r=>r.seq+'.'+r.proc_nm+'/'+r.site_cd+'/'+r.inout_type).join(' '),rs.length===3&&rs[0].site_cd==='V001'&&rs[2].inout_type==='사내'&&rs.every(r=>/^PRO-/.test(r.route_id)));
 await reload();ok('2차 칸에 「열처리」 표시',/열처리/.test(cellTxt('IT-2',2)));
 await rc('td.fl-l[data-cd="IT-2"]');d.querySelectorAll('.sd_del')[2].onclick();await wait(10);d.getElementById('sd_save').onclick();await wait(400);
 ok('3차 빼고 다시 등록 → 2공정',DB.process_route.filter(r=>r.item_cd==='IT-2'&&r.use_yn!==false).length===2)});
await scenario('F3. 사내 → 1차 출고 (미가공 재고에서 신규 투입 400) → 1차 → 사내 입고 400 (불량 10) · 입고확정까지',async()=>{
 await move('IT-1',1,{lot:'NEW',dir:'out',v:{fl_q:400}});const lot=newLot();LOT=lot;
 ok('새 로트 '+lot+' 400 · 1차 반출 400',lot&&N(PLOT(lot).lot_qty)===400&&P(lot,1).status==='반출'&&N(P(lot,1).ship_qty)===400&&MV(lot,1,['반출']).length===1);
 await reload();ok('사내 미가공 500 · 1차 가공중 400 「'+cellTxt('IT-1',1)+'」',/미가공 500/.test(cellTxt('IT-1',0))&&/가공중 400/.test(cellTxt('IT-1',1)));
 await move('IT-1',1,{lot,dir:'in',v:{w_iqty:400,w_ng:10,w_cause:'가공',w_act:'폐기'}});
 ok('1차 완료 · 입고 400 불량 10',P(lot,1).status==='완료'&&N(P(lot,1).in_qty)===400&&N(P(lot,1).ng_qty)===10);
 await reload();ok('사내 대기 390 「'+cellTxt('IT-1',0)+'」',/대기 390/.test(cellTxt('IT-1',0)));inv('F3')});
await scenario('F4. 사내 → 2차 나눠 출고 200 + 190 (두 번째는 추가발주) → 2차 → 사내 부분입고 300 (확정 안 함) → 나머지 90 입고·확정',async()=>{
 await move('IT-1',1,{lot:'NEW',dir:'out',v:{fl_q:400}});const lot=newLot();LOT=lot;await move('IT-1',1,{lot,dir:'in',v:{w_iqty:400,w_ng:10,w_cause:'가공',w_act:'폐기'}});
 await move('IT-1',2,{lot,dir:'out',v:{fl_q:200}});ok('2차 발주·출고 200',N(P(lot,2).out_qty)===200&&N(P(lot,2).ship_qty)===200);
 let e=await officeErr(()=>move('IT-1',2,{lot,dir:'out',v:{fl_q:300}}));ok('190 남았는데 300 출고 → '+(e?'막힘':'저장됨(문제)'),!!e&&N(P(lot,2).out_qty)===200);
 await move('IT-1',2,{lot,dir:'out',v:{fl_q:190}});ok('추가 190 → 발주 390 · 출고 390 · 기록 2건',N(P(lot,2).out_qty)===390&&N(P(lot,2).ship_qty)===390&&MV(lot,2,['반출']).length===2);
 await move('IT-1',2,{lot,dir:'in',v:{w_iqty:300,fl_conf:false}});ok('부분입고 300 → 확정 전',P(lot,2).status==='본사입고'&&N(P(lot,2).in_qty)===300);
 const ds=await dirs('IT-1',2,lot);ok('2차 칸 방향: '+ds.join(','),ds.includes('in')&&ds.includes('conf')&&ds.includes('direct'));
 await move('IT-1',2,{lot,dir:'in',v:{w_iqty:90}});ok('나머지 90 입고·확정 → 입고 390 완료',P(lot,2).status==='완료'&&N(P(lot,2).in_qty)===390);inv('F4')});
await scenario('F5. 마지막 공정(3차 사내) 투입 → 입고확정 = 가공완료 → 진행 줄에서 빠지고 사내 완료로',async()=>{
 await move('IT-1',1,{lot:'NEW',dir:'out',v:{fl_q:300}});const lot=newLot();LOT=lot;
 await move('IT-1',1,{lot,dir:'in',v:{w_iqty:300}});await move('IT-1',2,{lot,dir:'out',v:{fl_q:300}});await move('IT-1',2,{lot,dir:'in',v:{w_iqty:300}});
 await move('IT-1',3,{lot,dir:'out',v:{fl_q:300,fl_site:HOME}});ok('3차 사내투입 300',P(lot,3).status==='반출'&&MV(lot,3,['사내투입']).length===1);
 await move('IT-1',3,{lot,dir:'in',v:{w_iqty:300,w_wk:'홍길동'}});
 ok('3차 완료 → 로트 가공완료',P(lot,3).status==='완료'&&PLOT(lot).status==='가공완료');
 await reload();ok('사내 「'+cellTxt('IT-1',0)+'」 완료 300',/완료 300/.test(cellTxt('IT-1',0)));
 ok('진행 로트 0 (품번 줄 「'+D().querySelector('td.fl-l[data-cd="IT-1"]').textContent.replace(/\s+/g,' ').trim()+'」)',/진행 로트 0/.test(D().querySelector('td.fl-l[data-cd="IT-1"]').textContent));inv('F5')});
await scenario('F6. 1차 → 2차 직송 (본사 거치지 않음) · 품번 [종료] → 로트 종료',async()=>{
 await move('IT-1',1,{lot:'NEW',dir:'out',v:{fl_q:200}});const lot=newLot();LOT=lot;
 await move('IT-1',1,{lot,dir:'direct',v:{w_dsite:'V023',w_dq:200,w_dng:0}});
 ok('1차 직송입고·완료 → 2차 미래써모텍 반출 200',P(lot,1).status==='완료'&&P(lot,2).status==='반출'&&P(lot,2).site_cd==='V023'&&N(P(lot,2).ship_qty)===200);
 await reload();D().querySelector('[data-endi="IT-1"]').click();await wait(50);const b=D().querySelector('#actBody [data-e="'+lot+'"]');ok('종료 목록에 '+lot,!!b);
 if(b){b.onclick();await wait(400)}ok('로트 종료',PLOT(lot).status==='종료');inv('F6')});
console.log('\n'+(FAIL?'❌ 실패 '+FAIL+'건':'✅ 전체 통과'));process.exit(FAIL?1:0)})();
