/* Tablero de Publicidad (piezas de propaganda por partido). Datos: js/data-propaganda.js
   Los archivos se llaman "propaganda" y no "publicidad" porque los bloqueadores de anuncios
   (lista AdGuard en español, regla "/publicidad.") bloquean cualquier ruta con "/publicidad." */
(() => {
  'use strict';
  const { Board, Rank, Pager, decode, fmt, esc, $, $$, tween, plot, layout, ramp, mix, shapeSvg, Mapa } = window.MX;

  const D = window.PUBLICIDAD;
  const C = D.cats;
  const raw = decode(D);
  const N = raw.length;

  const SECS = [...new Set(raw.map(r => r.seccion).filter(s => s !== null))].sort((a, b) => a - b);
  const secIdx = new Map(SECS.map((s, i) => [s, i]));
  raw.forEach(r => { r.si = secIdx.has(r.seccion) ? secIdx.get(r.seccion) : null; });

  /* Partidos: color institucional y logo */
  const PARTY = {
    PAN: { color: '#0b4ea2', logo: 'imagenes/partidos/pan-recorte.png', name: 'PAN', full: 'Partido Acción Nacional' },
    MORENA: { color: '#a3123a', logo: 'imagenes/partidos/morena-recorte.png', name: 'Morena', full: 'Movimiento Regeneración Nacional', wide: true },
    MC: { color: '#f07c1b', logo: 'imagenes/partidos/mc-recorte.png', name: 'MC', full: 'Movimiento Ciudadano' },
  };
  const P = C.partido.map(k => PARTY[k]);
  /* size: sm (listas), md (tooltip), lg (tarjeta). El logo de Morena es horizontal: se ajusta al ancho de la caja. */
  const logo = (i, size = 'sm') => `<span class="lbox lbox-${size}"><img class="logo ${P[i].wide ? 'wide' : ''}" src="${P[i].logo}" alt="" loading="lazy"></span>`;
  const swp = i => `<i class="sw" style="--c:${P[i].color}"></i>`;

  /* Tipos de pieza: una forma y un color propios */
  const TIPO = {
    Lona: { shape: 'circle', color: '#2e9e44' },
    Espectacular: { shape: 'star', color: '#7a3fa0' },
    Barda: { shape: 'square', color: '#d08a12' },
    Mupi: { shape: 'triangle', color: '#1f7fc0' },
  };
  const T = C.tipo.map(k => TIPO[k]);
  const NEUTRAL = '#44524a';

  const dims = {
    partido: { label: 'Partido', values: C.partido.map((_, i) => P[i].name), prefix: i => logo(i), get: r => r.partido },
    cand: { label: 'Candidato', values: C.cand, prefix: i => logo(D.candPartido[i]), sub: i => P[D.candPartido[i]].name, get: r => r.cand },
    tipo: { label: 'Tipo de pieza', chip: 'Tipo', values: C.tipo, prefix: i => shapeSvg(T[i].shape, T[i].color, 16), get: r => r.tipo },
    temp: { label: 'Temporalidad', values: C.temp, get: r => r.temp },
    mes: { label: 'Mes', values: C.mes.map(m => m[0].toUpperCase() + m.slice(1)), get: r => r.mes },
    seccion: {
      label: 'Sección', kind: 'search', open: true, searchLabel: 'sección', values: SECS.map(s => 'Sección ' + s),
      short: i => 'Sección ' + SECS[i], get: r => r.si,
    },
    colonia: { label: 'Colonia', kind: 'search', searchLabel: 'colonia', values: C.colonia, get: r => r.colonia },
  };

  const VIEWS = {
    panorama: { title: 'Publicidad en el distrito local 4', desc: 'Lonas, espectaculares, bardas y mupis registrados por partido y candidato en Querétaro.' },
    mapa: { title: 'Mapa de publicidad', desc: 'Cada pieza en su ubicación, con forma por tipo y color por partido. También por concentración en cada sección.' },
    registros: { title: 'Registros', desc: 'Cada pieza con su domicilio. Haz clic en una fila para ver el detalle.' },
  };

  const shapeOf = r => T[r.tipo].shape;
  const domParty = a => {
    const c = [0, 0, 0]; a.forEach(r => c[r.partido]++);
    const m = Math.max(...c); const i = c.indexOf(m);
    return { i, n: m, p: a.length ? m / a.length : 0, c };
  };

  /* ---------------- Panorama ---------------- */
  let rankCand, rankCol;
  function initPanorama() {
    $('#parties').innerHTML = C.partido.map((_, i) => `<article class="card party span-4" style="--pc:${P[i].color}" data-party="${i}">
      <div class="party-head">${logo(i, 'lg')}<div><h2>${esc(P[i].name)}</h2><p title="${esc(P[i].full)}">${esc(P[i].full)}</p></div></div>
      <div class="party-n"><b data-count-up data-r="n">0</b><span data-r="share"></span></div>
      <div class="party-share"><i data-r="bar"></i></div>
      <div class="party-tipos">${C.tipo.map((t, k) => `<div><span>${shapeSvg(T[k].shape, P[i].color, 14)}${esc(t)}</span><b data-count-up data-r="t${k}">0</b></div>`).join('')}</div>
      <div class="party-cands" data-r="cands"></div>
      <button type="button" class="btn party-only" data-only-dim="partido" data-i="${i}" aria-pressed="false">Ver solo ${esc(P[i].name)}</button>
    </article>`).join('');
    $('#lg-tipo').innerHTML = C.partido.map((_, i) => `<span>${swp(i)}${esc(P[i].name)}</span>`).join('');
    $('#lg-mes').innerHTML = $('#lg-tipo').innerHTML;
    rankCand = Rank($('#rank-cand'), 'cand', C.cand, { prefix: i => logo(D.candPartido[i]), sub: true });
    rankCol = Rank($('#rank-colonia'), 'colonia', C.colonia, { limit: 10, sub: true, wideSub: true });
  }

  function renderPanorama(cur, api) {
    const ent = api.entering, n = cur.length;
    const sel = api.state.f.partido;
    C.partido.forEach((_, i) => {
      const card = $(`.party[data-party="${i}"]`);
      const a = cur.filter(r => r.partido === i);
      const q = r => $(`[data-r="${r}"]`, card);
      tween(q('n'), a.length, fmt.int, ent ? 1600 : 700, ent ? 300 + i * 150 : 0);
      q('share').textContent = `piezas, ${fmt.pct(n ? a.length / n : 0)} del total`;
      q('bar').style.setProperty('--w', n ? a.length / n : 0);
      C.tipo.forEach((_, k) => tween(q('t' + k), a.filter(r => r.tipo === k).length, fmt.int, ent ? 1400 : 600, ent ? 450 + i * 150 : 0));
      const cands = C.cand.map((c, ci) => ({ c, ci, n: a.filter(r => r.cand === ci).length })).filter(x => D.candPartido[x.ci] === i).sort((x, y) => y.n - x.n);
      q('cands').innerHTML = cands.map(x => `<button type="button" data-toggle-dim="cand" data-i="${x.ci}" aria-pressed="${api.state.f.cand.has(x.ci)}"><span>${esc(x.c)}</span><b>${fmt.int(x.n)}</b></button>`).join('');
      card.classList.toggle('off', sel.size > 0 && !sel.has(i));
      const ob = $('.party-only', card);
      const only = sel.size === 1 && sel.has(i);
      ob.textContent = only ? 'Quitar filtro' : `Ver solo ${P[i].name}`;
    });

    // Piezas por tipo y partido
    const rt = api.except('tipo');
    const selT = api.state.f.tipo;
    const dataT = C.partido.map((_, i) => ({
      type: 'bar', name: P[i].name, x: C.tipo, y: C.tipo.map((_, k) => rt.filter(r => r.tipo === k && r.partido === i).length),
      marker: { color: P[i].color, opacity: C.tipo.map((_, k) => selT.size && !selT.has(k) ? 0.3 : 1) },
      hovertemplate: `${P[i].name}: <b>%{y}</b><extra></extra>`,
    }));
    const maxT = Math.max(...C.tipo.map((_, k) => Math.max(...dataT.map(t => t.y[k]))), 1);
    plot('plot-tipo', dataT, layout({
      barmode: 'group', bargap: 0.28, bargroupgap: 0.06, hovermode: 'x unified', margin: { l: 40, r: 8, t: 10, b: 30 },
      yaxis: { range: [0, maxT * 1.12], title: { text: 'Piezas', standoff: 6 } }, xaxis: { type: 'category', tickfont: { size: 13, color: '#14201a' } },
    }), dataT.map(t => ({ y: t.y.map(() => 0) })), p => { const k = C.tipo.indexOf(p.x); if (k >= 0) board.toggle('tipo', k); });

    // Piezas por mes y partido, con la etapa marcada
    const rm = api.except('mes');
    const xs = dims.mes.values;
    const selM = api.state.f.mes;
    const dataM = C.partido.map((_, i) => ({
      type: 'bar', name: P[i].name, x: xs, y: C.mes.map((_, m) => rm.filter(r => r.mes === m && r.partido === i).length),
      marker: { color: P[i].color, opacity: C.mes.map((_, m) => selM.size && !selM.has(m) ? 0.3 : 1) },
      hovertemplate: `${P[i].name}: <b>%{y}</b><extra></extra>`,
    }));
    const totM = C.mes.map((_, m) => dataM.reduce((s, t) => s + t.y[m], 0));
    const campIdx = C.mes.findIndex((_, m) => raw.some(r => r.mes === m && C.temp[r.temp] === 'Campaña'));
    const shapes = campIdx > 0 ? [{ type: 'line', xref: 'x', yref: 'paper', x0: campIdx - 0.5, x1: campIdx - 0.5, y0: 0, y1: 1, line: { color: '#5c6b63', width: 1.2, dash: 'dot' } }] : [];
    const ann = campIdx > 0 ? [
      { xref: 'x', yref: 'paper', x: (campIdx - 1) / 2, y: 1.04, text: 'Precampaña', showarrow: false, font: { size: 12, color: '#44524a' } },
      { xref: 'x', yref: 'paper', x: campIdx + (C.mes.length - 1 - campIdx) / 2, y: 1.04, text: 'Campaña', showarrow: false, font: { size: 12, color: '#44524a' } },
    ] : [];
    plot('plot-mes', dataM, layout({
      barmode: 'stack', bargap: 0.32, hovermode: 'x unified', margin: { l: 40, r: 8, t: 26, b: 30 }, shapes, annotations: ann,
      yaxis: { range: [0, Math.max(...totM, 1) * 1.1], title: { text: 'Piezas', standoff: 6 } },
      xaxis: { type: 'category', tickvals: xs, ticktext: xs.map(s => s.replace(/ 20(\d\d)$/, " '$1")), tickfont: { size: 12.5, color: '#14201a' } },
    }), dataM.map(t => ({ y: t.y.map(() => 0) })), p => { const m = xs.indexOf(p.x); if (m >= 0) board.toggle('mes', m); });

    // Candidatos
    const rc = api.except('cand');
    const cc = api.countBy(rc, 'cand');
    rankCand.update(cc, api.state.f.cand, {
      entering: ent, titles: cc.map(v => `${fmt.int(v)} piezas`),
      sub: i => {
        const a = rc.filter(r => r.cand === i); if (!a.length) return '';
        const t = [0, 0, 0, 0]; a.forEach(r => t[r.tipo]++); const k = t.indexOf(Math.max(...t));
        return `<span class="pill" title="Tipo de pieza más usado">${shapeSvg(T[k].shape, P[D.candPartido[i]].color, 12)}${esc(C.tipo[k])}</span>`;
      },
    });
    // Colonias
    const rcol = api.except('colonia');
    const groups = C.colonia.map(() => []); rcol.forEach(r => groups[r.colonia].push(r));
    rankCol.update(groups.map(g => g.length), api.state.f.colonia, {
      entering: ent, titles: groups.map(g => `${fmt.int(g.length)} piezas`),
      sub: i => { if (!groups[i].length) return ''; const d = domParty(groups[i]); return `<span class="pill" title="Partido con más piezas">${swp(d.i)}${esc(P[d.i].name)} ${fmt.pct(d.p)}</span>`; },
    });
  }

  /* ---------------- Mapa ---------------- */
  let mapa = null, sideSec, sideCol2;
  const mstate = { view: 'puntos', measure: 'n', mark: 'forma' };
  function initMapa() {
    sideSec = Rank($('#rank-sec'), 'seccion', dims.seccion.values, { limit: 10, sub: true, wideSub: true });
    sideCol2 = Rank($('#rank-col2'), 'colonia', C.colonia, { limit: 8 });
    $('#map-ctl').addEventListener('click', e => {
      const v = e.target.closest('[data-mview]'); if (v) { mstate.view = v.dataset.mview; board.render(); }
      const m = e.target.closest('[data-mark]'); if (m) { mstate.mark = m.dataset.mark; board.render(); }
    });
    $('#m-measure').addEventListener('change', e => { mstate.measure = e.target.value; board.render(); });
  }
  const tipHead = r => `<div class="tt-head">${logo(r.partido, 'md')}<div><strong>${esc(C.cand[r.cand])}</strong><span class="tt-sub">${esc(P[r.partido].name)}, ${esc(C.temp[r.temp].toLowerCase())}</span></div></div>`;
  function ensureMap() {
    if (mapa) { mapa.refresh(); return; }
    mapa = Mapa($('#map'), {
      geo: window.SECCIONES,
      onSection: s => { if (secIdx.has(s)) board.toggle('seccion', secIdx.get(s)); },
      sectionTip: s => {
        const a = (mapa._rs || raw).filter(r => r.seccion === s);
        if (!a.length) return `<strong>Sección ${s}</strong><span class="tt-sub">Sin piezas con los filtros actuales</span>`;
        const d = domParty(a);
        return `<strong>Sección ${s}</strong><span class="tt-sub">${fmt.int(a.length)} ${a.length === 1 ? 'pieza' : 'piezas'}</span>
          <dl class="tt-list">${C.partido.map((_, i) => `<div><dt>${swp(i)}${esc(P[i].name)}</dt><dd>${fmt.int(d.c[i])}</dd></div>`).join('')}</dl>
          <span class="tt-hint">Clic para filtrar esta sección</span>`;
      },
      pointTip: r => `${tipHead(r)}<dl class="tt-list"><div><dt>Tipo</dt><dd class="cell-shape">${shapeSvg(T[r.tipo].shape, mstate.mark === 'forma' ? P[r.partido].color : T[r.tipo].color, 13)}${esc(C.tipo[r.tipo])}</dd></div>
        <div><dt>Colonia</dt><dd>${esc(C.colonia[r.colonia])}</dd></div><div><dt>Fecha</dt><dd>${fmt.date(r.fecha)}</dd></div></dl><span class="tt-hint">Clic para ver el domicilio</span>`,
      pointPopup: r => `${tipHead(r)}<div class="detail compact"><div class="d-grid">
        <div><h4>Tipo de pieza</h4><p class="cell-shape">${shapeSvg(T[r.tipo].shape, P[r.partido].color, 13)}${esc(C.tipo[r.tipo])}</p></div>
        <div><h4>Domicilio</h4><p>${esc(C.dom[r.dom])}</p></div>
        <div><h4>Registro</h4><p>${fmt.date(r.fecha)}, sección ${r.seccion ?? 'n/d'}</p></div>
        <div><p><a class="link" href="https://www.google.com/maps?q=${r.lat},${r.lon}" target="_blank" rel="noopener">Ver en Google Maps<svg class="icon"><use href="#i-arrow-right"/></svg></a></p></div>
      </div></div>`,
    });
  }

  function renderMapa(cur, api) {
    ensureMap();
    const rsSec = api.except('seccion');
    mapa._rs = rsSec;
    const groups = new Map();
    rsSec.forEach(r => { if (r.seccion === null) return; if (!groups.has(r.seccion)) groups.set(r.seccion, []); groups.get(r.seccion).push(r); });
    const values = new Map();
    groups.forEach((a, s) => values.set(s, mstate.measure === 'n' ? a.length : domParty(a)));
    let color;
    const nums = [...groups.values()].map(a => a.length);
    const lo = Math.min(...nums), hi = Math.max(...nums);
    if (mstate.measure === 'n') color = v => ramp(hi === lo ? 0.6 : (v - lo) / (hi - lo));
    else color = v => mix(P[v.i].color, 0.3 + 0.7 * Math.min(1, Math.max(0, (v.p - 1 / 3) / (2 / 3))));

    const terr = ['seccion', 'colonia'].some(k => api.state.f[k].size);
    const forma = mstate.mark === 'forma';
    mapa.update({
      view: mstate.view, values, color,
      frame: terr ? [...new Set(cur.map(r => r.seccion).filter(s => s !== null))] : [],
      selected: new Set([...api.state.f.seccion].map(i => SECS[i])),
      points: cur.map(r => ({ ...r, color: forma ? P[r.partido].color : T[r.tipo].color, shape: forma ? shapeOf(r) : 'circle' })),
      animate: api.entering || mapa._lastView !== mstate.view || mapa._lastMark !== mstate.mark,
    });
    mapa._lastView = mstate.view; mapa._lastMark = mstate.mark;

    $$('#map-ctl [data-mview]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mview === mstate.view)));
    $$('#map-ctl [data-mark]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mark === mstate.mark)));
    $('#m-measure').value = mstate.measure;
    $('#m-mark-field').hidden = mstate.view === 'relleno';
    $('#m-measure-field').hidden = mstate.view === 'puntos';

    // Leyendas clicables: filtran el mapa
    const cp = api.countBy(api.except('partido'), 'partido');
    const ct = api.countBy(api.except('tipo'), 'tipo');
    const sP = api.state.f.partido, sT = api.state.f.tipo;
    const partyItems = C.partido.map((_, i) => `<button type="button" class="lg-item" data-toggle-dim="partido" data-i="${i}" aria-pressed="${sP.has(i)}">${logo(i)}${forma ? shapeSvg('circle', P[i].color, 12) : ''}<span>${esc(P[i].name)}</span><b>${fmt.int(cp[i])}</b></button>`).join('');
    const tipoItems = C.tipo.map((t, k) => `<button type="button" class="lg-item" data-toggle-dim="tipo" data-i="${k}" aria-pressed="${sT.has(k)}">${shapeSvg(forma ? T[k].shape : 'circle', forma ? NEUTRAL : T[k].color, forma && T[k].shape === 'star' ? 17 : 14)}<span>${esc(t)}</span><b>${fmt.int(ct[k])}</b></button>`).join('');
    let lg = '';
    if (mstate.view !== 'relleno') {
      lg += `<div class="lg-block"><p class="lg-title">${forma ? 'Forma = tipo de pieza' : 'Color = tipo de pieza'}. Clic para mostrar u ocultar.</p><div class="seg-legend">${tipoItems}</div></div>`;
      lg += `<div class="lg-block"><p class="lg-title">${forma ? 'Color = partido' : 'Partido'}. Clic para mostrar u ocultar.</p><div class="seg-legend">${partyItems}</div></div>`;
    }
    if (mstate.view !== 'puntos') {
      lg += mstate.measure === 'n'
        ? `<div class="lg-block"><p class="lg-title">Piezas por sección</p><div class="map-legend"><span>${nums.length ? fmt.int(lo) : ''}</span><i class="ramp"></i><span>${nums.length ? fmt.int(hi) : ''}</span></div></div>`
        : `<div class="lg-block"><p class="lg-title">Partido con más piezas en la sección. Más intenso = más ventaja.</p><div class="seg-legend">${C.partido.map((_, i) => `<span class="lg-item static"><i class="sw" style="--c:${P[i].color}"></i>${logo(i)}<span>${esc(P[i].name)}</span></span>`).join('')}</div></div>`;
    }
    $('#map-lg').innerHTML = lg;

    // Laterales
    const cSec = SECS.map(s => (groups.get(s) || []).length);
    sideSec.update(cSec, api.state.f.seccion, {
      entering: api.entering, titles: cSec.map(v => `${fmt.int(v)} piezas`),
      sub: i => { const a = groups.get(SECS[i]); if (!a || !a.length) return ''; const d = domParty(a); return `<span class="pill" title="Partido con más piezas">${swp(d.i)}${esc(P[d.i].name)} ${fmt.pct(d.p)}</span>`; },
    });
    sideCol2.update(api.countBy(api.except('colonia'), 'colonia'), api.state.f.colonia, { entering: api.entering });
  }

  /* ---------------- Registros ---------------- */
  let pager;
  function initRegistros() {
    pager = Pager({
      table: $('#tbl-reg'), footer: $('#pager'), search: $('#reg-q'), pageSize: 15,
      sort: { key: 'fecha', dir: 'desc' }, id: r => r.id,
      match: (r, q) => MX.norm([r.id, C.cand[r.cand], P[r.partido].name, C.tipo[r.tipo], C.colonia[r.colonia], C.dom[r.dom], r.seccion].join(' ')).includes(q),
      columns: [
        { key: 'id', label: '#', value: r => r.id, render: r => `<b>${r.id}</b>`, cls: 'num' },
        { key: 'fecha', label: 'Fecha', value: r => r.fecha, render: r => fmt.date(r.fecha) },
        { key: 'temp', label: 'Etapa', value: r => r.temp, render: r => esc(C.temp[r.temp]) },
        { key: 'partido', label: 'Partido', value: r => P[r.partido].name, render: r => `<span class="cell-logo">${logo(r.partido)}${esc(P[r.partido].name)}</span>` },
        { key: 'cand', label: 'Candidato', value: r => C.cand[r.cand], render: r => esc(C.cand[r.cand]) },
        { key: 'tipo', label: 'Tipo', value: r => C.tipo[r.tipo], render: r => `<span class="cell-shape">${shapeSvg(T[r.tipo].shape, P[r.partido].color, 14)}${esc(C.tipo[r.tipo])}</span>` },
        { key: 'colonia', label: 'Colonia', value: r => C.colonia[r.colonia], render: r => esc(C.colonia[r.colonia]), cls: 'wrap' },
        { key: 'seccion', label: 'Sección', value: r => r.seccion ?? 0, render: r => r.seccion ?? 'n/d', cls: 'num' },
      ],
      detail: r => `<div class="detail"><div class="d-grid">
        <div class="d-wide"><h4>Domicilio</h4><p>${esc(C.dom[r.dom])}</p></div>
        <div><h4>Código postal</h4><p>${r.cp}</p></div>
        <div><h4>Distrito local</h4><p>${r.distrito}</p></div>
        <div><h4>Coordenadas</h4><p>${r.lat}, ${r.lon}</p></div>
        <div><h4>Mapa</h4><p><a class="link" href="https://www.google.com/maps?q=${r.lat},${r.lon}" target="_blank" rel="noopener">Ver en Google Maps<svg class="icon"><use href="#i-arrow-right"/></svg></a></p></div>
      </div></div>`,
    });
  }

  /* ---------------- Board ---------------- */
  const board = Board({
    rows: raw, dims, views: VIEWS, noun: ['pieza', 'piezas'], fuente: D.fuente,
    railGroups: [
      { title: 'Partido y candidato', dims: ['partido', 'cand'] },
      { title: 'Pieza', dims: ['tipo', 'temp', 'mes'] },
      { title: 'Territorio', dims: ['seccion', 'colonia'] },
    ],
    init() { initPanorama(); initMapa(); initRegistros(); },
    render(view, cur, api) {
      if (view === 'panorama') renderPanorama(cur, api);
      else if (view === 'mapa') renderMapa(cur, api);
      else pager.update(cur);
    },
  });
  board.start();
})();
