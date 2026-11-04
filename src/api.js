/* =====================================================================
 *  API : Oracle 서버(API) 연동
 *  - API 주소는 빌드 시 window.JCS_API_BASE 로 주입됩니다 (GitHub 저장소 변수 API_BASE).
 *  - 서버에 연결할 수 없으면 이 브라우저에만 저장하는 오프라인 모드로 자동 전환합니다.
 * ===================================================================== */
const LOCAL_BANNED = parseBanned((document.getElementById('bannedWords') || {}).textContent || '');
const LS = { brain: 'jcs_brain_offline_v3', rank: 'jcs_rank_offline_v1', settings: 'jcs_settings_v1' };
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
const API_BASE = (new URLSearchParams(location.search).get('api') || window.JCS_API_BASE || '').trim().replace(/\/+$/, '');
async function httpJson(method, path, body) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(API_BASE + path, { method, signal: ctl.signal, headers: body ? { 'Content-Type': 'text/plain;charset=UTF-8' } : {}, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || ('HTTP ' + r.status)); e.server = true; throw e; }
    return j;
  } finally { clearTimeout(timer); }
}
const Api = {
  mode: 'offline', token: null, banned: LOCAL_BANNED, pending: null, ready: null,
  init() {
    if (!API_BASE) return (this.ready = Promise.resolve());
    return (this.ready = httpJson('GET', '/api/config').then(r => { this.mode = 'server'; this.banned = (r.banned || []).concat(LOCAL_BANNED); })
      .catch(e => console.warn('API 서버 연결 실패 — 오프라인 모드', e)));
  },
  async start(diff) {
    this.token = null; this.pending = null;
    await this.ready;
    if (this.mode === 'server') {
      try { const r = await httpJson('POST', '/api/game/start', { diff }); this.token = r.token; return r.brain; }
      catch (e) { console.warn('서버 연결 실패 — 오프라인 모드로 진행', e); }
    }
    return lsGet(LS.brain, null) || brainNew();
  },
  async end(report) {
    if (this.token) {
      try { return await httpJson('POST', '/api/game/end', { token: this.token, report }); }
      catch (e) { return { learn: null, qualifies: [], error: e.server ? e.message : '서버에 연결할 수 없습니다.' }; }
    }
    const r = sanitizeReport(JSON.parse(JSON.stringify(report)));
    let learn = null, qualifies = [];
    if (r && r.day >= 3) { const b = lsGet(LS.brain, null) || brainNew(); learn = brainLearnReport(b, r); lsSet(LS.brain, b); }
    if (r && r.result === 'win') { const e = makeEntry(r); qualifies = rankQualify(lsGet(LS.rank, []), e); if (qualifies.length) this.pending = e; }
    return { learn, qualifies, ipPrefix: '로컬', offline: true };
  },
  async submit(nick) {
    const err = nicknameError(nick, this.banned); if (err) throw new Error(err);
    if (this.token) return (await httpJson('POST', '/api/rank/submit', { token: this.token, nickname: nick })).entry;
    if (!this.pending) throw new Error('등록할 수 있는 기록이 없습니다.');
    const e = Object.assign({}, this.pending, { nick: nick.trim(), ip: '로컬' }); this.pending = null;
    lsSet(LS.rank, rankPrune(lsGet(LS.rank, []).concat([e]))); return e;
  },
  async rankings() {
    await this.ready;
    if (this.mode === 'server') { try { return (await httpJson('GET', '/api/rankings')).entries; } catch (e) { } }
    return lsGet(LS.rank, []);
  },
  abort(report) {
    if (this.token) {
      const body = JSON.stringify({ token: this.token, report }), url = API_BASE + '/api/game/end';
      if (!(navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }))))
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body, keepalive: true }).catch(() => { });
      this.token = null; return;
    }
    const r = sanitizeReport(JSON.parse(JSON.stringify(report)));
    if (r && r.day >= 3) { const b = lsGet(LS.brain, null) || brainNew(); brainLearnReport(b, r); lsSet(LS.brain, b); }
  },
};
Api.init();
