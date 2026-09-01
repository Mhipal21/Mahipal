const $ = (id) => document.getElementById(id);

// Same backend for every device. This URL is intentionally not a secret.
const WORKER_URL = 'https://pv-capture-ai.mahipal-office21.workers.dev';
const DB_NAME = 'pv-capture-db';
const STORE = 'records';
const CONFIG_KEY = 'pv-capture-config-v4';
const RETENTION_DAYS = 30;
const CONDITIONS = ['Good','Fair','Poor','Damaged','Under Repair'];
const NOT_FOUND_REASONS = ['','Missing','Disposed','Transferred','Stolen','Under Maintenance'];

let db;
let pendingPhoto = null;
let editingRef = null;
let aiRequestSeq = 0;
let assetRowsTouched = false;
let activeTeamTab = 'ALL';
let sharedRecords = [];
let sharedTeamMembers = [];
let refreshTimer = null;

function toast(message, ms=2200){
  const el=$('toast'); el.textContent=message; el.classList.remove('hidden');
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.add('hidden'),ms);
}
function pad(n){return String(n).padStart(2,'0')}
function formatDate(d){return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`}
function formatTime(d){return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function validDate(x){const d=new Date(x);return !Number.isNaN(d.getTime())?d:new Date()}
function uniqueId(){return (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2,10)}`)}
function setSyncBadge(state,text){const b=$('syncBadge');b.className=`sync-badge ${state}`;b.textContent=text}
function getPin(){return localStorage.getItem('pv-team-pin')||''}
function apiHeaders(extra={}){const h={'Content-Type':'application/json',...extra};const pin=getPin();if(pin)h['X-Team-Pin']=pin;return h}

async function apiFetch(path,options={}){
  const url=`${WORKER_URL}${path}`;
  const opts={...options,headers:{...(options.body?apiHeaders():{'X-Team-Pin':getPin()}),...(options.headers||{})}};
  let res=await fetch(url,opts);
  if(res.status===401){
    const pin=prompt('Enter the shared PV team PIN');
    if(pin){localStorage.setItem('pv-team-pin',pin);opts.headers={...(options.body?apiHeaders():{'X-Team-Pin':pin}),...(options.headers||{})};res=await fetch(url,opts)}
  }
  return res;
}

