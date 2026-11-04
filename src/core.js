/* =====================================================================
 *  CORE : 시뮬레이션 엔진 + 국민 지지도 모델 + 종전 판정 (DOM 비의존)
 *  북한군 학습 로직은 shared/brain.js (서버와 공용)
 * ===================================================================== */
const GRID = { lat0: 33.0, lat1: 43.1, lon0: 124.2, lon1: 130.8, res: 0.05 };
const NX = Math.round((GRID.lon1 - GRID.lon0) / GRID.res);
const NY = Math.round((GRID.lat1 - GRID.lat0) / GRID.res);
const NCELL = NX * NY;
const KMLAT = 111, KMLON = 111 * 0.79;
const SECTOR_NAME = BRAIN_SECTOR_NAME;
const SIDE_OF = { ROK: 1, US: 1, KPA: 2, PLA: 2 };
const POSTURE = {
  attack:  { off: 1.0, def: 0.7, fight: 1.0, aggr: 1.0,  loss: 1.0, label: '공격' },
  defend:  { off: 0,   def: 1.5, fight: 1.4, aggr: 0.35, loss: 0.6, label: '방어' },
  delay:   { off: 0,   def: 1.0, fight: 1.0, aggr: 0.3,  loss: 0.8, label: '지연전' },
  retreat: { off: 0,   def: 0.3, fight: 0.4, aggr: 0.1,  loss: 1.3, label: '후퇴' },
  reserve: { off: 0,   def: 0.5, fight: 0.6, aggr: 0.05, loss: 0.8, label: '예비·정비' },
};
const FIRE = { max: { m: 1.8, r: 4, label: '최대 화력' }, normal: { m: 1, r: 1.5, label: '보통' },
  conserve: { m: 0.5, r: 0.5, label: '탄약 절약' }, stop: { m: 0, r: 0, label: '사격 중지' } };
const SIDEQ = { ROK: 1.0, US: 1.25, KPA: 0.70, PLA: 1.0 };
const TANKV = { ROK: 4, US: 5, KPA: 1.7, PLA: 3.8 };
const IFVV = { ROK: 0.012, US: 0.015, KPA: 0.006, PLA: 0.011 };
const ARTQ = { ROK: 1, US: 1.2, KPA: 0.5, PLA: 0.85 };
const KINDQ = { inf: 1, mech: 1.05, armor: 1, air: 1.05, arty: 0.3, hq: 0.5, sof: 1.8, marine: 1.1 };
const SPEED = { inf: 1.4, mech: 2.5, armor: 2.5, rapid: 2.2, home: 1.0, mob: 1.0, sof: 1.6, marine: 1.6, arty: 1.6,
  pla: 1.8, kinf: 1.0, kmech: 1.8, karty: 0.9, ksof: 1.5 };
const MOB = { mech: 2, armor: 2, rapid: 1.6, pla: 1.4, kmech: 1.6 };
const COST = { tank: 0.009, ifv: 0.004, gun: 0.005, shell: 0.000004, rocket: 0.00003, day: 0.45 };
const DIFF = {
  easy:   { mul: 0.92, sofPool: 50000, kres: 10, offDay: 5, startOff: 0,  chinaMul: 1.0 },
  normal: { mul: 0.98, sofPool: 70000, kres: 14, offDay: 3, startOff: 0,  chinaMul: 1.25 },
  hard:   { mul: 1.06, sofPool: 90000, kres: 18, offDay: 0, startOff: 14, chinaMul: 1.5 },
};
/* 위험·패배 판정 기준 */
const DANGER = { will: 5, willWarn: 15, land: 0.10, southLost: 0.30, wmd: 90 };
const LOSE_LAND = 0.05;   // 한반도 전체 육지 중 국군 통제 비율이 이 값 미만이면 전선 붕괴(패전)

function cellOf(lat, lon) {
  const i = Math.floor((lon - GRID.lon0) / GRID.res), j = Math.floor((lat - GRID.lat0) / GRID.res);
  if (i < 0 || j < 0 || i >= NX || j >= NY) return -1;
  return j * NX + i;
}
function cellLL(c) { const i = c % NX, j = (c / NX) | 0; return [GRID.lat0 + (j + 0.5) * GRID.res, GRID.lon0 + (i + 0.5) * GRID.res]; }
function km(a1, o1, a2, o2) { const dy = (a1 - a2) * KMLAT, dx = (o1 - o2) * KMLON; return Math.sqrt(dx * dx + dy * dy); }
function pip(lat, lon, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][0], xi = poly[i][1], yj = poly[j][0], xj = poly[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) ins = !ins;
  }
  return ins;
}
function mdlLat(lon) {
  for (let k = 0; k < MDL.length - 1; k++) { const [x1, y1] = MDL[k], [x2, y2] = MDL[k + 1]; if (lon >= x1 && lon <= x2) return y1 + (y2 - y1) * (lon - x1) / (x2 - x1); }
  return 38.6;
}
function sectorOf(lon) { return lon < 126.8 ? 0 : lon < 127.8 ? 1 : 2; }
const SECTOR_REAR = [[38.45, 126.20], [38.60, 127.30], [38.70, 128.00]];
function isMountain(lat, lon) {
  if (lon > 127.55 && lat > 36.6 && lat < 38.95) return true;
  if (lat > 35.2 && lat < 36.9 && lon > 127.5 && lon < 128.6) return true;
  if (lat > 39.3 && lon > 125.9 && lon < 129.2) return true;
  return lat > 40.4;
}
const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const NB8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function nbrs(c, set) {
  const i = c % NX, j = (c / NX) | 0, out = [];
  for (const [di, dj] of set) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < NX && b < NY) out.push(b * NX + a); }
  return out;
}
function nearestCity(lat, lon) { let b = null, bd = 1e9; for (const c of CITIES) { const d = km(lat, lon, c[1], c[2]); if (d < bd) { bd = d; b = c[0]; } } return b; }

function applyKnowledge(S) {
  const K = S.K; if (!K) return;
  const msgs = [], sum = K.sector[0] + K.sector[1] + K.sector[2];
  if (sum > 0.2) {
    const top = [0, 1, 2].sort((a, b) => K.sector[b] - K.sector[a])[0], w = K.sector[top] / sum;
    if (w > 0.4) {
      const mech = S.units.filter(u => u.side === 'KPA' && u.type === 'kmech' && u.reserve)
        .sort((a, b) => km(a.lat, a.lon, ...SECTOR_REAR[top]) - km(b.lat, b.lon, ...SECTOR_REAR[top]));
      const n = w > 0.6 ? 3 : 2;
      mech.slice(0, n).forEach((u, i) => { u.aiTarget = [SECTOR_REAR[top][0] + 0.12 * i, SECTOR_REAR[top][1] + (i - 1) * 0.15]; });
      msgs.push(`${SECTOR_NAME[top]}에 기계화 예비대 ${Math.min(n, mech.length)}개 사전 배치`);
    }
  }
  S.beachDef = [];
  const reserves = S.units.filter(u => u.side === 'KPA' && u.type === 'kinf' && u.reserve && !/91수도/.test(u.parent));
  for (const l of K.landings.slice(0, 3)) {
    if (l[2] < 0.6) continue;
    S.beachDef.push(l);
    const r = reserves.filter(u => !u.aiTarget).sort((a, b) => km(a.lat, a.lon, l[0], l[1]) - km(b.lat, b.lon, l[0], l[1]))[0];
    if (r) { r.aiTarget = [l[0], l[1]]; r.garrison = true; }
    msgs.push(`${nearestCity(l[0], l[1])} 해안 방어 강화`);
  }
  S.rearSec = Math.min(0.15, K.airOps * 0.04);
  if (S.rearSec > 0.03) msgs.push('후방 공정 대비 경계 강화');
  if (msgs.length) log(S, `[정보 판단] 북한군이 과거 전쟁의 교훈을 반영한 것으로 보입니다 — ${msgs.join(', ')}.`, 'warn');
}

/* 국민 지지도: 매일 목표 지지도(T)로 12%씩 수렴, 돌발 사건은 즉시 충격 */
const WILL_RATE = 0.12;
function willTarget(S, capFrac, lostFrac) {
  const st = S.stats, day = dayOf(S);
  const kiaEq = st.rok.kia + st.rok.mia * 0.7 + st.rok.wia * 0.25 + (st.us.kia + st.us.mia * 0.7 + st.us.wia * 0.25) * 0.3;
  if (capFrac > S.bestCap + 0.01) { S.bestCap = capFrac; S.lastProg = day; }
  const P = {
    base: 68, rally: 12 * Math.exp(-day / 25),
    cas: -11 * Math.log10(1 + kiaEq / 1000), civ: -6 * Math.log10(1 + st.civ / 2000),
    prog: 32 * capFrac + (S.flags.pyongyang ? 8 : 0),
    stall: -Math.min(25, Math.max(0, day - S.lastProg - 10) * 0.6),
    fatigue: -Math.min(15, Math.max(0, day - 45) * 0.12),
    lost: -90 * lostFrac - (S.flags.seoulLost ? 25 : 0),
    ext: -(S.wmdHits * 6) - (S.chinaIn && !S.chinaOut ? 6 : 0) - (S.mobilized ? 2 : 0),
  };
  P.T = P.base + P.rally + P.cas + P.civ + P.prog + P.stall + P.fatigue + P.lost + P.ext;
  P.kiaEq = kiaEq;
  return P;
}
function shock(S, v, why) { S.will = Math.min(100, S.will + v); S.lastShock = { v, why, h: S.hour }; }

