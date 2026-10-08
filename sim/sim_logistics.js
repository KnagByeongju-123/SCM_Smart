/* SCM Smart — 물류 이동 점검 (2026-10-08)
 * 실행: cd sim && npm i jsdom && node sim_logistics.js
 * 1 품번 QR 목록이 실제 출고(ship_qty) 기준으로 미출고·미입고를 보여주는지
 * 2 나눠 출고한 뒤 [발주취소] → 발주 전체 취소 (추가발주분만 취소하지 않음) · 수령확인된 출고가 있으면 막음
 * 3 입고확정·수량수정도 실제 출고를 넘는 입고는 막음
 * 4 출고취소: 화면을 연 뒤 협력사가 수령확인해도 막음 (최신 자료로 확인) */
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
async function qrItem(mode){const dom=new JSDOM(QRIN,{runScripts:'dangerously',url:'https://x.github.io/SCM_Smart/qr_in.html',virtualConsole:vc,beforeParse(w){common(w);w.Html5Qrcode=class{};try{w.localStorage.setItem('scm_qr_worker','현장작업자');w.localStorage.setItem('scm_qr_org','HQ')}catch(e){}}});
 await wait(250);const w=dom.window,d=w.document;d.getElementById('hamb').onclick();d.querySelector('#dNav .mi[data-k="'+mode+'"]').onclick();await wait(150);
 await w.eval('loadItem("IT-1","")');await wait(250);const vis=i=>!d.getElementById(i).classList.contains('hide');
 return {ship:vis('shipCard'),in:vis('inCard'),list:d.getElementById('itemLots').textContent.replace(/\s+/g,' ').slice(0,60)}}
/* ── 시나리오 ── */
(async()=>{
await scenario('L1. 품번 QR — 발주 600(바로출고 끔) · 출고 0 → 출고 모드에 나오고, 입고 모드엔 안 나옴',async()=>{
 await O.order(1,'V026',600,null,{noShip:true});
 let r=await qrItem('ship');check('출고 모드: 출고 카드 '+(r.ship?'보임':'안 보임(문제) 「'+r.list+'」'),{ok:()=>r.ship});
 r=await qrItem('in');check('입고 모드: '+(r.in?'입고 카드 보임(문제)':'입고 대상 없음 「'+r.list+'」'),{ok:()=>!r.in});
 await O.ship(1,200);r=await qrItem('in');check('200 출고 후 입고 모드: 입고 카드 보임',{ok:()=>r.in})});
await scenario('L2. 나눠 출고 300+300 → [발주취소] → 발주 전체 취소',async()=>{
 await O.order(1,'V026',600,null,{noShip:true});await O.ship(1,300);await O.ship(1,300);
 const ok_=mv(1,['반출']).every(m=>m.remark==='분할출고');check('출고 기록에 「분할출고」 표시',{ok:()=>ok_});
 await O.cancelOrder(1);check('발주취소 → 대기 · 출고기록 0',{'lp.1.status':'대기',ok:()=>mv(1,['반출']).length===0})});
await scenario('L3. QR 출고 300+300 → [발주취소] → 발주 전체 취소',async()=>{
 await O.order(1,'V026',600,null,{noShip:true});await QRship(300);await QRship(300);
 await O.cancelOrder(1);check('발주취소 → 대기 · 출고기록 0',{'lp.1.status':'대기',ok:()=>mv(1,['반출']).length===0})});
await scenario('L4. 발주 400 + 추가발주 200 → [발주취소] → 추가발주 200만 취소 (옛 자료 포함)',async()=>{
 await O.order(1,'V026',400);await O.addOrder(1,'V026',200);check('추가발주 기록에 「추가발주」 표시',{ok:()=>mv(1,['반출']).some(m=>m.remark==='추가발주')});
 await O.cancelOrder(1);check('추가발주 200 취소 → 발주 400',{'lp.1.out_qty':400,'lp.1.ship_qty':400,'lp.1.status':'반출',ok:()=>mv(1,['반출']).length===1});
 await O.addOrder(1,'V026',200);DB.lot_move.forEach(m=>{delete m.remark});
 await O.cancelOrder(1);check('표시 없는 옛 자료도 추가발주 200 취소',{'lp.1.out_qty':400,ok:()=>mv(1,['반출']).length===1})});
await scenario('L5. 협력사가 수령확인한 출고 → [발주취소] 막힘',async()=>{
 await O.order(1,'V026',600);await QRrcv('V026',[600]);const e=await officeErr(()=>O.cancelOrder(1));
 check('발주취소 → '+(e?'막힘':'취소됨(문제)'),{ok:()=>!!e,'lp.1.status':'반출',ok2:()=>mv(1,['반출']).length===1});
});
await scenario('L6. 출고 300 · 입고 300 (발주 600) → 입고확정에서 입고 600 으로 고치면 막힘',async()=>{
 await O.order(1,'V026',600,null,{noShip:true});await O.ship(1,300);await QR(300);
 const e=await officeErr(async()=>{const d=await win(1);set(d,'w_iqty',600);await click(d,'w_conf')});
 check('입고확정 600 → '+(e?'막힘':'저장됨(문제)'),{ok:()=>!!e,'lp.1.in_qty':300,'lp.1.status':'본사입고'});
 await O.confirm(1);check('그대로 확정은 됨',{'lp.1.status':'완료','lp.1.in_qty':300})});
await scenario('L7. 출고 200+200 → 화면 열어둔 사이 협력사 수령확인 → [출고취소] 막힘',async()=>{
 await O.order(1,'V026',600,null,{noShip:true});await O.ship(1,200);await O.ship(1,200);
 const d=await win(1);await QRrcv('V026',[200,200]);
 const e=await officeErr(()=>click(d,'w_shipc'));check('출고취소 → '+(e?'막힘':'취소됨(문제)'),{ok:()=>!!e,'lp.1.ship_qty':400})});
console.log('\n'+(FAIL?'❌ 실패 '+FAIL+'건':'✅ 전체 통과'));process.exit(FAIL?1:0)})();
