/* =====================================================================
 *  MENU : 메인 화면 · 명예의 전당 · 게임 안내 · 설정 · 프롤로그 · 엔딩 · 종료 처리
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
$('#mStart').onclick = () => { show('app'); clearGame(); if (SETTINGS.prologue === 'skip') showBriefing(); else runSequence(prologueLines(), showBriefing); };
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

/* ---------- 검은 화면 + 흰 글자 페이드 연출 (프롤로그·엔딩 공용) ---------- */
let seqTimer = [];
function runSequence(lines, done) {
  const P = $('#prologue'), T = P.querySelector('.txt');
  P.style.display = 'flex'; T.classList.remove('show'); T.textContent = '';
  seqTimer.forEach(clearTimeout); seqTimer = [];
  let t = 600;
  lines.forEach(line => {
    seqTimer.push(setTimeout(() => { T.textContent = line; T.classList.add('show'); }, t));
    const hold = 2600 + line.length * 35;
    seqTimer.push(setTimeout(() => T.classList.remove('show'), t + 1400 + hold));
    t += 1400 + hold + 1500;
  });
  seqTimer.push(setTimeout(finish, t));
  let finished = false;
  function finish() { if (finished) return; finished = true; seqTimer.forEach(clearTimeout); seqTimer = []; P.style.display = 'none'; done(); }
  $('#skipBtn').onclick = finish;
}
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
    '의장님, 명령을 내려 주십시오.',
    '제2차 한국전쟁'];
}
/* ---------- 시나리오별 엔딩 ---------- */
function endingLines(S) {
  const o = S.over, st = S.stats, d = o.stats.day;
  const cas = fmt(st.rok.kia + st.rok.wia + st.rok.mia), kia = fmt(st.rok.kia), civ = fmt(st.civ), pow = fmt(st.kpaPOW);
  const yearsSince50 = new Date().getFullYear() - 1950;
  const china = S.chinaIn, wmdHit = S.wmdHits > 0;
  const E = {
    win_clean: [
      `개전 ${d}일째. 압록강 하구, 신의주.`,
      '국군 선두 부대가 강변에 닿았다.\n강 건너편에서는 아무것도 움직이지 않았다.',
      '평양의 지도부는 이미 자취를 감추었고,\n마지막까지 버티던 부대들도 무기를 내려놓았다.',
      `포로 ${pow}명. 국군 사상자 ${cas}명.\n그 희생 위에서 전쟁은 끝났다.`,
      '휴전선의 철조망이 걷히던 날,\n일흔 해 넘게 닫혀 있던 길이 다시 이어졌다.',
      '분단 이후 처음으로,\n한반도 전역에 하나의 깃발이 올랐다.',
      '이제 더 어려운 일이 시작된다.\n하나 된 나라를 다시 세우는 일.',
      '합동참모의장의 임무는 여기까지다.',
      '제2차 한국전쟁 — 종결'],
    win_china: [
      `개전 ${d}일째.`,
      '압록강을 건너왔던 중국군의 마지막 제대가\n국경 너머로 물러났다.',
      '두 개의 군대를 상대한 전쟁이었다.\n누구도 이 결말을 장담하지 못했다.',
      '베이징과 워싱턴, 그리고 서울 사이에서\n밤샘 협상이 이어졌다.',
      '그리고 마침내,\n국경선은 다시 압록강과 두만강이 되었다.',
      `국군 전사자 ${kia}명.\n그들의 이름은 국경의 비석에 새겨졌다.`,
      '통일은 이루어졌다.\n그러나 강 건너의 긴장은 쉽게 사라지지 않을 것이다.',
      '제2차 한국전쟁 — 종결'],
    win_pyrrhic: [
      `개전 ${d}일째. 전선은 마침내 국경에 닿았다.`,
      '그러나 서울의 광장에는\n환호 대신 침묵이 흘렀다.',
      `국군 사상자 ${cas}명.\n민간인 피해 ${civ}명.`,
      wmdHit ? '대량살상무기가 남긴 상처는\n전쟁이 끝난 뒤에도 아물지 않았다.' : '포성이 멎은 도시마다\n돌아오지 못한 이들의 사진이 내걸렸다.',
      '국회는 전쟁 지휘에 대한 청문회를 예고했고,\n합동참모의장은 증언대에 서게 되었다.',
      '한반도는 하나가 되었다.\n그 대가가 얼마였는지는, 역사가 판단할 것이다.',
      '제2차 한국전쟁 — 상처뿐인 통일'],
    lose_will: [
      `개전 ${d}일째.`,
      '광장마다 전쟁 중단을 요구하는 촛불이 가득했다.',
      '국회는 추가 전쟁 예산안을 부결했고,\n정부는 휴전 협상 개시를 발표했다.',
      china ? '중국은 중재자를 자처하며\n협상 테이블에 앉았다.' : '판문점에서\n다시 협상이 시작되었다.',
      '전선은 그 자리에서 멈췄다.\n또 하나의 군사분계선이 그어졌다.',
      `국군 사상자 ${cas}명.\n그들이 지킨 땅은, 다시 둘로 나뉘었다.`,
      '합동참모의장은 사의를 표명했다.',
      '통일은 다시, 다음 세대의 몫으로 남았다.',
      '제2차 한국전쟁 — 휴전'],
    lose_front: [
      `개전 ${d}일째. 부산.`,
      '최후 방어선이 무너졌다.',
      '남은 부대들은 항구로 물러나며\n피란민의 철수를 엄호했다.',
      '정부는 제주로 옮겨 갔고,\n동맹국 함대가 밤새 사람들을 실어 날랐다.',
      `${yearsSince50}년 전 여름의 기억이\n다시 이 땅에 되살아났다.`,
      '그러나 이번에는,\n인천의 반격은 오지 않았다.',
      '제2차 한국전쟁 — 패전'],
    lose_surrender: [
      `개전 ${d}일째. 대통령 집무실.`,
      '합동참모의장은 마지막 보고를 올렸다.\n"더 이상의 희생은 의미가 없습니다."',
      '정부는 전 전선에 사격 중지를 명령했다.',
      '총성이 멎은 전선 위로\n조용한 비가 내렸다.',
      `국군 사상자 ${cas}명. 민간인 피해 ${civ}명.\n숫자는 거기서 멈췄다.`,
      '이 결정이 옳았는지는\n누구도 쉽게 말할 수 없을 것이다.',
      '제2차 한국전쟁 — 정전'],
  };
  return E[o.ending] || E.lose_will;
}
const END_SUBTEXT = {
  win_clean: '분단 이후 처음으로 한반도 전역이 하나의 정부 아래 놓였습니다.',
  win_china: '중국군의 개입을 이겨내고 압록강·두만강까지 전선을 밀어 올렸습니다.',
  win_pyrrhic: '통일은 이루었지만, 막대한 희생과 무너진 민심이 남았습니다.',
  lose_will: '누적된 피해로 국민적 지지가 붕괴해 정부가 휴전을 결정했습니다.',
  lose_front: '국군의 최후 방어선이 무너졌습니다.',
  lose_surrender: '정부는 전 전선에 사격 중지를 명령하고 전쟁 중단을 선언했습니다.',
};
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

