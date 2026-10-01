/* 핏스닥 FITSDAQ — 경량 SVG 차트 (외부 라이브러리 없음) */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }
  function tooltip(host) {
    let t = host.querySelector('.ch-tip');
    if (!t) { t = document.createElement('div'); t.className = 'ch-tip'; host.appendChild(t); }
    return t;
  }

  /* 캔들 차트 */
  function candle(host, opt) {
    host.innerHTML = '';
    host.style.position = 'relative';
    const data = opt.data;
    const W = Math.max(300, host.clientWidth || 640);
    const volH = opt.volume ? (opt.volH || 64) : 0;
    const H = opt.height || 300;
    const m = { l: 10, r: opt.rightAxis === false ? 10 : 58, t: 18, b: 26 + (volH ? volH + 14 : 0) };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const up = css('--up') || '#f04452', dn = css('--down') || '#3b82f6';
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': opt.aria || '캔들 차트' }, host);

    let lo = Infinity, hi = -Infinity;
    data.forEach(d => { lo = Math.min(lo, d.l); hi = Math.max(hi, d.h); });
    (opt.refLines || []).forEach(r => { lo = Math.min(lo, r.y); hi = Math.max(hi, r.y); });
    const pad = (hi - lo) * 0.08 || 1;
    lo -= pad; hi += pad;
    if (opt.minY != null) lo = Math.min(lo, opt.minY);
    const y = v => m.t + ih - (v - lo) / (hi - lo) * ih;
    const band = iw / data.length;
    const x = i => m.l + band * i + band / 2;

    // grid
    const ticks = niceTicks(lo, hi, 4);
    ticks.forEach(tv => {
      el('line', { x1: m.l, x2: m.l + iw, y1: y(tv), y2: y(tv), class: 'grid' }, svg);
      if (opt.rightAxis !== false) {
        const tx = el('text', { x: m.l + iw + 8, y: y(tv) + 4, class: 'axis' }, svg);
        tx.textContent = opt.yfmt ? opt.yfmt(tv) : tv;
      }
    });
    // x labels
    const every = opt.xEvery || Math.ceil(data.length / 8);
    data.forEach((d, i) => {
      if (i % every !== 0 && i !== data.length - 1) return;
      if (i === data.length - 1 && i % every !== 0 && (data.length - 1) % every < every * 0.6) return;
      const tx = el('text', { x: x(i), y: m.t + ih + 16, class: 'axis', 'text-anchor': 'middle' }, svg);
      tx.textContent = opt.xfmt ? opt.xfmt(d.label, i) : d.label;
    });
    // ref lines
    (opt.refLines || []).forEach(r => {
      el('line', { x1: m.l, x2: m.l + iw, y1: y(r.y), y2: y(r.y), class: 'ref ' + (r.cls || '') }, svg);
      const tx = el('text', { x: m.l + 6, y: y(r.y) - 6, class: 'ref-label ' + (r.cls || '') }, svg);
      tx.textContent = r.label;
    });
    // scenario bands (선택)
    if (opt.lines) {
      opt.lines.forEach(L => {
        const pts = [];
        data.forEach((d, i) => { const v = L.get(d, i); if (v != null) pts.push(`${x(i)},${y(v)}`); });
        if (pts.length > 1) el('polyline', { points: pts.join(' '), class: 'sline ' + (L.cls || '') }, svg);
      });
    }
    // candles
    const cw = Math.max(2, Math.min(18, band * 0.62));
    data.forEach((d, i) => {
      const isUp = d.c >= d.o;
      const col = isUp ? up : dn;
      const g = el('g', { class: 'cd' + (d.past ? ' past' : '') + (d.now ? ' now' : '') }, svg);
      el('line', { x1: x(i), x2: x(i), y1: y(d.h), y2: y(d.l), stroke: col, 'stroke-width': 1.4 }, g);
      const top = y(Math.max(d.o, d.c)), bot = y(Math.min(d.o, d.c));
      el('rect', { x: x(i) - cw / 2, y: top, width: cw, height: Math.max(1.6, bot - top), fill: col, rx: 1.5 }, g);
      if (d.now) {
        el('circle', { cx: x(i), cy: y(d.c), r: 5.5, class: 'now-dot' }, g);
      }
    });
    // annotations
    (opt.notes || []).forEach(n => {
      const d = data[n.i]; if (!d) return;
      const yy = n.pos === 'bottom' ? y(d.l) + 16 : y(d.h) - 10;
      const tx = el('text', { x: Math.min(Math.max(x(n.i), m.l + 40), m.l + iw - 40), y: yy, class: 'note', 'text-anchor': 'middle' }, svg);
      tx.textContent = n.text;
    });
    // volume
    if (volH) {
      const vy0 = H - 4, vh = volH;
      let vmax = 0; opt.volume.values.forEach(s => { vmax = Math.max(vmax, s.reduce((a, b) => a + b, 0)); });
      opt.volume.values.forEach((s, i) => {
        let acc = 0;
        s.forEach((v, k) => {
          const hgt = v / vmax * vh;
          el('rect', { x: x(i) - cw / 2, y: vy0 - (acc + hgt) / 1, width: cw, height: Math.max(0, hgt), fill: opt.volume.colors[k], opacity: .85 }, svg);
          acc += hgt;
        });
      });
      const lt = el('text', { x: m.l + 4, y: vy0 - vh + 10, class: 'axis' }, svg);
      lt.textContent = opt.volume.label || '거래량';
    }
    // hover
    const tip = tooltip(host);
    const hov = el('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' }, svg);
    const cross = el('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ih, class: 'cross', visibility: 'hidden' }, svg);
    const move = ev => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(data.length - 1, Math.floor((px - m.l) / band)));
      const d = data[i];
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      tip.innerHTML = opt.tip ? opt.tip(d, i) : `${d.label}<br>시 ${d.o} 고 ${d.h} 저 ${d.l} 종 ${d.c}`;
      tip.style.display = 'block';
      const left = x(i) / W * r.width;
      tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, left - tip.offsetWidth / 2)) + 'px';
      tip.style.top = '4px';
    };
    const leave = () => { tip.style.display = 'none'; cross.setAttribute('visibility', 'hidden'); };
    hov.addEventListener('mousemove', move); hov.addEventListener('touchstart', move, { passive: true });
    hov.addEventListener('touchmove', move, { passive: true });
    hov.addEventListener('mouseleave', leave); hov.addEventListener('touchend', () => setTimeout(leave, 1800));
    return svg;
  }

  /* 막대 차트 */
  function bars(host, opt) {
    host.innerHTML = '';
    const W = Math.max(260, host.clientWidth || 400), H = opt.height || 180;
    const m = { l: 6, r: 6, t: 22, b: 24 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': opt.aria || '막대 차트' }, host);
    const max = Math.max.apply(null, opt.values) || 1;
    const band = iw / opt.values.length, bw = Math.min(46, band * 0.62);
    opt.values.forEach((v, i) => {
      const h = v / max * ih;
      const cx = m.l + band * i + band / 2;
      const hl = opt.highlight != null && opt.highlight.includes(i);
      el('rect', { x: cx - bw / 2, y: m.t + ih - h, width: bw, height: h, rx: 3, class: hl ? 'bar hl' : (opt.low && opt.low.includes(i) ? 'bar lo' : 'bar') }, svg);
      const lt = el('text', { x: cx, y: m.t + ih + 16, class: 'axis', 'text-anchor': 'middle' }, svg);
      lt.textContent = opt.labels[i];
      if (opt.showValues !== false) {
        const vt = el('text', { x: cx, y: m.t + ih - h - 6, class: 'val', 'text-anchor': 'middle' }, svg);
        vt.textContent = opt.fmt ? opt.fmt(v) : v;
      }
    });
    return svg;
  }

  /* 스파크라인 */
  function spark(host, values, opt) {
    opt = opt || {};
    host.innerHTML = '';
    const W = Math.max(120, host.clientWidth || 200), H = opt.height || 48;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart spark' }, host);
    if (values.length < 2) return svg;
    const lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    const y = v => H - 4 - (v - lo) / ((hi - lo) || 1) * (H - 8);
    const x = i => 4 + i / (values.length - 1) * (W - 8);
    const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    el('polyline', { points: pts, class: 'spark-line ' + (values[values.length - 1] >= values[0] ? 'up' : 'down') }, svg);
    el('circle', { cx: x(values.length - 1), cy: y(values[values.length - 1]), r: 3, class: 'spark-dot' }, svg);
    return svg;
  }

  window.FCH = { candle, bars, spark };
})();
