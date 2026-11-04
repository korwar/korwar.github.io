/* =====================================================================
 *  MENU : 메인 화면 · 명예의 전당 · 게임 안내 · 설정 · 프롤로그 · 종료 처리
 * ===================================================================== */
const screens = { menu: $('#menu'), app: $('#app') };
function show(name) { screens.menu.style.display = name === 'menu' ? 'flex' : 'none'; screens.app.style.display = name === 'app' ? 'flex' : 'none'; if (name === 'app') fitView(); }
(function menuArt() {
  const P = p => `${((p[1] - 124) * 0.79 * 60).toFixed(1)},${((43.3 - p[0]) * 60).toFixed(1)}`;
  const poly = KOREA_POLY.map(P).join(' ');
  const mdl = MDL.slice(1, -1).map(p => P([p[1], p[0]])).join(' ');
  const cities = CITIES.filter(c => c[3]).map(c => { const [x, y] = P([c[1], c[2]]).split(','); return `<circle cx="${x}" cy="${y}" r="3" fill="#ffd34d"/>`; }).join('');
  $('#menuArt').innerHTML = `<svg viewBox="-20 -10 360 640" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c43434" stop-opacity=".22"/><stop offset=".47" stop-color="#c43434" stop-opacity=".22"/>
    <stop offset=".47" stop-color="#3070cd" stop-opacity=".28"/><stop offset="1" stop-color="#3070cd" stop-opacity=".28"/></linearGradient></defs>
    <polygon points="${poly}" fill="url(#mg)" stroke="#9fb3c8" stroke-opacity=".45" stroke-width="1.2"/>
    <polyline points="${mdl}" fill="none" stroke="#ffd34d" stroke-width="2" stroke-dasharray="6 4" opacity=".8"/>${cities}</svg>`;
})();
let rankState = { cat: 'score', board: 'all', entries: [] };
function renderRankTabs() {
  $('#rankCats').innerHTML = RANK_CATS.map(c => `<button class="chip ${c.key === rankState.cat ? 'sel' : ''}" data-cat="${c.key}" title="${esc(c.desc)}">${esc(c.name)}</button>`).join('');
  $('#rankBoards').innerHTML = [['all', '전체'], ['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']]
    .map(([k, n]) => `<button class="chip sm ${k === rankState.board ? 'sel' : ''}" data-board="${k}">${n}</button>`).join('');
  document.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { rankState.cat = b.dataset.cat; renderRankTabs(); renderRankTable(); });
  document.querySelectorAll('[data-board]').forEach(b => b.onclick = () => { rankState.board = b.dataset.board; renderRankTabs(); renderRankTable(); });
}
function renderRankTable() {
  const cat = RANK_CATS.find(c => c.key === rankState.cat), field = cat.field || cat.key;
  const top = rankTop(rankState.entries, cat.key, rankState.board);
  $('#rankDesc').textContent = cat.desc;
  $('#rankBody').innerHTML = top.length ? top.map((e, i) => `<tr class="${i < 3 ? 'top' + (i + 1) : ''}">
      <td class="rk">${i + 1}</td><td class="nk">${esc(e.nick)} <span class="ip">(${esc(e.ip)})</span></td>
      <td class="val">${cat.fmt(e[field])}</td><td><span class="dtag ${esc(e.diff)}">${DIFF_NAME[e.diff] || ''}</span></td>
      <td class="dt">${new Date(e.t).toLocaleDateString('ko-KR')}</td></tr>`).join('')
    : `<tr><td colspan="5" class="empty">아직 등록된 승전 기록이 없습니다.<br>첫 번째 통일의 주인공이 되십시오.</td></tr>`;
}
async function loadRankings() {
  $('#rankMode').textContent = '사령부와 교신 중…';
  rankState.entries = await Api.rankings();
  $('#rankMode').innerHTML = Api.mode === 'server' ? '<span class="dot on"></span>서버 연결 · 전체 지휘관 기록' : '<span class="dot"></span>오프라인 모드 · 이 브라우저의 기록만 표시';
  renderRankTabs(); renderRankTable();
}
function openMenu() { clearGame(); show('menu'); loadRankings(); }
$('#mStart').onclick = () => { show('app'); clearGame(); if (SETTINGS.prologue === 'skip') showBriefing(); else runPrologue(showBriefing); };
$('#mGuide').onclick = () => openModal('guide');
$('#mSettings').onclick = () => { fillSettings(); openModal('settings'); };
$('#mCredits').onclick = () => openModal('credits');
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('.modal').style.display = 'none');
document.querySelectorAll('#guideTabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#guideTabs button').forEach(x => x.classList.toggle('sel', x === b));
  document.querySelectorAll('.gpage').forEach(p => p.style.display = p.dataset.page === b.dataset.page ? 'block' : 'none');
});
$('#rankRules').innerHTML = RANK_CATS.map(c => `<li><b>${esc(c.name)}</b> — ${esc(c.desc)}</li>`).join('');
function fillSettings() { $('#setPrologue').value = SETTINGS.prologue; $('#setSpeed').value = SETTINGS.speed; $('#setLabels').value = SETTINGS.labels; $('#setAutoPause').checked = SETTINGS.autoPause; }
$('#setSave').onclick = () => {
  SETTINGS.prologue = $('#setPrologue').value; SETTINGS.speed = +$('#setSpeed').value; SETTINGS.labels = $('#setLabels').value; SETTINGS.autoPause = $('#setAutoPause').checked;
  lsSet(LS.settings, SETTINGS); lblMode = SETTINGS.labels; autoPause = SETTINGS.autoPause;
  $('#settings').style.display = 'none';
};
let prologueTimer = [];
function prologueLines() {
  return [
    `${new Date().getFullYear()}년, 서울 용산. 합동참모본부.`,
    '합참 작전본부장으로서 전군의 작전을 총괄해 온 당신은\n대장 진급과 함께 합동참모의장에 취임한다.',
    '그러나 취임식의 박수 소리가 채 가라앉기도 전에\n정보본부의 긴급 보고가 집무실로 올라온다.',
    '북한군 전방 군단의 대규모 기동.\n개방되는 장사정포 갱도 진지.\n평양-원산선 이북 예비 전력의 남하.',
    '북한은 이미 전면전 준비에 돌입해 있었다.',
    '휴전선 일대에서는 한 달에 한 번 꼴로\n크고 작은 국지 교전이 이어지고 있었다.',
    '정부는 현 사태를 국가 존립의 위기로 규정했다.',
    '한미 양국은 긴급 협의를 거쳐\n마침내 하나의 결론에 이른다.',
    '북한과의 개전.\n그리고 대한민국에 의한 한반도 통일.',
    '이제 국군의 모든 부대가\n당신의 지시를 기다리고 있다.',
    '의장님, 명령을 내려 주십시오.'];
}
function runPrologue(done) {
  const P = $('#prologue'), T = P.querySelector('.txt');
  P.style.display = 'flex'; T.classList.remove('show'); T.textContent = '';
  prologueTimer.forEach(clearTimeout); prologueTimer = [];
  let t = 600;
  prologueLines().forEach(line => {
    prologueTimer.push(setTimeout(() => { T.textContent = line; T.classList.add('show'); }, t));
    const hold = 2600 + line.length * 35;
    prologueTimer.push(setTimeout(() => T.classList.remove('show'), t + 1400 + hold));
    t += 1400 + hold + 1500;
  });
  prologueTimer.push(setTimeout(finish, t));
  function finish() { prologueTimer.forEach(clearTimeout); prologueTimer = []; P.style.display = 'none'; done(); }
  $('#skipBtn').onclick = finish;
}
function showBriefing() {
  const m = $('#brief'); m.style.display = 'flex';
  m.querySelectorAll('[data-diff]').forEach(b => b.onclick = async () => { m.style.display = 'none'; await startNew(b.dataset.diff); });
  $('#briefBack').onclick = () => { m.style.display = 'none'; openMenu(); };
}
$('#helpBtn').onclick = () => { openModal('help'); paused = true; updateSpeedBtns(); };
$('#toMenuBtn').onclick = () => {
  if (S && !S.over && !confirm('작전을 중단하고 메인 화면으로 돌아가시겠습니까?\n진행 중인 전쟁 기록은 랭킹에 등록되지 않습니다.')) return;
  if (S && !S.over) Api.abort(makeReport(S, 'abort'));
  openMenu();
};
window.addEventListener('pagehide', () => { if (S && !S.over && S.hour >= 72) Api.abort(makeReport(S, 'abort')); });

