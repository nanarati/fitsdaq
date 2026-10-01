/* 핏스닥 FITSDAQ — 체력 평가 엔진
 * 모든 계산은 브라우저 안에서만 이뤄지며, 입력값은 서버로 전송되지 않습니다.
 */
(function () {
  'use strict';
  const Q = window.FIT_Q;
  const P = Q.P;
  const AGES = Q.ages;
  const TWINS = window.FIT_TWINS || [];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- 분위수 테이블 ---------- */
  function binOf(age) {
    let b = Math.floor(age / 5) * 5;
    return clamp(b, 10, 95);
  }
  function binIdx(age) { return AGES.indexOf(binOf(age)); }

  function tableAtIdx(sex, metric, i) {
    const arr = Q.q[sex + metric];
    if (!arr) return null;
    if (arr[i]) return arr[i];
    for (let d = 1; d < AGES.length; d++) {
      if (arr[i - d]) return arr[i - d];
      if (arr[i + d]) return arr[i + d];
    }
    return null;
  }
  function table(sex, metric, age) { return tableAtIdx(sex, metric, binIdx(age)); }
  function hasTable(sex, metric, age) {
    const arr = Q.q[sex + metric];
    return !!(arr && arr[binIdx(age)]);
  }

  // 값 → 백분위(0~100)
  function pctOf(q, v) {
    const n = q.length;
    if (v < q[0]) return Math.max(0.3, P[0] * (v / q[0]) * 0.8);
    if (v > q[n - 1]) return 99.6;
    const f = q.indexOf(v);
    if (f >= 0) {
      let l = f; while (l + 1 < n && q[l + 1] === v) l++;
      return (P[f] + P[l]) / 2;
    }
    let i = 0; while (i < n - 1 && q[i + 1] < v) i++;
    const t = (v - q[i]) / (q[i + 1] - q[i] || 1);
    return lerp(P[i], P[i + 1], t);
  }
  // 백분위 → 값
  function valOf(q, p) {
    const n = q.length;
    if (p <= P[0]) return q[0];
    if (p >= P[n - 1]) return q[n - 1];
    let i = 0; while (i < n - 1 && P[i + 1] < p) i++;
    const t = (p - P[i]) / (P[i + 1] - P[i]);
    return lerp(q[i], q[i + 1], t);
  }
  // 연속 나이(구간 중앙 = 라벨+2.5)에서 백분위 p의 값
  function valAtAge(sex, metric, age, p) {
    const arr = Q.q[sex + metric];
    const centers = AGES.map(a => a + 2.5);
    const pts = [];
    centers.forEach((c, i) => { if (arr[i]) pts.push([c, valOf(arr[i], p)]); });
    if (!pts.length) return null;
    if (age <= pts[0][0]) return pts[0][1];
    if (age >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    for (let i = 0; i < pts.length - 1; i++) {
      if (age >= pts[i][0] && age <= pts[i + 1][0]) {
        const t = (age - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
        return lerp(pts[i][1], pts[i + 1][1], t);
      }
    }
    return null;
  }

  /* ---------- 점수 함수 ---------- */
  function piecewise(pts, x) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      if (x <= pts[i + 1][0]) return lerp(pts[i][1], pts[i + 1][1], (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]));
    }
    return pts[pts.length - 1][1];
  }
  // 성인 BMI: 대한비만학회 아시아-태평양 기준(정상 18.5~22.9)
  function bmiScore(bmi, age, sex) {
    if (age < 19) {
      const p = pctOf(table(sex, 'bmi', age), bmi);
      if (p >= 15 && p <= 85) return 100;
      return clamp(100 - Math.abs(p < 15 ? 15 - p : p - 85) * 3.2, 30, 100);
    }
    return piecewise([[15, 40], [17, 62], [18.5, 92], [20, 100], [23, 100], [25, 80], [27.5, 62], [30, 45], [35, 25], [40, 15]], bmi);
  }
  function sbpScore(sbp) {
    return piecewise([[85, 80], [95, 100], [119, 100], [129, 85], [139, 65], [159, 40], [180, 20]], sbp);
  }
  function rating(p) {
    if (p >= 90) return 'AAA'; if (p >= 75) return 'AA'; if (p >= 60) return 'A';
    if (p >= 45) return 'BBB'; if (p >= 30) return 'BB'; if (p >= 15) return 'B'; return 'CCC';
  }

  const W = { strength: 0.35, cardio: 0.40, body: 0.15, bp: 0.10 };

  /* ---------- 입력 정규화 ---------- */
  // raw: {name, sex:'M'|'F', age, h, w, grip?, gripQuiz?, vo2?, par?, fig8?, walk?, fall?, sbp?}
  function normalize(raw) {
    const sex = raw.sex === 'F' ? 'F' : 'M';
    const age = clamp(Math.round(+raw.age), 10, 95);
    const h = +raw.h, w = +raw.w;
    const bmi = w / Math.pow(h / 100, 2);
    const elder = age >= 65;
    const est = {};
    let grip = raw.grip != null && raw.grip !== '' ? +raw.grip : null;
    let relg = null;
    if (grip == null) {
      const s = clamp(+raw.gripQuiz || 0, 0, 3);
      const p = [18, 38, 58, 76][s];
      if (elder) grip = valOf(table(sex, 'grip', age), p);
      else { relg = valOf(table(sex, 'relg', age), p); grip = relg * w / 100; }
      est.grip = true;
    }
    if (relg == null) relg = grip / w * 100;

    let vo2 = null, fig8 = null;
    if (!elder) {
      vo2 = raw.vo2 != null && raw.vo2 !== '' ? +raw.vo2 : null;
      if (vo2 == null) {
        const par = clamp(+raw.par || 0, 0, 7);
        let p = [8, 18, 30, 42, 55, 68, 80, 90][par];
        if (bmi > 25) p -= (bmi - 25) * 3; else if (bmi < 18.5) p -= 5;
        vo2 = valOf(table(sex, 'vo2', age), clamp(p, 3, 97));
        est.vo2 = true;
      }
    } else {
      fig8 = raw.fig8 != null && raw.fig8 !== '' ? +raw.fig8 : null;
      if (fig8 == null) {
        let g = { fast: 75, normal: 52, slow: 28, vslow: 12 }[raw.walk || 'normal'];
        if (raw.fall) g -= 10;
        fig8 = valOf(table(sex, 'fig8', age), clamp(100 - g, 3, 97));
        est.fig8 = true;
      }
    }
    const sbp = raw.sbp != null && raw.sbp !== '' ? +raw.sbp : null;
    return {
      name: (raw.name || '내 체력').trim().slice(0, 12) || '내 체력',
      sex, age, h, w, bmi, elder, grip, relg, vo2, fig8, sbp, est
    };
  }

  /* ---------- 평가 ---------- */
  function components(u) {
    const c = {};
    if (!u.elder) {
      const pS = pctOf(table(u.sex, 'relg', u.age), u.relg);
      const pC = pctOf(table(u.sex, 'vo2', u.age), u.vo2);
      c.strength = { key: 'strength', label: '근력', sub: '상대악력', value: u.relg, unit: '%', pct: pS, score: pS, est: !!u.est.grip };
      c.cardio = { key: 'cardio', label: '심폐지구력', sub: 'VO₂max', value: u.vo2, unit: 'ml/kg/min', pct: pC, score: pC, est: !!u.est.vo2 };
    } else {
      const pS = pctOf(table(u.sex, 'grip', u.age), u.grip);
      const raw = pctOf(table(u.sex, 'fig8', u.age), u.fig8);
      c.strength = { key: 'strength', label: '근력', sub: '악력', value: u.grip, unit: 'kg', pct: pS, score: pS, est: !!u.est.grip };
      c.cardio = { key: 'cardio', label: '보행·협응', sub: '8자보행', value: u.fig8, unit: '초', pct: 100 - raw, score: 100 - raw, est: !!u.est.fig8, lowerBetter: true };
    }
    const pB = pctOf(table(u.sex, 'bmi', u.age), u.bmi);
    c.body = { key: 'body', label: '체성분', sub: 'BMI', value: u.bmi, unit: 'kg/m²', pct: pB, score: bmiScore(u.bmi, u.age, u.sex), est: false, neutral: true };
    if (u.sbp) {
      const pP = pctOf(table(u.sex, 'sbp', u.age), u.sbp);
      c.bp = { key: 'bp', label: '혈압', sub: '수축기', value: u.sbp, unit: 'mmHg', pct: pP, score: sbpScore(u.sbp), est: false, neutral: true };
    }
    Object.values(c).forEach(x => { x.rating = rating(x.score); });
    return c;
  }
  function composite(c) {
    let s = 0, wsum = 0;
    for (const k in c) { s += c[k].score * W[k]; wsum += W[k]; }
    return s / wsum;
  }
  const priceOf = score => Math.max(1000, Math.round(score * 10) * 100);

  // 쌍둥이 표본 → 공통 형식
  function twinUser(t) {
    return {
      sex: t[0] === 1 ? 'M' : 'F', age: t[1] + 2, h: t[2], w: t[3], bmi: t[3] / Math.pow(t[2] / 100, 2),
      grip: t[4], relg: t[5], vo2: t[6], fig8: t[7], sbp: t[8] || null, elder: t[1] >= 65, est: {}, label: t[1]
    };
  }
  let twinCache = null;
  function twinsAll() {
    if (twinCache) return twinCache;
    twinCache = TWINS.map((t, i) => {
      const u = twinUser(t);
      u.age = t[1]; // 구간 라벨 기준 평가
      const c = components(u);
      const sc = composite(c);
      return { i, u, c, score: sc, price: priceOf(sc), code: 'S' + String(10000 + i * 37 % 89999).padStart(5, '0') };
    });
    return twinCache;
  }

  function sectorRank(u, score) {
    const bin = binOf(u.age);
    const peers = twinsAll().filter(t => t.u.sex === u.sex && Math.abs(t.u.age - bin) <= 5 && t.u.elder === u.elder);
    const below = peers.filter(t => t.score < score).length;
    const frac = peers.length ? (below + 0.5) / (peers.length + 1) : score / 100;
    const N = Q.N[u.sex][binIdx(u.age)] || 1;
    const rank = clamp(Math.round((1 - frac) * N) + 1, 1, N);
    return { rank, N, frac, peers: peers.length };
  }

  function findTwins(u, k) {
    k = k || 5;
    const pool = twinsAll().filter(t => t.u.sex === u.sex && Math.abs(t.u.age - binOf(u.age)) <= 5 && t.u.elder === u.elder);
    const d = t => {
      const a = t.u;
      let s = Math.pow((a.bmi - u.bmi) / 3, 2) + Math.pow((a.grip - u.grip) / (u.elder ? 6 : 8), 2);
      if (u.elder) s += Math.pow(((a.fig8 || 30) - u.fig8) / 5, 2);
      else s += Math.pow(((a.vo2 || 35) - u.vo2) / 4, 2);
      s += Math.pow((a.age - binOf(u.age)) / 10, 2);
      return Math.sqrt(s);
    };
    return pool.map(t => ({ t, dist: d(t) })).sort((a, b) => a.dist - b.dist).slice(0, k)
      .map(x => Object.assign({}, x.t, { sim: Math.round(clamp(100 - x.dist * 18, 40, 99)) }));
  }

  /* ---------- 체력나이 ---------- */
  function ageWhereMedian(sex, metric, v, lo, hi, decreasing) {
    let best = null, bestD = Infinity;
    for (let a = lo; a <= hi; a += 0.5) {
      const m = valAtAge(sex, metric, a, 50);
      const dd = Math.abs(m - v);
      if (dd < bestD) { bestD = dd; best = a; }
    }
    const mLo = valAtAge(sex, metric, lo, 50), mHi = valAtAge(sex, metric, hi, 50);
    const slope = (mHi - mLo) / (hi - lo); // 값/년
    if (decreasing) {
      if (v > mLo) return clamp(lo - (v - mLo) / Math.abs(slope), lo - 15, lo);
      if (v < mHi) return clamp(hi + (mHi - v) / Math.abs(slope), hi, hi + 20);
    } else {
      if (v < mLo) return clamp(lo - (mLo - v) / Math.abs(slope), lo - 10, lo);
      if (v > mHi) return clamp(hi + (v - mHi) / Math.abs(slope), hi, hi + 15);
    }
    return best;
  }
  function fitnessAge(u) {
    if (u.age < 20) return null;
    // 심폐(65세 이상은 8자보행) 기준 나이에 근력 백분위 보정(±최대 10세)
    const c = components(u);
    const adj = -(c.strength.pct - 50) * 0.2;
    if (!u.elder) {
      const aC = ageWhereMedian(u.sex, 'vo2', u.vo2, 22.5, 62.5, true);
      return Math.round(clamp(aC + adj, 18, 85));
    }
    const aF = ageWhereMedian(u.sex, 'fig8', u.fig8, 67.5, 87.5, false);
    return Math.round(clamp(aF + adj, 50, 99));
  }

  /* ---------- 생애 근력 차트(악력 기준) ---------- */
  // AWGS 2019(아시아 근감소증 진단 기준) 악력 저하 기준
  const AWGS = { M: 28, F: 18 };
  function lifeProjection(u) {
    const pNow = pctOf(table(u.sex, 'grip', u.age), u.grip);
    const bull = clamp(pNow + 15, 3, 97), bear = clamp(Math.max(pNow - 12, pNow * 0.55), 2, 97);
    const bins = [];
    for (let a = 10; a <= 90; a += 5) bins.push(a);
    const curBin = binOf(u.age);
    const g = (a, p) => valAtAge(u.sex, 'grip', a + 2.5, p);
    const candles = [];
    let prev = g(10, pNow);
    bins.forEach(a => {
      const base = a === curBin ? u.grip : g(a, pNow);
      const past = a < curBin;
      let o = prev, c = base, hi, lo;
      if (a === curBin) { o = u.grip; c = u.grip; }
      if (past || a === curBin) { hi = Math.max(o, c); lo = Math.min(o, c); }
      else { hi = Math.max(g(a, bull), o, c); lo = Math.min(g(a, bear), o, c); }
      candles.push({ label: a, o, h: hi, l: lo, c, past, now: a === curBin, bull: past ? null : g(a, bull), bear: past ? null : g(a, bear) });
      prev = base;
    });
    // 경고선 도달 나이
    const cross = p => {
      if (u.grip < AWGS[u.sex]) return u.age;
      for (let a = u.age; a <= 100; a += 0.5) {
        const v = valAtAge(u.sex, 'grip', a, p);
        if (v < AWGS[u.sex]) return Math.round(a);
      }
      return null;
    };
    return { candles, pNow, cutoff: AWGS[u.sex], cross: { base: cross(pNow), bull: cross(bull), bear: cross(bear) } };
  }

  /* ---------- 리포트 ---------- */
  const SPORT_MAP = {
    strength: ['헬스', '필라테스', '클라이밍', '복싱'],
    cardio: ['수영', '줄넘기', '배드민턴', '축구(풋살)'],
    mobility: ['요가', '탁구', '수영', '댄스(줌바 등)'],
    body: ['수영', '댄스(줌바 등)', '복싱', '헬스'],
    bp: ['수영', '요가', '탁구']
  };
  function boardRow(name) {
    const B = window.SPORT_BOARD;
    return B.vs.find(r => r[0] === name) || B.ds.find(r => r[0] === name) || null;
  }

  function report(u, c, score) {
    const list = Object.values(c).sort((a, b) => a.score - b.score);
    const weak = list[0], weak2 = list[1], strong = list[list.length - 1];
    let opinion, opinionCls, opinionNote;
    if (score < 45) { opinion = '적극 매수'; opinionCls = 'sbuy'; opinionNote = '저평가 구간입니다. 체력은 낮은 구간에서 운동을 시작할 때 개선 폭이 가장 큽니다.'; }
    else if (score < 65) { opinion = '매수'; opinionCls = 'buy'; opinionNote = '업종 평균권입니다. 약한 지표 하나만 끌어올려도 주가가 눈에 띄게 오릅니다.'; }
    else if (score < 80) { opinion = '비중 확대'; opinionCls = 'buy'; opinionNote = '업종 상위권입니다. 지금 습관을 유지하면서 약한 지표를 보완하면 우량주로 올라섭니다.'; }
    else { opinion = '보유 (우량주)'; opinionCls = 'hold'; opinionNote = '업종 최상위권입니다. 지금의 운동 습관이 곧 배당입니다. 꾸준히 유지하는 것이 가장 좋은 전략입니다.'; }

    // 12주 목표주가: 최약 지표 +12p, 차약 지표 +6p
    const c2 = JSON.parse(JSON.stringify(c));
    c2[weak.key].score = clamp(c2[weak.key].score + 12, 0, 100);
    if (weak2) c2[weak2.key].score = clamp(c2[weak2.key].score + 6, 0, 100);
    const tScore = composite(c2);
    const target = priceOf(tScore);

    const risks = [];
    list.forEach(x => {
      if (x.key === 'body' && u.bmi >= 25) risks.push('체성분: BMI ' + u.bmi.toFixed(1) + '로 비만 기준(25 이상)에 해당합니다.');
      else if (x.key === 'body' && u.bmi < 18.5) risks.push('체성분: BMI ' + u.bmi.toFixed(1) + '로 저체중 구간입니다. 근육량 확보가 우선입니다.');
      else if (x.key === 'bp' && u.sbp >= 130) risks.push('혈압: 수축기 ' + u.sbp + 'mmHg입니다. 고강도 운동 전에 전문의와 상담하세요.');
      else if ((x.key === 'strength' || x.key === 'cardio') && x.score < 30) risks.push(x.label + ': 업종 하위 ' + Math.round(x.pct) + '% 구간(' + x.rating + ')입니다.');
    });

    const weakDomain = weak.key === 'cardio' && u.elder ? 'mobility' : weak.key;
    const w2Domain = weak2 ? (weak2.key === 'cardio' && u.elder ? 'mobility' : weak2.key) : 'cardio';
    const picks = [];
    const add = (name, wt, why) => {
      if (picks.find(p => p.name === name)) { picks.find(p => p.name === name).wt += wt; return; }
      picks.push({ name, wt, why, row: boardRow(name) });
    };
    const A = SPORT_MAP[weakDomain] || SPORT_MAP.cardio;
    const B2 = SPORT_MAP[w2Domain] || SPORT_MAP.strength;
    add(A[0], 40, weak.label + ' 보강');
    add(A[1], 25, weak.label + ' 보강');
    add(B2[0], 20, (weak2 ? weak2.label : '균형') + ' 보완');
    const KEEP = { strength: '클라이밍', cardio: '배드민턴', mobility: '탁구', body: '댄스(줌바 등)', bp: '요가' };
    const keepName = KEEP[strong.key === 'cardio' && u.elder ? 'mobility' : strong.key] || '배드민턴';
    add(keepName, 15, strong.label + ' 유지');
    picks.sort((a, b) => b.wt - a.wt);

    return { opinion, opinionCls, opinionNote, target, upside: (target / priceOf(score) - 1) * 100, weak, weak2, strong, risks, picks };
  }

  /* ---------- 공개 API ---------- */
  function evaluate(raw) {
    const u = normalize(raw);
    const c = components(u);
    const score = composite(c);
    const price = priceOf(score);
    const rank = sectorRank(u, score);
    return {
      u, c, score, price,
      ipo: 50000,
      change: (price / 50000 - 1) * 100,
      rank,
      fitAge: fitnessAge(u),
      life: lifeProjection(u),
      twins: findTwins(u, 5),
      rep: report(u, c, score),
      sector: (u.age < 20 ? (binOf(u.age) === 10 ? '10대 초중반' : '10대 후반') : (Math.floor(u.age / 10) * 10) + '대') + ' ' + (u.sex === 'M' ? '남성' : '여성'),
      code: tickerCode(u)
    };
  }
  function tickerCode(u) {
    let h = 0; const s = u.name + u.sex + u.age;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return 'F' + String(h % 100000).padStart(5, '0');
  }

  window.FX = { evaluate, pctOf, valOf, valAtAge, table, binOf, rating, AWGS, twinsAll, hasTable, P, AGES };
})();
