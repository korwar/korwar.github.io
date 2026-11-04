/* =====================================================================
 *  UI : 지도 렌더링 · 부대 버튼 · 지휘 패널 (게임 화면)
 * ===================================================================== */
const $ = s => document.querySelector(s);
const KX = 0.79, WLON0 = 124.0, WLAT1 = 43.3;
let S = null, paused = true, speed = 1, selected = null, mode = null;
const SETTINGS = Object.assign({ prologue: 'always', speed: 1, labels: 'all', autoPause: true }, lsGet(LS.settings, {}));
let lblMode = SETTINGS.labels, autoPause = SETTINGS.autoPause;
const view = { s: 60, ox: 0, oy: 0 };
let unitEls = new Map(), lastLogId = 0, terrVerDrawn = -1, frontPath = null, ctxKey = '';
const canvas = $('#map'), ctx = canvas.getContext('2d');
const terrCv = document.createElement('canvas'); terrCv.width = NX; terrCv.height = NY;
const terrCtx = terrCv.getContext('2d');
const wx = lon => (lon - WLON0) * KX, wy = lat => (WLAT1 - lat);
const sx = lon => wx(lon) * view.s + view.ox, sy = lat => wy(lat) * view.s + view.oy;
const s2ll = (x, y) => [WLAT1 - (y - view.oy) / view.s, (x - view.ox) / view.s / KX + WLON0];
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmt(n) { return Math.round(n).toLocaleString('ko-KR'); }
function pct(n) { return (n * 100).toFixed(1) + '%'; }

const TYPE_BG = { inf: '#1f4e8c', mech: '#2d6a4f', armor: '#4b5d2a', rapid: '#4a3f8c', home: '#3d5a80', mob: '#555f69', sof: '#1d1d1d',
  marine: '#8b1e1e', arty: '#7a5418', kinf: '#7d0f0f', kmech: '#6b1a00', karty: '#5c2a00', ksof: '#3a0a0a', pla: '#9a0000' };
