/* 핏스닥 FITSDAQ — 화면 로직 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const fmt = n => Math.round(n).toLocaleString('ko-KR');
  const f1 = n => (Math.round(n * 10) / 10).toFixed(1);
  const cls = v => (v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'flat');
  const arr = v => (v > 0.05 ? '▲' : v < -0.05 ? '▼' : '─');
  const sgn = v => (v > 0 ? '+' : '') + f1(v);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ro = w => { const c = w.charCodeAt(w.length - 1); if (c < 0xac00 || c > 0xd7a3) return w + '로'; const j = (c - 0xac00) % 28; return w + (j && j !== 8 ? '으로' : '로'); };
  const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1); if (c < 0xac00 || c > 0xd7a3) return w + b; return w + ((c - 0xac00) % 28 ? a : b); };
  const FX = window.FX, FCH = window.FCH, MKT = window.FITSPI, BOARD = window.SPORT_BOARD;

  /* ---------- 저장소 ---------- */
  const KEY = 'fitsdaq.v1';
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)) || { history: [] }; } catch (e) { return { history: [] }; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } },
    clear() { try { localStorage.removeItem(KEY); } catch (e) { } }
  };
  const state = { raw: null, res: null, sample: false };

  /* ---------- 라우터 ---------- */
  const VIEWS = ['home', 'stock', 'market', 'board', 'about'];
  function route() {
    let v = (location.hash || '#home').slice(1);
    if (v === 'demo') { list(SAMPLES.a, true); return; }
    if (!VIEWS.includes(v)) v = 'home';
    VIEWS.forEach(x => { $('#v-' + x).hidden = x !== v; });
    $$('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.view === v));
    if (v === 'stock') renderStock();
    if (v === 'market') renderMarket();
    if (v === 'board') renderBoard();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  /* ---------- 세그먼트 버튼 ---------- */
  $$('.seg').forEach(seg => seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if (seg.dataset.mode) {
      const box = seg.closest('.box');
      box.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== b.dataset.v; });
    }
    seg.dispatchEvent(new CustomEvent('pick', { detail: b.dataset.v }));
  }));
  function setSeg(sel, v) {
    const seg = $(sel); if (!seg) return;
    const b = seg.querySelector(`button[data-v="${v}"]`); if (b) b.click();
  }

  /* ---------- 상장 신청서 ---------- */
  const ageInput = $('#f-age');
  function syncAgeBoxes() {
    const a = +ageInput.value;
    const elder = a >= 65;
    $('#box-vo2').hidden = elder;
    $('#box-fig8').hidden = !elder;
  }
  ageInput.addEventListener('input', syncAgeBoxes);

  function err(msg) { $('#f-err').textContent = msg || ''; return null; }
  function num(id) { const v = $(id).value.trim(); return v === '' ? null : +v; }
  function readForm(silent) {
    const fail = m => (silent ? null : err(m));
    const raw = { name: $('#f-name').value.trim(), sex: $('#f-sex .on').dataset.v };
    raw.age = num('#f-age'); raw.h = num('#f-h'); raw.w = num('#f-w');
    if (raw.age == null || raw.age < 10 || raw.age > 95) return fail('나이는 10~95세 사이로 입력해 주세요.');
    if (raw.h == null || raw.h < 120 || raw.h > 210) return fail('키는 120~210cm 사이로 입력해 주세요.');
    if (raw.w == null || raw.w < 25 || raw.w > 200) return fail('몸무게는 25~200kg 사이로 입력해 주세요.');
    if ($('[data-mode=grip] .on').dataset.v === 'in') {
      raw.grip = num('#f-grip');
      if (raw.grip == null) return fail('악력을 입력하거나 \'잘 모르겠어요\'를 눌러 주세요.');
      if (raw.grip < 3 || raw.grip > 90) return fail('악력은 3~90kg 사이로 입력해 주세요.');
    } else raw.gripQuiz = $$('.gq').filter(c => c.checked).length;
    if (raw.age < 65) {
      if ($('[data-mode=vo2] .on').dataset.v === 'in') {
        raw.vo2 = num('#f-vo2');
        if (raw.vo2 == null || raw.vo2 < 10 || raw.vo2 > 80) return fail('VO₂max는 10~80 사이로 입력하거나 \'잘 모르겠어요\'를 눌러 주세요.');
      } else raw.par = +$('#f-par').value;
    } else {
      if ($('[data-mode=fig8] .on').dataset.v === 'in') {
        raw.fig8 = num('#f-fig8');
        if (raw.fig8 == null || raw.fig8 < 5 || raw.fig8 > 60) return fail('8자보행 기록은 5~60초 사이로 입력하거나 \'잘 모르겠어요\'를 눌러 주세요.');
      } else { raw.walk = $('#f-walk').value; raw.fall = $('#f-fall').checked; }
    }
    const s = num('#f-sbp');
    if (s != null) { if (s < 80 || s > 200) return fail('혈압은 80~200mmHg 사이로 입력해 주세요.'); raw.sbp = s; }
    if (!silent) err('');
    return raw;
  }
  function fillForm(raw) {
    $('#f-name').value = raw.name || '';
    setSeg('#f-sex', raw.sex || 'M');
    $('#f-age').value = raw.age || ''; $('#f-h').value = raw.h || ''; $('#f-w').value = raw.w || '';
    if (raw.grip != null) { setSeg('[data-mode=grip]', 'in'); $('#f-grip').value = raw.grip; }
    else { setSeg('[data-mode=grip]', 'q'); $$('.gq').forEach((c, i) => { c.checked = i < (raw.gripQuiz || 0); }); }
    if (raw.vo2 != null) { setSeg('[data-mode=vo2]', 'in'); $('#f-vo2').value = raw.vo2; }
    else { setSeg('[data-mode=vo2]', 'q'); $('#f-par').value = raw.par != null ? raw.par : 2; }
    if (raw.fig8 != null) { setSeg('[data-mode=fig8]', 'in'); $('#f-fig8').value = raw.fig8; }
    else { setSeg('[data-mode=fig8]', 'q'); $('#f-walk').value = raw.walk || 'normal'; $('#f-fall').checked = !!raw.fall; }
    $('#f-sbp').value = raw.sbp || '';
    syncAgeBoxes();
  }

  const SAMPLES = {
    a: { name: '예시·직장인', sex: 'F', age: 43, h: 162, w: 58, grip: 24, par: 2, sbp: 124 },
    b: { name: '예시·어르신', sex: 'M', age: 71, h: 168, w: 66, grip: 33, walk: 'normal', sbp: 132 }
  };
  $$('[data-sample]').forEach(b => b.addEventListener('click', () => {
    const raw = SAMPLES[b.dataset.sample];
    fillForm(raw);
    list(raw, true);
  }));

  $('#ipo').addEventListener('submit', e => {
    e.preventDefault();
    const raw = readForm();
    if (raw) list(raw, false);
  });

  function list(raw, sample) {
    state.raw = raw; state.sample = sample;
    state.res = FX.evaluate(raw);
    if (!sample) {
      const s = store.get();
      s.last = raw;
      s.history = (s.history || []).concat([{ t: new Date().toISOString(), name: state.res.u.name, price: state.res.price, fitAge: state.res.fitAge }]).slice(-30);
      store.set(s);
    }
    if (location.hash === '#stock') renderStock(); else location.hash = '#stock';
  }

  /* ---------- 내 종목 ---------- */
  function renderStock() {
    if (!state.res) {
      const s = store.get();
      if (s.last) { state.raw = s.last; state.res = FX.evaluate(s.last); state.sample = false; }
      else { state.raw = SAMPLES.a; state.res = FX.evaluate(SAMPLES.a); state.sample = true; }
    }
    $('#demo-banner').hidden = !state.sample;
    if (state.sample && state.raw) $('#demo-name').textContent = '예시 종목(' + state.raw.age + '세 ' + (state.raw.sex === 'F' ? '여성' : '남성') + ')';
    $('#stock-empty').hidden = !!state.res;
    $('#stock-body').hidden = !state.res;
    if (!state.res) return;
    const r = state.res, u = r.u;
    $('#q-name').textContent = u.name;
    $('#q-code').textContent = r.code;
    $('#q-sector').textContent = r.sector + ' 업종' + (state.sample ? ' · 예시' : '');
    $('#q-price').textContent = fmt(r.price);
    const diff = r.price - r.ipo;
    $('#q-chg').className = 'chg num ' + cls(diff);
    $('#q-chg').textContent = `${arr(diff)} ${fmt(Math.abs(diff))} (${sgn(r.change)}%)`;
    const top = r.rank.rank / r.rank.N * 100;
    $('#q-sub').innerHTML = `공모가(업종 중앙값) 50,000원 대비 · 업종 내 시가총액 <b class="num">${fmt(r.rank.rank)}위</b> / ${fmt(r.rank.N)}종목 (상위 ${top < 1 ? f1(top) : Math.round(top)}%)`;

    // KPI
    if (r.fitAge != null) {
      $('#k-fage').textContent = r.fitAge + '세';
      const d = r.fitAge - u.age;
      $('#k-fage-s').innerHTML = d < 0 ? `<span class="up">실제보다 ${-d}세 젊음</span>` : d > 0 ? `<span class="down">실제보다 ${d}세 많음</span>` : '실제 나이와 같음';
    } else { $('#k-fage').textContent = '성장기'; $('#k-fage-s').textContent = '10대는 백분위로 평가합니다'; }
    $('#k-op').innerHTML = `<span class="op ${r.rep.opinionCls}">${r.rep.opinion}</span>`;
    $('#k-op-s').textContent = josa(r.rep.weak.label, '이', '가') + ' 가장 약합니다';
    $('#k-tp').textContent = fmt(r.rep.target) + '원';
    $('#k-tp-s').innerHTML = `<span class="up">상승여력 ${sgn(r.rep.upside)}%</span>`;
    const cr = r.life.cross;
    if (cr.base != null && cr.base <= u.age) { $('#k-del').textContent = '도달'; $('#k-del-s').innerHTML = '<span class="down">근력 보강이 가장 시급합니다</span>'; }
    else if (cr.base == null) { $('#k-del').textContent = '안전'; $('#k-del-s').textContent = '100세까지 경고선 위(기준 경로)'; }
    else { $('#k-del').textContent = cr.base + '세'; $('#k-del-s').innerHTML = `운동 시 <span class="up">${cr.bull ? cr.bull + '세' : '100세+'}</span> · 방치 시 <span class="down">${cr.bear || '-'}세</span>`; }

    renderLife(r);
    renderFin(r);
    renderReport(r);
    renderPortfolio(r);
    renderTwins(r);
    renderWeekday();
    renderHistory();
  }

  function renderLife(r) {
    const L = r.life;
    const data = L.candles.map(d => Object.assign({}, d, d.now ? { bull: d.c, bear: d.c } : {}));
    const nowI = data.findIndex(d => d.now);
    FCH.candle($('#ch-life'), {
      data, height: 300, xEvery: 2, aria: '나이별 악력 전망 캔들 차트',
      yfmt: v => v + 'kg', xfmt: l => l + '세', minY: Math.min(L.cutoff - 4, 8),
      refLines: [{ y: L.cutoff, label: '근감소증 경고선 ' + L.cutoff + 'kg (AWGS 2019)' }],
      lines: [{ cls: 'bull', get: d => d.bull }, { cls: 'bear', get: d => d.bear }],
      notes: [{ i: nowI, text: '현재 ' + f1(r.u.grip) + 'kg' }],
      tip: d => `<b>${d.label}~${d.label + 4}세</b>${d.past ? ' (과거 추정)' : ''}<br>기준 ${f1(d.c)}kg` + (d.past || d.now ? '' : `<br><span class="up">강세 ${f1(d.bull)}kg</span> · <span class="down">약세 ${f1(d.bear)}kg</span>`)
    });
    const cr = L.cross;
    let t = `지금 악력은 같은 업종 안에서 ${Math.round(L.pNow)}백분위입니다. `;
    if (cr.base != null && cr.base <= r.u.age) t += `이미 근감소증 경고선(${L.cutoff}kg) 아래에 있어, 근력 운동을 바로 시작하는 것이 좋습니다.`;
    else t += `이 순위를 유지하면 ${cr.base ? cr.base + '세에' : '100세가 넘어서야'} 경고선에 닿고, 꾸준히 운동해 백분위를 15%p 올리면 ${cr.bull ? cr.bull + '세' : '100세 이후'}까지 늦출 수 있습니다. 반대로 운동이 부족하면 ${cr.bear ? cr.bear + '세' : '100세 이후'}에 경고선을 깰 수 있습니다.`;
    $('#life-cap').textContent = t;
  }

  function renderFin(r) {
    const order = ['strength', 'cardio', 'body', 'bp'];
    $('#fin').innerHTML = order.filter(k => r.c[k]).map(k => {
      const c = r.c[k];
      let pos;
      if (c.neutral) pos = `건강기준 ${Math.round(c.score)}점`;
      else { const t = 100 - c.pct; pos = '업종 ' + (t <= 50 ? `상위 ${Math.max(1, Math.round(t))}%` : `하위 ${Math.max(1, Math.round(c.pct))}%`); }
      const fill = c.neutral ? c.score : c.pct;
      const mk = c.neutral ? '' : `<div class="mk" style="left:calc(${c.pct}% - 1px)"></div>`;
      const val = c.key === 'body' ? f1(c.value) : c.key === 'bp' ? Math.round(c.value) : f1(c.value);
      return `<div class="fin-row"><div class="nm"><b>${c.label}</b><span>${c.sub}</span></div>
        <div><div class="val"><b class="num">${val}</b> ${c.unit}${c.est ? '<span class="est">추정</span>' : ''} · ${pos}</div>
        <div class="meter"><div class="mid"></div><div class="fill" style="width:${fill}%"></div>${mk}</div></div>
        <div class="rating r-${c.rating}">${c.rating}</div></div>`;
    }).join('');
  }

  function renderReport(r) {
    const u = r.u, rep = r.rep, w = rep.weak, s = rep.strong;
    let head;
    if (r.score >= 80) head = '업종 대표 우량주, 꾸준함이 곧 배당';
    else if (r.score >= 65) head = `${josa(s.label, '이', '가')} 이끄는 성장주, ${w.label}만 받쳐주면 우량주`;
    else if (r.score >= 45) head = `${w.label} 개선이 주가 재평가의 열쇠`;
    else head = `저평가 매력 충분, ${w.label}부터 턴어라운드`;
    const posTxt = c => c.neutral ? `건강기준 ${Math.round(c.score)}점` : (100 - c.pct <= 50 ? `상위 ${Math.max(1, Math.round(100 - c.pct))}%` : `하위 ${Math.max(1, Math.round(c.pct))}%`);
    const twinAvg = r.twins.reduce((a, t) => a + t.price, 0) / r.twins.length;
    const anyEst = Object.values(r.c).some(c => c.est);
    const d = new Date();
    const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    $('#report').innerHTML = `<div class="stamp">FITSDAQ RESEARCH</div>
      <div class="rh"><div><div class="t">핏스닥 리서치센터 · ${date} · ${r.sector} 업종</div><h4>${esc(u.name)} (${r.code}) — “${head}”</h4></div>
      <div class="tp"><div class="t">투자의견</div><span class="op ${rep.opinionCls}">${rep.opinion}</span><div class="t" style="margin-top:6px">12주 목표주가</div><div class="v num">${fmt(rep.target)}원</div></div></div>
      <div class="rep-grid">
        <div><h5>투자 포인트</h5><p>${s.label}(${s.sub}) 지표가 업종 ${ro(posTxt(s))} 가장 돋보입니다. 신용등급은 ${s.rating}입니다.</p></div>
        <div><h5>핵심 리스크</h5>${rep.risks.length ? '<ul>' + rep.risks.map(x => `<li>${x}</li>`).join('') + '</ul>' : '<p>눈에 띄는 리스크 요인은 없습니다.</p>'}</div>
        <div><h5>밸류에이션</h5><p>현재가 ${fmt(r.price)}원은 공모가 대비 ${sgn(r.change)}%이며, 업종 ${fmt(r.rank.N)}종목 가운데 ${fmt(r.rank.rank)}위 수준입니다. 나와 가장 닮은 체력 쌍둥이 5종목의 평균 주가는 ${fmt(twinAvg)}원입니다.</p></div>
        <div><h5>투자 전략</h5><p>${rep.opinionNote} ${w.label} 백분위를 12주 동안 12%p 끌어올리면 목표주가 ${fmt(rep.target)}원(상승여력 ${sgn(rep.upside)}%)에 닿을 수 있습니다. 포트폴리오에서는 ${rep.picks[0].name}·${rep.picks[1].name} 비중을 높게 가져가세요.${anyEst ? ' 추정치가 섞여 있으니, 체력인증센터에서 실측하면 시세가 더 정확해집니다.' : ''}</p></div>
      </div>
      <p class="cap">* 합성데이터 기반 자동 분석이며 의료 진단이 아닙니다. 핏스닥에는 '매도' 의견이 없습니다. 체력은 팔 수 없는 자산이니까요.</p>`;
  }

  function renderPortfolio(r) {
    const rows = r.rep.picks.map(p => {
      const row = p.row;
      const fee = row ? fmt(row[2]) + '원' : '-';
      let yoy = '-';
      if (row) {
        if (!row[4]) yoy = '<span class="up">신규</span>';
        else { const g = (row[5] / row[4] - 1) * 100; yoy = `<span class="${cls(g)}">${arr(g)} ${Math.abs(g).toFixed(0)}%</span>`; }
      }
      return `<tr><td><b>${p.name}</b></td><td><span class="wbar" style="width:${p.wt * 1.1}px"></span>${p.wt}%</td><td style="text-align:left">${p.why}</td><td class="num">${fee}</td><td class="num">${yoy}</td></tr>`;
    }).join('');
    $('#pf').innerHTML = `<tr><th>종목</th><th style="text-align:left">비중</th><th style="text-align:left">목적</th><th>월 수강료</th><th>거래량 전년비</th></tr>${rows}`;
  }

  function renderTwins(r) {
    const u = r.u;
    const second = u.elder ? '8자보행' : 'VO₂max';
    const me = `<tr class="me"><td><b>나</b> <span class="muted mono">${r.code}</span></td><td>${u.age}세</td><td class="num">${f1(u.grip)}</td><td class="num">${f1(u.elder ? u.fig8 : u.vo2)}</td><td class="num">${f1(u.bmi)}</td><td class="num"><b>${fmt(r.price)}</b></td><td>-</td></tr>`;
    const rows = r.twins.map(t => {
      const a = t.u;
      return `<tr><td class="mono">${t.code}</td><td>${a.age}~${a.age + 4}세</td><td class="num">${f1(a.grip)}</td><td class="num">${f1(u.elder ? a.fig8 : a.vo2)}</td><td class="num">${f1(a.bmi)}</td><td class="num ${cls(t.price - r.price)}">${fmt(t.price)}</td><td class="num">${t.sim}%</td></tr>`;
    }).join('');
    $('#tw').innerHTML = `<tr><th>종목</th><th style="text-align:left">나이</th><th>악력</th><th>${second}</th><th>BMI</th><th>주가</th><th>닮음</th></tr>${me}${rows}`;
    const best = r.twins.slice().sort((a, b) => b.price - a.price)[0];
    let cap = '';
    if (best && best.price > r.price) {
      const a = best.u;
      const dv = u.elder ? (u.fig8 - a.fig8) : (a.vo2 - u.vo2);
      const dg = a.grip - u.grip;
      const parts = [];
      if (dv > 0.5) parts.push(u.elder ? `8자보행이 ${f1(dv)}초 빠르고` : `VO₂max가 ${f1(dv)} 높고`);
      if (dg > 0.5) parts.push(`악력이 ${f1(dg)}kg 강합니다`);
      cap = `가장 비싼 쌍둥이 종목 ${best.code}(${fmt(best.price)}원)은 나와 체격이 비슷하지만 ` + (parts.length ? parts.join(' ').replace(/고$/, '습니다') + '.' : '체성분 지표가 더 좋습니다.') + ' 같은 체격에서도 운동 습관이 주가 차이를 만든다는 뜻입니다.';
    } else cap = '닮은 종목들 가운데 내 주가가 가장 높습니다. 지금 습관을 지키는 것이 최고의 전략입니다.';
    $('#tw-cap').textContent = cap;
  }

  function renderWeekday() {
    const wd = MKT.wd;
    const order = [1, 2, 3, 4, 5, 6, 0];
    const names = ['일', '월', '화', '수', '목', '금', '토'];
    const vals = order.map(i => wd[i]);
    const wk = [1, 2, 3, 4, 5];
    const minI = wk.reduce((m, i) => (wd[i] < wd[m] ? i : m), 1);
    const maxI = wk.reduce((m, i) => (wd[i] > wd[m] ? i : m), 1);
    FCH.bars($('#ch-wd'), { labels: order.map(i => names[i]), values: vals, highlight: [order.indexOf(minI)], height: 170, fmt: v => fmt(v), aria: '요일별 측정 건수' });
    const s = seasonality();
    const lowM = s.order.slice(-3).sort((a, b) => a - b).map(i => (i + 1) + '월').join('·');
    const hiM = s.order.slice(0, 2).sort((a, b) => a - b).map(i => (i + 1) + '월').join('·');
    $('#wd-cap').innerHTML = `평일 가운데 ${names[minI]}요일 측정 건수가 가장 적습니다(${names[maxI]}요일보다 ${Math.round((1 - wd[minI] / wd[maxI]) * 100)}% 적음). 월별로는 ${hiM}이 성수기, ${lowM}이 비수기입니다. 가까운 체력인증센터 찾기와 예약은 <a href="https://nfa.kspo.or.kr" target="_blank" rel="noopener">국민체력100</a>에서 할 수 있습니다.`;
  }

  function renderHistory() {
    const h = (store.get().history || []);
    const host = $('#hist');
    if (!h.length) { host.innerHTML = `<p class="muted" style="margin:0">${state.sample ? '예시 종목은 기록에 저장되지 않습니다.' : '아직 공시 기록이 없습니다.'}</p>`; return; }
    const last = h.slice(-8).reverse();
    host.innerHTML = `<div id="hist-sp" class="chart-host" style="min-height:56px"></div><div class="tbl-scroll"><table class="t"><tr><th>공시일</th><th>종목명</th><th>주가</th><th>체력나이</th></tr>${last.map(x => {
      const d = new Date(x.t);
      return `<tr><td class="num">${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</td><td>${esc(x.name)}</td><td class="num">${fmt(x.price)}</td><td class="num">${x.fitAge != null ? x.fitAge + '세' : '-'}</td></tr>`;
    }).join('')}</table></div><p class="cap">${h.length < 2 ? '운동 후 다시 측정해 \'실적 재공시\'를 누르면 내 주가 흐름이 차트로 쌓입니다.' : '최근 공시 ' + h.length + '건의 주가 흐름입니다.'}</p>`;
    if (h.length >= 2) FCH.spark($('#hist-sp'), h.map(x => x.price), { height: 56 });
  }

  $('#btn-edit').addEventListener('click', () => { if (state.raw) fillForm(state.raw); location.hash = '#home'; setTimeout(() => $('#ipo').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); });
  $('#btn-clear').addEventListener('click', () => { store.clear(); state.res = null; state.raw = null; alert('이 기기에 저장된 기록을 지웠습니다.'); });

  /* ---------- 공유 카드 ---------- */
  function rr(x, X, Y, W, H, R) { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); }
  function drawCard(r) {
    const cv = $('#share-canvas'), x = cv.getContext('2d');
    const W = 1080, H = 1350, F = '"Noto Sans KR","Noto Sans CJK KR",sans-serif';
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0a0d13'); g.addColorStop(1, '#0f1a2c');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // header
    const lg = x.createLinearGradient(70, 70, 130, 130); lg.addColorStop(0, '#22e3a1'); lg.addColorStop(1, '#0fa3ff');
    x.fillStyle = lg; rr(x, 70, 70, 64, 64, 14); x.fill();
    x.fillStyle = '#06110c'; x.font = `900 40px ${F}`; x.textAlign = 'center'; x.fillText('F', 102, 117);
    x.textAlign = 'left'; x.fillStyle = '#e9edf4'; x.font = `900 40px ${F}`; x.fillText('핏스닥', 152, 115);
    x.fillStyle = '#8c96aa'; x.font = `500 24px ${F}`; x.fillText('FITSDAQ · 내 체력이 상장되는 거래소', 290, 113);
    // name
    x.fillStyle = '#e9edf4'; x.font = `900 64px ${F}`; x.fillText(r.u.name, 70, 250);
    x.fillStyle = '#8c96aa'; x.font = `500 28px ${F}`; x.fillText(`${r.code} · ${r.sector} 업종`, 70, 298);
    // price
    x.fillStyle = '#e9edf4'; x.font = `900 150px ${F}`; x.fillText(fmt(r.price), 64, 470);
    const pw = x.measureText(fmt(r.price)).width;
    x.fillStyle = '#8c96aa'; x.font = `700 48px ${F}`; x.fillText('원', 80 + pw, 468);
    const diff = r.price - r.ipo;
    x.fillStyle = diff >= 0 ? '#ff4d5e' : '#3d8bff'; x.font = `700 40px ${F}`;
    x.fillText(`${arr(diff)} ${fmt(Math.abs(diff))} (${sgn(r.change)}%)  공모가 대비`, 70, 540);
    // tiles
    const tiles = [
      ['업종 순위', `${fmt(r.rank.rank)}위`, `/ ${fmt(r.rank.N)}종목`],
      ['체력나이', r.fitAge != null ? r.fitAge + '세' : '성장기', r.fitAge != null ? `실제 ${r.u.age}세` : '백분위 평가'],
      ['투자의견', r.rep.opinion, `목표 ${fmt(r.rep.target)}원`],
      ['경고선 도달', r.life.cross.base == null ? '안전' : (r.life.cross.base <= r.u.age ? '도달' : r.life.cross.base + '세'), '근감소증 기준']
    ];
    tiles.forEach((t, i) => {
      const X = 70 + (i % 2) * 480, Y = 600 + Math.floor(i / 2) * 200;
      x.fillStyle = '#151b28'; rr(x, X, Y, 460, 176, 22); x.fill();
      x.strokeStyle = '#2c3649'; x.lineWidth = 2; x.stroke();
      x.fillStyle = '#8c96aa'; x.font = `500 28px ${F}`; x.fillText(t[0], X + 30, Y + 52);
      x.fillStyle = i === 2 ? '#ff7a87' : '#e9edf4'; x.font = `900 54px ${F}`; x.fillText(t[1], X + 30, Y + 118);
      x.fillStyle = '#8c96aa'; x.font = `500 24px ${F}`; x.fillText(t[2], X + 30, Y + 154);
    });
    // mini life chart
    const C = r.life.candles, X0 = 90, Y0 = 1062, CW = 900, CH = 170;
    let lo = Infinity, hi = -Infinity; C.forEach(c => { lo = Math.min(lo, c.l, r.life.cutoff); hi = Math.max(hi, c.h); });
    const y = v => Y0 + CH - (v - lo) / (hi - lo) * CH;
    const band = CW / C.length;
    x.strokeStyle = '#ffc145'; x.setLineDash([10, 8]); x.lineWidth = 2;
    x.beginPath(); x.moveTo(X0, y(r.life.cutoff)); x.lineTo(X0 + CW, y(r.life.cutoff)); x.stroke(); x.setLineDash([]);
    C.forEach((c, i) => {
      const cx = X0 + band * i + band / 2;
      const col = c.c >= c.o ? '#ff4d5e' : '#3d8bff';
      x.globalAlpha = c.past ? 0.35 : 1;
      x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); x.moveTo(cx, y(c.h)); x.lineTo(cx, y(c.l)); x.stroke();
      x.fillStyle = col; const t = y(Math.max(c.o, c.c)), b = y(Math.min(c.o, c.c)); x.fillRect(cx - 14, t, 28, Math.max(4, b - t));
      if (c.now) { x.globalAlpha = 1; x.strokeStyle = '#22e3a1'; x.lineWidth = 4; x.beginPath(); x.arc(cx, y(c.c), 12, 0, Math.PI * 2); x.stroke(); }
    });
    x.globalAlpha = 1;
    x.fillStyle = '#8c96aa'; x.font = `500 24px ${F}`; x.fillText('생애 근력 차트 (10세 → 90세, 악력 기준)', 70, 1032);
    // footer
    x.fillStyle = '#5d677b'; x.font = `500 24px ${F}`;
    x.fillText('국민체력100 합성데이터 2만 명과 비교한 결과 · 의료 진단 아님', 70, 1290);
    x.fillStyle = '#22e3a1'; x.font = `700 26px ${F}`; x.textAlign = 'right';
    x.fillText(location.host ? location.host + location.pathname.replace(/index\.html$/, '') : 'FITSDAQ', W - 70, 1290);
    x.textAlign = 'left';
  }
  $('#btn-share').addEventListener('click', () => {
    if (!state.res) return;
    drawCard(state.res);
    const d = $('#dlg-share');
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  });
  $('#btn-close').addEventListener('click', () => { const d = $('#dlg-share'); if (d.close) d.close(); else d.removeAttribute('open'); });
  $('#btn-dl').addEventListener('click', () => {
    const cv = $('#share-canvas');
    const a = document.createElement('a');
    a.download = 'fitsdaq-' + (state.res ? state.res.code : 'card') + '.png';
    a.href = cv.toDataURL('image/png');
    document.body.appendChild(a); a.click(); a.remove();
  });

  /* ---------- 핏스피 ---------- */
  function seasonality() {
    const start = MKT.vol.start.split('-').map(Number);
    const sums = new Array(12).fill(0), cnt = new Array(12).fill(0);
    MKT.vol.rows.forEach((r, i) => {
      const y = start[0] + Math.floor((start[1] - 1 + i) / 12), m = (start[1] - 1 + i) % 12;
      if (y >= 2022 && y <= 2025) { sums[m] += r[0]; cnt[m]++; }
    });
    const avg = sums.map((s, i) => s / (cnt[i] || 1));
    const order = avg.map((v, i) => i).sort((a, b) => avg[b] - avg[a]);
    return { avg, order };
  }
  let mktDone = false;
  function renderMarket() {
    const O = MKT.ohlc;
    const data = O.map(o => ({ label: o[0], o: o[1], h: o[2], l: o[3], c: o[4] }));
    const last = data[data.length - 1], prev = data[data.length - 2];
    $('#m-idx').textContent = last.c.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const ch = (last.c / prev.c - 1) * 100;
    $('#m-chg').className = 'num ' + cls(ch);
    $('#m-chg').textContent = `${arr(ch)} ${f1(Math.abs(last.c - prev.c))} (${sgn(ch)}%)`;
    $('#m-asof').textContent = last.label.replace('-', '.') + ' 기준 · 전월 대비';
    // 통계
    const ath = data.reduce((m, d) => (d.h > m.h ? d : m), data[0]);
    const preF = data.filter(d => d.label <= '2020-02'), trF = data.filter(d => d.label >= '2020-03' && d.label <= '2021-12');
    const pre = preF.reduce((m, d) => (d.h > m.h ? d : m), preF[0]);
    const trough = trF.reduce((m, d) => (d.l < m.l ? d : m), trF[0]);
    const rec = data.find(d => d.label > trough.label && d.h > pre.h);
    const ytdBase = data.find(d => d.label === (+last.label.slice(0, 4) - 1) + '-12');
    const ytd = ytdBase ? (last.c / ytdBase.c - 1) * 100 : 0;
    $('#m-stats').innerHTML = [
      ['사상 최고치', ath.h.toLocaleString('ko-KR', { maximumFractionDigits: 1 }), ath.label.replace('-', '.')],
      ['코로나 낙폭', sgn((trough.l / pre.h - 1) * 100) + '%', `${pre.label.replace('-', '.')} → ${trough.label.replace('-', '.')}`],
      ['전고점 회복', rec ? rec.label.replace('-', '.') : '-', '코로나 이전 고점 돌파'],
      ['연초 대비', sgn(ytd) + '%', last.label.slice(0, 4) + '년 누적']
    ].map(s => `<div class="stat"><div class="k">${s[0]}</div><div class="v num">${s[1]}</div><div class="muted" style="font-size:12px">${s[2]}</div></div>`).join('');
    // 차트
    const trI = data.indexOf(trough), preI = data.indexOf(pre);
    FCH.candle($('#ch-mkt'), {
      data, height: 380, volume: { values: MKT.vol.rows.map(r => [r[1], r[2], r[3], r[4]]), colors: ['#7c5cff', '#3d8bff', '#22e3a1', '#ffc145'], label: '월 거래량(측정 건수)' }, volH: 70,
      xEvery: 12, xfmt: l => "'" + l.slice(2, 4), yfmt: v => fmt(v), aria: '핏스피 월봉 차트',
      notes: [{ i: preI, text: '코로나 직전 고점' }, { i: trI, text: '저점 ' + fmt(trough.l), pos: 'bottom' }, { i: data.length - 1, text: '사상 최고' }],
      tip: (d, i) => { const v = MKT.vol.rows[i]; return `<b>${d.label.replace('-', '.')}</b><br>시 ${f1(d.o)} · 고 ${f1(d.h)}<br>저 ${f1(d.l)} · 종 ${f1(d.c)}<br>측정 ${fmt(v[0])}건`; }
    });
    // 업종 비중(최근 완결 연도)
    const yr = +last.label.slice(0, 4) - 1;
    const st = MKT.vol.start.split('-').map(Number);
    const sum = [0, 0, 0, 0];
    MKT.vol.rows.forEach((r, i) => { const y = st[0] + Math.floor((st[1] - 1 + i) / 12); if (y === yr) { for (let k = 0; k < 4; k++) sum[k] += r[k + 1]; } });
    const tot = sum.reduce((a, b) => a + b, 0);
    $('#sec-y').textContent = yr + '년 측정 건수 기준';
    FCH.bars($('#ch-sec'), { labels: ['유소년', '청소년', '성인', '어르신'], values: sum.map(v => v / tot * 100), highlight: [2], fmt: v => f1(v) + '%', height: 180, aria: '연령층별 측정 비중' });
    $('#sec-cap').textContent = `${yr}년 핏스피 거래의 ${f1(sum[2] / tot * 100)}%는 성인, ${f1(sum[1] / tot * 100)}%는 청소년, ${f1(sum[3] / tot * 100)}%는 어르신 측정입니다.`;
    const s = seasonality();
    const lbl = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(m => m + '월');
    FCH.bars($('#ch-season'), { labels: lbl, values: s.avg.map(v => Math.round(v)), highlight: s.order.slice(0, 2), low: s.order.slice(-3), height: 180, showValues: false, aria: '월별 평균 측정 건수' });
    $('#season-cap').textContent = `${s.order.slice(0, 2).sort((a, b) => a - b).map(i => (i + 1) + '월').join('·')}은 학생 단체 측정이 몰리는 성수기이고, ${s.order.slice(-3).sort((a, b) => a - b).map(i => (i + 1) + '월').join('·')}은 비교적 한산합니다.`;
    mktDone = true;
  }

  /* ---------- 종목 시세판 ---------- */
  const SIDO = { 11: '서울', 26: '부산', 27: '대구', 28: '인천', 29: '광주', 30: '대전', 31: '울산', 36: '세종', 41: '경기', 43: '충북', 44: '충남', 46: '전남', 47: '경북', 48: '경남', 50: '제주', 51: '강원', 52: '전북', 12: '기타(코드 12)' };
  let boardSrc = 'vs', boardSort = { k: 1, dir: -1 };
  function renderBoard() {
    const rows = BOARD[boardSrc].slice();
    const keyFn = { 0: r => r[0], 1: r => r[1], 2: r => r[2], 3: r => r[3], 4: r => (r[4] ? r[5] / r[4] : 9), 5: r => r[6] };
    const kf = keyFn[boardSort.k];
    rows.sort((a, b) => { const A = kf(a), B = kf(b); return (A > B ? 1 : A < B ? -1 : 0) * boardSort.dir; });
    const th = (k, t, left) => `<th class="sortable" data-k="${k}"${left ? ' style="text-align:left"' : ''}>${t}${boardSort.k === k ? (boardSort.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`;
    $('#board').innerHTML = `<tr>${th(0, '종목', 1)}${th(2, '현재가')}${th(3, '평균가')}${th(1, '거래량')}${th(4, '전년비')}${th(5, '주말반')}</tr>` + rows.map(r => {
      let yoy;
      if (!r[4]) yoy = '<span class="up">신규</span>';
      else { const g = (r[5] / r[4] - 1) * 100; yoy = `<span class="${cls(g)}">${arr(g)} ${Math.abs(g).toFixed(1)}%</span>`; }
      return `<tr><td class="nm">${r[0]}</td><td class="num">${fmt(r[2])}</td><td class="num muted">${fmt(r[3])}</td><td class="num">${fmt(r[1])}</td><td class="num">${yoy}</td><td class="num">${Math.round(r[6] * 100)}%</td></tr>`;
    }).join('');
    $('#b-n').textContent = `승인 ${fmt(boardSrc === 'vs' ? BOARD.nV : BOARD.nD)}건 · 상위 ${rows.length}종목`;
    $$('#board th.sortable').forEach(t => t.addEventListener('click', () => {
      const k = +t.dataset.k;
      boardSort = { k, dir: boardSort.k === k ? -boardSort.dir : (k === 0 ? 1 : -1) };
      renderBoard();
    }));
    const sel = $('#b-sido');
    if (!sel.options.length) {
      Object.keys(BOARD.sd).sort((a, b) => (SIDO[a] || a).localeCompare(SIDO[b] || b, 'ko')).forEach(c => {
        const o = document.createElement('option'); o.value = c; o.textContent = SIDO[c] || ('코드 ' + c); sel.appendChild(o);
      });
      sel.value = '11';
      sel.addEventListener('change', renderSido);
    }
    renderSido();
  }
  function renderSido() {
    const c = $('#b-sido').value, rows = BOARD.sd[c] || [];
    const tot = rows.reduce((a, r) => a + r[1], 0);
    FCH.bars($('#ch-sido'), { labels: rows.map(r => r[0].replace('(줌바 등)', '')), values: rows.map(r => r[1]), highlight: [0], fmt: v => fmt(v) + '건', height: 190, aria: '시도별 인기 종목' });
  }
  $('#b-src').addEventListener('pick', e => { boardSrc = e.detail; boardSort = { k: 1, dir: -1 }; renderBoard(); });

  /* ---------- 실시간 시세 미리보기 ---------- */
  let liveRaw = SAMPLES.a, liveIsUser = false, lastLivePrice = null, liveTimer;
  function renderLive() {
    const raw = readForm(true);
    liveIsUser = !!raw;
    liveRaw = raw || SAMPLES.a;
    const r = FX.evaluate(liveRaw), u = r.u;
    $('#lv-tag').textContent = liveIsUser ? '내 입력 · 실시간' : '예시 · 43세 직장인';
    $('#lv-tag').className = 'chip' + (liveIsUser ? ' acc' : '');
    $('#lv-hint').textContent = liveIsUser ? '값을 바꿀 때마다 시세가 다시 계산됩니다' : '신청서에 입력하면 내 시세로 바로 바뀝니다';
    $('#lv-name').textContent = liveIsUser ? u.name : '예시·직장인';
    $('#lv-code').textContent = r.code;
    const pe = $('#lv-price');
    pe.textContent = fmt(r.price);
    if (lastLivePrice != null && lastLivePrice !== r.price) {
      pe.classList.remove('flash-up', 'flash-down'); void pe.offsetWidth;
      pe.classList.add(r.price > lastLivePrice ? 'flash-up' : 'flash-down');
      setTimeout(() => pe.classList.remove('flash-up', 'flash-down'), 700);
    }
    lastLivePrice = r.price;
    const diff = r.price - r.ipo;
    $('#lv-chg').className = 'num ' + cls(diff);
    $('#lv-chg').textContent = `${arr(diff)} ${fmt(Math.abs(diff))} (${sgn(r.change)}%)`;
    $('#lv-sub').textContent = `${r.sector} 업종 ${fmt(r.rank.rank)}위 / ${fmt(r.rank.N)}종목 · 공모가 50,000원 대비`;
    $('#lv-age').textContent = r.fitAge != null ? r.fitAge + '세' : '성장기';
    $('#lv-op').innerHTML = `<span class="op ${r.rep.opinionCls}" style="font-size:14px">${r.rep.opinion}</span>`;
    $('#lv-tp').textContent = fmt(r.rep.target) + '원';
    const cr = r.life.cross;
    $('#lv-del').textContent = cr.base == null ? '안전' : (cr.base <= u.age ? '도달' : cr.base + '세');
    const data = r.life.candles.map(d => Object.assign({}, d, d.now ? { bull: d.c, bear: d.c } : {}));
    FCH.candle($('#lv-chart'), {
      data, height: 132, rightAxis: false, xEvery: 4, xfmt: l => l + '세', aria: '생애 근력 미니 차트',
      refLines: [{ y: r.life.cutoff, label: '경고선 ' + r.life.cutoff + 'kg' }],
      lines: [{ cls: 'bull', get: d => d.bull }, { cls: 'bear', get: d => d.bear }],
      tip: d => `<b>${d.label}~${d.label + 4}세</b><br>악력 ${f1(d.c)}kg`
    });
  }
  const scheduleLive = () => { clearTimeout(liveTimer); liveTimer = setTimeout(renderLive, 120); };
  $('#ipo').addEventListener('input', scheduleLive);
  $('#ipo').addEventListener('change', scheduleLive);
  $$('#ipo .seg').forEach(sg => sg.addEventListener('pick', scheduleLive));
  $('#lv-open').addEventListener('click', () => { const raw = readForm(true); if (raw) list(raw, false); else list(SAMPLES.a, true); });

  /* ---------- 티커 테이프 & 미니 지수 ---------- */
  function tape() {
    const O = MKT.ohlc, last = O[O.length - 1], prev = O[O.length - 2];
    const ch = (last[4] / prev[4] - 1) * 100;
    const items = [`<span class="tape-item"><b>핏스피</b>${last[4].toLocaleString('ko-KR', { maximumFractionDigits: 1 })} <span class="${cls(ch)}">${arr(ch)}${Math.abs(ch).toFixed(2)}%</span></span>`];
    BOARD.vs.filter(r => r[4] >= 20).map(r => ({ r, g: (r[5] / r[4] - 1) * 100 })).sort((a, b) => Math.abs(b.g) - Math.abs(a.g)).slice(0, 9)
      .forEach(({ r, g }) => items.push(`<span class="tape-item"><b>${r[0]}</b>${fmt(r[2])} <span class="${cls(g)}">${arr(g)}${Math.abs(g).toFixed(1)}%</span></span>`));
    const med = (sex, m, age) => FX.valOf(FX.table(sex, m, age), 50);
    [['M', 30, '30대 남'], ['F', 40, '40대 여'], ['M', 70, '70대 남'], ['F', 20, '20대 여']].forEach(([s, a, n]) => {
      items.push(`<span class="tape-item"><b>${n} 악력</b>${f1(med(s, 'grip', a))}kg</span>`);
    });
    $('#tape').innerHTML = items.join('');
    // 미니
    $('#mini-v').textContent = last[4].toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    $('#mini-c').innerHTML = `<span class="${cls(ch)}">${arr(ch)} ${Math.abs(last[4] - prev[4]).toFixed(1)} (${sgn(ch)}%)</span> <span class="muted">· ${last[0].replace('-', '.')}</span>`;
    FCH.spark($('#mini-sp'), O.slice(-48).map(o => o[4]), { height: 54 });
  }
  const mini = $('#mini-mkt');
  mini.addEventListener('click', () => { location.hash = '#market'; });
  mini.addEventListener('keydown', e => { if (e.key === 'Enter') location.hash = '#market'; });

  /* ---------- 리사이즈 시 차트 재그리기 ---------- */
  let rz;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      const v = (location.hash || '#home').slice(1);
      if (v === 'stock' && state.res) { renderLife(state.res); renderWeekday(); renderHistory(); }
      if (v === 'market') renderMarket();
      if (v === 'board') renderSido();
      if (v === 'home') { tape(); renderLive(); }
    }, 150);
  });

  /* ---------- 시작 ---------- */
  syncAgeBoxes();
  tape();
  renderLive();
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
})();
