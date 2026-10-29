/* Nucleo compartido de los tableros de Gestiones y Publicidad.
   Filtros combinables (Y entre campos, O dentro de un campo), etiquetas de filtros activos,
   pestañas, contadores animados, tooltip, Plotly animado, rankings y tabla paginada. */
(() => {
  'use strict';

  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const nf = new Intl.NumberFormat('es-MX');
  const fmt = {
    int: v => Number.isFinite(v) ? nf.format(Math.round(v)) : 'n/d',
    pct: v => Number.isFinite(v) ? Math.round(v * 100) + '%' : 'n/d',
    pct1: v => Number.isFinite(v) ? (v * 100).toFixed(1) + '%' : 'n/d',
    f1: v => Number.isFinite(v) ? v.toFixed(1) : 'n/d',
    date: s => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; },
  };

  function decode(D) {
    return D.rows.map(r => { const o = {}; D.cols.forEach((c, i) => { o[c] = r[i]; }); return o; });
  }

  /* ---------- Contador animado (count-up) ---------- */
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  function tween(el, to, f, ms = 700, delay = 0) {
    if (!el) return;
    const from = Number.isFinite(el._v) ? el._v : 0;
    el._v = to;
    cancelAnimationFrame(el._raf);
    clearTimeout(el._to);
    if (REDUCE || !Number.isFinite(to) || from === to) { el.textContent = f(to); return; }
    el.textContent = f(from);
    const run = () => {
      const t0 = performance.now();
      const step = now => {
        const p = Math.min(1, (now - t0) / ms);
        el.textContent = f(from + (to - from) * easeOut(p));
        if (p < 1) el._raf = requestAnimationFrame(step);
      };
      el._raf = requestAnimationFrame(step);
    };
    if (delay) el._to = setTimeout(run, delay); else run();
  }

  /* ---------- Tooltip propio ---------- */
  const Tip = {
    el: null,
    show(html, x, y) {
      const t = this.el || (this.el = $('#tip'));
      t.innerHTML = html;
      t.classList.add('on');
      t.setAttribute('aria-hidden', 'false');
      this.move(x, y);
    },
    move(x, y) {
      const t = this.el; if (!t) return;
      const r = t.getBoundingClientRect();
      let left = x + 16, top = y + 14;
      if (left + r.width > innerWidth - 8) left = x - r.width - 16;
      if (top + r.height > innerHeight - 8) top = innerHeight - r.height - 8;
      t.style.left = Math.max(8, left) + 'px';
      t.style.top = Math.max(8, top) + 'px';
    },
    hide() { if (this.el) { this.el.classList.remove('on'); this.el.setAttribute('aria-hidden', 'true'); } },
  };

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
    margin: { l: 40, r: 8, t: 10, b: 34 }, autosize: true, showlegend: false,
    hoverlabel: { bgcolor: '#ffffff', bordercolor: '#c3ccc0', align: 'left', font: { family: FONT, size: 13, color: '#14201a' } },
    xaxis: { showgrid: false, zeroline: false, linecolor: '#c3ccc0', ticks: 'outside', tickcolor: '#c3ccc0', ticklen: 4, fixedrange: true },
    yaxis: { gridcolor: '#e8ede5', zeroline: false, fixedrange: true, ticks: '', automargin: true },
  }, extra);
  const CONFIG = { displayModeBar: false, responsive: true };
  const FRESH = new Set();

  function bindClick(el) {
    if (el._bound || !el.on) return;
    el._bound = true;
    el.on('plotly_click', ev => { const p = ev.points && ev.points[0]; if (p && el._onClick) el._onClick(p); });
  }
  /* Primera vez: parte de `from` y anima a los datos. Despues: anima desde el estado actual. */
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
      if (lay.yaxis && lay.yaxis.range) frame.layout = { yaxis: { range: lay.yaxis.range } };
      Plotly.animate(el, frame, { transition: { duration: 600, easing: 'cubic-out' }, frame: { duration: 600, redraw: true }, mode: 'immediate' })
        .then(settle, settle);
    };
    if (fresh) {
      const start = data.map((t, i) => ({ ...t, ...(from[i] || {}) }));
      Plotly.react(el, start, lay, CONFIG).then(() => { bindClick(el); if (el._tok === tok) go(); });
    } else go();
  }

  /* ---------- Formas de marcador (geometria SVG, centradas en 10,10) ---------- */
  const SHAPES = {
    circle: 'M10 3.2a6.8 6.8 0 1 1 0 13.6a6.8 6.8 0 1 1 0-13.6Z',
    square: 'M4 4h12v12H4Z',
    star: (() => {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3.9 : 9;
        pts.push((10 + r * Math.cos(a)).toFixed(2) + ' ' + (10.6 + r * Math.sin(a)).toFixed(2));
      }
      return 'M' + pts.join('L') + 'Z';
    })(),
    triangle: 'M10 2.6L17.6 16H2.4Z',
    diamond: 'M10 2.4L17.6 10L10 17.6L2.4 10Z',
  };
  const shapeSvg = (shape, color, size = 14, stroke = '#ffffff') =>
    `<svg class="shape" width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true"><path d="${SHAPES[shape] || SHAPES.circle}" fill="${color}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

  /* ---------- Rampa de color (concentracion) ---------- */
  const RAMP = [[0, [233, 244, 212]], [0.5, [123, 193, 29]], [1, [34, 103, 38]]];
  function ramp(t) {
    t = Math.min(1, Math.max(0, t));
    const [a, b] = t <= 0.5 ? [RAMP[0], RAMP[1]] : [RAMP[1], RAMP[2]];
    const k = (t - a[0]) / (b[0] - a[0]);
    return `rgb(${a[1].map((v, i) => Math.round(v + (b[1][i] - v) * k)).join(',')})`;
  }
  function mix(hex, t) { // de casi blanco al color
    const h = hex.replace('#', ''); const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    const w = [244, 246, 242];
    return `rgb(${c.map((v, i) => Math.round(w[i] + (v - w[i]) * t)).join(',')})`;
  }

  /* =====================================================================
     Board: estado, filtros, rail, chips, pestañas y ciclo de render
     ===================================================================== */
  function Board(cfg) {
    const rows = cfg.rows;
    const N = rows.length;
    const dims = cfg.dims;
    const VIEWS = cfg.views;
    const ORDER = Object.keys(VIEWS);

    const state = Object.assign({
      view: ORDER[0],
      f: Object.fromEntries(Object.keys(dims).map(k => [k, new Set()])),
    }, cfg.state || {});

    let enterPending = true, wasEmpty = false;
    const api = { rows, N, dims, state, entering: false, $, $$, esc, fmt, tween, Tip, plot, layout, FRESH, shapeSvg, ramp, mix, norm };

    const hasFilters = () => Object.values(state.f).some(s => s.size);
    const match = (r, skip) => {
      for (const k in state.f) {
        if (skip && skip.includes(k)) continue;
        const s = state.f[k];
        if (s.size && !s.has(dims[k].get(r))) return false;
      }
      return true;
    };
    const except = (...d) => rows.filter(r => match(r, d));
    const countBy = (a, dim) => {
      const c = new Array(dims[dim].values.length).fill(0);
      for (const r of a) { const v = dims[dim].get(r); if (v !== null && v !== undefined) c[v]++; }
      return c;
    };
    function toggle(dim, i) { const s = state.f[dim]; s.has(i) ? s.delete(i) : s.add(i); render(); }
    function setOnly(dim, list) { state.f[dim] = new Set(list); render(); }
    function resetAll() { Object.values(state.f).forEach(s => s.clear()); render(); }
    Object.assign(api, { hasFilters, match, except, countBy, toggle, setOnly, resetAll, render: () => render() });

    /* ----- Rail ----- */
    function optHtml(dim, i) {
      const D = dims[dim];
      const pre = D.prefix ? D.prefix(i) : '';
      const sub = D.sub ? `<small>${esc(D.sub(i))}</small>` : '';
      return `<label class="opt ${pre ? 'has-icon' : ''}" data-name="${esc(norm(D.values[i] + ' ' + (D.sub ? D.sub(i) : '')))}">
        <input type="checkbox" data-dim="${dim}" data-i="${i}">${pre}
        <span class="name">${esc(D.label1 ? D.label1(i) : D.values[i])}${sub}</span><span class="count" data-count="${dim}-${i}"></span></label>`;
    }
    function buildRail() {
      const mount = $('#rail-filters');
      mount.innerHTML = cfg.railGroups.map(g => `<div class="rail-group"><h3>${esc(g.title)}</h3>${g.dims.map(dim => {
        const D = dims[dim];
        const opts = D.values.map((_, i) => optHtml(dim, i)).join('');
        if (D.kind === 'search') {
          return `<details class="fs-long" data-dim="${dim}" ${D.open ? 'open' : ''}>
            <summary><span class="fs-label">${esc(D.label)}</span><span class="fs-sum" data-sum="${dim}">Todas</span><svg class="icon"><use href="#i-caret-down"/></svg></summary>
            <div class="fs-body">
              <label class="search"><svg class="icon"><use href="#i-magnifying-glass"/></svg><span class="sr-only">Buscar en ${esc(D.label)}</span>
                <input type="search" data-search="${dim}" placeholder="Buscar ${esc(D.searchLabel || D.label.toLowerCase())}" autocomplete="off"></label>
              <div class="opts scroll" data-opts="${dim}">${opts}</div>
              <p class="fs-none" data-none="${dim}" hidden>Sin coincidencias.</p>
            </div></details>`;
        }
        return `<fieldset data-dim="${dim}"><legend>${esc(D.label)}</legend><div class="opts">${opts}</div></fieldset>`;
      }).join('')}</div>`).join('');

      $('#rail').addEventListener('change', e => {
        const t = e.target;
        if (t.matches('input[type="checkbox"][data-dim]')) toggle(t.dataset.dim, +t.dataset.i);
      });
      $('#rail').addEventListener('input', e => {
        const t = e.target;
        if (!t.matches('input[data-search]')) return;
        const q = norm(t.value.trim());
        let shown = 0;
        $$(`[data-opts="${t.dataset.search}"] .opt`).forEach(l => {
          const ok = !q || l.dataset.name.includes(q);
          l.hidden = !ok; if (ok) shown++;
        });
        $(`[data-none="${t.dataset.search}"]`).hidden = shown > 0;
      });
    }

    function updateRail(cur) {
      for (const dim in dims) {
        const D = dims[dim];
        if (!$(`[data-dim="${dim}"]`, $('#rail'))) continue;
        const counts = countBy(except(dim), dim);
        const sel = state.f[dim];
        D.values.forEach((_, i) => {
          const input = $(`input[data-dim="${dim}"][data-i="${i}"]`);
          input.checked = sel.has(i);
          tween($(`[data-count="${dim}-${i}"]`), counts[i], fmt.int, api.entering ? 900 : 450);
          const lab = input.closest('.opt');
          const zero = counts[i] === 0 && !input.checked;
          lab.classList.toggle('zero', zero);
          if (D.kind === 'search') lab.style.order = input.checked ? -1 : zero ? 1 : 0;
        });
        const sum = $(`[data-sum="${dim}"]`);
        if (sum) {
          sum.textContent = !sel.size ? 'Todas' : sel.size === 1 ? (D.short ? D.short([...sel][0]) : D.values[[...sel][0]]) : `${sel.size} seleccionadas`;
          sum.classList.toggle('on', sel.size > 0);
        }
      }
      const n = cur.length;
      tween($('#n-cur'), n, fmt.int, api.entering ? 1400 : 600, api.entering ? 200 : 0);
      $('#n-of').textContent = hasFilters() ? `de ${fmt.int(N)} ${cfg.noun[1]} (${fmt.pct(n / N)})` : `${cfg.noun[1]}, base completa`;
      $('#n-bar').style.setProperty('--w', n / N);
      $('#reset').disabled = !hasFilters();
      const nl = $('#n-line'); if (nl) nl.innerHTML = `Mostrando <b>${fmt.int(n)}</b> de ${fmt.int(N)} ${cfg.noun[1]}`;
    }

    let prevChips = new Set();
    function updateChips() {
      const box = $('#chips');
      const items = [], keys = new Set();
      for (const dim in state.f) for (const i of state.f[dim]) {
        const key = dim + ':' + i; keys.add(key);
        const D = dims[dim];
        const name = D.short ? D.short(i) : D.values[i];
        items.push(`<button type="button" class="chip ${prevChips.has(key) ? '' : 'new'}" data-chip-dim="${dim}" data-i="${i}" aria-label="Quitar filtro ${esc(D.label)}: ${esc(name)}">
          <small>${esc(D.chip || D.label)}</small>${esc(name)}<svg class="icon"><use href="#i-x"/></svg></button>`);
      }
      prevChips = keys;
      box.hidden = !items.length;
      box.innerHTML = items.length ? `<span class="chips-label">Filtros activos</span>${items.join('')}<button type="button" class="btn btn-quiet chips-clear" data-action="reset">Quitar todos</button>` : '';
    }

    /* ----- Pestañas ----- */
    function placeTabInd() {
      const t = $('.tab[aria-selected="true"]'), ind = $('#tab-ind');
      if (!t || !ind) return;
      ind.style.transform = `translateX(${t.offsetLeft + 10}px) scaleX(${Math.max(1, t.offsetWidth - 20)})`;
    }
    function startEnter(view) {
      if (REDUCE) return;
      view.classList.remove('enter');
      $$('.card', view).forEach((c, k) => c.style.setProperty('--k', k));
      $$('.plot', view).forEach(p => FRESH.add(p.id));
      $$('[data-count-up]', view).forEach(el => { el._v = 0; });
      void view.offsetWidth;
      view.classList.add('enter');
      clearTimeout(view._enterT);
      view._enterT = setTimeout(() => view.classList.remove('enter'), 1800);
    }

    function render() {
      const cur = rows.filter(r => match(r));
      api.entering = false;
      const view = $('#view-' + state.view);
      const empty = cur.length === 0;
      if (!empty && (enterPending || wasEmpty)) { enterPending = false; wasEmpty = false; api.entering = true; }

      updateRail(cur);
      updateChips();
      const v = VIEWS[state.view];
      $('#page-title').textContent = v.title;
      $('#page-desc').textContent = v.desc;
      $$('.tab').forEach(t => {
        const on = t.dataset.view === state.view;
        t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      });
      placeTabInd();

      $('#empty').hidden = !empty;
      $$('.view').forEach(el => { el.hidden = empty || el.id !== 'view-' + state.view; });
      const small = cur.length > 0 && cur.length < 20;
      $('#notice').hidden = !small;
      if (small) $('#notice-text').textContent = `Solo ${cur.length} ${cur.length === 1 ? cfg.noun[0] : cfg.noun[1]} con estos filtros: los porcentajes cambian mucho con pocos registros.`;
      const pressedOnly = (dim, list) => { const s = state.f[dim]; return s.size === list.length && list.every(i => s.has(i)); };
      $$('[data-only-dim]').forEach(b => b.setAttribute('aria-pressed', String(pressedOnly(b.dataset.onlyDim, b.dataset.i.split(',').map(Number)))));
      if (empty) { wasEmpty = true; Tip.hide(); return; }
      if (api.entering) startEnter(view);
      cfg.render(state.view, cur, api);
      api.entering = false;
    }

    function setView(v, focus) {
      state.view = v; enterPending = true; Tip.hide();
      if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
      render();
      if (focus) $(`#tab-${v}`).focus();
      $('#main').scrollTo({ top: 0 });
    }

    function bind() {
      document.addEventListener('click', e => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.matches('.tab')) return setView(t.dataset.view);
        if (t.matches('#reset, [data-action="reset"]')) return resetAll();
        if (t.matches('#toggle-rail')) {
          const open = $('#rail').classList.toggle('open');
          t.setAttribute('aria-expanded', String(open)); return;
        }
        if (t.matches('[data-chip-dim]')) return toggle(t.dataset.chipDim, +t.dataset.i);
        if (t.matches('[data-toggle-dim]')) return toggle(t.dataset.toggleDim, +t.dataset.i);
        if (t.matches('[data-only-dim]')) {
          const dim = t.dataset.onlyDim, list = t.dataset.i.split(',').map(Number);
          const s = state.f[dim];
          const same = s.size === list.length && list.every(i => s.has(i));
          return setOnly(dim, same ? [] : list);
        }
        if (t.matches('[data-goto]')) return setView(t.dataset.goto);
      });
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
      window.addEventListener('scroll', () => Tip.hide(), true);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeTabInd);
    }

    api.setView = setView;
    api.start = () => {
      $('#src').textContent = cfg.fuente;
      const h = location.hash.slice(1);
      if (VIEWS[h]) state.view = h;
      buildRail();
      bind();
      if (cfg.init) cfg.init(api);
      render();
    };
    return api;
  }

  /* =====================================================================
     Ranking persistente: las barras y cifras se animan al cambiar
     ===================================================================== */
  function Rank(ul, dim, names, opts = {}) {
    const limit = opts.limit || Infinity;
    ul.classList.add('rank');
    if (opts.sub) ul.classList.add('with-sub');
    if (opts.wideSub) ul.classList.add('wide-sub');
    ul.innerHTML = names.map((n, i) => `<li><button type="button" class="rank-row" data-toggle-dim="${dim}" data-i="${i}" aria-pressed="false">
      <span class="rank-name">${opts.prefix ? opts.prefix(i) : ''}<span>${esc(n)}</span></span><span class="rank-bar"><i></i></span>
      <span class="rank-val" data-count-up>0</span>${opts.sub ? '<span class="rank-sub"></span>' : ''}</button></li>`).join('');
    let more = null, expanded = false;
    if (Number.isFinite(limit) && names.length > limit) {
      more = document.createElement('button');
      more.type = 'button'; more.className = 'btn btn-quiet rank-more';
      ul.after(more);
      more.addEventListener('click', () => { expanded = !expanded; api.last && api.update(...api.last); });
    }
    const api = {
      last: null,
      update(values, sel, o = {}) {
        api.last = [values, sel, o];
        const f = o.fmt || (v => fmt.int(v));
        const finite = values.map(v => Number.isFinite(v) ? v : -Infinity);
        const order = values.map((_, i) => i).sort((a, b) => finite[b] - finite[a] || a - b);
        const scale = o.scale || Math.max(...values.filter(Number.isFinite), 1e-9);
        ul.classList.toggle('has-sel', sel.size > 0);
        let visible = 0;
        const nonzero = values.filter((v, i) => v > 0 || sel.has(i)).length;
        order.forEach((i, rank) => {
          const li = ul.children[i];
          li.style.order = rank;
          const hide = (!expanded && rank >= limit && !sel.has(i)) || (!(values[i] > 0) && !sel.has(i) && o.hideZero !== false);
          li.hidden = hide; if (!hide) visible++;
          const btn = li.firstElementChild;
          btn.setAttribute('aria-pressed', String(sel.has(i)));
          if (o.titles) btn.title = o.titles[i];
          $('.rank-bar i', li).style.setProperty('--w', Number.isFinite(values[i]) ? Math.max(0, values[i] / scale) : 0);
          tween($('.rank-val', li), values[i], f, o.entering ? 1100 : 550, o.entering ? 300 : 0);
          if (o.sub) $('.rank-sub', li).innerHTML = o.sub(i);
        });
        if (more) {
          more.hidden = nonzero <= limit;
          more.textContent = expanded ? 'Ver menos' : `Ver los ${nonzero}`;
        }
        return order;
      },
    };
    return api;
  }

  /* =====================================================================
     Tabla paginada con busqueda, orden y detalle desplegable
     ===================================================================== */
  function Pager(cfg) {
    const st = { q: '', sort: cfg.sort || { key: cfg.columns[0].key, dir: 'desc' }, page: 0, open: new Set(), data: [] };
    const size = cfg.pageSize || 15;
    const table = cfg.table, foot = cfg.footer, input = cfg.search;

    function draw() {
      const col = cfg.columns.find(c => c.key === st.sort.key);
      let data = st.q ? st.data.filter(r => cfg.match(r, st.q)) : st.data.slice();
      if (col && col.value) {
        data.sort((a, b) => {
          const va = col.value(a), vb = col.value(b);
          const x = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb;
          const y = x || (cfg.id(a) - cfg.id(b));
          return st.sort.dir === 'asc' ? y : -y;
        });
      }
      const pages = Math.max(1, Math.ceil(data.length / size));
      st.page = Math.min(st.page, pages - 1);
      const slice = data.slice(st.page * size, st.page * size + size);
      const ncol = cfg.columns.length;
      const head = `<thead><tr>${cfg.columns.map(c => {
        if (!c.value) return `<th scope="col" class="${c.cls || ''}">${c.label}</th>`;
        const on = st.sort.key === c.key;
        return `<th scope="col" class="${c.cls || ''}" aria-sort="${on ? (st.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" data-psort="${c.key}">${c.label}<svg class="icon"><use href="#i-caret-${on && st.sort.dir === 'asc' ? 'up' : 'down'}"/></svg></button></th>`;
      }).join('')}<th scope="col" class="col-x"><span class="sr-only">Detalle</span></th></tr></thead>`;
      const body = slice.length ? slice.map((r, k) => {
        const id = String(cfg.id(r)), open = st.open.has(id);
        return `<tr class="prow ${open ? 'open' : ''}" data-pid="${id}" style="--r:${k}" tabindex="0" aria-expanded="${open}">
          ${cfg.columns.map(c => `<td class="${c.cls || ''}">${c.render(r)}</td>`).join('')}
          <td class="col-x"><svg class="icon"><use href="#i-caret-down"/></svg></td></tr>
          ${open ? `<tr class="pdetail"><td colspan="${ncol + 1}">${cfg.detail(r)}</td></tr>` : ''}`;
      }).join('') : `<tr><td colspan="${ncol + 1}" class="pempty">Ningún registro coincide con «${esc(st.q)}».</td></tr>`;
      table.innerHTML = head + `<tbody>${body}</tbody>`;
      const a = data.length ? st.page * size + 1 : 0, b = Math.min(data.length, (st.page + 1) * size);
      foot.innerHTML = `<span>${fmt.int(a)} a ${fmt.int(b)} de ${fmt.int(data.length)} registros</span>
        <span class="pnav"><button type="button" class="btn" data-ppage="-1" ${st.page === 0 ? 'disabled' : ''} aria-label="Página anterior"><svg class="icon"><use href="#i-caret-left"/></svg></button>
        <span>Página ${st.page + 1} de ${pages}</span>
        <button type="button" class="btn" data-ppage="1" ${st.page >= pages - 1 ? 'disabled' : ''} aria-label="Página siguiente"><svg class="icon"><use href="#i-caret-right"/></svg></button></span>`;
    }

    table.addEventListener('click', e => {
      const s = e.target.closest('[data-psort]');
      if (s) {
        const k = s.dataset.psort;
        st.sort = st.sort.key === k ? { key: k, dir: st.sort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'desc' };
        st.page = 0; return draw();
      }
      const tr = e.target.closest('tr.prow');
      if (tr) { const id = tr.dataset.pid; st.open.has(id) ? st.open.delete(id) : st.open.add(id); draw(); }
    });
    table.addEventListener('keydown', e => {
      const tr = e.target.closest('tr.prow');
      if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tr.click(); $(`tr.prow[data-pid="${tr.dataset.pid}"]`, table)?.focus(); }
    });
    foot.addEventListener('click', e => {
      const b = e.target.closest('[data-ppage]');
      if (b) { st.page += +b.dataset.ppage; draw(); table.closest('.card').scrollIntoView({ block: 'nearest' }); }
    });
    if (input) input.addEventListener('input', () => { st.q = norm(input.value.trim()); st.page = 0; draw(); });

    return { update(data) { st.data = data; draw(); } };
  }

  window.MX = { Board, Rank, Pager, decode, fmt, esc, norm, tween, Tip, plot, layout, FRESH, shapeSvg, SHAPES, ramp, mix, REDUCE, $, $$ };
})();