const logoCache = new Map();
function logoURL(u) {
  if (logoCache.has(u.id)) return logoCache.get(u.id);
  let bg = TYPE_BG[u.type] || '#333';
  if (u.side === 'US') bg = '#0a3161';
  if (u.second) bg = '#5a2a2a';
  const num = String(u.num || ''), nick = u.nick || '';
  const fs = num.length <= 2 ? 26 : num.length <= 4 ? 17 : num.length <= 6 ? 12.5 : 10;
  const sp = '32,5 35,13 44,13 37,18 40,26 32,21 24,26 27,18 20,13 29,13';
  const star = u.side === 'KPA' ? `<polygon points="${sp}" fill="#ffdf6e" opacity=".9"/>` : u.side === 'PLA' ? `<polygon points="${sp}" fill="#ffd700"/>` : u.side === 'US' ? `<polygon points="${sp}" fill="#fff"/>` : '';
  const ty = star ? 44 : (nick ? 36 : 41);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient></defs>
    <circle cx="32" cy="32" r="32" fill="${bg}"/><circle cx="32" cy="32" r="32" fill="url(#g)"/>${star}
    <text x="32" y="${ty}" font-family="Malgun Gothic,Noto Sans KR,sans-serif" font-weight="800" font-size="${fs}" fill="#fff" text-anchor="middle">${esc(num)}</text>
    ${nick && !star ? `<text x="32" y="52" font-family="Malgun Gothic,Noto Sans KR,sans-serif" font-size="${nick.length > 3 ? 8 : 10}" fill="#f2e3a6" text-anchor="middle">${esc(nick)}</text>` : ''}</svg>`;
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  logoCache.set(u.id, url); return url;
}
function setLogo(img, u) { img.src = u.logo || logoURL(u); img.onerror = () => { img.onerror = null; img.src = logoURL(u); }; }

function clearGame() {
  unitEls.forEach(el => el.remove()); unitEls.clear(); S = null; selected = null; mode = null;
  $('#status').innerHTML = ''; $('#ctx').innerHTML = ''; $('#logBox').innerHTML = ''; $('#clock').textContent = 'D+0  00:00';
}
async function startNew(diff) {
  $('#loading').style.display = 'flex';
  const brain = await Api.start(diff);
  clearGame();
  S = newGame(diff, brain);
  paused = false; speed = SETTINGS.speed; lastLogId = 0; terrVerDrawn = -1; ctxKey = ''; endShown = false;
  $('#loading').style.display = 'none';
  fitView(); renderCtx(true); updateSpeedBtns(); pollLog();
}
function resize() { const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; canvas.width = r.width * dpr; canvas.height = r.height * dpr; }
function fitView() {
  resize();
  const r = canvas.getBoundingClientRect(), w = (130.85 - 124.15) * KX, h = (43.05 - 33.05);
  view.s = Math.min(r.width / w, r.height / h);
  view.ox = (r.width - w * view.s) / 2 - wx(124.15) * view.s;
  view.oy = (r.height - h * view.s) / 2 - wy(43.05) * view.s;
  view.fit = view.s;
}
function zoomAt(f, x, y) { const ns = Math.max(view.fit * 0.7, Math.min(view.fit * 16, view.s * f)); f = ns / view.s; view.ox = x - (x - view.ox) * f; view.oy = y - (y - view.oy) * f; view.s = ns; }
function centerOn(lat, lon) { const r = canvas.getBoundingClientRect(); if (view.s < view.fit * 2.5) view.s = view.fit * 2.5; view.ox = r.width / 2 - wx(lon) * view.s; view.oy = r.height / 2 - wy(lat) * view.s; }

const landPath = new Path2D(), neighPath = new Path2D(), mdlPath = new Path2D();
KOREA_POLY.forEach((p, i) => i ? landPath.lineTo(wx(p[1]), wy(p[0])) : landPath.moveTo(wx(p[1]), wy(p[0]))); landPath.closePath();
for (const isl of ISLANDS) { landPath.moveTo(wx(isl[1] + isl[3]), wy(isl[0])); landPath.ellipse(wx(isl[1]), wy(isl[0]), isl[3] * KX, isl[2], 0, 0, Math.PI * 2); }
NEIGHBOR_POLY.forEach((p, i) => i ? neighPath.lineTo(wx(p[1]), wy(p[0])) : neighPath.moveTo(wx(p[1]), wy(p[0]))); neighPath.closePath();
MDL.slice(1, -1).forEach((p, i) => i ? mdlPath.lineTo(wx(p[0]), wy(p[1])) : mdlPath.moveTo(wx(p[0]), wy(p[1])));
function rebuildTerritory() {
  const img = terrCtx.createImageData(NX, NY), d = img.data;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const c = j * NX + i, p = ((NY - 1 - j) * NX + i) * 4;
    if (!S.land[c]) continue;
    if (S.owner[c] === 1) { d[p] = 48; d[p + 1] = 110; d[p + 2] = 205; } else { const cap = S.origOwner[c] === 1; d[p] = cap ? 235 : 196; d[p + 1] = cap ? 90 : 52; d[p + 2] = 52; }
    d[p + 3] = 150;
  }
  terrCtx.putImageData(img, 0, 0);
  frontPath = new Path2D();
  const r = GRID.res;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const c = j * NX + i; if (!S.land[c]) continue;
    const lon = GRID.lon0 + i * r, lat = GRID.lat0 + j * r;
    if (i < NX - 1 && S.land[c + 1] && S.owner[c + 1] !== S.owner[c]) { frontPath.moveTo(wx(lon + r), wy(lat)); frontPath.lineTo(wx(lon + r), wy(lat + r)); }
    if (j < NY - 1 && S.land[c + NX] && S.owner[c + NX] !== S.owner[c]) { frontPath.moveTo(wx(lon), wy(lat + r)); frontPath.lineTo(wx(lon + r), wy(lat + r)); }
  }
  terrVerDrawn = S.terrVer;
}
function draw() {
  const r = canvas.getBoundingClientRect(), W = r.width, H = r.height, dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a1a2b'); g.addColorStop(1, '#06111d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (!S) return;
  if (terrVerDrawn !== S.terrVer) rebuildTerritory();
  ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.ox, dpr * view.oy);
  ctx.lineWidth = 1 / view.s; ctx.strokeStyle = '#ffffff10'; ctx.beginPath();
  for (let lo = 124; lo <= 131; lo++) { ctx.moveTo(wx(lo), wy(32)); ctx.lineTo(wx(lo), wy(44)); }
  for (let la = 33; la <= 43; la++) { ctx.moveTo(wx(123), wy(la)); ctx.lineTo(wx(132), wy(la)); }
  ctx.stroke();
  ctx.fillStyle = '#1b1f24'; ctx.fill(neighPath); ctx.strokeStyle = '#3a414a'; ctx.lineWidth = 1.2 / view.s; ctx.stroke(neighPath);
  ctx.fillStyle = '#25331f'; ctx.fill(landPath);
  ctx.save(); ctx.clip(landPath); ctx.imageSmoothingEnabled = true;
  ctx.drawImage(terrCv, wx(GRID.lon0), wy(GRID.lat1), NX * GRID.res * KX, NY * GRID.res); ctx.restore();
  ctx.strokeStyle = '#c9d6e3'; ctx.lineWidth = 1.1 / view.s; ctx.stroke(landPath);
  ctx.setLineDash([5 / view.s, 4 / view.s]); ctx.strokeStyle = '#ffffff70'; ctx.lineWidth = 1.2 / view.s; ctx.stroke(mdlPath); ctx.setLineDash([]);
  if (frontPath) { ctx.lineCap = 'round'; ctx.strokeStyle = '#00000090'; ctx.lineWidth = 5 / view.s; ctx.stroke(frontPath); ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2.4 / view.s; ctx.stroke(frontPath); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = 'bold 13px "Noto Sans KR",sans-serif'; ctx.fillStyle = '#ffffff40'; ctx.textAlign = 'center';
  ctx.fillText('중 국', sx(125.4), sy(42.3)); ctx.fillText('러시아', sx(131.2), sy(43.4)); ctx.fillText('서 해', sx(124.9), sy(36.4)); ctx.fillText('동 해', sx(130.2), sy(38.6));
  const zoomed = view.s > view.fit * 1.8;
  for (const [n, la, lo, major] of CITIES) {
    if (!major && !zoomed) continue;
    const x = sx(lo), y = sy(la);
    ctx.fillStyle = major ? '#fff' : '#cfd8e3'; ctx.beginPath(); ctx.arc(x, y, major ? 3.5 : 2.5, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `${major ? 'bold 12px' : '11px'} "Noto Sans KR",sans-serif`; ctx.textAlign = 'left';
    ctx.lineWidth = 3; ctx.strokeStyle = '#000c'; ctx.strokeText(n, x + 5, y + 4); ctx.fillStyle = major ? '#fff' : '#d8e2ec'; ctx.fillText(n, x + 5, y + 4);
  }
  for (const u of S.units) {
    if (!u.alive) continue;
    const t = u.pending ? [u.pending.lat, u.pending.lon] : u.target;
    if (!t || SIDE_OF[u.side] !== 1) continue;
    const isSel = selected === u;
    if (!isSel && view.s < view.fit * 1.5 && !u.pending) continue;
    ctx.strokeStyle = u.pending ? '#ff9f43' : (isSel ? '#ffffff' : '#ffffff80'); ctx.lineWidth = isSel ? 2 : 1.2;
    ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(sx(u.lon), sy(u.lat));
    if (u.pending) ctx.quadraticCurveTo((sx(u.lon) + sx(t[1])) / 2, Math.min(sy(u.lat), sy(t[0])) - 40, sx(t[1]), sy(t[0])); else ctx.lineTo(sx(t[1]), sy(t[0]));
    ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(sx(t[1]), sy(t[0]), 6, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx(t[1]) - 9, sy(t[0])); ctx.lineTo(sx(t[1]) + 9, sy(t[0])); ctx.moveTo(sx(t[1]), sy(t[0]) - 9); ctx.lineTo(sx(t[1]), sy(t[0]) + 9); ctx.stroke();
  }
  if (selected && selected.alive && selected.c) {
    ctx.strokeStyle = '#ffd34d55'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.arc(sx(selected.lon), sy(selected.lat), selected.c.artRange / 111 * view.s, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
}
function shortName(u) { return u.name.replace(/^(육군|해병대|조선인민군|중국인민해방군) /, '').replace('(한미연합사단)', ''); }
function syncUnits() {
  const r = canvas.getBoundingClientRect();
  for (const u of S.units) {
    let el = unitEls.get(u);
    if (!u.alive) { if (el) { el.remove(); unitEls.delete(u); if (selected === u) { selected = null; renderCtx(true); } } continue; }
    if (!el) {
      el = document.createElement('div');
      const sideCls = u.side === 'KPA' ? 'enemy' : u.side === 'PLA' ? 'enemy pla' : u.side === 'US' ? 'us' : '';
      el.className = `unit ${u.cat === 'bde' ? 'bde' : 'div'} ${sideCls}`;
      el.innerHTML = `<div class="lbl"></div><button class="ub"><img alt=""></button>`;
      setLogo(el.querySelector('img'), u);
      const btn = el.querySelector('.ub');
      btn.addEventListener('mousedown', e => e.stopPropagation());
      btn.addEventListener('click', e => { e.stopPropagation(); onUnitClick(u); });
      btn.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); if (selected && SIDE_OF[selected.side] === 1) issueTarget(u.lat, u.lon); });
      btn.title = u.name;
      $('#unitLayer').appendChild(el); unitEls.set(u, el);
    }
    const x = sx(u.lon), y = sy(u.lat), vis = x > -80 && x < r.width + 80 && y > -60 && y < r.height + 60;
    el.style.display = vis ? '' : 'none';
    if (!vis) continue;
    const friendly = SIDE_OF[u.side] === 1;
    el.classList.toggle('hideLbl', lblMode === 'none' || (lblMode === 'own' && !friendly) || (lblMode === 'zoom' && view.s < view.fit * 2.2 && selected !== u));
    const longL = view.s >= view.fit * 2.2 || selected === u;
    if (el._long !== longL) { el._long = longL; el.querySelector('.lbl').textContent = longL ? u.name : shortName(u); }
    const bh = u.cat === 'bde' ? 28 : 34;
    el.style.transform = `translate(${Math.round(x - el.offsetWidth / 2)}px, ${Math.round(y - el.offsetHeight + bh / 2)}px)`;
    el.classList.toggle('selected', selected === u);
    el.classList.toggle('inactive', !u.active);
    el.classList.toggle('pending', !!u.pending);
    el.classList.toggle('fight', u.engaged > 3 && u.c && u.nearD < 24);
  }
}
function onUnitClick(u) {
  if (mode) { if (mode.type === 'target') issueTarget(u.lat, u.lon); else issueSpecial(u.lat, u.lon); return; }
  selected = u; renderCtx(true);
}
let drag = null;
const wrap = $('#mapWrap');
wrap.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); zoomAt(Math.pow(1.0015, -e.deltaY), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
wrap.addEventListener('mousedown', e => { if (e.button === 0) drag = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy, moved: false }; });
window.addEventListener('mousemove', e => {
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; wrap.classList.add('panning'); }
  if (drag.moved) { view.ox = drag.ox + dx; view.oy = drag.oy + dy; }
});
window.addEventListener('mouseup', e => {
  if (!drag) return; const d = drag; drag = null; wrap.classList.remove('panning');
  if (d.moved || !S || !wrap.contains(e.target) || e.target.closest('#logBox,#legend,#zoomBtns')) return;
  const r = canvas.getBoundingClientRect(); const [lat, lon] = s2ll(e.clientX - r.left, e.clientY - r.top);
  if (mode) { if (mode.type === 'target') issueTarget(lat, lon); else issueSpecial(lat, lon); return; }
  if (selected) { selected = null; renderCtx(true); }
});
wrap.addEventListener('contextmenu', e => {
  e.preventDefault(); if (!S || !selected || SIDE_OF[selected.side] !== 1 || !selected.active) return;
  const r = canvas.getBoundingClientRect(); const [lat, lon] = s2ll(e.clientX - r.left, e.clientY - r.top); issueTarget(lat, lon);
});
window.addEventListener('keydown', e => {
  if (!S || $('#app').style.display === 'none' || $('#prologue').style.display === 'flex') return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); togglePause(); }
  if (e.key === 'Escape') { if (mode) setMode(null); else if (selected) { selected = null; renderCtx(true); } }
  const sp = { '1': 1, '2': 2, '3': 4, '4': 8, '5': 16 }[e.key]; if (sp) { speed = sp; paused = false; updateSpeedBtns(); }
});
window.addEventListener('resize', () => { const f = view.s / (view.fit || 1); fitView(); view.s = view.fit * Math.max(1, f); });
function setMode(m) {
  mode = m; wrap.classList.toggle('targeting', !!m);
  const h = $('#hint'); if (m) { h.textContent = m.text + '  (Esc: 취소)'; h.style.display = 'block'; } else h.style.display = 'none';
}
function issueTarget(lat, lon) {
  const u = mode && mode.unit || selected; setMode(null);
  if (!u) return;
  const c = cellOf(lat, lon);
  if (c < 0 || !S.land[c]) { toast('육지를 지정하십시오.', false); return; }
  CMD.setTarget(S, u, lat, lon);
  if (S.owner[c] !== 1) toast('목표가 적 지역입니다 — 부대는 전선까지 이동한 뒤 공격 자세일 때 전진합니다.', true);
  renderCtx(true);
}
function issueSpecial(lat, lon) {
  const m = mode; setMode(null); if (!m) return;
  const err = m.type === 'landing' ? CMD.landing(S, m.unit, lat, lon) : CMD.airOp(S, m.unit, lat, lon);
  if (err) toast(err, false); renderCtx(true);
}
function togglePause() { paused = !paused; updateSpeedBtns(); }
function updateSpeedBtns() {
  document.querySelectorAll('#speed .btn').forEach(b => { const v = b.dataset.sp; b.classList.toggle('sel', v === 'pause' ? paused : (!paused && +v === speed)); });
  $('#pauseBtn').textContent = paused ? '▶' : '❚❚';
}
document.querySelectorAll('#speed .btn').forEach(b => b.onclick = () => { if (b.dataset.sp === 'pause') togglePause(); else { speed = +b.dataset.sp; paused = false; } updateSpeedBtns(); });
let lastT = performance.now(), acc = 0, uiT = 0;
function loop(t) {
  const dt = Math.min(0.25, (t - lastT) / 1000); lastT = t;
  if (S && !paused && !S.over) {
    acc += dt * speed * (24 / 5);
    let n = 0;
    while (acc >= 1 && n < 120) { step(S); acc -= 1; n++; if (S.over) break; }
    if (n >= 120) acc = 0;
  }
  if ($('#app').style.display !== 'none') { draw(); if (S) syncUnits(); }
  uiT += dt;
  if (S && uiT > 0.25) { uiT = 0; updateStatus(); updateCtxValues(); pollLog(); if (S.over) showEnd(); }
  requestAnimationFrame(loop);
}
let statusCache = { v: -1 };
function updateStatus() {
  const d = Math.floor(S.hour / 24), h = S.hour % 24;
  $('#clock').textContent = `D+${d}  ${String(h).padStart(2, '0')}:00`;
  if (statusCache.v !== S.terrVer) {
    let cap = 0, lost = 0; for (let c = 0; c < NCELL; c++) { if (S.origOwner[c] === 2 && S.owner[c] === 1) cap++; if (S.origOwner[c] === 1 && S.owner[c] === 2) lost++; }
    statusCache = { v: S.terrVer, cap: cap / S.northCells0, lost: lost / S.southCells0 };
  }
  const st = S.stats, rk = st.rok, us = st.us;
  const bar = (v, c, mark) => `<div class="bar">${mark != null ? `<i style="left:${Math.max(0, Math.min(100, mark))}%"></i>` : ''}<div style="width:${Math.max(0, Math.min(100, v))}%;background:${c}"></div></div>`;
  const willC = S.will > 50 ? '#46a05b' : S.will > 25 ? '#e0a92e' : '#d9534f', chC = S.chinaRisk < 40 ? '#46a05b' : S.chinaRisk < 70 ? '#e0a92e' : '#d9534f';
  const kpaAlive = S.units.filter(u => u.alive && u.side === 'KPA').reduce((a, u) => a + unitTotals(u).pers, 0);
  const infil = S.units.filter(u => u.alive && u.infil).length;
  const T = S.willP ? S.willP.T : S.will, diff = T - S.will, trend = Math.abs(diff) < 1 ? '→' : diff > 0 ? '▲' : '▼';
  const nextUS = (() => { const r = US_REINF.find(r => !S.flags['us_' + r.id]); return r ? ` <small>(다음 D-${Math.max(0, r.day - S.usBoost - d)})</small>` : ''; })();
  $('#status').innerHTML = `
    <div class="s"><div class="k">전쟁 비용(직접비)</div><div class="v">${st.cost.toFixed(1)} <small>조 원</small></div></div>
    <div class="s"><div class="k">북측 지역 확보율</div><div class="v">${pct(statusCache.cap)} <small>${statusCache.lost > 0.001 ? '피탈 ' + pct(statusCache.lost) : ''}</small></div></div>
    <div class="s w"><div class="k">국군 사상자</div><div class="v">${fmt(rk.kia + rk.wia + rk.mia)} <small>명 (전사 ${fmt(rk.kia)} · 부상 ${fmt(rk.wia)} · 실종 ${fmt(rk.mia)})</small></div></div>
    <div class="s"><div class="k">미군 사상자</div><div class="v">${fmt(us.kia + us.wia + us.mia)} <small>명</small></div></div>
    <div class="s"><div class="k">민간인 피해</div><div class="v">${fmt(st.civ)} <small>명</small></div></div>
    <div class="s"><div class="k">북한군 잔존 병력(추정)</div><div class="v">${fmt(kpaAlive / 1000)}<small>천명 · 손실 ${fmt((st.kpa + st.kpaPOW) / 1000)}천</small></div></div>
    <div class="s"><div class="k">후방 침투조 활동</div><div class="v">${infil}<small>개 조 · 누적 ${st.infilTeams}</small></div></div>
    <div class="s" title="흰 눈금은 현재 여건에서 지지도가 수렴해 가는 목표치입니다."><div class="k">국민 지지도</div><div class="v">${S.will.toFixed(0)} <small style="color:${diff >= 0 ? '#8fe3a1' : '#ff8a80'}">${trend} 목표 ${T.toFixed(0)}</small></div>${bar(S.will, willC, T)}</div>
    <div class="s"><div class="k">제공권</div><div class="v">${pct(S.air.sup)}</div>${bar(S.air.sup * 100, '#3d8bfd')}</div>
    <div class="s"><div class="k">중국 개입 ${S.chinaIn ? (S.chinaOut ? '<span class="tag">철수</span>' : '<span class="tag" style="background:#8a2a2a">개입 중</span>') : '위험'}</div><div class="v">${S.chinaIn ? (S.chinaOut ? '—' : fmt(S.units.filter(u => u.alive && u.side === 'PLA').reduce((a, u) => a + unitTotals(u).pers, 0)) + '<small>명</small>') : S.chinaRisk.toFixed(0)}</div>${S.chinaIn ? '' : bar(S.chinaRisk, chC)}</div>
    <div class="s"><div class="k">북한 WMD 위협도</div><div class="v">${S.wmd.toFixed(0)}</div>${bar(S.wmd, S.wmd > 70 ? '#d9534f' : '#e0a92e')}</div>
    <div class="s w"><div class="k">북한군 태세 · 교도대 · 미군 증원 · 난이도</div><div class="v" style="font-size:12px">${S.stance === 'offensive' ? '<span style="color:#ff8a80">공세</span>' : '방어'} · 교도대 잔여 ${S.kresLeft} · 미 증원 ${US_REINF.filter(r => S.flags['us_' + r.id]).length}/${US_REINF.length}${nextUS} · ${DIFF_NAME[S.difficulty]}</div></div>`;
}
function pollLog() {
  const box = $('#logBox'); let added = false;
  for (const l of S.log) {
    if (l.id <= lastLogId) continue; lastLogId = l.id; added = true;
    const div = document.createElement('div'); div.className = 'l ' + l.type;
    div.innerHTML = `<span class="t">D+${Math.floor(l.h / 24)} ${String(l.h % 24).padStart(2, '0')}시</span>${esc(l.msg)}`;
    box.appendChild(div);
    if (/★|\[경보\]|\[긴급\]/.test(l.msg)) { toast(l.msg, l.type === 'good'); if (autoPause && !paused) { paused = true; updateSpeedBtns(); } }
    else if (/\[침투\]/.test(l.msg)) toast(l.msg, false);
  }
  while (box.children.length > 120) box.firstChild.remove();
  if (added) box.scrollTop = box.scrollHeight;
}
let toastT = null;
function toast(msg, good) { const t = $('#toast'); t.textContent = msg; t.className = good ? 'good' : ''; t.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => t.style.display = 'none', 4200); }
const ORD_OPTS = Object.entries(POSTURE).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
const FIRE_OPTS = Object.entries(FIRE).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
function renderCtx(force) {
  const key = selected ? 'u:' + selected.id : 'g';
  if (!force && key === ctxKey) return; ctxKey = key;
  if (!S) { $('#ctx').innerHTML = ''; return; }
  $('#ctx').innerHTML = selected ? unitPanel(selected) : globalPanel();
  bindCtx(); updateCtxValues();
}
function cdTxt(k) { const h = CMD.cooldown(S, k); return h ? ` <small>(${Math.ceil(h / 24)}일)</small>` : ''; }
const WILL_ROWS = [['base', '기준치'], ['rally', '개전 결집 효과'], ['cas', '장병 사상자'], ['civ', '민간인 피해'], ['prog', '전과(북측 확보·평양)'],
  ['stall', '전선 교착'], ['fatigue', '장기전 피로'], ['lost', '남측 영토 피탈·서울'], ['ext', 'WMD·중국 참전·동원']];
function globalPanel() {
  const a = S.air.alloc, groups = {};
  for (const u of S.units) if (u.alive && SIDE_OF[u.side] === 1) (groups[u.parent] = groups[u.parent] || []).push(u);
  return `
  <h4>전군 지시 <label style="font-size:11px;font-weight:400"><input type="checkbox" id="incHome"> 지역방위·동원사단 포함</label></h4>
  <div class="grid3">
    <button class="btn red" data-all="attack">전군 총공격</button><button class="btn" data-all="defend">전군 방어</button><button class="btn" data-all="delay">전군 지연전</button>
    <button class="btn" data-all="retreat">전군 후퇴</button><button class="btn" data-all="reserve">전군 예비·정비</button><button class="btn" id="desel">부대 선택 해제</button>
  </div>
  <div class="note">개별 부대 지시는 지도에서 부대 버튼을 클릭하십시오. 부대 선택 후 지도 우클릭 = 이동 목표 지정.</div>
  <h4>전군 포병 사격</h4>
  <div class="grid2"><select id="allFire" class="btn">${FIRE_OPTS}</select><button class="btn ${S.counterBattery ? 'on' : ''}" id="cbBtn">대화력전 우선 ${S.counterBattery ? 'ON' : 'OFF'}</button></div>
  <h4>공군 작전 배분 <small style="font-weight:400">합계 ${a.as + a.cas + a.int + a.str}%</small></h4>
  ${[['as', '제공 작전'], ['cas', '근접항공지원'], ['int', '후방 차단'], ['str', '전략 타격']].map(([k, n]) =>
    `<div class="slider"><label>${n}</label><input type="range" min="0" max="100" step="5" value="${a[k]}" data-air="${k}"><span data-airv="${k}">${a[k]}%</span></div>`).join('')}
  <div class="note">제공: 제공권 확보(AN-2 침투 억제) · 근접지원: 공격 부대 전투력 증가 · 후방차단: 북한군 보급 감소 · 전략타격: WMD 위협·장사정포 억제</div>
  <h4>전략·지원 조치</h4>
  <div class="grid2">
    <button class="btn" data-g="killChain">킬체인 선제타격${cdTxt('kc')}</button>
    <button class="btn" data-g="ammo">탄약 긴급 보급${cdTxt('ammo')}</button>
    <button class="btn" data-g="mobilize" ${S.mobilized ? 'disabled' : ''}>${S.mobilized ? '동원령 선포됨' : '국가 총동원령'}</button>
    <button class="btn" data-g="requestUS">미 증원 가속 요청${cdTxt('us')}</button>
    <button class="btn" data-g="psyops">대북 심리전${cdTxt('psy')}</button>
    <button class="btn" data-g="diplomacy">대중국 외교 협상${cdTxt('dip')}</button>
    <button class="btn ${S.stopLine ? 'on' : ''}" data-g="toggleStopLine">북진 한계선(39.5°) ${S.stopLine ? '선언 중' : '선언'}</button>
    <button class="btn red" id="surBtn">항복</button>
  </div>
  <h4>국민 지지도 요인 <small style="font-weight:400">매일 목표치로 12%씩 수렴</small></h4>
  <table class="tb">${WILL_ROWS.map(([k, n]) => `<tr><td>${n}</td><td class="n" data-w="${k}"></td></tr>`).join('')}<tr><td><b>목표 지지도</b></td><td class="n" data-w="T"></td></tr></table>
  <div class="note" data-w="note"></div>
  <h4>표시 옵션</h4>
  <div class="grid2">
    <button class="btn" id="lblBtn">부대명 표시: ${{ all: '전체', own: '아군만', zoom: '확대 시', none: '숨김' }[lblMode]}</button>
    <button class="btn ${autoPause ? 'on' : ''}" id="apBtn">주요 사건 시 자동 정지</button>
  </div>
  <h4>아군 부대 목록 <small style="font-weight:400">${S.units.filter(u => u.alive && SIDE_OF[u.side] === 1).length}개</small></h4>
  <div class="ulist">${Object.entries(groups).map(([g, us]) => `<div class="grp"><div class="gh">▸ ${esc(g)} (${us.length})</div><div class="gi">${us.map(u =>
    `<div class="it" data-uid="${u.id}">${esc(u.name)}${u.active ? '' : '<span class="tag">미동원</span>'}<span data-pp="${u.id}"></span></div>`).join('')}</div></div>`).join('')}</div>
  <h4>적 후방 침투조 <small style="font-weight:400">클릭 시 위치로 이동</small></h4>
  <div class="ulist" id="infilList"></div>`;
}
function fmtE(n, friendly) { if (friendly) return fmt(n); const r = n > 2000 ? 500 : n > 200 ? 50 : 5; return '약 ' + fmt(Math.round(n / r) * r); }
function unitPanel(u) {
  const friendly = SIDE_OF[u.side] === 1, i = u.init;
  const special = friendly && u.active ? (u.type === 'sof' ? ['air', '후방 침투 작전 (320km)'] : u.type === 'rapid' ? ['air', '공중강습 작전 (130km)'] : u.type === 'marine' ? ['landing', '상륙작전 (600km)'] : null) : null;
  let h = `<div class="uhead ${u.cat}"><img src="${u.logo || logoURL(u)}"><div><div class="nm">${esc(u.name)}</div>
    <div class="pa">${esc(u.parent)} · ${u.cat === 'div' ? '사단급' : '여단·대대급'}</div><div class="st" data-v="state"></div></div><button class="btn x" id="closeU">✕</button></div>`;
  if (!friendly) h += `<div class="note" style="margin-top:8px">※ 적 부대 정보는 정보자산 판단에 따른 추정치입니다.${u.infil ? ' 후방 침투조 — 주변 아군 보급을 교란합니다. 인근 부대에 공격 지시를 내려 소탕하십시오.' : ''}</div>`;
  const row = (k, n, v) => v ? `<tr><td>${n}</td><td class="n" data-v="${k}"></td><td class="n">${fmtE(v, friendly)}</td></tr>` : '';
  h += `<h4>병력 · 장비</h4><table class="tb"><tr><th></th><th style="text-align:right">현재</th><th style="text-align:right">편제</th></tr>
    ${row('off', '장교', i.off || 1)}${row('nco', '부사관', i.nco || 1)}${row('enl', '병사', i.enl || 1)}${row('pers', '<b>총원</b>', i.pers)}
    ${row('tanks', '전차', i.tanks)}${row('ifv', '장갑차', i.ifv)}${row('guns', '야포(포신)', i.guns)}${row('mlrs', '다연장로켓', i.mlrs)}
    ${(i.guns || i.mlrs) ? row('shells', '포탄·로켓', u.brigades.reduce((a, b) => a + b.initShells, 0)) : ''}
    <tr><td>보급 상태</td><td class="n" data-v="supply"></td><td></td></tr><tr><td>사기</td><td class="n" data-v="morale"></td><td></td></tr>
    <tr><td>전투력 지수</td><td class="n" data-v="power"></td><td></td></tr></table>`;
  if (!friendly) return h;
  if (!u.active) return h + `<div class="note" style="margin-top:10px;color:#ffd166">동원사단입니다. 전군 지시 패널의 '국가 총동원령' 후 약 5일 뒤 투입할 수 있습니다.</div>`;
  h += `<h4>${u.cat === 'div' ? '사단' : '부대'} 일괄 지시</h4>
  <div class="grid3">${Object.entries(POSTURE).map(([k, v]) => `<button class="btn ${k === 'attack' ? 'red' : ''}" data-uo="${k}">${v.label}</button>`).join('')}
  <select class="btn" id="uFire" title="포병 사격 강도">${FIRE_OPTS}</select></div>
  <div class="grid2" style="margin-top:6px"><button class="btn" id="tgtBtn">이동 목표 지정</button><button class="btn" id="tgtClr" ${u.target ? '' : 'disabled'}>목표 해제</button>
    ${special ? `<button class="btn pri" id="spBtn" data-k="${special[0]}" style="grid-column:span 2" ${u.pending ? 'disabled' : ''}>${u.pending ? '작전 준비 중…' : special[1]}</button>` : ''}</div>
  <h4>${u.cat === 'div' ? '예하 여단·직할대별 지시' : '예하 전력별 지시'}</h4>`;
  u.brigades.forEach((b, k) => {
    h += `<div class="brig"><div class="bn">${esc(b.name)}<span data-b="${k}"></span></div>
      <div class="bc"><select data-bo="${k}">${ORD_OPTS}</select>${(b.guns || b.mlrs) ? `<select data-bf="${k}">${FIRE_OPTS}</select>` : ''}</div><div class="eq" data-be="${k}"></div></div>`;
  });
  return h;
}
function bindCtx() {
  const el = $('#ctx');
  el.querySelectorAll('[data-all]').forEach(b => b.onclick = () => { const inc = $('#incHome').checked; CMD.allOrder(S, b.dataset.all, u => inc || (u.type !== 'home' && u.type !== 'mob')); pollLog(); renderCtx(true); });
  const af = $('#allFire'); if (af) { af.value = 'normal'; af.onchange = () => { CMD.allFire(S, af.value); pollLog(); }; }
  const cb = $('#cbBtn'); if (cb) cb.onclick = () => { CMD.toggleCB(S); pollLog(); renderCtx(true); };
  el.querySelectorAll('[data-air]').forEach(r => r.oninput = () => {
    const k = r.dataset.air, a = S.air.alloc; a[k] = +r.value;
    if (a.as + a.cas + a.int + a.str > 100) { const others = Object.keys(a).filter(x => x !== k); let over = a.as + a.cas + a.int + a.str - 100;
      for (const o of others) { const take = Math.min(a[o], Math.ceil(over / others.length / 5) * 5); a[o] -= take; over -= take; }
      for (const o of others) if (over > 0) { const take = Math.min(a[o], over); a[o] -= take; over -= take; } }
    el.querySelectorAll('[data-air]').forEach(x => x.value = a[x.dataset.air]);
    el.querySelectorAll('[data-airv]').forEach(x => x.textContent = a[x.dataset.airv] + '%');
  });
  el.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { const err = CMD[b.dataset.g](S); if (err) toast(err, false); pollLog(); renderCtx(true); });
  const sb = $('#surBtn'); if (sb) sb.onclick = () => { if (confirm('정말 항복하시겠습니까? 게임이 종료됩니다.')) { CMD.surrender(S); showEnd(); } };
  const lb = $('#lblBtn'); if (lb) lb.onclick = () => { lblMode = { all: 'own', own: 'zoom', zoom: 'none', none: 'all' }[lblMode]; renderCtx(true); };
  const ap = $('#apBtn'); if (ap) ap.onclick = () => { autoPause = !autoPause; renderCtx(true); };
  const ds = $('#desel'); if (ds) ds.onclick = () => { selected = null; renderCtx(true); };
  el.querySelectorAll('.gh').forEach(g => g.onclick = () => g.parentElement.classList.toggle('open'));
  el.querySelectorAll('[data-uid]').forEach(it => it.onclick = () => { const u = S.units.find(x => x.id === it.dataset.uid && x.alive); if (u) { selected = u; centerOn(u.lat, u.lon); renderCtx(true); } });
  const u = selected; if (!u) return;
  $('#closeU').onclick = () => { selected = null; renderCtx(true); };
  el.querySelectorAll('[data-uo]').forEach(b => b.onclick = () => { CMD.setUnitOrder(S, u, b.dataset.uo); renderCtx(true); });
  const uf = $('#uFire'); if (uf) { const f = u.brigades.find(b => b.guns || b.mlrs); uf.value = f ? f.fire : 'normal'; uf.onchange = () => { CMD.setUnitFire(S, u, uf.value); renderCtx(true); }; }
  el.querySelectorAll('[data-bo]').forEach(s => { const k = +s.dataset.bo; s.value = u.brigades[k].order; s.onchange = () => CMD.setBrigOrder(S, u, k, s.value); });
  el.querySelectorAll('[data-bf]').forEach(s => { const k = +s.dataset.bf; s.value = u.brigades[k].fire; s.onchange = () => CMD.setBrigFire(S, u, k, s.value); });
  const tb = $('#tgtBtn'); if (tb) tb.onclick = () => setMode({ type: 'target', unit: u, text: `${u.name}: 이동 목표 지점을 지도에서 클릭하십시오` });
  const tc = $('#tgtClr'); if (tc) tc.onclick = () => { CMD.clearTarget(S, u); renderCtx(true); };
  const sp = $('#spBtn'); if (sp) sp.onclick = () => setMode({ type: sp.dataset.k, unit: u, text: `${u.name}: ${sp.dataset.k === 'landing' ? '상륙 지점(해안)' : '작전 지점'}을 지도에서 클릭하십시오` });
}
let infilSig = '';
function updateCtxValues() {
  if (!S) return;
  const el = $('#ctx'), u = selected;
  if (!u) {
    el.querySelectorAll('[data-pp]').forEach(s => { const x = S.units.find(v => v.id === s.dataset.pp); if (x && x.active) s.textContent = Math.round(unitTotals(x).pers / x.init.pers * 100) + '%'; });
    const P = S.willP;
    if (P) el.querySelectorAll('[data-w]').forEach(c => {
      const k = c.dataset.w;
      if (k === 'note') { const sd = Math.max(0, dayOf(S) - S.lastProg); c.textContent = `전사 환산 누적 ${fmt(P.kiaEq)}명 · 마지막 전선 진전 후 ${sd}일 경과${sd > 7 ? ' (10일 초과 시 교착 감점)' : ''}${S.lastShock ? ` · 최근 충격: ${S.lastShock.why} ${S.lastShock.v > 0 ? '+' : ''}${S.lastShock.v}` : ''}`; return; }
      const v = P[k]; c.textContent = k === 'T' || k === 'base' ? v.toFixed(1) : (v >= 0 ? '+' : '') + v.toFixed(1);
      c.style.color = k === 'T' || k === 'base' ? '' : v > 0.05 ? '#8fe3a1' : v < -0.05 ? '#ff8a80' : '#7d93a8';
    });
    const il = $('#infilList');
    if (il) {
      const list = S.units.filter(x => x.alive && x.infil), sig = list.map(x => x.id).join(',');
      if (sig !== infilSig || !il.children.length) {
        infilSig = sig;
        il.innerHTML = list.length ? list.map(x => `<div class="it" data-iid="${x.id}">${esc(x.name)} — ${esc(nearestCity(x.lat, x.lon))} 일대<span>${fmt(unitTotals(x).pers)}명</span></div>`).join('') : '<div class="note">현재 확인된 침투조 없음</div>';
        il.querySelectorAll('[data-iid]').forEach(it => it.onclick = () => { const x = S.units.find(v => v.id === it.dataset.iid && v.alive); if (x) { selected = x; centerOn(x.lat, x.lon); renderCtx(true); } });
      }
    }
    return;
  }
  if (!u.alive) return;
  const friendly = SIDE_OF[u.side] === 1, t = unitTotals(u);
  const set = (k, v) => { const e = el.querySelector(`[data-v="${k}"]`); if (e) e.textContent = v; };
  for (const k of ['off', 'nco', 'enl', 'pers', 'tanks', 'ifv', 'guns', 'mlrs', 'shells']) set(k, fmtE(t[k], friendly));
  set('supply', Math.round(u.supply) + '%'); set('morale', Math.round(u.morale) + '%');
  const c = u.c || computeUnit(S, u);
  set('power', friendly ? (c.fight + c.fire).toFixed(1) : '약 ' + Math.round(c.fight + c.fire));
  const st = [];
  if (!u.active) st.push('미동원'); if (u.pending) st.push('작전 준비 중'); if (u.status) st.push(u.status);
  if (u.engaged > 3 && u.nearD < 24) st.push('교전 중'); else if (c.fireOn) st.push('포격전');
  if (u.supply < 40) st.push('보급 부족'); if (u.target) st.push('이동 중');
  if (friendly) st.push('자세: ' + POSTURE[u.brigades.reduce((a, b) => bPers(b) > bPers(a) ? b : a).order].label);
  set('state', st.join(' · '));
  u.brigades.forEach((b, k) => {
    const e = el.querySelector(`[data-b="${k}"]`); if (e) e.textContent = `${fmt(bPers(b))} / ${fmt(b.init)}`;
    const q = el.querySelector(`[data-be="${k}"]`);
    if (q) q.textContent = [`장교 ${fmt(b.off)}`, `부사관 ${fmt(b.nco)}`, `병사 ${fmt(b.enl)}`, b.tanks >= 0.5 ? `전차 ${fmt(b.tanks)}` : '', b.ifv >= 0.5 ? `장갑차 ${fmt(b.ifv)}` : '',
      b.guns >= 0.5 ? `야포 ${fmt(b.guns)}` : '', b.mlrs >= 0.5 ? `다연장 ${fmt(b.mlrs)}` : '', (b.guns || b.mlrs) ? `포탄 ${fmt(b.shells)}` : ''].filter(Boolean).join(' · ');
  });
}
$('#zin').onclick = () => { const r = canvas.getBoundingClientRect(); zoomAt(1.4, r.width / 2, r.height / 2); };
$('#zout').onclick = () => { const r = canvas.getBoundingClientRect(); zoomAt(1 / 1.4, r.width / 2, r.height / 2); };
$('#zfit').onclick = () => fitView();
