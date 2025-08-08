
// PWA: register SW
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
// Theme
const root = document.documentElement;
const savedTheme = localStorage.getItem('theme'); if (savedTheme) root.setAttribute('data-theme', savedTheme);
function toggleTheme(){ const next = (root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', next); localStorage.setItem('theme', next); }

// Utils
const USD = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
const fmtDate = d => d ? new Date(d).toLocaleDateString() : '—';
const byId = id => document.getElementById(id);
const escapeHTML = s => (s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

// Toast
function toast(msg){
  let t = byId('toast'); if (!t){ t = document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg; t.style.display='block'; clearTimeout(t._to); t._to = setTimeout(()=> t.style.display='none', 2000);
}

// IndexedDB
const DB_NAME = 'duckStampScrapbook'; const DB_VERSION = 2;
let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('stamps')) {
        const store = db.createObjectStore('stamps', { keyPath: 'id' });
        store.createIndex('addedAt', 'addedAt'); store.createIndex('year','year');
      }
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath:'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function tx(store, mode='readonly'){ const db = await openDB(); return db.transaction(store, mode).objectStore(store); }
const reqProm = req => new Promise((res,rej)=>{ req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
async function put(store, val){ return reqProm((await tx(store,'readwrite')).put(val)); }
async function get(store, key){ return reqProm((await tx(store)).get(key)); }
async function del(store, key){ return reqProm((await tx(store,'readwrite')).delete(key)); }
async function getAll(store){ return reqProm((await tx(store)).getAll()); }

// Images
async function storeImage(file){ const id = crypto.randomUUID(); await put('images', { id, blob:file }); return id; }
async function getImageURL(imageId){ if (!imageId) return ''; const rec = await get('images', imageId); return rec ? URL.createObjectURL(rec.blob) : ''; }
async function getImageURLSafe(imageId){ try { return await getImageURL(imageId); } catch { return ''; } }

// Catalog + autofill
let REF = new Map([
  [1934, {artist:`J.N. "Ding" Darling`, species:`Mallards`, face:1.00}],
  [1959, {artist:`Maynard Reece`, species:`King Eiders`, face:3.00}],
  [1991, {artist:`Robert Steiner`, species:`Snow Geese`, face:25.00}],
  [2020, {artist:`James Hautman`, species:`Black-bellied Whistling-Ducks`, face:25.00}]
]);
async function tryLoadExternalCatalog(){
  try { const res = await fetch('./catalog.json', {cache:'no-store'});
    if (!res.ok) return; const arr = await res.json();
    if (Array.isArray(arr)) for (const row of arr) if (row && row.year) REF.set(Number(row.year), {
      artist: row.artist || '', species: row.species || '', face: Number.isFinite(row.face)? Number(row.face): undefined
    });
  } catch {}
}
const scottFromYear = y => Number.isFinite(y) && y>=1934 ? `RW${y - 1933}` : '';

// --- Wikimedia Commons image DB ---
let IMG = new Map();
async function tryLoadCommonsDB(){
  try{
    const res = await fetch('./images-commons.json', { cache: 'no-store' });
    if (!res.ok) return;
    const arr = await res.json();
    if (Array.isArray(arr)){
      for (const r of arr){
        if (r && r.year) IMG.set(Number(r.year), r);
      }
    }
  }catch(e){ /* ignore */ }
}
function applyImageForYear(y){
  const rec = IMG.get(Number(y));
  const preview = byId('preview');
  const links = byId('imageLinks');
  if (!preview) return;
  preview.innerHTML = '';
  if (!rec || !rec.image_url){
    if (links) links.innerHTML = '';
    return;
  }
  const img = new Image();
  img.src = rec.image_url; img.alt = `Federal Duck Stamp ${y}`;
  img.style.width = '240px'; img.style.height = 'auto'; img.style.borderRadius='10px'; img.style.border='1px solid var(--border)';
  preview.appendChild(img);
  if (links){
    links.innerHTML = `
      <a class="btn secondary" href="${rec.image_url}" download target="_blank" rel="noopener">Download Image</a>
      <a class="btn secondary" href="${rec.page_url||'#'}" target="_blank" rel="noopener">View on Wikimedia Commons</a>
    `;
  }
}

function applyAutofillForYear(y){
  const toggle = byId('autoFillToggle'); if (toggle && !toggle.checked) return;
  const sc = scottFromYear(y); const scEl = byId('scott'); if (sc && scEl && !scEl.value) scEl.value = sc;
  const row = REF.get(Number(y)); if (!row) return;
  if (row.face && !byId('faceValue').value) byId('faceValue').value = row.face;
  if (row.artist && !byId('artist').value) byId('artist').value = row.artist;
  if (row.species && !byId('species').value) byId('species').value = row.species;
}

// CRUD
let editingId = null;
async function handleSubmit(){
  const y = Number(byId('year').value.trim());
  if (!y || y < 1934 || y > 2100) return toast("Enter a valid year (1934–2100).");
  const data = {
    id: editingId || crypto.randomUUID(),
    addedAt: editingId ? undefined : Date.now(),
    year: y,
    faceValue: +byId('faceValue').value || 0,
    price: +byId('price').value || 0,
    estValue: +byId('estValue').value || 0,
    purchaseDate: byId('purchaseDate').value || null,
    condition: byId('condition').value || '',
    signatureType: byId('signatureType').value || '',
    acquisition: byId('acq').value || '',
    artist: (byId('artist').value||'').trim(),
    species: (byId('species').value||'').trim(),
    scott: (byId('scott').value||'').trim(),
    platePos: (byId('platePos').value||'').trim(),
    notes: (byId('notes').value||'').trim(),
  };
  const fileIn = byId('img'); const file = fileIn ? fileIn.files[0] : null;
  if (!editingId && !file) return toast("Please add an image.");
  if (file) data.imageId = await storeImage(file);
  const existing = editingId ? await get('stamps', editingId) : null;
  await put('stamps', existing ? { ...existing, ...data } : data);
  editingId = null; const btn = byId('submitBtn'); if (btn) btn.textContent='Add';
  resetForm(); toast('Saved ✅');
  try { renderCollection(); renderChart(); } catch {}
}
function resetForm(){
  const ids = ['img','year','faceValue','price','estValue','purchaseDate','condition','signatureType','acq','artist','species','scott','platePos','notes'];
  ids.forEach(id => { const el = byId(id); if (el) el.value=''; });
  const preview = byId('preview'); if (preview) preview.innerHTML='';
  editingId = null; const btn = byId('submitBtn'); if (btn) btn.textContent='Add';
}
async function editStamp(id){
  const s = await get('stamps', id); if (!s) return; editingId = id;
  if (byId('year')) byId('year').value = s.year || '';
  if (byId('faceValue')) byId('faceValue').value = s.faceValue ?? '';
  if (byId('price')) byId('price').value = s.price ?? '';
  if (byId('estValue')) byId('estValue').value = s.estValue ?? '';
  if (byId('purchaseDate')) byId('purchaseDate').value = s.purchaseDate ?? '';
  if (byId('condition')) byId('condition').value = s.condition || '';
  if (byId('signatureType')) byId('signatureType').value = s.signatureType || '';
  if (byId('acq')) byId('acq').value = s.acquisition || '';
  if (byId('artist')) byId('artist').value = s.artist || '';
  if (byId('species')) byId('species').value = s.species || '';
  if (byId('scott')) byId('scott').value = s.scott || '';
  if (byId('platePos')) byId('platePos').value = s.platePos || '';
  if (byId('notes')) byId('notes').value = s.notes || '';
  const btn = byId('submitBtn'); if (btn) btn.textContent='Save Changes';
  window.scrollTo({top:0, behavior:'smooth'});
}
async function deleteStamp(id){
  if (!confirm("Remove this stamp from your vault?")) return;
  const s = await get('stamps', id); if (s?.imageId) await del('images', s.imageId);
  await del('stamps', id); toast('Deleted 🗑️'); try { renderCollection(); renderChart(); } catch {}
}

// Export/Import
async function exportJSON(){
  const stamps = await getAll('stamps');
  const blob = new Blob([JSON.stringify(stamps, null, 2)], { type:'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'duck-stamp-vault.json'; a.click(); URL.revokeObjectURL(a.href);
}
async function importJSON(evt){
  const file = evt.target.files?.[0]; if (!file) return;
  try { const data = JSON.parse(await file.text()); if (!Array.isArray(data)) throw new Error('Invalid format');
    for (const s of data) await put('stamps', s);
    toast('Import complete 📥'); try { renderCollection(); renderChart(); } catch {}
  } catch (e){ toast('Import failed: ' + e.message); } evt.target.value = '';
}

// Collection render (big cards)
async function renderCollection(){
  const list = await getAll('stamps'); const wrap = byId('collectionList'); if (!wrap) return;
  let arr = [...list].sort((a,b)=> (b.addedAt||0)-(a.addedAt||0));
  wrap.innerHTML = '';
  if (!arr.length){ wrap.innerHTML = '<div class="totals">No stamps yet. Go to “Add a stamp”.</div>'; const t = byId('totals'); if (t) t.textContent=''; return; }
  let totalSpend=0, totalEst=0;
  for (const s of arr){
    totalSpend += Number(s.price||0); totalEst += Number(s.estValue||0);
    const url = await getImageURLSafe(s.imageId);
    const node = document.createElement('div'); node.className='big-card';
    node.innerHTML = `
      <img src="${url}" alt="Stamp ${s.year||''}">
      <div class="meta">
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
          <div style="font-weight:700; font-size:18px">${s.year||'—'}</div>
          ${s.scott ? `<span class="pill">${escapeHTML(s.scott)}</span>` : ''}
          ${s.species ? `<span class="pill">${escapeHTML(s.species)}</span>` : ''}
          ${s.artist ? `<span class="pill">Artist: ${escapeHTML(s.artist)}</span>` : ''}
        </div>
        <div style="margin-top:4px; color:var(--muted)">
          <b>Condition:</b> ${escapeHTML(s.condition||'—')}
          ${s.signatureType ? ` • <b>Signature:</b> ${escapeHTML(s.signatureType)}`:''}
        </div>
        <div style="margin-top:4px">
          <b>Face:</b> ${isFinite(s.faceValue)?USD.format(s.faceValue):'—'}
          • <b>Paid:</b> ${USD.format(s.price||0)}
          • <b>Est:</b> ${s.estValue?USD.format(s.estValue):'—'}
        </div>
        <div style="margin-top:4px; color:var(--muted)">
          <b>Acquired:</b> ${escapeHTML(s.acquisition||'—')} • <b>Date:</b> ${fmtDate(s.purchaseDate)}
          ${s.platePos ? ` • <b>Plate/Pos:</b> ${escapeHTML(s.platePos)}`:''}
        </div>
        ${s.notes ? `<div style="margin-top:6px">${escapeHTML(s.notes)}</div>`:''}
        <div style="display:flex; gap:8px; margin-top:10px">
          <a class="btn secondary" href="./add.html" onclick="editStamp('${s.id}')">Edit</a>
          <button class="btn danger" onclick="deleteStamp('${s.id}')">Delete</button>
        </div>
      </div>`;
    wrap.appendChild(node);
  }
  const t = byId('totals'); if (t) t.textContent = `Items: ${arr.length} • Total Spend: ${USD.format(totalSpend)} • Total Est. Value: ${USD.format(totalEst)} • Δ: ${USD.format(totalEst - totalSpend)}`;
}

// Chart render
async function renderChart(){
  const c = byId('chart'); if (!c) return;
  const ctx = c.getContext('2d'); const W = c.width = c.clientWidth * devicePixelRatio; const H = c.height = c.clientHeight * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio); ctx.clearRect(0,0,W,H);
  const stamps = await getAll('stamps'); if (!stamps.length){ byId('chartSummary').textContent=''; return; }
  const pts = stamps.map(s => ({ date: s.purchaseDate ? new Date(s.purchaseDate) : new Date(s.addedAt||Date.now()), paid:+(s.price||0), est:+(s.estValue||0) })).sort((a,b)=>a.date-b.date);
  const months = new Map();
  for (const p of pts){ const k = `${p.date.getFullYear()}-${String(p.date.getMonth()+1).padStart(2,'0')}`; const cur = months.get(k)||{spend:0, est:0}; cur.spend+=p.paid; cur.est+=p.est; months.set(k,cur); }
  let cumSpend=0, cumEst=0; const series=[];
  for (const [k,v] of [...months.entries()].sort()){ cumSpend+=v.spend; cumEst+=v.est; series.push({label:k, spend:cumSpend, est:cumEst}); }
  const padL=56, padR=10, padT=12, padB=26; const iW=(W/devicePixelRatio)-padL-padR, iH=(H/devicePixelRatio)-padT-padB;
  const maxY = Math.max(10, ...series.map(s=>Math.max(s.spend,s.est))); const x=i=> padL + (series.length<=1 ? 0 : (i/(series.length-1))*iW); const y=v=> padT + iH - (v/maxY)*iH;
  // grid + labels
  ctx.strokeStyle='rgba(200,200,200,.15)'; ctx.lineWidth=1; ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--muted')||'#999'; ctx.font='12px system-ui';
  for (let i=0;i<=4;i++){ const yy=padT+(i/4)*iH; ctx.beginPath(); ctx.moveTo(padL,yy); ctx.lineTo(padL+iW,yy); ctx.stroke(); const val=maxY*(1-i/4); ctx.fillText(new Intl.NumberFormat().format(Math.round(val)), 8, yy+4); }
  const plot=(color,key)=>{ ctx.beginPath(); series.forEach((s,i)=>{ const xx=x(i), yy=y(s[key]); i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy); }); ctx.strokeStyle=color; ctx.lineWidth=2.4; ctx.stroke(); };
  plot('#e35d6a','spend'); plot('#20c997','est');
  ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--muted')||'#999'; const labs=[0, Math.floor(series.length/2), series.length-1];
  new Set(labs).forEach(i=>{ if (i<0||i>=series.length) return; const xx=x(i); ctx.fillText(series[i].label, xx-14, padT+iH+18); });
  const last=series.at(-1); byId('chartSummary').textContent = `Cumulative spend ${USD.format(last.spend)} vs. estimated value ${USD.format(last.est)} (Δ ${USD.format(last.est - last.spend)})`;
}

// File drop previews
function wireDrop(){
  const drop = byId('drop'), fileIn = byId('img'), preview = byId('preview'); if (!drop || !fileIn || !preview) return;
  const setPreview = async (file) => { preview.innerHTML=''; if (!file) return; const url=URL.createObjectURL(file); const img=new Image(); img.src=url; img.onload=()=>URL.revokeObjectURL(url); preview.appendChild(img); };
  ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', e => { const f=e.dataTransfer.files[0]; if (!f) return; fileIn.files = e.dataTransfer.files; setPreview(f); });
  fileIn.addEventListener('change', e => setPreview(e.target.files[0]));
}

// Page bootstrap
async function boot(page){
  document.getElementById('yearNow')?.replaceChildren(document.createTextNode(new Date().getFullYear()));
  await openDB(); await tryLoadExternalCatalog(); await tryLoadCommonsDB();
  if (page === 'collection'){ renderCollection(); }
  if (page === 'value'){ renderChart(); }
  if (page === 'add'){ wireDrop(); const yearEl=byId('year'); yearEl?.addEventListener('change', e=> { const y=Number(e.target.value); applyAutofillForYear(y); applyImageForYear(y); }); }
  // Hide splash quickly
  const s = document.querySelector('.splash'); if (s){ setTimeout(()=>{ s.style.opacity='0'; setTimeout(()=> s.style.display='none', 350); }, 1100); }
}