/* ---------- 종료: 엔딩 연출 → 결과 화면 ---------- */
let endShown = false;
const rankFormHTML = $('#rankForm').innerHTML;
function showEnd() {
  if (!S || !S.over || endShown) return; endShown = true; paused = true; updateSpeedBtns(); setDanger(null);
  const report = makeReport(S);
  const resultP = Api.end(report);                 // 엔딩이 흐르는 동안 서버 전송
  runSequence(endingLines(S), () => showResult(report, resultP));
}
async function showResult(report, resultP) {
  const o = S.over, e = $('#end'), st = S.stats;
  e.className = o.result; e.style.display = 'flex';
  e.querySelector('h1').textContent = o.title;
  e.querySelector('p').textContent = END_SUBTEXT[o.ending] || '';
  e.querySelector('.stats').innerHTML = `
    <div>작전 기간<b>${o.stats.day}일</b></div><div>전쟁 직접비용<b>${o.stats.cost.toFixed(1)}조 원</b></div>
    <div>국군 사상자<b>${fmt(o.stats.cas)}명</b></div><div>국군 전사자<b>${fmt(st.rok.kia)}명</b></div>
    <div>민간인 피해<b>${fmt(st.civ)}명</b></div><div>북한군 포로<b>${fmt(st.kpaPOW)}명</b></div>
    <div>중국군 개입<b>${S.chinaIn ? (S.chinaOut ? '개입 후 철수' : '개입') : '없음'}</b></div><div>최종 국민 지지도<b>${Math.max(0, S.will).toFixed(0)}</b></div>`;
  $('#learnBox').textContent = '전쟁 기록을 사령부로 전송하는 중…';
  $('#rankForm').style.display = 'none';
  const sr = sanitizeReport(JSON.parse(JSON.stringify(report)));
  $('#endScore').textContent = o.result === 'win' && sr ? `종합 전공 점수 ${makeEntry(sr).score.toLocaleString('ko-KR')}점` : '';
  const r = await resultP, L = r.learn;
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
$('#againBtn').onclick = () => { resetEnd(); clearGame(); if (SETTINGS.prologue === 'skip') showBriefing(); else runSequence(prologueLines(), showBriefing); };
$('#endMenuBtn').onclick = () => { resetEnd(); openMenu(); };
requestAnimationFrame(loop);
openMenu();
