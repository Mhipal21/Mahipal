const $ = (id) => document.getElementById(id);
const DB_NAME = 'pv-capture-db';
const STORE = 'records';
const CONFIG_KEY = 'pv-capture-config-v1';
let db;
let pendingPhoto = null;
let editingId = null;

function toast(message, ms=2200){ const el=$('toast'); el.textContent=message; el.classList.remove('hidden'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.add('hidden'),ms); }
function pad(n){return String(n).padStart(2,'0')}
function formatDate(d){return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`}
function formatTime(d){return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id',autoIncrement:true})};req.onsuccess=()=>{db=req.result;resolve(db)};req.onerror=()=>reject(req.error)})}
function storeTx(mode='readonly'){return db.transaction(STORE,mode).objectStore(STORE)}
function dbAdd(rec){return new Promise((res,rej)=>{const r=storeTx('readwrite').add(rec);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function dbPut(rec){return new Promise((res,rej)=>{const r=storeTx('readwrite').put(rec);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function dbDelete(id){return new Promise((res,rej)=>{const r=storeTx('readwrite').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function dbClear(){return new Promise((res,rej)=>{const r=storeTx('readwrite').clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function dbAll(){return new Promise((res,rej)=>{const r=storeTx().getAll();r.onsuccess=()=>res(r.result.sort((a,b)=>a.id-b.id));r.onerror=()=>rej(r.error)})}
function dbGet(id){return new Promise((res,rej)=>{const r=storeTx().get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}

function getConfig(){try{return JSON.parse(localStorage.getItem(CONFIG_KEY))||{}}catch{return {}}}
function setConfig(patch){const c={...getConfig(),...patch};localStorage.setItem(CONFIG_KEY,JSON.stringify(c));return c}
function hydrateConfig(){const c=getConfig();['city','area','building','floor'].forEach(k=>$(k).value=c[k]||'');$('member1').value=c.member1||'';$('member2').value=c.member2||'';$('member3').value=c.member3||'';refreshMembers()}
function persistFixed(){setConfig({city:$('city').value.trim(),area:$('area').value.trim(),building:$('building').value.trim(),floor:$('floor').value.trim()})}
function members(){const c=getConfig();return [c.member1,c.member2,c.member3].map(x=>(x||'').trim()).filter(Boolean)}
function refreshMembers(){const m=members();[$('clickedBy'),$('editClickedBy')].forEach(sel=>{const current=sel.value;sel.innerHTML='<option value="">Select team member</option>'+m.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');if(m.includes(current))sel.value=current})}

async function fileToJpegDataUrl(file){
  const src=URL.createObjectURL(file);
  try{
    const img=new Image(); await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=src});
    const max=1280, scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
    const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    canvas.getContext('2d').drawImage(img,0,0,w,h);
    return canvas.toDataURL('image/jpeg',0.72);
  } finally { URL.revokeObjectURL(src); }
}

function fixedLocationValid(){persistFixed();const c=getConfig();if(!c.city||!c.area||!c.building||!c.floor){toast('Fill City, Area, Building and Floor first.');return false}return true}

$('takePhotoBtn').addEventListener('click',()=>{if(!fixedLocationValid())return;if(!members().length){$('settingsModal').classList.remove('hidden');toast('Set the 3-member team first.');return}$('cameraInput').click()});
$('cameraInput').addEventListener('change',async(e)=>{
  const file=e.target.files?.[0]; if(!file)return;
  toast('Preparing photo…');
  const dataUrl=await fileToJpegDataUrl(file);
  const d=new Date(file.lastModified || Date.now());
  pendingPhoto={dataUrl,capturedAt:d.toISOString(),originalName:file.name||'asset-photo.jpg'};
  $('preview').src=dataUrl;$('capturedDate').textContent=formatDate(d);$('capturedTime').textContent=formatTime(d);
  $('room').value='';$('subLocation').value='';$('assetName').value='';$('quantity').value='1';$('serialNumber').value='';$('clickedBy').value='';
  $('detailModal').classList.remove('hidden');
  setTimeout(()=>$('room').focus(),300); e.target.value='';
});
$('discardBtn').addEventListener('click',()=>{pendingPhoto=null;$('detailModal').classList.add('hidden')});

$('saveRecordBtn').addEventListener('click',async()=>{
  const room=$('room').value.trim(),subLocation=$('subLocation').value.trim(),assetName=$('assetName').value.trim(),clickedBy=$('clickedBy').value,quantity=Math.max(1,Number($('quantity').value||1));
  if(!room||!subLocation||!assetName||!clickedBy){toast('Complete all fields marked *');return}
  if(!pendingPhoto){toast('Photo is missing.');return}
  persistFixed(); const c=getConfig();
  await dbAdd({
    photo:pendingPhoto.dataUrl,photoName:pendingPhoto.originalName,capturedAt:pendingPhoto.capturedAt,
    city:c.city,area:c.area,building:c.building,floor:c.floor,
    room,subLocation,assetName,quantity,serialNumber:$('serialNumber').value.trim(),clickedBy
  });
  pendingPhoto=null;$('detailModal').classList.add('hidden');await renderRecords();toast('Asset saved');
});

async function renderRecords(){
  const rows=await dbAll();$('recordCount').textContent=rows.length;$('emptyState').style.display=rows.length?'none':'block';
  $('recordList').innerHTML=rows.slice().reverse().map((r,i)=>{const d=new Date(r.capturedAt);return `<article class="record"><img src="${r.photo}" alt="${escapeHtml(r.assetName)}"><div><h3>${escapeHtml(r.assetName)}</h3><p>${escapeHtml(r.building)} · Floor ${escapeHtml(r.floor)} · Room ${escapeHtml(r.room)}</p><p>${escapeHtml(r.subLocation)} · Qty ${r.quantity} · ${formatDate(d)} ${formatTime(d)}</p><p>By ${escapeHtml(r.clickedBy)}${r.serialNumber?` · S/N ${escapeHtml(r.serialNumber)}`:''}</p></div><div class="record-actions"><button class="mini-btn" data-edit="${r.id}">Edit</button><button class="mini-btn danger" data-delete="${r.id}">Delete</button></div></article>`}).join('');
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(confirm('Delete this asset photo?')){await dbDelete(Number(b.dataset.delete));await renderRecords();toast('Deleted')}});
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEdit(Number(b.dataset.edit)));
}

async function openEdit(id){const r=await dbGet(id);if(!r)return;editingId=id;$('editPreview').src=r.photo;$('editRoom').value=r.room;$('editSubLocation').value=r.subLocation;$('editAssetName').value=r.assetName;$('editQuantity').value=r.quantity;$('editSerialNumber').value=r.serialNumber||'';refreshMembers();$('editClickedBy').value=r.clickedBy;$('editModal').classList.remove('hidden')}
$('closeEditBtn').onclick=()=>{$('editModal').classList.add('hidden');editingId=null};
$('saveEditBtn').onclick=async()=>{const r=await dbGet(editingId);if(!r)return;const room=$('editRoom').value.trim(),sub=$('editSubLocation').value.trim(),name=$('editAssetName').value.trim(),who=$('editClickedBy').value;if(!room||!sub||!name||!who){toast('Complete all fields marked *');return}Object.assign(r,{room,subLocation:sub,assetName:name,quantity:Math.max(1,Number($('editQuantity').value||1)),serialNumber:$('editSerialNumber').value.trim(),clickedBy:who});await dbPut(r);$('editModal').classList.add('hidden');editingId=null;await renderRecords();toast('Changes saved')};

$('settingsBtn').onclick=()=>{$('settingsModal').classList.remove('hidden')};
$('closeSettingsBtn').onclick=()=>{$('settingsModal').classList.add('hidden')};
$('saveSettingsBtn').onclick=()=>{const vals=[$('member1').value.trim(),$('member2').value.trim(),$('member3').value.trim()];if(vals.some(v=>!v)){toast('Enter all 3 team-member names.');return}setConfig({member1:vals[0],member2:vals[1],member3:vals[2]});refreshMembers();$('settingsModal').classList.add('hidden');toast('Team saved')};
['city','area','building','floor'].forEach(k=>$(k).addEventListener('change',persistFixed));

$('clearAllBtn').onclick=async()=>{const rows=await dbAll();if(!rows.length)return;if(confirm('Delete ALL captured asset photos? This cannot be undone.')){await dbClear();await renderRecords();toast('All records cleared')}};

async function exportExcel(){
  const rows=await dbAll(); if(!rows.length){toast('Capture at least one asset first.');return}
  if(typeof ExcelJS==='undefined'){toast('Excel library not loaded. Connect to internet and reopen the app.',4000);return}
  $('exportBtn').disabled=true;$('exportBtn').textContent='Preparing…';
  try{
    const wb=new ExcelJS.Workbook(); wb.creator='PV Capture'; wb.created=new Date();
    const ws=wb.addWorksheet('Physical Verification',{views:[{state:'frozen',ySplit:1}]});
    ws.columns=[
      {header:'Sr No',key:'sr',width:8},{header:'Photo',key:'photo',width:20},{header:'City',key:'city',width:18},{header:'Area',key:'area',width:20},{header:'Building',key:'building',width:24},{header:'Floor Number',key:'floor',width:14},{header:'Room Number',key:'room',width:16},{header:'Sub-location',key:'sub',width:24},{header:'Name of Asset',key:'asset',width:28},{header:'Quantity',key:'qty',width:10},{header:'Serial Number',key:'serial',width:18},{header:'Clicked By',key:'who',width:20},{header:'Date',key:'date',width:13},{header:'Time',key:'time',width:12}
    ];
    const header=ws.getRow(1);header.height=24;header.font={bold:true,color:{argb:'FFFFFFFF'}};header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0F172A'}};header.alignment={vertical:'middle',horizontal:'center'};
    rows.forEach((r,idx)=>{
      const d=new Date(r.capturedAt);const rowNo=idx+2;
      const row=ws.addRow({sr:idx+1,city:r.city,area:r.area,building:r.building,floor:r.floor,room:r.room,sub:r.subLocation,asset:r.assetName,qty:r.quantity,serial:r.serialNumber||'',who:r.clickedBy,date:formatDate(d),time:formatTime(d)});
      row.height=78;row.alignment={vertical:'middle',wrapText:true};
      const imageId=wb.addImage({base64:r.photo,extension:'jpeg'});
      ws.addImage(imageId,{tl:{col:1.08,row:rowNo-0.92},ext:{width:118,height:92}});
    });
    ws.autoFilter={from:'A1',to:'N1'};ws.eachRow((row)=>row.eachCell((cell)=>{cell.border={top:{style:'thin',color:{argb:'FFE2E8F0'}},left:{style:'thin',color:{argb:'FFE2E8F0'}},bottom:{style:'thin',color:{argb:'FFE2E8F0'}},right:{style:'thin',color:{argb:'FFE2E8F0'}}}}));
    const buffer=await wb.xlsx.writeBuffer();const file=new File([buffer],`Physical_Verification_${formatDate(new Date()).replaceAll('/','-')}.xlsx`,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    if(navigator.canShare && navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'Physical Verification Excel'});}
    else {const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000)}
    toast('Excel report ready');
  }catch(err){console.error(err);toast('Could not create Excel. Please try again.',4000)}finally{$('exportBtn').disabled=false;$('exportBtn').textContent='Export Excel'}
}
$('exportBtn').onclick=exportExcel;

window.addEventListener('load',async()=>{await openDb();hydrateConfig();await renderRecords();if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{})}if(!members().length)setTimeout(()=>$('settingsModal').classList.remove('hidden'),500)});