function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id',autoIncrement:true})};req.onsuccess=()=>{db=req.result;resolve(db)};req.onerror=()=>reject(req.error)})}
function storeTx(mode='readonly'){return db.transaction(STORE,mode).objectStore(STORE)}
function dbAdd(rec){return new Promise((res,rej)=>{const r=storeTx('readwrite').add(rec);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function dbPut(rec){return new Promise((res,rej)=>{const r=storeTx('readwrite').put(rec);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function dbDelete(id){return new Promise((res,rej)=>{const r=storeTx('readwrite').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function dbClear(){return new Promise((res,rej)=>{const r=storeTx('readwrite').clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function dbAllRaw(){return new Promise((res,rej)=>{const r=storeTx().getAll();r.onsuccess=()=>res(r.result.sort((a,b)=>a.id-b.id));r.onerror=()=>rej(r.error)})}
function dbGet(id){return new Promise((res,rej)=>{const r=storeTx().get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}

function normalizeAsset(a={}){
  return {
    rowId:a.rowId||uniqueId(),
    assetName:String(a.assetName||a.name||'').trim(),
    quantity:Math.max(1,Number(a.quantity||1)),
    serialNumber:String(a.serialNumber||'').trim(),
    barcode:String(a.barcode||'').trim(),
    condition:CONDITIONS.includes(a.condition)?a.condition:'Good',
    notFoundReason:NOT_FOUND_REASONS.includes(a.notFoundReason)?a.notFoundReason:''
  };
}
function normalizeRecord(r={}){
  const assets = Array.isArray(r.assets) && r.assets.length
    ? r.assets.map(normalizeAsset)
    : [normalizeAsset({assetName:r.assetName,quantity:r.quantity,serialNumber:r.serialNumber,condition:r.condition,notFoundReason:r.notFoundReason})];
  return {
    ...r,
    room:String(r.room||'').trim(),
    subLocation:String(r.subLocation||r.sub_location||'').trim(),
    clickedBy:String(r.clickedBy||r.clicked_by||'').trim(),
    remarks:String(r.remarks||'').trim(),
    city:String(r.city||''),area:String(r.area||''),building:String(r.building||''),floor:String(r.floor||''),
    assets,
    capturedAt:r.capturedAt||r.captured_at||new Date().toISOString(),
    createdAt:r.createdAt||r.created_at||new Date().toISOString(),
    source:r.source||'camera',
    remoteId:r.remoteId||r.remote_id||r.id||'',
    clientId:r.clientId||r.client_id||'',
    photoUrl:r.photoUrl||r.photo_url||'',
    appVersion:4
  };
}

function getConfig(){
  try{
    const current=JSON.parse(localStorage.getItem(CONFIG_KEY));
    if(current) return current;
    const old3=JSON.parse(localStorage.getItem('pv-capture-config-v3'))||{};
    const migrated={
      city:old3.city||'',area:old3.area||'',building:old3.building||'',floor:old3.floor||'',room:old3.room||'',
      aiEnabled:old3.aiEnabled!==false
    };
    localStorage.setItem(CONFIG_KEY,JSON.stringify(migrated));
    return migrated;
  }catch{return {aiEnabled:true}}
}
function setConfig(patch){const c={...getConfig(),...patch};localStorage.setItem(CONFIG_KEY,JSON.stringify(c));return c}
function hydrateConfig(){
  const c=getConfig();
  ['city','area','building','floor'].forEach(k=>$(k).value=c[k]||'');
  $('roomFixed').value=c.room||'';
  $('aiEnabled').checked=c.aiEnabled!==false;
  $('workerDisplay').textContent=WORKER_URL.replace(/^https?:\/\//,'');
  refreshMembers();
}
function persistFixed(){setConfig({city:$('city').value.trim(),area:$('area').value.trim(),building:$('building').value.trim(),floor:$('floor').value.trim(),room:$('roomFixed').value.trim()})}
function members(){return sharedTeamMembers.map(x=>(x||'').trim()).filter(Boolean)}
function refreshMembers(){
  const m=members();
  [$('clickedBy'),$('editClickedBy')].forEach(sel=>{
    const current=sel.value;
    sel.innerHTML='<option value="">Select team member</option>'+m.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    if(m.includes(current)) sel.value=current;
  });
  $('member1').value=m[0]||'';$('member2').value=m[1]||'';$('member3').value=m[2]||'';
}

async function loadSharedConfig(){
  try{
    const res=await apiFetch('/config');
    if(!res.ok) throw new Error(`Config ${res.status}`);
    const data=await res.json();
    sharedTeamMembers=Array.isArray(data.teamMembers)?data.teamMembers.slice(0,3):[];
    refreshMembers();
    return true;
  }catch(err){console.error(err);return false}
}
async function saveSharedConfig(teamMembers){
  const res=await apiFetch('/config',{method:'PUT',body:JSON.stringify({teamMembers})});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||`Config save ${res.status}`);
  sharedTeamMembers=data.teamMembers||teamMembers;
  refreshMembers();
}

async function fileToJpegDataUrl(file){
  const src=URL.createObjectURL(file);
  try{
    const img=new Image(); await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=src});
    const max=1440, scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
    const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    canvas.getContext('2d').drawImage(img,0,0,w,h);
    return canvas.toDataURL('image/jpeg',0.74);
  } finally { URL.revokeObjectURL(src); }
}
async function shrinkDataUrlForAi(dataUrl){
  const img=new Image(); await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=dataUrl});
  const max=1024, scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  canvas.getContext('2d').drawImage(img,0,0,w,h);
  return canvas.toDataURL('image/jpeg',0.68);
}
async function sourceToDataUrl(src){
  if(!src) throw new Error('Photo missing');
  if(src.startsWith('data:image/')) return src;
  const res=await apiFetch(src.replace(WORKER_URL,''),{method:'GET'});
  if(!res.ok) throw new Error('Photo download failed');
  const blob=await res.blob();
  return await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(blob)});
}

function fixedLocationValid(){
  persistFixed(); const c=getConfig();
  if(!c.city||!c.area||!c.building||!c.floor||!c.room){toast('Fill City, Area, Building, Floor and Room first.');return false}
  return true;
}
function locationSnapshotHtml(){
  const c=getConfig();
  return `<strong>${escapeHtml(c.city)}</strong><span>${escapeHtml(c.area)}</span><span>${escapeHtml(c.building)}</span><span>Floor ${escapeHtml(c.floor)}</span><span>Room ${escapeHtml(c.room)}</span>`;
}
function conditionOptions(selected='Good'){return CONDITIONS.map(v=>`<option value="${escapeHtml(v)}" ${v===selected?'selected':''}>${escapeHtml(v)}</option>`).join('')}
function notFoundOptions(selected=''){return NOT_FOUND_REASONS.map(v=>`<option value="${escapeHtml(v)}" ${v===selected?'selected':''}>${v?escapeHtml(v):'Not applicable'}</option>`).join('')}

function assetRowHtml(asset=normalizeAsset(), edit=false){
  const prefix=edit?'edit-asset-row':'asset-row';
  return `<div class="asset-row" data-row-id="${escapeHtml(asset.rowId)}">
    <div class="asset-row-top"><span class="asset-row-label">Asset</span><button type="button" class="row-remove" data-remove-${prefix} aria-label="Remove asset">✕</button></div>
    <div class="grid two compact-grid">
      <label class="full-grid">Name of Asset *<input data-field="assetName" autocomplete="off" value="${escapeHtml(asset.assetName)}" placeholder="e.g. Office Chair" /></label>
      <label>Quantity *<input data-field="quantity" type="number" min="1" step="1" inputmode="numeric" value="${asset.quantity}" /></label>
      <label>Serial Number<input data-field="serialNumber" autocomplete="off" value="${escapeHtml(asset.serialNumber)}" placeholder="Optional" /></label>
      <label>Barcode / Asset Tag<input data-field="barcode" autocomplete="off" value="${escapeHtml(asset.barcode||'')}" placeholder="Optional" /></label>
      <label>Condition<select data-field="condition">${conditionOptions(asset.condition)}</select></label>
      <label>Not Found Reason<select data-field="notFoundReason">${notFoundOptions(asset.notFoundReason)}</select></label>
    </div>
  </div>`;
}
function attachAssetRowEvents(container, edit=false){
  container.querySelectorAll('[data-field]').forEach(el=>{
    el.addEventListener('input',()=>{if(!edit) assetRowsTouched=true});
    el.addEventListener('change',()=>{if(!edit) assetRowsTouched=true});
  });
  container.querySelectorAll(edit?'[data-remove-edit-asset-row]':'[data-remove-asset-row]').forEach(btn=>{
    btn.onclick=()=>{const rows=container.querySelectorAll('.asset-row');if(rows.length<=1){toast('Keep at least one asset row.');return}btn.closest('.asset-row').remove();if(!edit)assetRowsTouched=true};
  });
}
function renderAssetRows(assets, edit=false){const container=$(edit?'editAssetRows':'assetRows');const list=(assets&&assets.length?assets:[normalizeAsset()]).map(normalizeAsset);container.innerHTML=list.map(a=>assetRowHtml(a,edit)).join('');attachAssetRowEvents(container,edit)}
function collectAssetRows(edit=false){
  const container=$(edit?'editAssetRows':'assetRows');
  return [...container.querySelectorAll('.asset-row')].map(row=>normalizeAsset({
    rowId:row.dataset.rowId,assetName:row.querySelector('[data-field="assetName"]').value,quantity:row.querySelector('[data-field="quantity"]').value,
    serialNumber:row.querySelector('[data-field="serialNumber"]').value,barcode:row.querySelector('[data-field="barcode"]').value,
    condition:row.querySelector('[data-field="condition"]').value,notFoundReason:row.querySelector('[data-field="notFoundReason"]').value
  }));
}
function assetRowsValid(assets){return assets.length>0 && assets.every(a=>a.assetName && Number(a.quantity)>=1)}

function setAiUi(state,message=''){
  const badge=$('aiAssetBadge'),retry=$('retryAiBtn'),status=$('aiStatus');
  badge.classList.toggle('hidden',state!=='done'); retry.classList.toggle('hidden',!['error','done'].includes(state));
  status.className='field-note'+(state==='loading'?' loading':state==='done'?' success':state==='error'?' error':''); status.textContent=message;
}
async function identifyAssets(){
  if(!pendingPhoto) return;
  const c=getConfig();
  if(c.aiEnabled===false){setAiUi('idle','AI is off. Add asset rows manually.');return}
  const requestId=++aiRequestSeq; setAiUi('loading','AI is detecting visible assets and quantities… You can fill the other fields meanwhile.'); $('retryAiBtn').disabled=true;
  try{
    const image=await shrinkDataUrlForAi(pendingPhoto.dataUrl);
    const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),30000);
    const response=await apiFetch('/ai',{method:'POST',body:JSON.stringify({image,mode:'multi_asset'}),signal:controller.signal}); clearTimeout(timeout);
    const data=await response.json().catch(()=>({})); if(!response.ok) throw new Error(data.error||`AI server error ${response.status}`);
    if(requestId!==aiRequestSeq || !pendingPhoto) return;
    const suggestions=Array.isArray(data.assets)?data.assets.map(a=>normalizeAsset({assetName:a.name||a.asset_name,quantity:a.quantity||1,condition:'Good'})).filter(a=>a.assetName):[];
    if(!suggestions.length) throw new Error('No clear assets returned');
    const current=collectAssetRows(false); const namesBlank=current.every(a=>!a.assetName);
    if(!assetRowsTouched || namesBlank){renderAssetRows(suggestions,false);assetRowsTouched=false;setAiUi('done',`AI detected ${suggestions.length} asset type${suggestions.length===1?'':'s'}. Verify names and quantities before saving.`)}
    else setAiUi('done',`AI detected ${suggestions.length} asset type${suggestions.length===1?'':'s'}, but your manual edits were kept. Tap Retry AI if you want to replace them.`);
  }catch(err){
    if(requestId!==aiRequestSeq) return; console.error(err);
    const msg=err?.name==='AbortError'?'AI timed out. Add assets manually or tap Retry AI.':'AI could not reliably detect assets. Add them manually or tap Retry AI.'; setAiUi('error',msg);
  }finally{$('retryAiBtn').disabled=false}
}

async function handlePhotoFile(file,source){
  if(!file) return; toast('Preparing photo…');
  try{
    const dataUrl=await fileToJpegDataUrl(file); const d=(file.lastModified && file.lastModified>0)?new Date(file.lastModified):new Date();
    pendingPhoto={dataUrl,capturedAt:d.toISOString(),originalName:file.name||'asset-photo.jpg',source};
    $('preview').src=dataUrl;$('capturedDate').textContent=formatDate(d);$('capturedTime').textContent=formatTime(d);$('locationSnapshot').innerHTML=locationSnapshotHtml();
    $('subLocation').value='';$('clickedBy').value='';$('remarks').value=''; assetRowsTouched=false;renderAssetRows([normalizeAsset()],false);setAiUi('idle','');
    $('detailModal').classList.remove('hidden');setTimeout(()=>$('subLocation').focus(),250);identifyAssets();
  }catch(err){console.error(err);toast('Could not prepare this photo.',4000)}
}
function ensureTeamConfigured(){if(members().length!==3){$('settingsModal').classList.remove('hidden');toast('Set the 3-member team first.');return false}return true}

$('takePhotoBtn').addEventListener('click',()=>{if(!fixedLocationValid()||!ensureTeamConfigured())return;$('cameraInput').click()});
$('uploadPhotoBtn').addEventListener('click',()=>{if(!fixedLocationValid()||!ensureTeamConfigured())return;$('galleryInput').click()});
$('cameraInput').addEventListener('change',async(e)=>{const file=e.target.files?.[0];await handlePhotoFile(file,'camera');e.target.value=''});
$('galleryInput').addEventListener('change',async(e)=>{const file=e.target.files?.[0];await handlePhotoFile(file,'gallery');e.target.value=''});
$('retryAiBtn').addEventListener('click',()=>{assetRowsTouched=false;renderAssetRows([normalizeAsset()],false);identifyAssets()});
$('addAssetRowBtn').addEventListener('click',()=>{const container=$('assetRows');container.insertAdjacentHTML('beforeend',assetRowHtml(normalizeAsset(),false));attachAssetRowEvents(container,false);assetRowsTouched=true});
$('discardBtn').addEventListener('click',()=>{pendingPhoto=null;aiRequestSeq++;$('detailModal').classList.add('hidden')});

async function uploadPending(local){
  const payload=normalizeRecord(local);
  const res=await apiFetch('/records',{method:'POST',body:JSON.stringify({
    clientId:payload.clientId||uniqueId(),photo:local.photo,photoName:local.photoName||'asset-photo.jpg',capturedAt:payload.capturedAt,source:payload.source,
    city:payload.city,area:payload.area,building:payload.building,floor:payload.floor,room:payload.room,subLocation:payload.subLocation,
    clickedBy:payload.clickedBy,remarks:payload.remarks,assets:payload.assets,createdAt:payload.createdAt
  })});
  const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.error||`Upload ${res.status}`); return data.record;
}
async function syncPendingRecords(showToast=false){
  const locals=(await dbAllRaw()).filter(r=>r.photo && !r.remoteId);
  if(!locals.length) return 0;
  setSyncBadge('syncing','Syncing…'); let done=0;
  for(const r of locals){
    try{
      if(!r.clientId){r.clientId=uniqueId();await dbPut(r)}
      await uploadPending(r); await dbDelete(r.id); done++;
    }catch(err){console.error('Sync failed',err);break}
  }
  if(done && showToast) toast(`${done} saved photo${done===1?'':'s'} synced to team cloud.`);
  return done;
}

$('saveRecordBtn').addEventListener('click',async()=>{
  const subLocation=$('subLocation').value.trim(),clickedBy=$('clickedBy').value,remarks=$('remarks').value.trim(); const assets=collectAssetRows(false);
  if(!subLocation||!clickedBy||!assetRowsValid(assets)){toast('Complete Sub-location, Clicked By, and every Asset Name / Quantity.');return}
  if(!pendingPhoto){toast('Photo is missing.');return}
  persistFixed(); const c=getConfig();
  const localId=await dbAdd({
    clientId:uniqueId(),photo:pendingPhoto.dataUrl,photoName:pendingPhoto.originalName,capturedAt:pendingPhoto.capturedAt,source:pendingPhoto.source,
    city:c.city,area:c.area,building:c.building,floor:c.floor,room:c.room,subLocation,clickedBy,remarks,assets,appVersion:4,createdAt:new Date().toISOString()
  });
  pendingPhoto=null;aiRequestSeq++;$('detailModal').classList.add('hidden');activeTeamTab=clickedBy;
  await renderRecords();toast('Photo saved. Syncing to team cloud…');
  try{await syncPendingRecords();await refreshSharedRecords();toast('Photo saved to shared team cloud.')}catch(err){console.error(err);setSyncBadge('offline','Saved locally');toast('Saved on this device. It will sync automatically when internet returns.',4200)}
});

function filteredRows(rows){return activeTeamTab==='ALL'?rows:rows.filter(r=>r.clickedBy===activeTeamTab)}
function renderTabs(rows){
  const people=members(); if(activeTeamTab!=='ALL' && !people.includes(activeTeamTab)) activeTeamTab='ALL';
  const tabs=[{key:'ALL',label:'All',count:rows.length},...people.map(p=>({key:p,label:p,count:rows.filter(r=>r.clickedBy===p).length}))];
  $('teamTabs').innerHTML=tabs.map(t=>`<button class="tab ${activeTeamTab===t.key?'active':''}" data-team-tab="${escapeHtml(t.key)}"><span>${escapeHtml(t.label)}</span><b>${t.count}</b></button>`).join('');
  document.querySelectorAll('[data-team-tab]').forEach(btn=>btn.onclick=async()=>{activeTeamTab=btn.dataset.teamTab;await renderRecords()});
}
function assetSummary(r){const parts=r.assets.slice(0,4).map(a=>`${escapeHtml(a.assetName)} × ${a.quantity}`);if(r.assets.length>4)parts.push(`+${r.assets.length-4} more`);return parts.join(' · ')}

async function getPendingRecords(){
  return (await dbAllRaw()).filter(r=>r.photo && !r.remoteId).map(r=>({...normalizeRecord(r),_kind:'local',_localId:r.id,photoSrc:r.photo}));
}
function remoteToUi(r){const n=normalizeRecord(r);return {...n,_kind:'remote',_remoteId:r.id||n.remoteId,photoSrc:n.photoUrl||`${WORKER_URL}/photo/${r.id}`}}
async function combinedRecords(){const pending=await getPendingRecords();const remote=sharedRecords.map(remoteToUi);return [...remote,...pending].sort((a,b)=>validDate(a.capturedAt)-validDate(b.capturedAt))}

async function refreshSharedRecords(){
  try{
    setSyncBadge('syncing','Syncing…');
    const res=await apiFetch('/records'); const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.error||`Records ${res.status}`);
    sharedRecords=Array.isArray(data.records)?data.records:[]; setSyncBadge('online','Cloud synced'); await renderRecords(); return true;
  }catch(err){console.error(err);setSyncBadge('offline','Offline');await renderRecords();return false}
}
async function renderRecords(){
  const rows=await combinedRecords(); renderTabs(rows); const shown=filteredRows(rows); $('recordCount').textContent=rows.length;
  $('emptyState').style.display=shown.length?'none':'block'; $('emptyState').textContent=rows.length?`No saved photos under ${activeTeamTab==='ALL'?'this tab':activeTeamTab}.`:'No asset photos captured yet.';
  $('exportBtn').textContent=activeTeamTab==='ALL'?'Export Excel':`Export ${activeTeamTab}`;
  $('recordList').innerHTML=shown.slice().reverse().map(r=>{
    const d=validDate(r.capturedAt); const pending=r._kind==='local';
    return `<article class="record"><img src="${escapeHtml(r.photoSrc)}" alt="Verification photo"><div><h3>${assetSummary(r)}</h3><p>${escapeHtml(r.building)} · Floor ${escapeHtml(r.floor)} · Room ${escapeHtml(r.room)}</p><p>${escapeHtml(r.subLocation)} · ${formatDate(d)} ${formatTime(d)}</p><p>By ${escapeHtml(r.clickedBy)}${r.remarks?` · ${escapeHtml(r.remarks)}`:''}</p>${pending?'<span class="sync-pending">Pending cloud sync</span>':''}</div><div class="record-actions"><button class="mini-btn" data-edit-kind="${r._kind}" data-edit-id="${pending?r._localId:r._remoteId}">Edit</button><button class="mini-btn danger" data-delete-kind="${r._kind}" data-delete-id="${pending?r._localId:r._remoteId}">Delete</button></div></article>`;
  }).join('');
  document.querySelectorAll('[data-delete-kind]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Delete this verification photo for the whole team?')) return;
    if(b.dataset.deleteKind==='local') await dbDelete(Number(b.dataset.deleteId));
    else {const res=await apiFetch(`/records/${encodeURIComponent(b.dataset.deleteId)}`,{method:'DELETE'});if(!res.ok){toast('Could not delete shared photo.');return}sharedRecords=sharedRecords.filter(r=>String(r.id)!==String(b.dataset.deleteId))}
    await renderRecords();toast('Deleted');
  });
  document.querySelectorAll('[data-edit-kind]').forEach(b=>b.onclick=()=>openEdit(b.dataset.editKind,b.dataset.editId));
}

async function openEdit(kind,id){
  let r;
  if(kind==='local'){const raw=await dbGet(Number(id));if(!raw)return;r=normalizeRecord(raw);editingRef={kind,id:Number(id)}}
  else {const raw=sharedRecords.find(x=>String(x.id)===String(id));if(!raw)return;r=normalizeRecord(raw);editingRef={kind,id:String(id)}}
  $('editPreview').src=kind==='local'?(r.photo||''):(r.photoUrl||`${WORKER_URL}/photo/${id}`); $('editRoom').value=r.room;$('editSubLocation').value=r.subLocation;$('editRemarks').value=r.remarks||'';
  refreshMembers();$('editClickedBy').value=r.clickedBy;renderAssetRows(r.assets,true);$('editModal').classList.remove('hidden');
}
$('editAddAssetRowBtn').onclick=()=>{const c=$('editAssetRows');c.insertAdjacentHTML('beforeend',assetRowHtml(normalizeAsset(),true));attachAssetRowEvents(c,true)};
$('closeEditBtn').onclick=()=>{$('editModal').classList.add('hidden');editingRef=null};
$('saveEditBtn').onclick=async()=>{
  if(!editingRef)return;
  const room=$('editRoom').value.trim(),sub=$('editSubLocation').value.trim(),who=$('editClickedBy').value,remarks=$('editRemarks').value.trim(),assets=collectAssetRows(true);
  if(!room||!sub||!who||!assetRowsValid(assets)){toast('Complete Room, Sub-location, Clicked By, and every Asset Name / Quantity.');return}
  if(editingRef.kind==='local'){
    const raw=await dbGet(editingRef.id);if(!raw)return;Object.assign(raw,{room,subLocation:sub,clickedBy:who,remarks,assets});await dbPut(raw);
  }else{
    const res=await apiFetch(`/records/${encodeURIComponent(editingRef.id)}`,{method:'PUT',body:JSON.stringify({room,subLocation:sub,clickedBy:who,remarks,assets})});
    const data=await res.json().catch(()=>({}));if(!res.ok){toast(data.error||'Could not save changes.');return}
  }
  $('editModal').classList.add('hidden');editingRef=null;await refreshSharedRecords();toast('Changes saved');
};

$('settingsBtn').onclick=()=>{$('settingsModal').classList.remove('hidden')};
$('closeSettingsBtn').onclick=()=>{$('settingsModal').classList.add('hidden')};
$('saveSettingsBtn').onclick=async()=>{
  const vals=[$('member1').value.trim(),$('member2').value.trim(),$('member3').value.trim()];
  if(vals.some(v=>!v)){toast('Enter all 3 team-member names.');return}
  if(new Set(vals.map(v=>v.toLowerCase())).size!==3){toast('Use three different team-member names.');return}
  $('saveSettingsBtn').disabled=true;
  try{
    await saveSharedConfig(vals); setConfig({aiEnabled:$('aiEnabled').checked}); $('settingsModal').classList.add('hidden'); await renderRecords();toast('Shared team settings saved.');
  }catch(err){console.error(err);toast('Could not save shared team settings. Check cloud setup.',4200)}
  finally{$('saveSettingsBtn').disabled=false}
};
['city','area','building','floor','roomFixed'].forEach(k=>$(k).addEventListener('change',persistFixed));

$('clearAllBtn').onclick=async()=>{
  const rows=await combinedRecords();if(!rows.length)return;
  if(!confirm('Delete ALL shared verification photos for every team member? This cannot be undone.'))return;
  try{const res=await apiFetch('/records',{method:'DELETE'});if(!res.ok)throw new Error('Delete failed');await dbClear();sharedRecords=[];activeTeamTab='ALL';await renderRecords();toast('All shared records cleared')}
  catch(err){console.error(err);toast('Could not clear shared records.',4000)}
};

async function cleanupLocalExpired(){
  const rows=await dbAllRaw();const cutoff=Date.now()-RETENTION_DAYS*86400000;
  for(const r of rows){const t=validDate(r.createdAt||r.capturedAt).getTime();if(t<cutoff)await dbDelete(r.id)}
}
async function requestPersistentStorage(){try{if(navigator.storage?.persist)await navigator.storage.persist()}catch{}}

async function exportExcel(){
  const rows=filteredRows(await combinedRecords());
  if(!rows.length){toast('No saved photos in this tab to export.');return}
  if(typeof ExcelJS==='undefined'){toast('Excel library not loaded. Connect to internet and reopen the app.',4000);return}
  $('exportBtn').disabled=true;$('exportBtn').textContent='Preparing…';
  try{
    const wb=new ExcelJS.Workbook();wb.creator='PV Capture';wb.created=new Date();const title=activeTeamTab==='ALL'?'Physical Verification':activeTeamTab.slice(0,28);const ws=wb.addWorksheet(title,{views:[{state:'frozen',ySplit:1}]});
    ws.columns=[
      {header:'Sr No',key:'sr',width:8},{header:'Photo',key:'photo',width:20},{header:'City',key:'city',width:18},{header:'Area',key:'area',width:20},{header:'Building',key:'building',width:24},{header:'Floor Number',key:'floor',width:14},{header:'Room Number',key:'room',width:16},{header:'Sub-location',key:'sub',width:24},{header:'Name of Asset',key:'asset',width:28},{header:'Quantity',key:'qty',width:10},{header:'Serial Number',key:'serial',width:18},{header:'Barcode / Asset Tag',key:'barcode',width:18},{header:'Condition',key:'condition',width:16},{header:'Not Found Reason',key:'notFound',width:20},{header:'Remarks',key:'remarks',width:28},{header:'Clicked By',key:'who',width:20},{header:'Date',key:'date',width:13},{header:'Time',key:'time',width:12}
    ];
    const header=ws.getRow(1);header.height=24;header.font={bold:true,color:{argb:'FFFFFFFF'}};header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0F172A'}};header.alignment={vertical:'middle',horizontal:'center'};
    let sr=1;
    for(const r of rows){
      const d=validDate(r.capturedAt),assets=r.assets.length?r.assets:[normalizeAsset()];const firstRowNo=ws.rowCount+1;
      assets.forEach((a,assetIdx)=>{const row=ws.addRow({sr:sr++,city:r.city,area:r.area,building:r.building,floor:r.floor,room:r.room,sub:r.subLocation,asset:a.assetName,qty:a.quantity,serial:a.serialNumber||'',barcode:a.barcode||'',condition:a.condition||'',notFound:a.notFoundReason||'',remarks:r.remarks||'',who:r.clickedBy,date:formatDate(d),time:formatTime(d)});row.height=assets.length===1?78:Math.max(34,Math.ceil(92/assets.length));row.alignment={vertical:'middle',wrapText:true};if(assetIdx>0)row.getCell('B').value=''});
      const lastRowNo=ws.rowCount;if(lastRowNo>firstRowNo)ws.mergeCells(`B${firstRowNo}:B${lastRowNo}`);
      const dataUrl=await sourceToDataUrl(r.photoSrc);const imageId=wb.addImage({base64:dataUrl,extension:'jpeg'});ws.addImage(imageId,{tl:{col:1.08,row:firstRowNo-0.92},ext:{width:118,height:88}});
    }
    ws.autoFilter={from:'A1',to:'R1'};ws.eachRow(row=>row.eachCell(cell=>{cell.border={top:{style:'thin',color:{argb:'FFE2E8F0'}},left:{style:'thin',color:{argb:'FFE2E8F0'}},bottom:{style:'thin',color:{argb:'FFE2E8F0'}},right:{style:'thin',color:{argb:'FFE2E8F0'}}}}));
    const buffer=await wb.xlsx.writeBuffer();const suffix=activeTeamTab==='ALL'?'All':activeTeamTab.replace(/[^a-z0-9]+/gi,'_');const file=new File([buffer],`Physical_Verification_${suffix}_${formatDate(new Date()).replaceAll('/','-')}.xlsx`,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    if(navigator.canShare&&navigator.canShare({files:[file]}))await navigator.share({files:[file],title:'Physical Verification Excel'});else{const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000)}
    toast('Excel report ready');
  }catch(err){console.error(err);toast('Could not create Excel. Check internet and try again.',4000)}
  finally{$('exportBtn').disabled=false;await renderRecords()}
}
$('exportBtn').onclick=exportExcel;

async function startup(){
  await openDb();hydrateConfig();await cleanupLocalExpired();await requestPersistentStorage();
  setSyncBadge('syncing','Connecting…');
  const configOk=await loadSharedConfig();
  if(!configOk) setSyncBadge('offline','Cloud setup needed');
  await syncPendingRecords();
  await refreshSharedRecords();
  if(members().length!==3)setTimeout(()=>$('settingsModal').classList.remove('hidden'),500);
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  window.addEventListener('online',async()=>{await syncPendingRecords(true);await refreshSharedRecords()});
  refreshTimer=setInterval(async()=>{if(document.visibilityState==='visible'){await syncPendingRecords();await refreshSharedRecords()}},30000);
  document.addEventListener('visibilitychange',async()=>{if(document.visibilityState==='visible'){await syncPendingRecords();await refreshSharedRecords()}});
}
window.addEventListener('DOMContentLoaded',startup);