let endShown = false;
const rankFormHTML = $('#rankForm').innerHTML;
async function showEnd() {
  if (!S || !S.over || endShown) return; endShown = true; paused = true; updateSpeedBtns();
  const o = S.over, e = $('#end'), st = S.stats;
  e.className = o.result; e.style.display = 'flex';
  e.querySelector('h1').textContent = o.title;
  e.querySelector('p').textContent = o.msg;
  e.querySelector('.stats').innerHTML = `
    <div>작전 기간<b>${o.stats.day}일</b></div><div>전쟁 직접비용<b>${o.stats.cost.toFixed(1)}조 원</b></div>
    <div>국군 사상자<b>${fmt(o.stats.cas)}명</b></div><div>국군 전사자<b>${fmt(st.rok.kia)}명</b></div>
    <div>민간인 피해<b>${fmt(st.civ)}명</b></div><div>북한군 포로<b>${fmt(st.kpaPOW)}명</b></div>
    <div>중국군 개입<b>${S.chinaIn ? (S.chinaOut ? '개입 후 철수' : '개입') : '없음'}</b></div><div>최종 국민 지지도<b>${Math.max(0, S.will).toFixed(0)}</b></div>`;
  $('#learnBox').textContent = '전쟁 기록을 사령부로 전송하는 중…';
  $('#rankForm').style.display = 'none';
  const report = makeReport(S);
  const sr = sanitizeReport(JSON.parse(JSON.stringify(report)));
  $('#endScore').textContent = o.result === 'win' && sr ? `종합 전공 점수 ${makeEntry(sr).score.toLocaleString('ko-KR')}점` : '';
  const r = await Api.end(report), L = r.learn;
  $('#learnBox').innerHTML = L ? `북한군이 이번 전쟁을 분석해 <b>${r.offline ? '이 브라우저의' : '전체'} 북한군 교리</b>에 반영했습니다.<br>
    ${L.topSector ? `이번 전쟁의 국군 주공 축선: ${L.topSector}` : '국군 주공 축선 정보 부족'} · 상륙 ${L.landings}회 · 공중작전 ${L.airOps}회 기록`
    : r.error ? `기록 전송 실패: ${esc(r.error)}` : r.rejected ? '비정상적인 기록으로 판단되어 교리·랭킹에 반영되지 않았습니다.' : '작전 기간이 3일 미만이라 북한군 교리에 반영되지 않았습니다.';
  if (r.qualifies && r.qualifies.length) {
    $('#rankForm').style.display = 'block';
    $('#rankCatsWon').textContent = r.qualifies.join(' · ');
    $('#ipPrefix').textContent = r.ipPrefix || '-.-';
    setTimeout(() => $('#nickInput').focus(), 50);
  }
}
function bindRankForm() {
  const inp = $('#nickInput'), btn = $('#nickSubmit');
  inp.oninput = () => { const v = inp.value, err = v ? nicknameError(v, Api.banned) : ''; $('#nickErr').textContent = err || ''; $('#nickPreview').textContent = v.trim() && !err ? `표시: ${v.trim()} (${$('#ipPrefix').textContent})` : ''; };
  inp.onkeydown = e => { if (e.key === 'Enter') btn.click(); };
  btn.onclick = async () => {
    const v = inp.value, err = nicknameError(v, Api.banned);
    if (err) { $('#nickErr').textContent = err; return; }
    btn.disabled = true;
    try { const e = await Api.submit(v); $('#rankForm').innerHTML = `<div class="ok">명예의 전당에 등록되었습니다 — <b>${esc(e.nick)} (${esc(e.ip)})</b></div>`; }
    catch (ex) { $('#nickErr').textContent = ex.message; btn.disabled = false; }
  };
}
function resetEnd() { $('#end').style.display = 'none'; $('#rankForm').innerHTML = rankFormHTML; bindRankForm(); }
bindRankForm();
$('#againBtn').onclick = () => { resetEnd(); clearGame(); if (SETTINGS.prologue === 'skip') showBriefing(); else runPrologue(showBriefing); };
$('#endMenuBtn').onclick = () => { resetEnd(); openMenu(); };
requestAnimationFrame(loop);
openMenu();
