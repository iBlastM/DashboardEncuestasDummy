/* Tablero de encuestas Metrix. Sin dependencias salvo Plotly (vendor/). */
(() => {
  'use strict';

  const D = window.ENCUESTA;
  const C = D.cats;
  const GEO = window.GEO;
  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Datos ---------- */
  const rows = D.rows.map(r => ({
    id: r[0], distrito: r[1], animo: r[2], lugar: r[3],
    muni: r[4], estatal: r[5], kuri: r[6],
    problema: r[7], preocupacion: r[8], gusta: r[9],
  }));
  const N = rows.length;

  const DIMS = {
    distrito: 'Distrito', animo: 'Ánimo', lugar: 'Lugar',
    problema: 'Problemática', preocupacion: 'Preocupación', gusta: 'Le gusta',
  };

  const LEVELS = [
    { key: 'muni',    name: 'Gobierno municipal', short: 'Municipal', color: '#7bc11d', symbol: 'circle' },
    { key: 'estatal', name: 'Gobierno estatal',   short: 'Estatal',   color: '#226726', symbol: 'square' },
    { key: 'kuri',    name: 'Mauricio Kuri',      short: 'Kuri',      color: '#111815', symbol: 'diamond' },
  ];

  const VIEWS = {
    aprobacion: {
      title: 'Aprobación de gobierno',
      desc: 'Cómo califican las personas al gobierno municipal, al estatal y a Mauricio Kuri, en escala del 1 al 10.',
    },
    agenda: {
      title: 'Agenda ciudadana',
      desc: 'Qué quiere resolver la gente, qué le preocupa y qué valora de vivir en Querétaro. Haz clic en una respuesta para filtrar.',
    },
    territorio: {
      title: 'Análisis territorial',
      desc: 'Dónde se califica mejor o peor a los gobiernos. Cambia la variable del mapa y compara distritos.',
    },
    distritos: {
      title: 'Distritos',
      desc: 'Los siete distritos de la base, lado a lado.',
    },
  };
  const ORDER = Object.keys(VIEWS);

  /* ---------- Estado ---------- */
  const state = {
    view: 'aprobacion',
    f: Object.fromEntries(Object.keys(DIMS).map(k => [k, new Set()])),
    sort: { key: 'distrito', dir: 'asc' },
    heatDim: 'preocupacion',
    mapMetric: 'kuri',
  };
  let enterPending = true;
  let entering = false;
  let wasEmpty = false;
  const FRESH = new Set();

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const hasFilters = () => Object.values(state.f).some(s => s.size);
  const match = (r, skip = []) => {
    for (const k in state.f) {
      if (skip.includes(k)) continue;
      const s = state.f[k];
      if (s.size && !s.has(r[k])) return false;
    }
    return true;
  };
  const except = (...dims) => rows.filter(r => match(r, dims));

  function toggle(dim, i) {
    const s = state.f[dim];
    s.has(i) ? s.delete(i) : s.add(i);
    render();
  }

  /* ---------- Estadistica ---------- */
  const mean = (a, k) => a.length ? a.reduce((s, r) => s + r[k], 0) / a.length : NaN;
  const countBy = (a, k) => { const c = new Array(C[k].length).fill(0); for (const r of a) c[r[k]]++; return c; };
  function bands(a, k) {
    let lo = 0, mid = 0, hi = 0;
    for (const r of a) { const v = r[k]; if (v <= 5) lo++; else if (v <= 7) mid++; else hi++; }
    const n = a.length || 1;
    return { pLo: lo / n, pMid: mid / n, pHi: hi / n, approve: (mid + hi) / n };
  }
  const base = Object.fromEntries(LEVELS.map(L => [L.key, mean(rows, L.key)]));
  const meanAll = a => LEVELS.reduce((s, L) => s + mean(a, L.key), 0) / LEVELS.length;

  function distStats(a) {
    const mood = countBy(a, 'animo'), conc = countBy(a, 'preocupacion');
    const n = a.length, top = conc.indexOf(Math.max(...conc));
    return {
      n, muni: mean(a, 'muni'), estatal: mean(a, 'estatal'), kuri: mean(a, 'kuri'),
      aprK: bands(a, 'kuri').approve, feliz: n ? mood[0] / n : NaN,
      mood: mood.map(v => n ? v / n : 0), conc: n ? { name: C.preocupacion[top], p: conc[top] / n } : null,
    };
  }

  const nf = new Intl.NumberFormat('es-MX');
  const f1 = v => Number.isFinite(v) ? v.toFixed(1) : 'n/d';
  const f2 = v => Number.isFinite(v) ? v.toFixed(2) : 'n/d';
  const pct = v => Number.isFinite(v) ? Math.round(v * 100) + '%' : 'n/d';
  const int = v => Number.isFinite(v) ? nf.format(Math.round(v)) : 'n/d';
  const roman = i => C.distrito[i].replace('Distrito ', '');

  /* ---------- Animacion: numeros ---------- */
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  /* Contador animado (count-up): el texto sube desde su valor anterior (o 0) hasta el real. */
  function tween(el, to, fmt, ms = 700, delay = 0) {
    const from = Number.isFinite(el._v) ? el._v : 0;
    el._v = to;
    cancelAnimationFrame(el._raf);
    clearTimeout(el._to);
    if (REDUCE || !Number.isFinite(to) || from === to) { el.textContent = fmt(to); return; }
    el.textContent = fmt(from);
    const run = () => {
      const t0 = performance.now();
      const step = now => {
        const p = Math.min(1, (now - t0) / ms);
        el.textContent = fmt(from + (to - from) * easeOut(p));
        if (p < 1) el._raf = requestAnimationFrame(step);
      };
      el._raf = requestAnimationFrame(step);
    };
    if (delay) el._to = setTimeout(run, delay); else run();
  }

  /* ---------- Tooltip propio (mapa) ---------- */
  const tip = $('#tip');
  function placeTip(x, y) {
    const r = tip.getBoundingClientRect();
    let left = x + 16, top = y + 14;
    if (left + r.width > innerWidth - 8) left = x - r.width - 16;
    if (top + r.height > innerHeight - 8) top = innerHeight - r.height - 8;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  }
  function showTip(html, x, y) {
    tip.innerHTML = html;
    tip.classList.add('on');
    tip.setAttribute('aria-hidden', 'false');
    placeTip(x, y);
  }
  function hideTip() { tip.classList.remove('on'); tip.setAttribute('aria-hidden', 'true'); }

  /* ---------- Plotly ---------- */
  const FONT = '"Hanken Grotesk", system-ui, sans-serif';
  const merge = (a, b) => {
    const o = { ...a };
    for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? merge(a[k] || {}, b[k]) : b[k];
    return o;
  };
  const layout = extra => merge({
    font: { family: FONT, size: 12, color: '#44524a' },
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { l: 36, r: 8, t: 10, b: 34 },
    autosize: true,
    showlegend: false,
    /* Etiquetas claras con texto oscuro: legibles sobre cualquier serie */
    hoverlabel: {
      bgcolor: '#ffffff', bordercolor: '#c3ccc0', align: 'left',
      font: { family: FONT, size: 13, color: '#14201a' },
    },
    xaxis: { showgrid: false, zeroline: false, linecolor: '#c3ccc0', ticks: 'outside', tickcolor: '#c3ccc0', ticklen: 4, fixedrange: true },
    yaxis: { gridcolor: '#e8ede5', zeroline: false, fixedrange: true, ticks: '', automargin: true },
  }, extra);
  const CONFIG = { displayModeBar: false, responsive: true };

  function bindClick(el) {
    if (el._bound || !el.on) return;
    el._bound = true;
    el.on('plotly_click', ev => { const p = ev.points && ev.points[0]; if (p && el._onClick) el._onClick(p); });
  }

  /* Dibuja o actualiza. Entrada: parte de `from` y anima hasta los datos. Cambios: anima desde el estado actual. */
  function plot(id, data, lay, from, onClick) {
    const el = document.getElementById(id);
    el._onClick = onClick || null;
    const tok = el._tok = (el._tok || 0) + 1;
    const fresh = !el.data || FRESH.has(id);
    FRESH.delete(id);
    const settle = () => { if (el._tok === tok) Plotly.react(el, data, lay, CONFIG).then(() => bindClick(el)); };

    if (REDUCE) { Plotly.react(el, data, lay, CONFIG).then(() => bindClick(el)); return; }

    const go = () => {
      const frame = { data: data.map(t => ({ x: t.x, y: t.y })), traces: data.map((_, i) => i) };
      if (lay.xaxis && lay.xaxis.range) frame.layout = { xaxis: { range: lay.xaxis.range } };
      if (lay.yaxis && lay.yaxis.range) frame.layout = { ...(frame.layout || {}), yaxis: { range: lay.yaxis.range } };
      Plotly.animate(el, frame, {
        transition: { duration: 600, easing: 'cubic-out' },
        frame: { duration: 600, redraw: true },
        mode: 'immediate',
      }).then(settle, settle);
    };

    if (fresh) {
      const start = data.map((t, i) => ({ ...t, ...(from[i] || {}) }));
      Plotly.react(el, start, lay, CONFIG).then(() => { bindClick(el); if (el._tok === tok) go(); });
    } else {
      go();
    }
  }

  /* ---------- Rail ---------- */
  const OPT_ICONS = {
    animo: ['smiley', 'smiley-meh', 'smiley-sad'],
    lugar: ['road-horizon', 'house', 'calendar-star'],
  };
  function buildRail() {
    for (const dim of ['distrito', 'animo', 'lugar']) {
      const mount = $(`#f-${dim} .opts`);
      mount.innerHTML = C[dim].map((name, i) => {
        const ic = OPT_ICONS[dim] ? `<svg class="icon"><use href="#i-${OPT_ICONS[dim][i]}"/></svg>` : '';
        return `<label class="opt ${ic ? 'has-icon' : ''}">
          <input type="checkbox" data-dim="${dim}" data-i="${i}">${ic}
          <span class="name">${esc(name)}</span><span class="count" data-count="${dim}-${i}"></span></label>`;
      }).join('');
    }
    $('#rail').addEventListener('change', e => {
      const t = e.target;
      if (t.matches('input[data-dim]')) toggle(t.dataset.dim, +t.dataset.i);
    });
  }

  function updateRail(cur) {
    for (const dim of ['distrito', 'animo', 'lugar']) {
      const counts = countBy(except(dim), dim);
      C[dim].forEach((_, i) => {
        const input = $(`input[data-dim="${dim}"][data-i="${i}"]`);
        input.checked = state.f[dim].has(i);
        tween($(`[data-count="${dim}-${i}"]`), counts[i], int, 500);
        input.closest('.opt').style.opacity = counts[i] === 0 && !input.checked ? 0.5 : 1;
      });
    }
    const n = cur.length;
    tween($('#n-cur'), n, int, 600);
    $('#n-of').textContent = hasFilters()
      ? `de ${nf.format(N)} entrevistas (${pct(n / N)})`
      : 'entrevistas, muestra completa';
    $('#n-bar').style.setProperty('--w', n / N);
    $('#reset').disabled = !hasFilters();
    $('#n-line').innerHTML = `Mostrando <b>${nf.format(n)}</b> de ${nf.format(N)} entrevistas`;
  }

  let prevChips = new Set();
  function updateChips() {
    const box = $('#chips');
    const items = [];
    const keys = new Set();
    for (const dim in state.f) for (const i of state.f[dim]) {
      const key = dim + ':' + i;
      keys.add(key);
      items.push(`<button type="button" class="chip ${prevChips.has(key) ? '' : 'new'}" data-dim="${dim}" data-i="${i}" aria-label="Quitar filtro ${esc(DIMS[dim])}: ${esc(C[dim][i])}">
        <small>${esc(DIMS[dim])}</small>${esc(C[dim][i])}<svg class="icon"><use href="#i-x"/></svg></button>`);
    }
    prevChips = keys;
    box.hidden = !items.length;
    box.innerHTML = items.length ? `<span class="chips-label">Filtros activos</span>${items.join('')}` : '';
  }

  /* ---------- Vista: Aprobacion ---------- */
  function legend(id, shaped) {
    $(id).innerHTML = LEVELS.map(L =>
      `<span><i class="sw ${shaped ? L.symbol : ''}" style="--c:${L.color}"></i>${esc(L.short)}</span>`).join('');
  }

  function initKpis() {
    $('#kpis').innerHTML = LEVELS.map(L => `<article class="card kpi span-4" data-k="${L.key}">
      <div class="kpi-top"><span class="kpi-name"><i class="sw ${L.symbol}" style="--c:${L.color}"></i>${esc(L.name)}</span></div>
      <div class="kpi-main">
        <span class="kpi-value" data-r="avg">0.00</span><span class="kpi-scale">/ 10</span>
        <div class="kpi-approve"><b data-r="app">0%</b><span>aprueba</span></div>
      </div>
      <span class="kpi-delta" data-r="delta"></span>
      <div class="band" role="img" data-r="band"><i class="lo"></i><i class="mid"></i><i class="hi"></i></div>
      <div class="band-legend">
        <span class="lo"><i class="sw"></i>Reprueba <b data-r="lo">0%</b></span>
        <span class="mid"><i class="sw"></i>Suficiente <b data-r="mid">0%</b></span>
        <span class="hi"><i class="sw"></i>Buena <b data-r="hi">0%</b></span>
      </div>
    </article>`).join('');
  }

  function renderKpis(cur) {
    LEVELS.forEach((L, idx) => {
      const card = $(`.kpi[data-k="${L.key}"]`);
      const q = r => $(`[data-r="${r}"]`, card);
      const avg = mean(cur, L.key), b = bands(cur, L.key), d = hasFilters() ? avg - base[L.key] : null;
      /* Al entrar a la vista los numeros arrancan despues de que la tarjeta aparece, una tras otra */
      const ms = entering ? 1700 : 800, dl = entering ? 350 + idx * 150 : 0;
      tween(q('avg'), avg, f2, ms, dl);
      tween(q('app'), b.approve, pct, ms, dl);
      tween(q('lo'), b.pLo, pct, ms, dl); tween(q('mid'), b.pMid, pct, ms, dl); tween(q('hi'), b.pHi, pct, ms, dl);
      const [lo, mid, hi] = $$('.band i', card);
      lo.style.flexGrow = b.pLo; mid.style.flexGrow = b.pMid; hi.style.flexGrow = b.pHi;
      q('band').setAttribute('aria-label', `Reprueba ${pct(b.pLo)}, suficiente ${pct(b.pMid)}, buena ${pct(b.pHi)}`);
      const el = q('delta');
      if (d === null) { el.className = 'kpi-delta'; el.textContent = 'Muestra completa'; }
      else if (Math.abs(d) < 0.05) { el.className = 'kpi-delta'; el.textContent = 'Igual que la muestra completa'; }
      else {
        el.className = 'kpi-delta ' + (d > 0 ? 'up' : 'down');
        el.innerHTML = `<svg class="icon"><use href="#i-caret-${d > 0 ? 'up' : 'down'}"/></svg>${d > 0 ? '+' : '-'}${Math.abs(d).toFixed(2)} vs. muestra completa`;
      }
    });
  }

  function renderDist(cur) {
    const xs = Array.from({ length: 10 }, (_, i) => i + 1);
    const xcat = xs.map(n => 'Calificación ' + n);
    const data = LEVELS.map(L => {
      const counts = new Array(10).fill(0);
      cur.forEach(r => counts[r[L.key] - 1]++);
      return {
        type: 'bar', name: L.short, x: xcat, y: counts.map(c => c / cur.length * 100),
        customdata: counts, marker: { color: L.color },
        hovertemplate: `<b>%{y:.1f}%</b> (%{customdata} personas)<extra>${L.short}</extra>`,
      };
    });
    const ymax = Math.max(...data.flatMap(t => t.y)) * 1.12;
    plot('plot-dist', data, layout({
      barmode: 'group', bargap: 0.18, bargroupgap: 0.05, hovermode: 'x unified', margin: { l: 40, r: 8, t: 10, b: 52 },
      xaxis: { type: 'category', tickmode: 'array', tickvals: xcat, ticktext: xs.map(String), title: { text: 'Calificación (1 a 10)', standoff: 8 } },
      yaxis: { ticksuffix: '%', range: [0, ymax], tickformat: '.0f' },
    }), data.map(t => ({ y: t.y.map(() => 0) })));
  }

  function renderDots() {
    const rs = except('distrito');
    const sel = state.f.distrito;
    const names = C.distrito;
    const avgs = LEVELS.map(L => names.map((_, i) => mean(rs.filter(r => r.distrito === i), L.key)));
    const all = avgs.flat().filter(Number.isFinite);
    const lo = Math.max(1, Math.floor(Math.min(...all) - 0.5)), hi = Math.min(10, Math.ceil(Math.max(...all) + 0.5));
    const op = names.map((_, i) => sel.size && !sel.has(i) ? 0.3 : 1);

    const lx = [], ly = [];
    names.forEach((n, i) => {
      const v = LEVELS.map((_, j) => avgs[j][i]).filter(Number.isFinite);
      if (!v.length) return;
      lx.push(Math.min(...v), Math.max(...v), null); ly.push(n, n, null);
    });
    const data = [{ type: 'scatter', mode: 'lines', x: lx, y: ly, line: { color: '#d3dccd', width: 5 }, hoverinfo: 'skip', showlegend: false, connectgaps: false }];
    LEVELS.forEach((L, j) => data.push({
      type: 'scatter', mode: 'markers', name: L.short, x: avgs[j], y: names,
      marker: { color: L.color, symbol: L.symbol, size: 11, opacity: op, line: { color: '#fff', width: 1.5 } },
      /* y unified: al pasar por la fila aparecen los tres promedios juntos */
      hovertemplate: `<b>%{x:.2f}</b><extra>${L.short}</extra>`,
    }));
    plot('plot-dots', data, layout({
      hovermode: 'y unified', margin: { l: 78, r: 12, t: 8, b: 52 },
      xaxis: { range: [lo, hi], dtick: 1, showgrid: true, gridcolor: '#e8ede5', title: { text: 'Promedio (1 a 10)', standoff: 8 } },
      yaxis: { autorange: 'reversed', type: 'category', gridcolor: 'rgba(0,0,0,0)', tickfont: { size: 12.5, color: '#14201a' } },
    }), data.map(t => ({ x: t.x.map(v => v === null ? null : lo) })),
    p => { const i = names.indexOf(p.y); if (i >= 0) toggle('distrito', i); });
  }

  function renderAvgBars(id, dim) {
    const rs = except(dim);
    const sel = state.f[dim];
    const names = C[dim];
    const op = names.map((_, i) => sel.size && !sel.has(i) ? 0.3 : 1);
    const data = LEVELS.map(L => {
      const ys = names.map((_, i) => {
        const g = rs.filter(r => r[dim] === i);
        return g.length ? mean(g, L.key) : null;
      });
      return {
        type: 'bar', name: L.short, x: names, y: ys, marker: { color: L.color, opacity: op },
        text: ys.map(v => v === null ? '' : v.toFixed(1)), textposition: 'outside', cliponaxis: false,
        textfont: { size: 12, color: '#14201a', family: FONT },
        hovertemplate: `<b>${L.short}</b>: %{y:.2f}<extra></extra>`,
      };
    });
    plot(id, data, layout({
      barmode: 'group', bargap: 0.28, bargroupgap: 0.06, hovermode: 'x unified', margin: { l: 30, r: 6, t: 22, b: 30 },
      xaxis: { tickfont: { size: 13, color: '#14201a' } },
      yaxis: { range: [0, 10.8], tickvals: [0, 2, 4, 6, 8, 10] },
    }), data.map(t => ({ y: t.y.map(v => v === null ? null : 0), text: t.y.map(() => '') })),
    p => { const i = names.indexOf(p.x); if (i >= 0) toggle(dim, i); });
  }

  function insights() {
    const ra = except('animo');
    const g = i => ra.filter(r => r.animo === i);
    const fel = g(0), tri = g(2);
    let t = 'Promedio del 1 al 10 según el estado de ánimo. Haz clic en un grupo para filtrarlo.';
    if (fel.length && tri.length) {
      const d = meanAll(fel) - meanAll(tri);
      t = `Quien se siente feliz califica en promedio ${Math.abs(d).toFixed(1)} puntos ${d >= 0 ? 'más alto' : 'más bajo'} que quien se siente triste, en los tres niveles.`;
    }
    $('#insight-animo').textContent = t;

    const rl = except('lugar');
    const per = C.lugar.map((n, i) => ({ n, v: meanAll(rl.filter(r => r.lugar === i)) })).filter(x => Number.isFinite(x.v));
    let t2 = 'Promedio del 1 al 10 según dónde se hizo la entrevista.';
    if (per.length > 1) {
      per.sort((a, b) => b.v - a.v);
      t2 = `Se califica más alto en ${per[0].n.toLowerCase()} (${f1(per[0].v)}) y más bajo en ${per[per.length - 1].n.toLowerCase()} (${f1(per[per.length - 1].v)}).`;
    }
    $('#insight-lugar').textContent = t2;
  }

  function renderAprobacion(cur) {
    renderKpis(cur);
    renderDist(cur);
    renderDots();
    renderAvgBars('plot-animo', 'animo');
    renderAvgBars('plot-lugar', 'lugar');
    insights();
  }

  /* ---------- Listas de ranking (persistentes: las barras se animan al cambiar) ---------- */
  function initRankList(ul, dim) {
    ul.innerHTML = C[dim].map((name, i) => `<li><button type="button" class="rank-row" data-dim="${dim}" data-i="${i}" aria-pressed="false">
      <span class="rank-name">${esc(name)}</span><span class="rank-bar"><i></i></span><span class="rank-val">0%</span></button></li>`).join('');
  }
  /* values: arreglo por categoria; order: indices en orden; scale: valor que llena la barra */
  function updateRankList(ul, dim, values, scale, fmt, titles) {
    const finite = values.map(v => Number.isFinite(v) ? v : -Infinity);
    const order = values.map((_, i) => i).sort((a, b) => finite[b] - finite[a]);
    const sel = state.f[dim];
    ul.classList.toggle('has-sel', sel.size > 0);
    order.forEach((i, rank) => {
      const li = ul.children[i];
      li.style.order = rank;
      const btn = li.firstElementChild;
      btn.setAttribute('aria-pressed', String(sel.has(i)));
      if (titles) btn.title = titles[i];
      $('.rank-bar i', li).style.setProperty('--w', Number.isFinite(values[i]) ? Math.max(0, values[i] / scale) : 0);
      tween($('.rank-val', li), values[i], fmt, entering ? 1200 : 600, entering ? 400 : 0);
    });
    return order;
  }

  function renderRank(dim) {
    const rs = except(dim);
    const counts = countBy(rs, dim);
    const total = rs.length || 1;
    const shares = counts.map(c => c / total);
    const order = updateRankList($(`#rank-${dim}`), dim, shares, Math.max(...shares, 0.0001), pct, counts.map(c => `${nf.format(c)} personas`));
    $(`#top-${dim}`).textContent = rs.length ? `Más mencionada: ${C[dim][order[0]]}, ${pct(shares[order[0]])}.` : 'Sin registros.';
  }

  /* ---------- Vista: Agenda (mapa de calor persistente) ---------- */
  let heatBuilt = null;
  function buildHeat() {
    const dim = state.heatDim;
    const head = `<thead><tr><th scope="col">Distrito</th>${C[dim].map((c, j) =>
      `<th scope="col"><button type="button" data-heatcol="${j}" aria-pressed="false">${esc(c)}</button></th>`).join('')}<th scope="col">Entrevistas</th></tr></thead>`;
    const body = C.distrito.map((name, i) => `<tr data-i="${i}" style="--r:${i}"><th scope="row"><button type="button" class="cell-link" data-heatrow="${i}" aria-pressed="false">${esc(name)}</button></th>${
      C[dim].map(() => '<td class="cell"></td>').join('')}<td class="n"></td></tr>`).join('');
    const foot = `<tfoot><tr><td>Todos los distritos</td>${C[dim].map(() => '<td style="text-align:center"></td>').join('')}<td class="n"></td></tr></tfoot>`;
    $('#heat').innerHTML = head + `<tbody>${body}</tbody>` + foot;
    heatBuilt = dim;
  }

  function renderHeat() {
    const dim = state.heatDim;
    if (heatBuilt !== dim) buildHeat();
    const rs = except('distrito', dim);
    const sel = state.f.distrito, selCol = state.f[dim];
    const cols = C[dim];
    const rowOf = i => rs.filter(r => r.distrito === i);
    const share = a => countBy(a, dim).map(v => a.length ? v / a.length : 0);
    const mat = C.distrito.map((_, i) => share(rowOf(i)));
    const tot = share(rs);
    const maxV = Math.max(...mat.flat(), 0.0001);
    const bg = v => `rgba(123,193,29,${(0.06 + 0.7 * (v / maxV)).toFixed(3)})`;

    $$('#heat thead th button[data-heatcol]').forEach((b, j) => {
      b.setAttribute('aria-pressed', String(selCol.has(j)));
      b.parentElement.classList.toggle('colsel', selCol.has(j));
    });
    $$('#heat tbody tr').forEach((tr, i) => {
      const a = rowOf(i), mx = Math.max(...mat[i]);
      tr.classList.toggle('sel', sel.has(i));
      tr.style.opacity = sel.size && !sel.has(i) ? 0.62 : 1;
      $('.cell-link', tr).setAttribute('aria-pressed', String(sel.has(i)));
      $$('td.cell', tr).forEach((td, j) => {
        const v = mat[i][j];
        td.textContent = a.length ? pct(v) : 'n/d';
        td.style.background = bg(v);
        td.classList.toggle('top', !!(a.length && v === mx && v > 0));
      });
      tween($('td.n', tr), a.length, int, 500);
    });
    $$('#heat tfoot td:not(.n)').forEach((td, j) => { if (j > 0) td.textContent = rs.length ? pct(tot[j - 1]) : 'n/d'; });
    tween($('#heat tfoot td.n'), rs.length, int, 500);

    const labels = { preocupacion: 'su mayor preocupación', problema: 'la problemática que quiere resolver', gusta: 'lo que más le gusta de vivir en Querétaro' };
    const topAll = tot.indexOf(Math.max(...tot));
    $('#heat-sub').textContent = rs.length
      ? `Porcentaje de personas de cada distrito que eligió ${labels[dim]}. En general destaca: ${cols[topAll]}.`
      : 'Sin registros.';
    $$('#heat-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dim === dim)));
  }

  function renderAgenda() {
    ['problema', 'preocupacion', 'gusta'].forEach(renderRank);
    renderHeat();
  }

  /* ---------- Vista: Territorio ---------- */
  const METRICS = {
    kuri:    { label: 'Calificación de Mauricio Kuri', get: s => s.kuri, fmt: f2, short: f1, scale: () => 10 },
    muni:    { label: 'Calificación del gobierno municipal', get: s => s.muni, fmt: f2, short: f1, scale: () => 10 },
    estatal: { label: 'Calificación del gobierno estatal', get: s => s.estatal, fmt: f2, short: f1, scale: () => 10 },
    aprK:    { label: 'Aprueba a Kuri (6 o más)', get: s => s.aprK, fmt: pct, short: pct, scale: () => 1 },
    feliz:   { label: 'Ciudadanos felices', get: s => s.feliz, fmt: pct, short: pct, scale: () => 1 },
    n:       { label: 'Entrevistas levantadas', get: s => s.n, fmt: int, short: int, scale: m => m },
  };
  const RAMP = [[0, [233, 244, 212]], [0.5, [123, 193, 29]], [1, [34, 103, 38]]];
  function ramp(t) {
    t = Math.min(1, Math.max(0, t));
    const [a, b] = t <= 0.5 ? [RAMP[0], RAMP[1]] : [RAMP[1], RAMP[2]];
    const k = (t - a[0]) / (b[0] - a[0]);
    return a[1].map((v, i) => Math.round(v + (b[1][i] - v) * k));
  }
  const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };

  let distStatsCache = [];

  function initMap() {
    const svg = $('#map');
    svg.setAttribute('viewBox', `0 0 ${GEO.w} ${GEO.h}`);
    const ctx = GEO.municipios.map(m => `<path class="m-muni" d="${m.d}"/>`).join('');
    const ctxLabels = GEO.municipios.map(m => `<text class="m-muni-label" x="${m.cx}" y="${m.cy}" text-anchor="middle">${esc(m.name)}</text>`).join('');
    const ds = GEO.distritos.map(d => `<g class="m-d" data-i="${d.i}" tabindex="0" role="button" aria-pressed="false" style="--k:${d.i}">
        <path d="${d.d}"/>
        <text class="m-num" x="${d.cx}" y="${d.cy}" text-anchor="middle">${roman(d.i)}</text>
        <text class="m-val" x="${d.cx}" y="${d.cy + 34}" text-anchor="middle"></text>
      </g>`).join('');
    svg.innerHTML = `<g class="m-ctx">${ctx}</g><g class="m-ctx-l">${ctxLabels}</g><g class="m-ds">${ds}</g>`;

    $('#cover').innerHTML = (() => {
      const max = Math.max(...GEO.distritos.map(d => d.secciones));
      return GEO.distritos.map(d => `<li style="--r:${d.i}"><span class="cv-name">${esc(C.distrito[d.i])}</span>
        <span class="cv-bar"><i style="--w:${d.secciones / max}"></i></span>
        <span class="cv-n">${d.secciones}</span>
        <span class="cv-m">${Object.entries(d.munis).map(([k, v]) => `${esc(k)} ${v}`).join(', ')}</span></li>`).join('');
    })();
    initRankList($('#rank-terr'), 'distrito');

    const tipHtml = i => {
      const s = distStatsCache[i];
      const g = GEO.distritos[i];
      if (!s || !s.n) return `<strong>${esc(C.distrito[i])}</strong><span class="tt-sub">Sin entrevistas con los filtros actuales</span>`;
      return `<strong>${esc(C.distrito[i])}</strong>
        <span class="tt-sub">${Object.keys(g.munis).map(esc).join(' y ')}, ${g.secciones} secciones</span>
        <dl class="tt-list">
          <div><dt>Entrevistas</dt><dd>${nf.format(s.n)}</dd></div>
          <div><dt><i class="sw circle" style="--c:#7bc11d"></i>Municipal</dt><dd>${f2(s.muni)}</dd></div>
          <div><dt><i class="sw" style="--c:#226726"></i>Estatal</dt><dd>${f2(s.estatal)}</dd></div>
          <div><dt><i class="sw diamond" style="--c:#111815"></i>Kuri</dt><dd>${f2(s.kuri)}</dd></div>
          <div><dt>Aprueba a Kuri</dt><dd>${pct(s.aprK)}</dd></div>
          <div><dt>Felices</dt><dd>${pct(s.feliz)}</dd></div>
        </dl>
        <span class="tt-sub">Preocupa más: ${esc(s.conc.name)} (${pct(s.conc.p)})</span>`;
    };
    svg.addEventListener('pointermove', e => {
      const g = e.target.closest('.m-d');
      if (!g) return hideTip();
      showTip(tipHtml(+g.dataset.i), e.clientX, e.clientY);
    });
    svg.addEventListener('pointerleave', hideTip);
    svg.addEventListener('focusin', e => {
      const g = e.target.closest('.m-d');
      if (!g) return;
      const r = g.getBoundingClientRect();
      showTip(tipHtml(+g.dataset.i), r.left + r.width / 2, r.top + r.height / 2);
    });
    svg.addEventListener('focusout', hideTip);
    svg.addEventListener('click', e => { const g = e.target.closest('.m-d'); if (g) toggle('distrito', +g.dataset.i); });
    svg.addEventListener('keydown', e => {
      const g = e.target.closest('.m-d');
      if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle('distrito', +g.dataset.i); }
    });
  }

  function renderTerritorio() {
    const rs = except('distrito');
    const sel = state.f.distrito;
    const M = METRICS[state.mapMetric];
    distStatsCache = C.distrito.map((_, i) => distStats(rs.filter(r => r.distrito === i)));
    const vals = distStatsCache.map(s => s.n ? M.get(s) : NaN);
    const live = vals.filter(Number.isFinite);
    const lo = Math.min(...live), hi = Math.max(...live);

    $('#map-metric').value = state.mapMetric;
    $('#map').classList.toggle('has-sel', sel.size > 0);
    $$('#map .m-d').forEach(g => {
      const i = +g.dataset.i, v = vals[i];
      const t = !Number.isFinite(v) ? NaN : hi === lo ? 0.5 : (v - lo) / (hi - lo);
      const rgb = Number.isFinite(t) ? ramp(t) : [221, 227, 218];
      g.querySelector('path').style.fill = `rgb(${rgb.join(',')})`;
      const dark = lum(rgb) < 0.2;
      g.style.setProperty('--tx', dark ? '#ffffff' : '#14201a');
      g.querySelector('.m-val').textContent = Number.isFinite(v) ? M.short(v) : 'n/d';
      g.classList.toggle('sel', sel.has(i));
      g.setAttribute('aria-pressed', String(sel.has(i)));
      g.setAttribute('aria-label', `${C.distrito[i]}: ${M.label} ${Number.isFinite(v) ? M.fmt(v) : 'sin datos'}`);
    });
    $('#ml-min').textContent = live.length ? M.short(lo) : '';
    $('#ml-max').textContent = live.length ? M.short(hi) : '';

    const scale = M.scale(hi);
    updateRankList($('#rank-terr'), 'distrito', vals, scale || 1, M.fmt, C.distrito.map((_, i) => `${nf.format(distStatsCache[i].n)} entrevistas`));
    $('#terr-rank-title').textContent = 'Ranking de distritos';
    $('#terr-rank-sub').textContent = M.label + '.';

    // Lectura
    const ranked = vals.map((v, i) => ({ v, i })).filter(x => Number.isFinite(x.v)).sort((a, b) => b.v - a.v);
    const notes = [];
    if (ranked.length > 1) {
      const b = ranked[0], w = ranked[ranked.length - 1];
      const gap = state.mapMetric === 'aprK' || state.mapMetric === 'feliz' ? `${Math.round((b.v - w.v) * 100)} puntos porcentuales` :
        state.mapMetric === 'n' ? `${nf.format(b.v - w.v)} entrevistas` : `${(b.v - w.v).toFixed(2)} puntos`;
      notes.push(`<b>${esc(C.distrito[b.i])}</b> tiene el valor más alto (${M.fmt(b.v)}) y <b>${esc(C.distrito[w.i])}</b> el más bajo (${M.fmt(w.v)}): una brecha de ${gap}.`);
    } else if (ranked.length === 1) {
      notes.push(`Solo <b>${esc(C.distrito[ranked[0].i])}</b> tiene entrevistas con los filtros actuales (${M.fmt(ranked[0].v)}).`);
    }
    const rsAll = rs;
    if (rsAll.length) {
      const c = countBy(rsAll, 'preocupacion');
      const top = c.indexOf(Math.max(...c));
      const sh = C.distrito.map((_, i) => { const a = rsAll.filter(r => r.distrito === i); return a.length ? a.filter(r => r.preocupacion === top).length / a.length : NaN; });
      const rk = sh.map((v, i) => ({ v, i })).filter(x => Number.isFinite(x.v)).sort((a, b) => b.v - a.v);
      if (rk.length > 1) notes.push(`«${esc(C.preocupacion[top])}» es la mayor preocupación en general. Pesa más en <b>${esc(C.distrito[rk[0].i])}</b> (${pct(rk[0].v)}) y menos en <b>${esc(C.distrito[rk[rk.length - 1].i])}</b> (${pct(rk[rk.length - 1].v)}).`);
    }
    const cross = GEO.distritos.filter(d => Object.keys(d.munis).length > 1);
    if (cross.length) notes.push(`<b>${esc(C.distrito[cross[0].i])}</b> es el único que cruza dos municipios: ${Object.entries(cross[0].munis).map(([k, v]) => `${esc(k)} (${v} secciones)`).join(' y ')}.`);
    $('#terr-notes').innerHTML = notes.map(n => `<li>${n}</li>`).join('');
  }

  /* ---------- Vista: Distritos ---------- */
  const COLS = [
    { key: 'distrito', label: 'Distrito' },
    { key: 'n', label: 'Entrevistas' },
    { key: 'muni', label: 'Municipal' },
    { key: 'estatal', label: 'Estatal' },
    { key: 'kuri', label: 'Kuri' },
    { key: 'aprK', label: 'Aprueba a Kuri' },
    { key: 'feliz', label: '% feliz' },
    { key: 'conc', label: 'Mayor preocupación', nosort: true },
  ];

  function renderDistritos() {
    const rs = except('distrito');
    const sel = state.f.distrito;
    let data = C.distrito.map((name, i) => ({ i, name, ...distStats(rs.filter(r => r.distrito === i)) }));
    const { key, dir } = state.sort;
    data.sort((a, b) => {
      const va = key === 'distrito' ? a.i : a[key], vb = key === 'distrito' ? b.i : b[key];
      const x = (Number.isFinite(va) ? va : -1) - (Number.isFinite(vb) ? vb : -1);
      return dir === 'asc' ? x : -x;
    });
    const live = data.filter(d => d.n > 0);
    const best = k => Math.max(...live.map(d => d[k])), worst = k => Math.min(...live.map(d => d[k]));
    const cls = (k, v) => live.length > 1 ? (v === best(k) ? 'best' : v === worst(k) ? 'worst' : '') : '';

    const head = `<thead><tr>${COLS.map(c => {
      if (c.nosort) return `<th scope="col" class="concern-h">${c.label}</th>`;
      const active = state.sort.key === c.key;
      const aria = active ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
      const ic = active && state.sort.dir === 'asc' ? 'caret-up' : 'caret-down';
      return `<th scope="col" aria-sort="${aria}"><button type="button" data-sort="${c.key}">${c.label}<svg class="icon"><use href="#i-${ic}"/></svg></button></th>`;
    }).join('')}</tr></thead>`;

    const num = (k, v) => `<td class="${cls(k, v)}">${f2(v)}</td>`;
    const body = data.map((d, r) => `<tr data-i="${d.i}" class="${sel.has(d.i) ? 'sel' : ''}" style="--r:${r}">
      <td><button type="button" class="cell-link" data-row="${d.i}" aria-pressed="${sel.has(d.i)}">${esc(d.name)}</button></td>
      <td>${nf.format(d.n)}</td>
      ${num('muni', d.muni)}${num('estatal', d.estatal)}
      <td class="${cls('kuri', d.kuri)}"><span class="cell-bar"><b>${f2(d.kuri)}</b><span><i style="--w:${(d.kuri || 0) / 10}"></i></span></span></td>
      <td class="${cls('aprK', d.aprK)}">${pct(d.aprK)}</td>
      <td><span class="cell-mood"><b class="${cls('feliz', d.feliz)}">${pct(d.feliz)}</b>
        <span class="mood-bar" role="img" aria-label="Feliz ${pct(d.mood[0])}, regular ${pct(d.mood[1])}, triste ${pct(d.mood[2])}"><i class="f" style="flex:${d.mood[0]} 1 0"></i><i class="r" style="flex:${d.mood[1]} 1 0"></i><i class="t" style="flex:${d.mood[2]} 1 0"></i></span></span></td>
      <td class="concern">${d.conc ? `${esc(d.conc.name)} <small>${pct(d.conc.p)}</small>` : 'n/d'}</td>
    </tr>`).join('');

    const t = distStats(rs);
    const foot = `<tfoot><tr><td>Todos los distritos</td><td>${nf.format(t.n)}</td><td>${f2(t.muni)}</td><td>${f2(t.estatal)}</td><td><span class="cell-bar"><b>${f2(t.kuri)}</b><span></span></span></td>
      <td>${pct(t.aprK)}</td><td>${pct(t.feliz)}</td><td class="concern">${t.conc ? `${esc(t.conc.name)} <small>${pct(t.conc.p)}</small>` : 'n/d'}</td></tr></tfoot>`;

    const tbl = $('#tbl-dist');
    tbl.classList.toggle('has-sel', sel.size > 0);
    tbl.innerHTML = head + `<tbody>${body}</tbody>` + foot;
  }

  /* ---------- Orquestacion ---------- */
  function startEnter(view) {
    if (REDUCE) return;
    view.classList.remove('enter');
    $$('.card', view).forEach((c, k) => c.style.setProperty('--k', k));
    void view.offsetWidth;
    view.classList.add('enter');
    clearTimeout(view._enterT);
    view._enterT = setTimeout(() => view.classList.remove('enter'), 1700);
    $$('.plot', view).forEach(p => FRESH.add(p.id));
    $$('.kpi-value, .kpi-approve b, .band-legend b', view).forEach(el => { el._v = 0; });
    $$('.band i', view).forEach(el => { el.style.flexGrow = 0; });
    void view.offsetWidth;
    $$('.rank-bar i, .band i', view).forEach(el => el.style.removeProperty('transition'));
    $$('.rank-val', view).forEach(el => { el._v = 0; });
  }

  function placeTabInd() {
    const t = $('.tab[aria-selected="true"]');
    const ind = $('#tab-ind');
    if (!t) return;
    ind.style.transform = `translateX(${t.offsetLeft + 10}px) scaleX(${Math.max(1, t.offsetWidth - 20)})`;
  }

  function render() {
    const cur = rows.filter(r => match(r));
    updateRail(cur);
    updateChips();

    const v = VIEWS[state.view];
    $('#page-title').textContent = v.title;
    $('#page-desc').textContent = v.desc;
    $$('.tab').forEach(t => {
      const on = t.dataset.view === state.view;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    placeTabInd();

    const empty = cur.length === 0;
    $('#empty').hidden = !empty;
    $$('.view').forEach(el => { el.hidden = empty || el.id !== 'view-' + state.view; });

    const small = cur.length > 0 && cur.length < 50;
    $('#notice').hidden = !small;
    if (small) $('#notice-text').textContent = `Muestra pequeña (${cur.length} entrevistas): los promedios pueden cambiar mucho con pocas respuestas. Interprétalos con cautela.`;

    if (empty) { wasEmpty = true; hideTip(); return; }
    if (wasEmpty) { enterPending = true; wasEmpty = false; }
    entering = false;
    if (enterPending) { enterPending = false; entering = true; startEnter($('#view-' + state.view)); }

    if (state.view === 'aprobacion') renderAprobacion(cur);
    else if (state.view === 'agenda') renderAgenda();
    else if (state.view === 'territorio') renderTerritorio();
    else renderDistritos();
    entering = false;
  }

  function setView(v, focus) {
    state.view = v;
    enterPending = true;
    hideTip();
    if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
    render();
    if (focus) $(`#tab-${v}`).focus();
    $('#main').scrollTo({ top: 0 });
  }

  function resetAll() { Object.values(state.f).forEach(s => s.clear()); render(); }

  /* ---------- Eventos ---------- */
  function bind() {
    document.addEventListener('click', e => {
      const t = e.target.closest('button, tr[data-i]');
      if (!t) return;
      if (t.matches('.tab')) return setView(t.dataset.view);
      if (t.matches('#reset, [data-action="reset"]')) return resetAll();
      if (t.matches('#toggle-rail')) {
        const open = $('#rail').classList.toggle('open');
        t.setAttribute('aria-expanded', String(open));
        return;
      }
      if (t.matches('.chip')) return toggle(t.dataset.dim, +t.dataset.i);
      if (t.matches('.rank-row')) return toggle(t.dataset.dim, +t.dataset.i);
      if (t.matches('[data-sort]')) {
        const k = t.dataset.sort;
        state.sort = state.sort.key === k ? { key: k, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: k === 'distrito' ? 'asc' : 'desc' };
        return render();
      }
      if (t.matches('[data-heatcol]')) return toggle(state.heatDim, +t.dataset.heatcol);
      if (t.matches('#heat-seg button')) { state.heatDim = t.dataset.dim; return render(); }
      if (t.matches('.cell-link')) return toggle('distrito', +(t.dataset.row ?? t.dataset.heatrow));
      if (t.matches('tr[data-i]') && !e.target.closest('button')) return toggle('distrito', +t.dataset.i);
    });

    $('#map-metric').addEventListener('change', e => { state.mapMetric = e.target.value; render(); });

    $('.tabs').addEventListener('keydown', e => {
      const i = ORDER.indexOf(state.view);
      if (e.key === 'ArrowRight') setView(ORDER[(i + 1) % ORDER.length], true);
      else if (e.key === 'ArrowLeft') setView(ORDER[(i + ORDER.length - 1) % ORDER.length], true);
    });

    window.addEventListener('hashchange', () => {
      const v = location.hash.slice(1);
      if (VIEWS[v] && v !== state.view) { state.view = v; enterPending = true; render(); }
    });
    window.addEventListener('resize', placeTabInd);
    window.addEventListener('scroll', hideTip, true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeTabInd);
  }

  /* ---------- Arranque ---------- */
  $('#src').textContent = D.fuente;
  const h = location.hash.slice(1);
  if (VIEWS[h]) state.view = h;
  legend('#lg-dist'); legend('#lg-dots', true); legend('#lg-animo'); legend('#lg-lugar');
  buildRail();
  initKpis();
  ['problema', 'preocupacion', 'gusta'].forEach(d => initRankList($(`#rank-${d}`), d));
  initMap();
  bind();
  render();
})();