function newGame(difficulty = 'normal', brain = null, params = null) {
  const DF = DIFF[difficulty];
  const S = {
    hour: 0, difficulty, DF, over: null, log: [], logSeq: 0,
    land: new Uint8Array(NCELL), owner: new Uint8Array(NCELL), origOwner: new Uint8Array(NCELL),
    prog: new Float32Array(NCELL), fort: new Uint8Array(NCELL), mtn: new Uint8Array(NCELL), coast: new Uint8Array(NCELL),
    sup1: new Uint8Array(NCELL), sup2: new Uint8Array(NCELL), terrVer: 0, units: [], frontCells: { 1: [], 2: [] },
    stats: { cost: 0, rok: { kia: 0, wia: 0, mia: 0 }, us: { kia: 0, wia: 0, mia: 0 }, kpa: 0, kpaPOW: 0, pla: 0, civ: 0, shells: 0, tanksLost: 0, infilTeams: 0 },
    air: { sup: 0.62, alloc: { as: 30, cas: 40, int: 20, str: 10 } },
    will: 72, willP: null, bestCap: 0, lastProg: 0, wmdHits: 0, lastShock: null,
    chinaRisk: 8, chinaIn: false, chinaDay: -1, chinaOut: false, wmd: 25,
    stance: DF.startOff ? 'offensive' : 'defensive', stanceUntil: DF.startOff * 24,
    rokAttacked: false, counterBattery: false, stopLine: false, mobilized: false, mobDay: -1,
    usBoost: 0, cd: {}, flags: {}, northCells0: 0, southCells0: 0, landCells: 0, lastCaptured: 0, plaInit: 0, kpaInit: 0, seq: 0,
    P: params || brainPrepare(brain), K: brain && brain.gen > 0 ? brain.know : null, skill: brainSkill(brain),
    sofPool: DF.sofPool, kresLeft: DF.kres, nextInfil: 1, nextKres: 5, plaWave: 0, beachDef: [], rearSec: 0,
    obs: { sector: [0, 0, 0], landings: [], airOps: 0, infilHit: [0, 0, 0, 0] },
  };
  const fortDepth = [0.22, 0.22, 0.22];
  if (S.K) { const s = S.K.sector, t = s[0] + s[1] + s[2]; if (t > 0) for (let i = 0; i < 3; i++) fortDepth[i] += 0.14 * s[i] / t; }
  for (let c = 0; c < NCELL; c++) {
    const [lat, lon] = cellLL(c);
    let land = pip(lat, lon, KOREA_POLY), own = 0;
    for (const isl of ISLANDS) { const dy = (lat - isl[0]) / isl[2], dx = (lon - isl[1]) / isl[3]; if (dx * dx + dy * dy <= 1) { land = true; own = isl[5]; } }
    if (!land) continue;
    S.land[c] = 1; S.owner[c] = own || (lat > mdlLat(lon) ? 2 : 1); S.mtn[c] = isMountain(lat, lon) ? 1 : 0;
    const dm = lat - mdlLat(lon);
    if (S.owner[c] === 2 && dm >= 0 && dm < fortDepth[sectorOf(lon)]) S.fort[c] = 1;
  }
  for (let c = 0; c < NCELL; c++) if (S.land[c]) for (const n of nbrs(c, NB4)) if (!S.land[n]) { const [a, o] = cellLL(n); if (!pip(a, o, NEIGHBOR_POLY)) { S.coast[c] = 1; break; } }
  S.origOwner.set(S.owner);
  for (let c = 0; c < NCELL; c++) if (S.land[c]) { S.landCells++; if (S.owner[c] === 2) S.northCells0++; else S.southCells0++; }
  for (const u of buildROK()) addUnit(S, u);
  for (const u of buildKPA()) addUnit(S, u);
  S.kpaInit = S.units.filter(u => u.side === 'KPA').reduce((a, u) => a + u.init.pers, 0);
  for (const u of S.units) {
    if (u.side === 'ROK' || u.side === 'US') { const ord = (u.type === 'mech' || u.type === 'armor' || u.type === 'rapid' || u.type === 'sof') ? 'reserve' : 'defend'; u.brigades.forEach(b => b.order = ord); }
    else u.brigades.forEach(b => b.order = 'defend');
  }
  recomputeFront(S); computeSupply(S);
  S.willP = willTarget(S, 0, 0);
  log(S, '개전 명령 하달. 합동참모본부 전시 지휘체제로 전환.', 'sys');
  log(S, `[정보] 북한군 지상 전력 약 ${Math.round(S.kpaInit / 10000)}만 명 전개 확인. 특수작전군·교도대 추가 투입 예상.`, 'warn');
  log(S, '현재 모든 부대는 방어·예비 태세입니다. 공격 명령을 내려 작전을 개시하십시오.', 'sys');
  applyKnowledge(S);
  return S;
}
function makeReport(S, result) {
  let cap = 0; for (let c = 0; c < NCELL; c++) if (S.origOwner[c] === 2 && S.owner[c] === 1) cap++;
  const st = S.stats;
  return { diff: S.difficulty, result: result || (S.over ? S.over.result : 'abort'), day: dayOf(S),
    cas: Math.round(st.rok.kia + st.rok.wia + st.rok.mia), kia: Math.round(st.rok.kia), civ: Math.round(st.civ),
    cost: Math.round(st.cost * 10) / 10, will: Math.max(0, Math.round(S.will * 10) / 10), pow: Math.round(st.kpaPOW),
    china: S.chinaIn, capFrac: cap / S.northCells0, params: S.P, obs: S.obs };
}
/* 현재 위험 상황 목록 (UI 경보용) */
function dangerState(S) {
  let own = 0, lostS = 0;
  for (let c = 0; c < NCELL; c++) if (S.land[c]) { if (S.owner[c] === 1) own++; if (S.origOwner[c] === 1 && S.owner[c] === 2) lostS++; }
  const ownFrac = own / S.landCells, lostFrac = lostS / S.southCells0, T = S.willP ? S.willP.T : S.will;
  const msgs = []; let critical = false;
  if (S.will < DANGER.will) { msgs.push(`국민 지지도 붕괴 직전 (${S.will.toFixed(1)}%) — 정부가 휴전 협상을 검토 중입니다`); critical = true; }
  else if (S.will < DANGER.willWarn && T < S.will) msgs.push(`국민 지지도 급락 중 (${S.will.toFixed(1)}%, 목표 ${T.toFixed(0)})`);
  if (ownFrac < DANGER.land) { msgs.push(`국군 통제 영토 ${(ownFrac * 100).toFixed(1)}% — 최후 방어선 붕괴 임박`); critical = true; }
  else if (lostFrac >= DANGER.southLost) msgs.push(`남측 영토 ${(lostFrac * 100).toFixed(0)}% 피탈`);
  if (S.flags.seoulLost) msgs.push('수도 서울 함락');
  if (S.wmd >= DANGER.wmd) msgs.push(`북한 대량살상무기 사용 임박 (위협도 ${S.wmd.toFixed(0)})`);
  return { active: msgs.length > 0, critical, msgs, ownFrac };
}
function addUnit(S, u) {
  u.alive = true; u.morale = u.side === 'KPA' ? 74 : 82; u.supply = 100; u.target = null; u.pending = null;
  u.aiTarget = u.aiTarget || null; u.c = null; u.engaged = 0; u.status = '';
  if (u.reserve === undefined) u.reserve = false;
  for (const b of u.brigades) { b.init = b.off + b.nco + b.enl; b.initShells = b.shells || ((b.guns * 400) + (b.mlrs * 60)); }
  u.init = unitTotals(u); snapUnit(S, u, SIDE_OF[u.side]); S.units.push(u);
  return u;
}
function unitTotals(u) {
  const t = { pers: 0, off: 0, nco: 0, enl: 0, tanks: 0, ifv: 0, guns: 0, mlrs: 0, shells: 0 };
  for (const b of u.brigades) { t.off += b.off; t.nco += b.nco; t.enl += b.enl; t.tanks += b.tanks; t.ifv += b.ifv; t.guns += b.guns; t.mlrs += b.mlrs; t.shells += b.shells; }
  t.pers = t.off + t.nco + t.enl; return t;
}
function bPers(b) { return b.off + b.nco + b.enl; }
function snapUnit(S, u, side, maxR = 14) {
  const c = cellOf(u.lat, u.lon);
  if (c >= 0 && S.land[c] && S.owner[c] === side) return true;
  let best = -1, bd = 1e9; const i0 = Math.floor((u.lon - GRID.lon0) / GRID.res), j0 = Math.floor((u.lat - GRID.lat0) / GRID.res);
  for (let dj = -maxR; dj <= maxR; dj++) for (let di = -maxR; di <= maxR; di++) {
    const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= NX || j >= NY) continue;
    const cc = j * NX + i; if (!S.land[cc] || S.owner[cc] !== side) continue;
    const d = di * di * 0.62 + dj * dj; if (d < bd) { bd = d; best = cc; }
  }
  if (best >= 0) { const [a, o] = cellLL(best); u.lat = a; u.lon = o; return true; }
  return false;
}
function log(S, msg, type = 'info') { S.log.push({ id: ++S.logSeq, h: S.hour, msg, type }); if (S.log.length > 400) S.log.shift(); }
function dayOf(S) { return Math.floor(S.hour / 24); }
function liveUnits(S) { return S.units.filter(u => u.alive && u.active && !u.pending); }
function diffMul(S, side) { return (side === 'KPA' || side === 'PLA') ? S.DF.mul * (1 + S.skill) : 1; }
function computeUnit(S, u) {
  const side = u.side, dm = diffMul(S, side);
  const mod = (0.5 + 0.5 * u.morale / 100) * (0.35 + 0.65 * u.supply / 100) * dm;
  const tq = u.type === 'home' ? 0.75 : u.type === 'mob' ? 0.6 : u.second ? 0.7 : 1;
  let off = 0, def = 0, fight = 0, fire = 0, aggr = 0, loss = 0, pers = 0, wAtk = 0, wRet = 0, wDel = 0, artRange = 40, mlrsShare = 0, gunsT = 0;
  for (const b of u.brigades) {
    const p = bPers(b); pers += p;
    const base = (p * SIDEQ[side] * KINDQ[b.kind] * tq * 0.001 + b.tanks * TANKV[side] * 0.03 + b.ifv * IFVV[side]) * mod;
    const P = POSTURE[b.order];
    off += base * P.off; def += base * P.def; fight += base * P.fight; aggr = Math.max(aggr, P.aggr); loss += P.loss * p;
    if (b.order === 'attack') wAtk += p; else if (b.order === 'retreat') wRet += p; else if (b.order === 'delay') wDel += p;
    if ((b.guns || b.mlrs) && b.shells > 0) {
      fire += (b.guns * 0.04 + b.mlrs * 0.15) * ARTQ[side] * FIRE[b.fire].m * dm * (0.5 + 0.5 * u.supply / 100);
      mlrsShare += b.mlrs * 3; gunsT += b.guns;
    }
  }
  if (mlrsShare > gunsT) artRange = 70;
  pers = Math.max(pers, 1);
  let mode = 'hold';
  if (wRet / pers > 0.5) mode = 'retreat'; else if (wDel / pers > 0.5) mode = 'delay'; else if (wAtk / pers > 0.35) mode = 'advance';
  u.c = { off, def, fight, fire, aggr, lossMod: loss / pers, pers, mode, artRange, atkW: wAtk / pers, fireOn: false };
  return u.c;
}
function step(S) {
  if (S.over) return;
  S.hour++;
  const units = liveUnits(S);
  for (const u of units) computeUnit(S, u);
  const sideUnits = { 1: [], 2: [] };
  for (const u of units) { sideUnits[SIDE_OF[u.side]].push(u); u.nearD2 = 1e12; u.nearE = null; }
  const pairs = [], A = sideUnits[1], Bn = sideUnits[2];
  for (let i = 0; i < A.length; i++) {
    const a = A[i], ar = a.c.artRange;
    for (let j = 0; j < Bn.length; j++) {
      const b = Bn[j], dy = (a.lat - b.lat) * KMLAT, dx = (a.lon - b.lon) * KMLON, d2 = dx * dx + dy * dy;
      if (d2 < a.nearD2) { a.nearD2 = d2; a.nearE = b; }
      if (d2 < b.nearD2) { b.nearD2 = d2; b.nearE = a; }
      const mr = ar > b.c.artRange ? ar : b.c.artRange;
      if (d2 < 576 || d2 < mr * mr) pairs.push([a, b, Math.sqrt(d2)]);
    }
  }
  for (const u of units) u.nearD = Math.sqrt(u.nearD2);
  applyAir(S, units); combat(S, units, pairs); movement(S, units); pendingOps(S);
  if (S.hour % 3 === 0) territory(S, units);
  if (S.hour % 6 === 0) aiTick(S);
  if (S.hour % 24 === 0) daily(S);
}
function applyAir(S, units) {
  const a = S.air;
  for (const u of units) {
    if (SIDE_OF[u.side] === 1) { const cas = 1 + a.sup * (a.alloc.cas / 100) * 0.9; u.c.off *= cas; u.c.fight *= (1 + (cas - 1) * 0.6); }
    else { const k = 1 + (1 - a.sup) * 0.25; u.c.off *= k; u.c.fight *= k; }
  }
}
function combat(S, units, pairs) {
  const lossAcc = new Map(), add = (u, f) => lossAcc.set(u, (lossAcc.get(u) || 0) + f);
  for (const u of units) { u.nEng = 0; u.nFire = 0; u.engaged = Math.max(0, u.engaged - 1); }
  for (const [a, b, d] of pairs) { if (d < 24) { a.nEng++; b.nEng++; } if (d < a.c.artRange) a.nFire++; if (d < b.c.artRange) b.nFire++; }
  for (const [a, b, d] of pairs) {
    for (const x of [a, b]) if (d < x.c.artRange && x.c.fire > 0) x.c.fireOn = true;
    if (d < 24) {
      const cb = cellOf(b.lat, b.lon), fortB = S.fort[cb] && b.c.aggr < 1;
      const fa = (a.c.fight + (a.c.fireOn ? a.c.fire : 0)) / Math.max(1, a.nEng);
      const fb = (b.c.fight * (fortB ? 1.25 : 1) + (b.c.fireOn ? b.c.fire : 0)) / Math.max(1, b.nEng);
      const inten = Math.max(a.c.aggr, b.c.aggr, (a.c.fireOn || b.c.fireOn) ? 0.3 : 0.15);
      const r = Math.min(10, Math.max(0.1, fa / Math.max(0.05, fb)));
      const mA = S.mtn[cellOf(a.lat, a.lon)] ? 0.85 : 1, mB = (S.mtn[cb] ? 0.85 : 1) * (fortB ? 0.85 : 1);
      add(b, 0.0007 * inten * Math.pow(r, 0.7) * b.c.lossMod * mB);
      add(a, 0.0007 * inten * Math.pow(1 / r, 0.7) * a.c.lossMod * mA);
      a.engaged = 6; b.engaged = 6;
      if (a.c.aggr >= 1 && a.side !== 'US') S.rokAttacked = true;
    } else {
      for (const [x, y] of [[a, b], [b, a]]) if (d < x.c.artRange && x.c.fire > 0) {
        add(y, 0.0003 * Math.pow(Math.min(5, (x.c.fire / Math.max(1, x.nFire)) / Math.max(0.5, y.c.fight)), 0.7));
        y.engaged = Math.max(y.engaged, 3);
      }
    }
  }
  for (const u of units) if (u.c.fireOn) for (const b of u.brigades) if ((b.guns || b.mlrs) && b.shells > 0) {
    const r = FIRE[b.fire].r, used = Math.min(b.shells, b.guns * r + b.mlrs * r * 0.25); b.shells -= used;
    if (SIDE_OF[u.side] === 1) { S.stats.shells += used; S.stats.cost += b.guns * r * COST.shell + b.mlrs * r * 0.25 * COST.rocket; }
  }
  for (const [u, f] of lossAcc) applyLoss(S, u, Math.min(0.02, f));
}
function applyLoss(S, u, f) {
  if (f <= 0 || !u.alive) return;
  let lost = 0;
  for (const b of u.brigades) {
    const ff = f * ((b.kind === 'arty' || b.kind === 'hq') ? 0.55 : 1) * (b.order === 'reserve' ? 0.6 : 1);
    const dOff = b.off * ff, dNco = b.nco * ff, dEnl = b.enl * ff;
    b.off -= dOff; b.nco -= dNco; b.enl -= dEnl; lost += dOff + dNco + dEnl;
    const dt = b.tanks * ff * 1.1, di = b.ifv * ff * 1.05, dg = b.guns * ff * 0.5, dm = b.mlrs * ff * 0.5;
    b.tanks -= dt; b.ifv -= di; b.guns -= dg; b.mlrs -= dm;
    if (SIDE_OF[u.side] === 1) { S.stats.cost += dt * COST.tank + di * COST.ifv + (dg + dm) * COST.gun; S.stats.tanksLost += dt; }
  }
  u.morale = Math.max(0, u.morale - f * 32);
  if (u.side === 'ROK' || u.side === 'US') { const st = S.stats[u.side === 'ROK' ? 'rok' : 'us']; st.kia += lost * 0.24; st.wia += lost * 0.69; st.mia += lost * 0.07; }
  else if (u.side === 'KPA') S.stats.kpa += lost; else S.stats.pla += lost;
  if (unitTotals(u).pers / u.init.pers < 0.18) destroyUnit(S, u, '전투력 상실로 와해');
}
function destroyUnit(S, u, why, pow = false) {
  if (!u.alive) return;
  u.alive = false;
  const p = unitTotals(u).pers;
  if (pow) S.stats.kpaPOW += p;
  const s = SIDE_OF[u.side];
  if (!u.infil || u.init.pers > 2000) log(S, `${u.name} — ${why}${pow ? ` (포로 약 ${Math.round(p).toLocaleString()}명)` : ''}`, s === 1 ? 'bad' : 'good');
  if (s === 1) shock(S, u.cat === 'div' ? -1.5 : -0.5, '아군 부대 와해');
}
function canEnter(S, lat, lon, side) { const c = cellOf(lat, lon); return c >= 0 && S.land[c] && S.owner[c] === side; }
function moveToward(S, u, tlat, tlon, kmStep, side) {
  const dy = (tlat - u.lat) * KMLAT, dx = (tlon - u.lon) * KMLON, d = Math.hypot(dx, dy);
  if (d < 0.5) return true;
  const s = Math.min(kmStep, d), ux = dx / d, uy = dy / d;
  for (const [vx, vy] of [[ux, uy], [ux * 0.7 - uy * 0.7, uy * 0.7 + ux * 0.7], [ux * 0.7 + uy * 0.7, uy * 0.7 - ux * 0.7], [ux, 0], [0, uy]]) {
    const nl = u.lat + vy * s / KMLAT, no = u.lon + vx * s / KMLON;
    if (canEnter(S, nl, no, side)) { u.lat = nl; u.lon = no; return d - s < 0.5; }
  }
  return false;
}
function nearestCell(u, list, S, side) {
  const ll = S.frontLL[side]; let bd = 1e18, bk = -1;
  for (let k = 0, n = ll.length / 2; k < n; k++) { const dy = (u.lat - ll[2 * k]) * KMLAT, dx = (u.lon - ll[2 * k + 1]) * KMLON, d = dx * dx + dy * dy; if (d < bd) { bd = d; bk = k; } }
  return bk < 0 ? [-1, 1e9] : [list[bk], Math.sqrt(bd)];
}
function movement(S, units) {
  for (const u of units) {
    const side = SIDE_OF[u.side], c0 = cellOf(u.lat, u.lon);
    let spd = SPEED[u.type] || 1.2;
    if (S.mtn[c0]) spd *= 0.65; if (u.nearD < 18) spd *= 0.5; if (u.supply < 30) spd *= 0.6;
    if (c0 < 0 || S.owner[c0] !== side) {
      if (u.infil || u.inserted) continue;
      const [bc, bd] = nearestCell(u, S.frontCells[side], S, side);
      if (bc >= 0 && bd < 20) { const [a, o] = cellLL(bc); u.lat = a; u.lon = o; u.morale -= 2; } else u.status = '포위됨';
      continue;
    }
    u.status = '';
    if (u.target) {
      const arrived = moveToward(S, u, u.target[0], u.target[1], spd, side);
      if (arrived || km(u.lat, u.lon, u.target[0], u.target[1]) < 3) { u.target = null; if (side === 1) log(S, `${u.name} 목표 지점 도착.`, 'info'); }
      continue;
    }
    if (u.aiTarget) { const arr = moveToward(S, u, u.aiTarget[0], u.aiTarget[1], spd, side); if (arr || km(u.lat, u.lon, u.aiTarget[0], u.aiTarget[1]) < 8) u.aiTarget = null; continue; }
    const m = u.c.mode;
    if (m === 'advance') {
      const [bc, bd] = nearestCell(u, S.frontCells[3 - side], S, 3 - side);
      if (bc >= 0 && bd > 6) { const [a, o] = cellLL(bc); moveToward(S, u, a, o, spd, side); }
    } else if ((m === 'retreat' || m === 'delay') && u.nearE && u.nearD < 60) {
      const dy = (u.lat - u.nearE.lat) * KMLAT, dx = (u.lon - u.nearE.lon) * KMLON, d = Math.hypot(dx, dy) || 1;
      const k = (m === 'retreat' ? 0.9 : 0.25) * spd * 2;
      moveToward(S, u, u.lat + dy / d * k / KMLAT, u.lon + dx / d * k / KMLON, k, side);
    }
  }
}
function pendingOps(S) {
  for (const u of S.units) {
    if (!u.alive || !u.pending || S.hour < u.pending.eta) continue;
    const p = u.pending; u.pending = null;
    const side = SIDE_OF[u.side];
    u.lat = p.lat; u.lon = p.lon;
    const c = cellOf(p.lat, p.lon), hostile = S.owner[c] !== side, r = p.kind === 'landing' ? 2 : 1, i0 = c % NX, j0 = (c / NX) | 0;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const cc = (j0 + dj) * NX + i0 + di; if (cc >= 0 && cc < NCELL && S.land[cc]) S.owner[cc] = side; }
    S.terrVer++;
    if (hostile) {
      u.inserted = true;
      let enP = 0;
      for (const e of S.units) if (e.alive && SIDE_OF[e.side] !== side && km(e.lat, e.lon, u.lat, u.lon) < 25) enP += unitTotals(e).pers;
      let learned = 0;
      if (p.kind === 'landing') { for (const l of S.beachDef) if (km(l[0], l[1], u.lat, u.lon) < 45) learned += 0.06 * Math.min(1.5, l[2]); }
      else learned = S.rearSec;
      applyLoss(S, u, Math.min(0.35, 0.03 + enP / 200000 + learned));
      u.brigades.forEach(b => { if (b.kind !== 'arty') b.order = 'attack'; });
      if (learned > 0.02) log(S, `[정보] 북한군이 ${p.kind === 'landing' ? '상륙' : '공중침투'}을 예상하고 대비하고 있었습니다 — 초기 피해 증가.`, 'warn');
    }
    log(S, `${u.name} ${p.kind === 'landing' ? '상륙작전' : p.kind === 'air' ? '공중강습' : '침투작전'} 실시 — 목표 지역 진입${hostile ? ', 교두보 확보 중' : ''}.`, 'good');
    recomputeFront(S);
  }
}
let _stamp = null, _stampN = 0, _off = null, _def = null, _occ = null;
function territory(S, units) {
  if (!_stamp) { _stamp = new Int32Array(NCELL); _off = new Float32Array(NCELL * 2); _def = new Float32Array(NCELL * 2); _occ = new Float32Array(NCELL * 2); }
  _stampN++;
  const touched = [];
  for (const u of units) {
    const s = SIDE_OF[u.side] - 1, c0 = cellOf(u.lat, u.lon); if (c0 < 0) continue;
    const R = u.infil ? 1 : 3, i0 = c0 % NX, j0 = (c0 / NX) | 0, fireShare = u.c.fireOn ? u.c.fire : 0;
    const offP = u.c.off + (u.c.atkW > 0.2 ? fireShare * 0.8 : 0), defP = u.c.def + fireShare * 0.6;
    const occW = u.c.atkW > 0.3 ? (MOB[u.type] || 1) * u.c.atkW : 0;
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= NX || j >= NY) continue;
      const c = j * NX + i; if (!S.land[c]) continue;
      const w = 1 - Math.sqrt(di * di * 0.62 + dj * dj) / (R + 0.8); if (w <= 0) continue;
      if (_stamp[c] !== _stampN) { _stamp[c] = _stampN; _off[2 * c] = _off[2 * c + 1] = _def[2 * c] = _def[2 * c + 1] = _occ[2 * c] = _occ[2 * c + 1] = 0; touched.push(c); }
      _off[2 * c + s] += offP * w; _def[2 * c + s] += defP * w; _occ[2 * c + s] += occW * w;
    }
  }
  const flips = [];
  for (const c of touched) {
    const o = S.owner[c], e = 3 - o, oi = o - 1, ei = e - 1, A = _off[2 * c + ei];
    if (A <= 0.001) { S.prog[c] *= 0.85; continue; }
    let adj = false; for (const n of nbrs(c, NB4)) if (S.land[n] && S.owner[n] === e) { adj = true; break; }
    if (!adj) continue;
    const Dv = (_def[2 * c + oi] + 0.3 * _off[2 * c + oi]) * (S.fort[c] && o === 2 ? 1.35 : 1), tf = S.mtn[c] ? 0.6 : 1;
    if (Dv < 0.05) S.prog[c] += (0.18 * Math.min(_occ[2 * c + ei], 3) + 0.04) * tf;
    else { const r = A / Dv; if (r > 1.0) S.prog[c] += Math.min(0.5, 0.045 * (r - 0.9)) * tf * (0.7 + 0.3 * Math.min(2, _occ[2 * c + ei])); else S.prog[c] *= 0.9; }
    if (S.prog[c] >= 1) flips.push([c, e]);
  }
  for (const [c, e] of flips) { S.owner[c] = e; S.prog[c] = 0; }
  if (flips.length) { S.terrVer++; recomputeFront(S); }
}
function recomputeFront(S) {
  const f1 = [], f2 = [], L = S.land, O = S.owner;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const c = j * NX + i; if (!L[c]) continue; const o = O[c];
    if ((i > 0 && L[c - 1] && O[c - 1] !== o) || (i < NX - 1 && L[c + 1] && O[c + 1] !== o) ||
        (j > 0 && L[c - NX] && O[c - NX] !== o) || (j < NY - 1 && L[c + NX] && O[c + NX] !== o)) (o === 1 ? f1 : f2).push(c);
  }
  S.frontCells = { 1: f1, 2: f2 };
  const mk = l => { const a = new Float32Array(l.length * 2); l.forEach((c, k) => { const [x, y] = cellLL(c); a[2 * k] = x; a[2 * k + 1] = y; }); return a; };
  S.frontLL = { 1: mk(f1), 2: mk(f2) };
}
function computeSupply(S) {
  for (const side of [1, 2]) {
    const sup = side === 1 ? S.sup1 : S.sup2; sup.fill(0);
    const q = [];
    let srcs = SUPPLY_SRC[side].slice();
    if (side === 2 && S.chinaIn && !S.chinaOut) srcs = srcs.concat([[40.10, 124.42], [41.17, 126.32], [41.40, 128.18], [42.44, 129.72]]);
    for (const [a, o] of srcs) { const c = cellOf(a, o); if (c >= 0 && S.land[c] && S.owner[c] === side && !sup[c]) { sup[c] = 1; q.push(c); } }
    while (q.length) { const c = q.pop(); for (const n of nbrs(c, NB8)) if (S.land[n] && !sup[n] && S.owner[n] === side) { sup[n] = 1; q.push(n); } }
  }
}
function aiTick(S) {
  const P = S.P, units = liveUnits(S);
  for (const u of units) if (!u.c) computeUnit(S, u);
  const ally = units.filter(x => SIDE_OF[x.side] === 2), en = units.filter(x => SIDE_OF[x.side] === 1);
  for (const u of ally) {
    if (u.infil) { u.brigades.forEach(b => b.order = 'attack'); continue; }
    if (u.aiTarget) continue;
    if (u.reserve && !u.committed) { u.brigades.forEach(b => { b.order = u.garrison ? 'defend' : 'reserve'; }); continue; }
    let ne = 0, no = 0;
    for (const e of en) if (km(u.lat, u.lon, e.lat, e.lon) < 45) ne += e.c.fight + e.c.fire;
    for (const a of ally) if (km(u.lat, u.lon, a.lat, a.lon) < 45) no += a.c.fight + a.c.fire;
    const str = unitTotals(u).pers / u.init.pers, ratio = no / (ne + 0.01), offensive = S.stance === 'offensive' || u.side === 'PLA';
    let ord = 'defend';
    if (ne > 0 && str < P.retreatStr) ord = S.sup2[cellOf(u.lat, u.lon)] ? 'retreat' : 'defend';
    else if (ne > 0 && ratio < P.delayRatio && u.supply > 40) ord = 'delay';
    else if (offensive && ratio > (u.side === 'PLA' ? 0.8 : P.atkRatio)) ord = 'attack';
    else if (ne > 0 && ratio > P.counterRatio) ord = 'attack';
    for (const b of u.brigades) {
      b.order = b.kind === 'arty' && ord === 'attack' ? 'defend' : ord;
      if (b.guns || b.mlrs) {
        const sh = b.shells / Math.max(1, b.initShells);
        b.fire = sh < P.conserveAt ? 'conserve' : (u.type === 'karty' && (offensive || km(u.lat, u.lon, SEOUL[0], SEOUL[1]) < P.artRange)) ? 'max' : 'normal';
      }
    }
  }
}
function allocateReserves(S) {
  const P = S.P, units = liveUnits(S), threats = [];
  for (const u of units) {
    if (SIDE_OF[u.side] !== 1 || !u.c || u.c.atkW < 0.3) continue;
    const [, bd] = nearestCell(u, S.frontCells[2], S, 2); if (bd > 30) continue;
    threats.push({ u, w: u.c.off + u.c.fire, dP: km(u.lat, u.lon, PYONGYANG[0], PYONGYANG[1]) });
  }
  threats.sort((a, b) => (b.w / (1 + b.dP / 150)) - (a.w / (1 + a.dP / 150)));
  const res = units.filter(u => SIDE_OF[u.side] === 2 && u.reserve && !u.committed && !u.infil);
  for (const t of threats.slice(0, Math.round(P.resCount))) {
    let best = null, bd = 1e9;
    for (const r of res) {
      if (r.committed || (/91수도/.test(r.parent) && t.dP > 90) || (r.garrison && km(r.lat, r.lon, t.u.lat, t.u.lon) > 60)) continue;
      const d = km(r.lat, r.lon, t.u.lat, t.u.lon);
      if (d < bd && d < P.resRange) { bd = d; best = r; }
    }
    if (!best) continue;
    const dy = (PYONGYANG[0] - t.u.lat) * KMLAT, dx = (PYONGYANG[1] - t.u.lon) * KMLON, d = Math.hypot(dx, dy) || 1;
    best.aiTarget = [t.u.lat + dy / d * P.resOffset / KMLAT, t.u.lon + dx / d * P.resOffset / KMLON];
    best.committed = true; best.brigades.forEach(b => b.order = 'defend');
    log(S, `[정보] 북한군 예비전력(${best.name}) 이동 포착 — ${t.u.name} 정면으로 증원 중인 것으로 판단.`, 'warn');
  }
}
const INFIL_KIND = ['AN-2 공중침투', '잠수함·공기부양정 해상침투', '땅굴·전선 침투', '점령지 후방 유격전'];
function randomCell(S, pred, tries = 500) { for (let t = 0; t < tries; t++) { const c = (Math.random() * NCELL) | 0; if (S.land[c] && pred(c)) return c; } return -1; }
function frontDist(S, c) { const [a, o] = cellLL(c); return nearestCell({ lat: a, lon: o }, S.frontCells[2], S, 2)[1]; }
function spawnInfil(S, lat, lon, size, kindIdx) {
  const id = 'kinfil' + (++S.seq);
  const u = { id, name: `조선인민군 특수작전군 침투조(${S.seq})`, nick: '', num: `침투-${S.seq}`, parent: '조선인민군 특수작전군',
    side: 'KPA', cat: 'bde', type: 'ksof', lat, lon, active: true, infil: true, infilKind: kindIdx, brigades: [mkB('경보병·저격 침투 전력', 'sof', size, {}, 'KPA')] };
  u.brigades[0].order = 'attack';
  u.alive = true; u.morale = 82; u.supply = 75; u.target = null; u.pending = null; u.aiTarget = null; u.engaged = 0; u.reserve = false; u.status = '';
  u.brigades.forEach(b => { b.init = bPers(b); b.initShells = 0; }); u.init = unitTotals(u);
  S.units.push(u);
  const c = cellOf(lat, lon); if (c >= 0 && S.land[c]) S.owner[c] = 2;
  S.stats.infilTeams++;
}
function infiltrate(S) {
  const P = S.P, day = dayOf(S), w = [1, 1, 1.2, 0];
  if (S.K) for (let i = 0; i < 4; i++) w[i] += (S.K.infilHit[i] || 0) * 0.002;
  let cap = 0; for (let c = 0; c < NCELL; c += 7) if (S.origOwner[c] === 2 && S.owner[c] === 1) cap++;
  if (cap > 30) w[3] = 1.4;
  for (let attempt = 0; attempt < 4; attempt++) {
    let r = Math.random() * (w[0] + w[1] + w[2] + w[3]), kind = 0;
    while (kind < 3 && r > w[kind]) { r -= w[kind]; kind++; }
    let c = -1;
    if (kind === 0) c = randomCell(S, x => S.owner[x] === 1 && S.origOwner[x] === 1 && frontDist(S, x) > 60);
    else if (kind === 1) c = randomCell(S, x => S.coast[x] && S.owner[x] === 1 && frontDist(S, x) > 40, 3000);
    else if (kind === 2) c = randomCell(S, x => S.owner[x] === 1 && (d => d > 12 && d < 40)(frontDist(S, x)), 3000);
    else c = randomCell(S, x => S.owner[x] === 1 && S.origOwner[x] === 2 && frontDist(S, x) > 30, 3000);
    if (c < 0) continue;
    let size = 800 + Math.random() * 800;
    if (kind === 0) size *= 1 - S.air.sup * 0.45;
    size = Math.min(size, S.sofPool); S.sofPool -= size;
    const [a, o] = cellLL(c);
    spawnInfil(S, a, o, size, kind); S.terrVer++; recomputeFront(S);
    log(S, `[침투] 북한 특수작전군 1개 조(약 ${Math.round(size / 50) * 50}명) ${INFIL_KIND[kind]} — ${nearestCity(a, o)} 일대.`, 'bad');
    break;
  }
  S.nextInfil = day + Math.max(3, Math.round(P.infilInterval * (0.7 + Math.random() * 0.6)));
}
function mobilizeKres(S) {
  const sites = KRES_SITES.filter(p => { const c = cellOf(p[0], p[1]); return c >= 0 && S.owner[c] === 2 && S.sup2[c]; });
  if (!sites.length) return;
  const n = Math.min(2, S.kresLeft); let made = 0;
  for (let i = 0; i < n; i++) {
    const p = sites[(Math.random() * sites.length) | 0], k = S.DF.kres - S.kresLeft + 1;
    const u = KD('kres' + (++S.seq), '교도대', k, 'kinf', p[0] + (Math.random() - 0.5) * 0.2, p[1] + (Math.random() - 0.5) * 0.2,
      { name: `조선인민군 교도대 동원사단(${k})`, num: `교도-${k}`, pers: 9000, guns: 36, mlrs: 6, reserve: true });
    u.second = true; u.parent = '조선인민군 교도대(동원)';
    addUnit(S, u); u.brigades.forEach(b => b.order = 'reserve'); S.kresLeft--; made++;
  }
  if (made) log(S, `[정보] 북한 교도대 동원사단 ${made}개 편성 확인 (잔여 동원 가능 약 ${S.kresLeft}개 사단).`, 'warn');
}
function daily(S) {
  const day = dayOf(S), P = S.P;
  computeSupply(S);
  const units = S.units.filter(u => u.alive && u.active), a = S.air;
  a.sup = Math.min(0.95, Math.max(0.2, a.sup + (a.alloc.as / 100) * 0.022 - (S.chinaIn && !S.chinaOut ? 0.03 : 0.006)));
  const interdict = a.sup * (a.alloc.int / 100) * 0.7;
  for (const u of units) {
    if (u.pending) continue;
    const s = SIDE_OF[u.side], c = cellOf(u.lat, u.lon), sup = s === 1 ? S.sup1[c] : S.sup2[c];
    if (sup) { u.supply = Math.min(100, u.supply + (s === 1 ? 30 : 30 * (1 - interdict))); u.inserted = false; }
    else if (s === 1 && (S.coast[c] || u.inserted)) u.supply = Math.min(65, u.supply + (S.coast[c] ? 15 : 5) - (u.inserted && !S.coast[c] ? 12 : 0));
    else u.supply = Math.max(0, u.supply - (s === 2 ? (u.infil ? 12 : 18) : 15));
    if (s === 2 && !u.infil && u.engaged === 0) u.supply = Math.max(0, u.supply - interdict * 8);
    if (u.supply > 50) {
      const rate = s === 1 ? (S.mobilized ? 0.007 : 0.004) : 0.0025;
      for (const b of u.brigades) {
        const p = bPers(b); if (p < b.init) { const k = Math.min(b.init - p, b.init * rate) / Math.max(1, p); b.off += b.off * k; b.nco += b.nco * k; b.enl += b.enl * k; }
        if (b.guns || b.mlrs) b.shells = Math.min(b.initShells * 1.2, b.shells + (b.guns * (s === 1 ? 30 : 14 * (1 - interdict)) + b.mlrs * 6));
      }
    }
    if (sup && u.engaged === 0) u.morale = Math.min(100, u.morale + 4);
    if (!sup && !(s === 1 && S.coast[c])) u.morale -= u.infil ? 4 : 6;
    if (u.brigades.every(b => b.order === 'reserve')) u.morale = Math.min(100, u.morale + 3);
    u.morale = Math.max(0, u.morale);
    if (s === 2 && !sup && u.morale < 22 && u.supply < 25) destroyUnit(S, u, '보급 단절 및 사기 붕괴로 집단 투항', true);
    else if (s === 2 && u.morale < 6) destroyUnit(S, u, '사기 붕괴로 와해', true);
  }
  for (const k of units) if (k.infil && k.alive) {
    let hit = 0;
    for (const u of units) if (SIDE_OF[u.side] === 1 && km(u.lat, u.lon, k.lat, k.lon) < 40) { u.supply = Math.max(0, u.supply - 5); hit += 5; }
    for (const src of SUPPLY_SRC[1]) if (km(src[0], src[1], k.lat, k.lon) < 30) { S.stats.cost += 0.03; hit += 20; }
    S.obs.infilHit[k.infilKind || 0] += hit;
  }
  let lr = 0;
  for (const u of units) if (u.type === 'karty' && u.supply > 30 && km(u.lat, u.lon, SEOUL[0], SEOUL[1]) < 85) {
    const t = unitTotals(u); lr += (t.guns + t.mlrs) / 300;
    if (S.counterBattery) applyLoss(S, u, 0.035 * a.sup + 0.02);
  }
  if (lr > 0) {
    const civ = Math.round(260 * lr * (S.counterBattery ? 0.45 : 1) * (1 - a.sup * a.alloc.str / 100 * 0.6));
    S.stats.civ += civ; S.stats.cost += 0.08 * lr;
    if (day % 3 === 0) log(S, `북한군 장사정포의 수도권 포격 지속 — 민간인 피해 약 ${civ.toLocaleString()}명.${S.counterBattery ? '' : ' (대화력전 우선 지시 권장)'}`, 'bad');
  }
  if (S.counterBattery) { S.stats.cost += 0.05; S.stats.shells += 3000; }
  S.stats.cost += COST.day + units.filter(u => SIDE_OF[u.side] === 1).length * 0.004 + (a.alloc.as + a.alloc.cas + a.alloc.int + a.alloc.str) / 100 * 0.12;
  for (const u of units) if (SIDE_OF[u.side] === 1 && u.c && u.c.atkW > 0.3 && u.lat > 37.6) {
    const [, bd] = nearestCell(u, S.frontCells[2], S, 2);
    if (bd < 30) S.obs.sector[sectorOf(u.lon)] += u.c.off + u.c.fire * 0.5;
  }
  isolatePockets(S);
  let n2 = 0, cap = 0, s1 = 0, lostS = 0;
  for (let c = 0; c < NCELL; c++) if (S.land[c]) {
    if (S.owner[c] === 2) n2++; else s1++;
    if (S.origOwner[c] === 2 && S.owner[c] === 1) cap++;
    if (S.origOwner[c] === 1 && S.owner[c] === 2) lostS++;
  }
  const capFrac = cap / S.northCells0;
  S.lastCaptured = Math.max(S.lastCaptured, capFrac);
  const pc = cellOf(PYONGYANG[0], PYONGYANG[1]);
  if (!S.flags.pyongyang && S.owner[pc] === 1) {
    S.flags.pyongyang = true; S.chinaRisk += 15; shock(S, 5, '평양 점령');
    for (const u of units) if (u.side === 'KPA') u.morale -= 15;
    log(S, '★ 평양 점령! 북한 지도부는 자강도 방면으로 이탈한 것으로 추정됩니다.', 'good');
  }
  const sc = cellOf(SEOUL[0], SEOUL[1]);
  if (!S.flags.seoulLost && S.owner[sc] === 2) { S.flags.seoulLost = true; S.flags.seoulEverLost = true; shock(S, -10, '서울 함락'); log(S, '서울이 적에게 함락되었습니다!', 'bad'); }
  if (S.flags.seoulLost && S.owner[sc] === 1) { S.flags.seoulLost = false; shock(S, 5, '서울 탈환'); log(S, '서울 탈환.', 'good'); }
  S.willP = willTarget(S, capFrac, lostS / S.southCells0);
  S.will = Math.min(100, S.will + (S.willP.T - S.will) * WILL_RATE);
  if (day > 0 && day % 10 === 0) log(S, `[여론] 국민 지지도 ${S.will.toFixed(0)} (추세 ${S.willP.T >= S.will ? '상승' : '하락'}, 목표 ${S.willP.T.toFixed(0)}).`, 'sys');
  const kr = units.filter(u => u.side === 'KPA').reduce((s, u) => s + unitTotals(u).pers, 0) / S.kpaInit;
  if (kr < 0.25) for (const u of units) if (u.side === 'KPA') u.morale -= 2;
  if (kr < 0.12 && !S.flags.collapse) {
    S.flags.collapse = true; log(S, '북한군 지휘체계 붕괴 — 각지에서 대규모 투항이 이어지고 있습니다.', 'good');
    for (const u of units) if (u.side === 'KPA' && u.morale < 50) destroyUnit(S, u, '지휘체계 붕괴로 투항', true);
  }
  if (S.stance === 'defensive' && !S.flags.offTriggered && day >= Math.max(S.DF.offDay, Math.round(P.stanceDay)) && !S.rokAttacked) {
    S.flags.offTriggered = true; S.stance = 'offensive'; S.stanceUntil = S.hour + 24 * P.stanceLen;
    log(S, '[경보] 국군의 공세가 지연되자 북한군이 전 전선에서 선제 공세로 전환했습니다!', 'bad');
  }
  if (S.stance === 'offensive' && S.hour >= S.stanceUntil) { S.stance = 'defensive'; log(S, '[정보] 북한군 공세 동력 약화 — 방어 태세로 전환 중.', 'info'); }
  if (S.stance === 'defensive' && day > 10 && day % 9 === 0 && kr > 0.4 && !S.flags.collapse) {
    S.stance = 'offensive'; S.stanceUntil = S.hour + 24 * Math.max(3, P.stanceLen * 0.4);
    log(S, '[경보] 북한군이 예비 전력을 모아 반격에 나섰습니다.', 'bad');
  }
  allocateReserves(S);
  if (!S.flags.collapse && S.sofPool > 600 && day >= S.nextInfil) infiltrate(S);
  if (!S.flags.collapse && S.kresLeft > 0 && day >= S.nextKres) { mobilizeKres(S); S.nextKres = day + Math.max(3, Math.round(P.mobInterval)); }
  for (const r of US_REINF) {
    if (S.flags['us_' + r.id] || day < r.day - S.usBoost) continue;
    S.flags['us_' + r.id] = true;
    const u = { id: r.id, name: r.name, nick: r.nick, num: r.num, parent: '미 인도태평양사령부 증원전력', side: 'US', cat: 'div', type: r.type,
      lat: r.lat, lon: r.lon, active: true, brigades: r.b.map(x => mkB(x[0], x[1], x[2], x[3], 'US')) };
    u.brigades.forEach(b => b.order = 'reserve');
    addUnit(S, u); log(S, `미군 증원: ${r.name} 한반도 전개 완료.`, 'good');
  }
  if (S.mobilized && !S.flags.mobDone && day >= S.mobDay) {
    S.flags.mobDone = true;
    for (const u of S.units) if (u.type === 'mob' && !u.active) {
      u.active = true;
      for (const b of u.brigades) {
        Object.assign(b, mkB(b.name, b.kind, b.kind === 'inf' ? 3000 : b.kind === 'arty' ? 900 : 1500, { guns: b.guns }), { order: 'reserve' });
        b.init = bPers(b); b.initShells = b.guns * 400; b.shells = b.initShells;
      }
      u.init = unitTotals(u); snapUnit(S, u, 1, 40);
    }
    log(S, '동원사단 5개 편성 완료 — 전선 투입이 가능합니다.', 'good');
  }
  china(S, units, capFrac); wmd(S, units); checkEnd(S, n2, s1);
}
function isolatePockets(S) {
  const units = S.units.filter(u => u.alive && u.active && SIDE_OF[u.side] === 2), seen = new Uint8Array(NCELL); let flipped = 0;
  for (let c = 0; c < NCELL; c++) {
    if (!S.land[c] || S.owner[c] !== 2 || S.sup2[c] || seen[c]) continue;
    const comp = [c]; seen[c] = 1;
    for (let k = 0; k < comp.length; k++) for (const n of nbrs(comp[k], NB8)) if (S.land[n] && !seen[n] && S.owner[n] === 2 && !S.sup2[n]) { seen[n] = 1; comp.push(n); }
    const set = new Set(comp);
    if (units.some(u => { const uc = cellOf(u.lat, u.lon); if (set.has(uc)) return true; for (const n of nbrs(uc, NB8)) if (set.has(n)) return true; return false; })) continue;
    for (const x of comp) S.owner[x] = 1; flipped += comp.length;
  }
  if (flipped) { S.terrVer++; recomputeFront(S); if (flipped > 30) log(S, `고립된 적 지역 ${flipped}개 구역의 저항 소멸 — 아군 통제 하에 편입.`, 'good'); }
}
function china(S, units, capFrac) {
  if (S.chinaIn && !S.chinaOut) {
    const day = dayOf(S);
    while (S.plaWave < PLA_WAVE_DAYS.length && day >= S.chinaDay + PLA_WAVE_DAYS[S.plaWave]) {
      const w = S.plaWave++, list = PLA_ENTRY.filter(e => e.wave === w);
      for (const e of list) spawnPLA(S, e);
      log(S, `★ 중국군 제${w + 1}파 ${list.length}개 제대(약 ${Math.round(list.length * 2.15)}만 명) 압록강·두만강 도하.`, 'bad');
    }
    for (const u of units) if (u.side === 'PLA' && S.sup2[cellOf(u.lat, u.lon)]) for (const b of u.brigades) {
      const p = bPers(b); if (p < b.init) { const k = Math.min(b.init - p, b.init * 0.006) / Math.max(1, p); b.off += b.off * k; b.nco += b.nco * k; b.enl += b.enl * k; }
    }
    const pla = units.filter(u => u.side === 'PLA'), now = pla.reduce((s, u) => s + unitTotals(u).pers, 0);
    if (S.plaWave >= PLA_WAVE_DAYS.length && S.plaInit && (now / S.plaInit < 0.35 || pla.length === 0)) chinaWithdraw(S, '막대한 손실');
    return;
  }
  if (S.chinaOut) return;
  let inc = 0.45 + capFrac * 3.5, north = 0, usN = 0;
  for (const u of units) if (SIDE_OF[u.side] === 1) { if (u.lat > 39.6) north++; if (u.side === 'US' && u.lat > 39.0) usN++; }
  inc = (inc + Math.min(10, north * 1.8) + usN * 1.2) * S.DF.chinaMul;
  if (S.stopLine) {
    if (units.some(u => SIDE_OF[u.side] === 1 && u.lat > 39.5)) { S.stopLine = false; S.chinaRisk += 30; log(S, '선언한 북진 한계선을 넘었습니다 — 중국이 강하게 반발합니다.', 'bad'); }
    else inc *= 0.45;
  }
  S.chinaRisk = Math.min(100, S.chinaRisk + inc);
  if (S.chinaRisk >= 100 || (S.chinaRisk > 60 && Math.random() < 0.04)) chinaEnter(S);
}
function spawnPLA(S, e) {
  S.flags['pla_' + e.id] = true;
  const u = mkPLA(e), c = cellOf(u.lat, u.lon), i0 = c % NX, j0 = (c / NX) | 0;
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const cc = (j0 + dj) * NX + i0 + di; if (S.land[cc]) S.owner[cc] = 2; }
  S.terrVer++; recomputeFront(S);
  addUnit(S, u); u.brigades.forEach(b => b.order = 'attack');
  S.plaInit += u.init.pers;
}
function chinaEnter(S) {
  S.chinaIn = true; S.chinaDay = dayOf(S); S.plaWave = 0;
  log(S, '★ 중국 참전 — 중국인민해방군 북부전구 병력이 압록강·두만강을 넘어 한반도에 진입했습니다! 중부전구 증원도 예상됩니다.', 'bad');
  S.air.sup = Math.max(0.25, S.air.sup - 0.18); shock(S, -6, '중국 참전');
  S.stance = 'offensive'; S.stanceUntil = S.hour + 24 * 10;
  for (const u of S.units) if (u.alive && u.side === 'KPA') u.morale = Math.min(100, u.morale + 15);
  china(S, [], 0); computeSupply(S);
}
function chinaWithdraw(S, why) {
  S.chinaOut = true;
  for (const u of S.units) if (u.alive && u.side === 'PLA') u.alive = false;
  log(S, `★ 중국군 철수 결정 (${why}). 중국군이 국경 밖으로 철수합니다.`, 'good');
  shock(S, 5, '중국군 철수'); computeSupply(S);
}
function wmd(S, units) {
  const a = S.air;
  let inc = 0.7;
  if (units.some(u => SIDE_OF[u.side] === 1 && km(u.lat, u.lon, PYONGYANG[0], PYONGYANG[1]) < 60)) inc += 4;
  if (S.lastCaptured > 0.6) inc += 1;
  inc -= a.sup * (a.alloc.str / 100) * 3;
  if (S.flags.collapse) inc = -2;
  S.wmd = Math.max(0, S.wmd + inc);
  if (S.wmd >= 100) {
    S.wmd = 35; S.wmdHits++;
    const t = units.filter(u => SIDE_OF[u.side] === 1 && u.c).sort((x, y) => (y.c.off + y.c.def) - (x.c.off + x.c.def))[0];
    if (t) for (const u of units) if (SIDE_OF[u.side] === 1 && km(u.lat, u.lon, t.lat, t.lon) < 30) applyLoss(S, u, 0.22);
    S.stats.civ += 18000; shock(S, -12, 'WMD 피격');
    log(S, '★ [긴급] 북한의 대량살상무기 공격 발생 — 전방 주력 부대 및 인근 지역에 대규모 피해. 미국이 확장억제 공약에 따른 대응을 발표했습니다.', 'bad');
    S.usBoost += 5;
  }
}
/* 종전 판정: 결과(result)와 엔딩 시나리오(ending)를 함께 결정 */
const END_TITLES = {
  win_clean: '한반도 통일', win_china: '두 개의 군대를 넘어', win_pyrrhic: '상처뿐인 통일',
  lose_will: '휴전', lose_front: '패전', lose_surrender: '정전',
};
function finishGame(S, result, ending) {
  const st = S.stats;
  S.over = { result, ending, title: END_TITLES[ending], stats: { day: dayOf(S), cas: Math.round(st.rok.kia + st.rok.wia + st.rok.mia), cost: st.cost } };
}
function checkEnd(S, n2, s1) {
  if (S.over) return;
  const enemyAlive = S.units.some(u => u.alive && u.active && SIDE_OF[u.side] === 2);
  if (n2 === 0 || (!enemyAlive && S.lastCaptured > 0.5)) {
    if (n2) { for (let c = 0; c < NCELL; c++) if (S.land[c]) S.owner[c] = 1; S.terrVer++; }
    const cas = S.stats.rok.kia + S.stats.rok.wia + S.stats.rok.mia;
    finishGame(S, 'win', (S.will < 20 || cas > 350000) ? 'win_pyrrhic' : S.chinaIn ? 'win_china' : 'win_clean');
  } else if (S.will <= 0) finishGame(S, 'lose', 'lose_will');
  else if (s1 / S.landCells < LOSE_LAND) finishGame(S, 'lose', 'lose_front');
}
const CMD = {
  setBrigOrder(S, u, i, ord) { u.brigades[i].order = ord; if (ord === 'attack' && u.side === 'ROK') S.rokAttacked = true; },
  setBrigFire(S, u, i, f) { u.brigades[i].fire = f; },
  setUnitOrder(S, u, ord) { u.brigades.forEach(b => b.order = ord); if (ord === 'attack') S.rokAttacked = true; },
  setUnitFire(S, u, f) { u.brigades.forEach(b => b.fire = f); },
  setTarget(S, u, lat, lon) { u.target = [lat, lon]; },
  clearTarget(S, u) { u.target = null; },
  airOp(S, u, lat, lon) {
    const c = cellOf(lat, lon); if (c < 0 || !S.land[c]) return '육지를 지정하십시오.';
    const d = km(u.lat, u.lon, lat, lon), isRapid = u.type === 'rapid', range = isRapid ? 130 : 320;
    if (d > range) return `작전 반경(${range}km)을 초과합니다. (현재 ${Math.round(d)}km)`;
    if (S.air.sup < 0.5) return '제공권이 부족하여 공중작전이 불가합니다.';
    u.pending = { kind: isRapid ? 'air' : 'sof', lat, lon, eta: S.hour + (isRapid ? 12 : 24) };
    u.target = null; S.obs.airOps++;
    log(S, `${u.name} ${isRapid ? '공중강습' : '침투'} 작전 준비 (${isRapid ? 12 : 24}시간 후 실행).`, 'info');
    return null;
  },
  landing(S, u, lat, lon) {
    const c = cellOf(lat, lon); if (c < 0 || !S.land[c]) return '해안 지역(육지)을 지정하십시오.';
    if (!S.coast[c]) {
      let best = -1, bd = 1e9; const i0 = c % NX, j0 = (c / NX) | 0;
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const cc = (j0 + dj) * NX + i0 + di; if (cc >= 0 && cc < NCELL && S.coast[cc]) { const dd = di * di + dj * dj; if (dd < bd) { bd = dd; best = cc; } } }
      if (best < 0) return '상륙 가능한 해안이 아닙니다.';
      [lat, lon] = cellLL(best);
    }
    if (km(u.lat, u.lon, lat, lon) > 600) return '상륙 작전 반경(600km)을 초과합니다.';
    u.pending = { kind: 'landing', lat, lon, eta: S.hour + 48 }; u.target = null;
    if (S.owner[cellOf(lat, lon)] === 2) S.obs.landings.push([lat, lon]);
    log(S, `${u.name} 상륙작전 준비 — 48시간 후 상륙 개시.`, 'info');
    return null;
  },
  allOrder(S, ord, filter) { for (const u of S.units) if (u.alive && u.active && (u.side === 'ROK' || u.side === 'US') && (!filter || filter(u))) this.setUnitOrder(S, u, ord); log(S, `전군 지시: ${POSTURE[ord].label}`, 'sys'); },
  allFire(S, f) { for (const u of S.units) if (u.alive && (u.side === 'ROK' || u.side === 'US')) this.setUnitFire(S, u, f); log(S, `전군 포병 사격 지시: ${FIRE[f].label}`, 'sys'); },
  cooldown(S, k) { return Math.max(0, (S.cd[k] || 0) - S.hour); },
  killChain(S) { if (this.cooldown(S, 'kc')) return '재사용 대기 중'; S.cd.kc = S.hour + 24 * 7; S.wmd = Math.max(0, S.wmd - 28); S.stats.cost += 1.5; S.chinaRisk += 3;
    for (const u of S.units) if (u.alive && u.side === 'KPA' && u.type === 'karty') applyLoss(S, u, 0.05);
    log(S, '킬체인 선제 타격 실시 — 북한 전략 표적·장사정포 진지 타격.', 'good'); return null; },
  mobilize(S) { if (S.mobilized) return '이미 동원령이 선포되었습니다.'; S.mobilized = true; S.mobDay = dayOf(S) + 5; shock(S, -2, '총동원령'); S.stats.cost += 3;
    log(S, '국가 총동원령 선포 — 동원사단 편성까지 약 5일 소요.', 'sys'); return null; },
  requestUS(S) { if (this.cooldown(S, 'us')) return '재사용 대기 중'; S.cd.us = S.hour + 24 * 15; S.usBoost += 3; S.chinaRisk += 3;
    log(S, '미 증원전력 전개 가속 요청 — 이후 증원 일정 3일 단축.', 'sys'); return null; },
  diplomacy(S) { if (this.cooldown(S, 'dip')) return '재사용 대기 중'; S.cd.dip = S.hour + 24 * 10;
    if (S.chinaIn && !S.chinaOut) {
      const pla = S.units.filter(u => u.alive && u.side === 'PLA').reduce((s, u) => s + unitTotals(u).pers, 0);
      if (S.plaInit && pla / S.plaInit < 0.6 && S.lastCaptured > 0.7 && dayOf(S) - S.chinaDay > 20) { chinaWithdraw(S, '외교 협상 타결'); return null; }
      log(S, '대중국 외교 협상 — 중국 측은 현재 조건으로는 철수 불가 입장. (중국군 손실 40% 이상, 북측 지역 70% 이상 확보, 개입 후 20일 경과 필요)', 'warn'); return null;
    }
    S.chinaRisk = Math.max(0, S.chinaRisk - 15); log(S, '대중국 외교 협상 실시 — 개입 위험도 감소.', 'good'); return null; },
  toggleStopLine(S) { S.stopLine = !S.stopLine; log(S, S.stopLine ? '북진 한계선(북위 39.5°) 선언 — 중국 개입 위험 증가 속도 감소.' : '북진 한계선 선언 철회.', 'sys'); },
  psyops(S) { if (this.cooldown(S, 'psy')) return '재사용 대기 중'; S.cd.psy = S.hour + 24 * 5;
    for (const u of S.units) if (u.alive && u.side === 'KPA') u.morale -= 4; log(S, '대북 심리전 및 투항 권고 방송 실시 — 북한군 사기 저하.', 'good'); return null; },
  ammo(S) { if (this.cooldown(S, 'ammo')) return '재사용 대기 중'; S.cd.ammo = S.hour + 24 * 7; let n = 0;
    for (const u of S.units) if (u.alive && SIDE_OF[u.side] === 1) for (const b of u.brigades) if (b.guns || b.mlrs) { const add = b.initShells * 0.5; b.shells = Math.min(b.initShells * 1.5, b.shells + add); n += add; }
    S.stats.cost += n * 0.000006 + 0.5; log(S, `탄약 긴급 추진 보급 — 약 ${Math.round(n).toLocaleString()}발 보급.`, 'good'); return null; },
  toggleCB(S) { S.counterBattery = !S.counterBattery; log(S, S.counterBattery ? '대화력전 우선 지시 — 북한 장사정포 집중 타격.' : '대화력전 우선 지시 해제.', 'sys'); },
  surrender(S) { finishGame(S, 'lose', 'lose_surrender'); },
};
