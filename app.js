
const SHEET_ID='1m14GywxIymZp6p9izJ6QVWaC8fCnjr5F5OdXCKKUcss';
const SHEET_NAME='Sheet1';
const ADMIN_PASSWORD='0702';
const PAGE_SIZE=500;

let roomData=[];
let listPage='all';
let followers=new Set();
let following=new Set();
let checkResults=[];
let checkFilter='all';
let lastDebug=null;

const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const normalize=v=>String(v||'')
  .trim().replace(/^@/,'')
  .replace(/^https?:\/\/(www\.)?instagram\.com\//i,'')
  .replace(/^_u\//i,'')
  .split(/[/?#]/)[0]
  .replace(/\/$/,'')
  .toLowerCase();

function switchPage(page){
  $('listPage').classList.toggle('hidden',page!=='list');
  $('checkPage').classList.toggle('hidden',page!=='check');
  $('tabList').classList.toggle('active',page==='list');
  $('tabCheck').classList.toggle('active',page==='check');
  window.scrollTo(0,0);
}

function loadRoomJsonp(){
  return new Promise((resolve,reject)=>{
    const cb='roomCb_'+Date.now();
    const s=document.createElement('script');
    const timer=setTimeout(()=>{cleanup();reject(new Error('timeout'));},12000);
    function cleanup(){clearTimeout(timer);try{delete window[cb];}catch(e){}s.remove();}
    window[cb]=json=>{cleanup();resolve(json);};
    s.onerror=()=>{cleanup();reject(new Error('load'));};
    s.src='https://docs.google.com/spreadsheets/d/'+SHEET_ID+
      '/gviz/tq?sheet='+encodeURIComponent(SHEET_NAME)+
      '&tqx=responseHandler:'+cb+';out:json&cache='+Date.now();
    document.head.appendChild(s);
  });
}

async function loadRoomList(){
  $('listCount').textContent='불러오는 중...';
  try{
    const json=await loadRoomJsonp();
    const rows=json.table?.rows||[];
    roomData=rows.map(r=>{
      const c=r.c||[];
      return {
        no:Number(String(c[0]?.v??'').replace(/[^0-9]/g,'')),
        nickname:String(c[1]?.v??'').trim(),
        id:normalize(c[2]?.v??'')
      };
    }).filter(x=>x.no&&x.nickname&&x.id).sort((a,b)=>a.no-b.no);
    $('adminRoomCount').textContent=roomData.length.toLocaleString();
    buildPageButtons();
    renderRoomList();
    if(followers.size||following.size) buildCheckResults();
  }catch(e){
    $('listCount').textContent='연동 오류';
    $('roomList').innerHTML='<div class="empty">명단을 불러오지 못했습니다.</div>';
  }
}

function buildPageButtons(){
  const maxNo=roomData.length?Math.max(...roomData.map(x=>x.no)):0;
  const pages=Math.ceil(maxNo/PAGE_SIZE);
  let html='<button class="'+(listPage==='all'?'active':'')+'" data-list-page="all">전체</button>';
  for(let i=0;i<pages;i++){
    const start=i*PAGE_SIZE+1;
    const end=Math.min((i+1)*PAGE_SIZE,maxNo);
    html+='<button class="'+(listPage===i?'active':'')+'" data-list-page="'+i+'">'+start+'~'+end+'</button>';
  }
  $('pageButtons').innerHTML=html;
}

function renderRoomList(){
  const q=$('listSearch').value.toLowerCase().trim();
  const arr=roomData.filter(x=>{
    const hit=(x.no+' '+x.nickname+' '+x.id).toLowerCase().includes(q);
    if(listPage==='all') return hit;
    const start=listPage*PAGE_SIZE+1,end=(listPage+1)*PAGE_SIZE;
    return hit&&x.no>=start&&x.no<=end;
  });
  $('listCount').textContent='검색 결과 '+arr.length.toLocaleString()+'명';
  $('roomList').innerHTML=arr.length?arr.map(x=>
    '<div class="room-row"><div class="main"><div class="name">'+x.no+'. '+esc(x.nickname)+'</div><div class="id">@'+esc(x.id)+'</div></div>'+
    '<a class="insta" target="_blank" rel="noopener" href="https://instagram.com/'+encodeURIComponent(x.id)+'">@'+esc(x.id)+'</a></div>'
  ).join(''):'<div class="empty">표시할 인원이 없습니다.</div>';
}

function extractFromHtml(text){
  const doc=new DOMParser().parseFromString(text,'text/html');
  const ids=new Set();
  doc.querySelectorAll('a').forEach(a=>{
    const href=a.getAttribute('href')||'';
    const txt=(a.textContent||'').trim();
    let id='';
    const m=href.match(/instagram\.com\/(?:_u\/)?([^/?#]+)/i);
    if(m) id=m[1];
    else if(/^[A-Za-z0-9._]+$/.test(txt)) id=txt;
    id=normalize(id);
    if(id&&/^[a-z0-9._]+$/.test(id)&&!['accounts','explore','p','reel'].includes(id)) ids.add(id);
  });
  return ids;
}

function extractFromJson(text){
  const ids=new Set();
  const obj=JSON.parse(text);
  function walk(v){
    if(Array.isArray(v)){v.forEach(walk);return;}
    if(!v||typeof v!=='object') return;
    if(Array.isArray(v.string_list_data)){
      v.string_list_data.forEach(item=>{
        const id=normalize(item.value||item.href||'');
        if(id&&/^[a-z0-9._]+$/.test(id)) ids.add(id);
      });
    }
    if(typeof v.title==='string'){
      const id=normalize(v.title);
      if(id&&/^[a-z0-9._]+$/.test(id)) ids.add(id);
    }
    Object.values(v).forEach(walk);
  }
  walk(obj);
  return ids;
}

async function analyzeZip(){
  const file=$('instagramZip').files[0];
  if(!file){alert('인스타그램 ZIP 파일을 선택해주세요.');return;}
  if(typeof JSZip==='undefined'){alert('ZIP 분석 도구를 불러오지 못했습니다.');return;}

  $('zipProgress').textContent='ZIP 파일 읽는 중...';
  try{
    const zip=await JSZip.loadAsync(file);
    const names=Object.keys(zip.files).filter(n=>!zip.files[n].dir);
    const followersFiles=names.filter(n=>/(^|\/)followers(_\d+)?\.(html|json)$/i.test(n));
    const followingFiles=names.filter(n=>/(^|\/)following\.(html|json)$/i.test(n));

    if(!followersFiles.length||!followingFiles.length){
      throw new Error('ZIP 안에서 followers / following 파일을 찾지 못했습니다.');
    }

    const newFollowers=new Set();
    const newFollowing=new Set();

    let done=0;
    const total=followersFiles.length+followingFiles.length;

    for(const name of followersFiles){
      $('zipProgress').textContent='팔로워 분석 중... '+Math.round(done/total*100)+'%';
      const text=await zip.file(name).async('text');
      const ids=/\.json$/i.test(name)?extractFromJson(text):extractFromHtml(text);
      ids.forEach(id=>newFollowers.add(id));
      done++;
    }

    for(const name of followingFiles){
      $('zipProgress').textContent='팔로잉 분석 중... '+Math.round(done/total*100)+'%';
      const text=await zip.file(name).async('text');
      const ids=/\.json$/i.test(name)?extractFromJson(text):extractFromHtml(text);
      ids.forEach(id=>newFollowing.add(id));
      done++;
    }

    followers=newFollowers;
    following=newFollowing;
    if(!roomData.length) await loadRoomList();
    buildCheckResults();

    lastDebug={
      file:file.name,
      followersFiles,
      followingFiles,
      followers:followers.size,
      following:following.size,
      mutual:checkResults.filter(x=>x.status==='mutual').length,
      onlyMe:checkResults.filter(x=>x.status==='onlyMe').length,
      onlyThem:checkResults.filter(x=>x.status==='onlyThem').length,
      analyzedAt:new Date().toLocaleString()
    };
    localStorage.setItem('yeowooLastDebug',JSON.stringify(lastDebug));
    updateDebug();

    $('zipProgress').textContent='분석 완료 · 팔로워 '+followers.size.toLocaleString()+
      '명 / 팔로잉 '+following.size.toLocaleString()+'명';
    $('checkResults').classList.remove('hidden');

    // Known validation for the uploaded July ZIP structure.
    if(file.name==='맞팔확인7월.zip' &&
       !(followers.size===4578&&following.size===4564)){
      alert('분석 수가 예상값과 다릅니다. 파일 구조를 다시 확인해주세요.');
    }
  }catch(e){
    $('zipProgress').textContent='분석 실패';
    alert(e.message||'ZIP 파일 분석에 실패했습니다.');
  }
}

function buildCheckResults(){
  const roomMap=new Map(roomData.map(x=>[x.id,x]));
  const all=new Set([...followers,...following]);

  checkResults=[...all].map(id=>{
    const isFollower=followers.has(id);
    const isFollowing=following.has(id);
    let status=isFollower&&isFollowing?'mutual':isFollowing?'onlyMe':'onlyThem';
    const room=roomMap.get(id);
    return {id,status,no:room?.no||'',nickname:room?.nickname||'',inRoom:!!room};
  }).sort((a,b)=>(a.no||999999)-(b.no||999999)||a.id.localeCompare(b.id));

  const mutual=checkResults.filter(x=>x.status==='mutual').length;
  const onlyMe=checkResults.filter(x=>x.status==='onlyMe').length;
  const onlyThem=checkResults.filter(x=>x.status==='onlyThem').length;
  const roomMatched=checkResults.filter(x=>x.inRoom).length;

  $('followersCount').textContent=followers.size.toLocaleString();
  $('followingCount').textContent=following.size.toLocaleString();
  $('mutualCount').textContent=mutual.toLocaleString();
  $('onlyMeCount').textContent=onlyMe.toLocaleString();
  $('onlyThemCount').textContent=onlyThem.toLocaleString();
  $('matchedRoomCount').textContent=roomMatched.toLocaleString();
  $('adminMutual').textContent=mutual.toLocaleString();
  $('adminIssue').textContent=(onlyMe+onlyThem).toLocaleString();
  renderCheck();
}

function badge(status){
  const label={mutual:'맞팔',onlyMe:'나만',onlyThem:'상대만'}[status];
  return '<span class="status '+status+'">'+label+'</span>';
}

function renderCheck(){
  const q=$('checkSearch').value.toLowerCase().trim();
  const arr=checkResults.filter(x=>{
    const filterOk=checkFilter==='all'||x.status===checkFilter;
    const searchOk=(x.no+' '+x.nickname+' '+x.id).toLowerCase().includes(q);
    return filterOk&&searchOk;
  });
  $('checkCount').textContent='검색 결과 '+arr.length.toLocaleString()+'명';
  $('checkList').innerHTML=arr.length?arr.map(x=>
    '<div class="check-row"><div class="main"><div class="name">'+
      esc((x.no?x.no+'. ':'')+(x.nickname||x.id))+
      '</div><div class="id">@'+esc(x.id)+'</div></div>'+
      badge(x.status)+
      '<a class="insta-btn" target="_blank" rel="noopener" href="https://instagram.com/'+encodeURIComponent(x.id)+'">인스타</a></div>'
  ).join(''):'<div class="empty">표시할 결과가 없습니다.</div>';
}

function openAdmin(){$('adminModal').classList.remove('hidden');}
function closeAdmin(){$('adminModal').classList.add('hidden');}
function adminLogin(){
  if($('adminPw').value===ADMIN_PASSWORD) $('adminPanel').classList.remove('hidden');
  else alert('비밀번호가 틀렸습니다.');
}

function saveNotice(){
  const v=$('noticeInput').value.trim();
  localStorage.setItem('yeowooNotice',v);
  showNotice();
  alert('공지 저장 완료');
}
function deleteNotice(){
  localStorage.removeItem('yeowooNotice');
  $('noticeInput').value='';
  showNotice();
  alert('공지 삭제 완료');
}
function showNotice(){
  const v=localStorage.getItem('yeowooNotice')||'';
  if(v){
    $('noticeBox').classList.remove('hidden');
    $('noticeBox').textContent='📢 '+v;
    $('noticeInput').value=v;
  }else{
    $('noticeBox').classList.add('hidden');
    $('noticeBox').textContent='';
  }
}

function downloadCsv(status){
  const rows=checkResults.filter(x=>x.status===status);
  if(!rows.length){alert('다운로드할 결과가 없습니다.');return;}
  const labels={mutual:'맞팔',onlyMe:'나만 팔로우',onlyThem:'상대만 팔로우'};
  const matrix=[['번호','닉네임','아이디','상태'],...rows.map(x=>[x.no||'',x.nickname||'','@'+x.id,labels[x.status]])];
  const csv=matrix.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=labels[status]+'.csv';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function updateDebug(){
  if(!lastDebug){
    try{lastDebug=JSON.parse(localStorage.getItem('yeowooLastDebug')||'null');}catch(e){}
  }
  $('debugInfo').textContent=lastDebug?JSON.stringify(lastDebug,null,2):'아직 분석 기록이 없습니다.';
}

document.addEventListener('click',e=>{
  const page=e.target.closest('[data-page]')?.dataset.page;
  if(page) switchPage(page);

  const listBtn=e.target.closest('[data-list-page]');
  if(listBtn){
    listPage=listBtn.dataset.listPage==='all'?'all':Number(listBtn.dataset.listPage);
    buildPageButtons();
    renderRoomList();
  }

  const filterBtn=e.target.closest('[data-filter]');
  if(filterBtn){
    checkFilter=filterBtn.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b=>b.classList.remove('active'));
    filterBtn.classList.add('active');
    renderCheck();
  }

  const csv=e.target.closest('[data-csv]')?.dataset.csv;
  if(csv) downloadCsv(csv);
});

$('tabAdmin').addEventListener('click',openAdmin);
$('bottomAdmin').addEventListener('click',openAdmin);
$('adminClose').addEventListener('click',closeAdmin);
$('adminLogin').addEventListener('click',adminLogin);
$('reloadRoom').addEventListener('click',loadRoomList);
$('adminReload').addEventListener('click',loadRoomList);
$('analyzeZip').addEventListener('click',analyzeZip);
$('listSearch').addEventListener('input',renderRoomList);
$('checkSearch').addEventListener('input',renderCheck);
$('noticeSave').addEventListener('click',saveNotice);
$('noticeDelete').addEventListener('click',deleteNotice);

showNotice();
updateDebug();
loadRoomList();
