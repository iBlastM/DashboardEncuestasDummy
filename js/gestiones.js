/* Tablero de Gestiones (atencion ciudadana). Datos: js/data-gestiones.js */
(() => {
  'use strict';
  const { Board, Rank, Pager, decode, fmt, esc, $, $$, tween, plot, layout, ramp, shapeSvg, Mapa } = window.MX;

  const D = window.GESTIONES;
  const C = D.cats;
  const raw = decode(D);

  const SECS = [...new Set(raw.map(r => r.seccion))].sort((a, b) => a - b);
  const DISTS = [...new Set(raw.map(r => r.distrito))].sort((a, b) => a - b);
  const secIdx = new Map(SECS.map((s, i) => [s, i]));
  const secDist = new Map(raw.map(r => [r.seccion, r.distrito]));
  raw.forEach(r => { r.si = secIdx.get(r.seccion); r.di = DISTS.indexOf(r.distrito); });
  const N = raw.length;

  /* Colores con significado */
  const EST_COL = ['#226726', '#1f7fc0', '#d08a12', '#7d8a83', '#b84a34']; // Atendido, En proceso, En espera de oficio, En pausa, Cancelada
  const PRIO_COL = ['#b84a34', '#d08a12', '#7bc11d'];                       // Alto, Medio, Bajo
  const IND_COL = ['#1f7fc0', '#7a3fa0'];                                    // Individual, Colectivo
  const FID_COL = ['#226726', '#b84a34', '#c3ccc0'];
  const EST_ICON = ['check-circle', 'clock', 'hourglass', 'pause-circle', 'x-circle'];
  const ATENDIDO = C.estatus.indexOf('Atendido');
  const CURSO = ['En proceso', 'En espera de oficio', 'En pausa'].map(s => C.estatus.indexOf(s));
  const CANC = C.estatus.indexOf('Cancelada');

  const sw = c => `<i class="sw" style="--c:${c}"></i>`;
  const POINT_DIMS = {
    estatus: { label: 'Estatus', colors: EST_COL },
    prio: { label: 'Prioridad', colors: PRIO_COL },
    indcol: { label: 'Individual o colectiva', colors: IND_COL },
  };

  const dims = {
    distrito: { label: 'Distrito local', chip: 'Distrito', values: DISTS.map(d => 'Distrito ' + d), get: r => r.di },
    seccion: {
      label: 'Sección', kind: 'search', open: true, searchLabel: 'sección', values: SECS.map(s => 'Sección ' + s),
      sub: i => 'D' + secDist.get(SECS[i]), short: i => 'Sección ' + SECS[i], get: r => r.si,
    },
    colonia: { label: 'Colonia', kind: 'search', searchLabel: 'colonia', values: C.colonia, get: r => r.colonia },
    estatus: { label: 'Estatus', values: C.estatus, prefix: i => sw(EST_COL[i]), get: r => r.estatus },
    prio: { label: 'Prioridad', values: C.prio, prefix: i => sw(PRIO_COL[i]), get: r => r.prio },
    indcol: { label: 'Tipo de solicitante', chip: 'Solicitante', values: C.indcol, prefix: i => sw(IND_COL[i]), get: r => r.indcol },
    tipo: { label: 'Tipo de solicitud', chip: 'Solicitud', kind: 'search', searchLabel: 'tipo', values: C.tipo, get: r => r.tipo },
    dep: { label: 'Dependencia', kind: 'search', searchLabel: 'dependencia', values: C.dep, get: r => r.dep },
    mes: { label: 'Mes de registro', chip: 'Mes', values: C.mes.map(m => m[0].toUpperCase() + m.slice(1)), get: r => r.mes },
    evento: { label: 'Dónde se levantó', chip: 'Origen', kind: 'search', searchLabel: 'origen', values: C.evento, get: r => r.evento },
    resp: { label: 'Responsable', values: C.resp, get: r => r.resp },
    terr: { label: 'Territorial', kind: 'search', searchLabel: 'territorial', values: C.terr, get: r => r.terr },
    fidel: { label: 'Fidelización', values: C.fidel, prefix: i => sw(FID_COL[i]), get: r => r.fidel },
  };

  const VIEWS = {
    panorama: { title: 'Panorama de gestiones', desc: 'Cuántas solicitudes ciudadanas se registran, de qué tipo, a qué dependencia van y cómo avanza su atención.' },
    mapa: { title: 'Mapa de gestiones', desc: 'Concentración por sección electoral o cada solicitud como punto. Combina filtros para aislar lo que necesitas ver.' },
    registros: { title: 'Registros', desc: 'Cada gestión con su folio, seguimiento y comentarios. Haz clic en una fila para ver el detalle.' },
  };

  const atendRate = a => a.length ? a.filter(r => r.estatus === ATENDIDO).length / a.length : NaN;
  const topOf = (a, key, names) => {
    const c = new Map(); a.forEach(r => c.set(r[key], (c.get(r[key]) || 0) + 1));
    let best = null, bn = 0; c.forEach((n, k) => { if (n > bn) { best = k; bn = n; } });
    return best === null ? null : { name: names[best], n: bn, p: bn / a.length };
  };
  const badge = (txt, col) => `<span class="badge" style="--c:${col}">${esc(txt)}</span>`;

  /* ---------------- Panorama ---------------- */
  let ranks = {};
  function initPanorama() {
    $('#kpis').innerHTML = `
      <article class="card kpi2 span-3"><p class="kpi2-label"><svg class="icon"><use href="#i-clipboard-text"/></svg>Gestiones registradas</p>
        <p class="kpi2-value" data-count-up id="k-n">0</p><p class="kpi2-sub" id="k-n-sub"></p>
        <div class="band" id="k-band" role="img">${C.estatus.map((_, i) => `<i style="background:${EST_COL[i]}"></i>`).join('')}</div></article>
      <article class="card kpi2 span-3"><p class="kpi2-label"><svg class="icon" style="color:${EST_COL[ATENDIDO]}"><use href="#i-check-circle"/></svg>Atendidas</p>
        <p class="kpi2-value" data-count-up id="k-at">0%</p><p class="kpi2-sub" id="k-at-sub"></p>
        <button type="button" class="btn btn-quiet kpi2-act" data-only-dim="estatus" data-i="${ATENDIDO}" data-label="Ver solo atendidas">Ver solo atendidas</button></article>
      <article class="card kpi2 span-3"><p class="kpi2-label"><svg class="icon" style="color:${EST_COL[CURSO[0]]}"><use href="#i-clock"/></svg>En curso</p>
        <p class="kpi2-value" data-count-up id="k-cu">0</p><p class="kpi2-sub" id="k-cu-sub"></p>
        <button type="button" class="btn btn-quiet kpi2-act" data-only-dim="estatus" data-i="${CURSO.join(',')}" data-label="Ver solo en curso">Ver solo en curso</button></article>
      <article class="card kpi2 span-3"><p class="kpi2-label"><svg class="icon" style="color:${EST_COL[CANC]}"><use href="#i-x-circle"/></svg>Canceladas</p>
        <p class="kpi2-value" data-count-up id="k-ca">0%</p><p class="kpi2-sub" id="k-ca-sub"></p>
        <button type="button" class="btn btn-quiet kpi2-act" data-only-dim="estatus" data-i="${CANC}" data-label="Ver solo canceladas">Ver solo canceladas</button></article>`;
    $('#lg-mes').innerHTML = C.estatus.map((s, i) => `<span>${sw(EST_COL[i])}${esc(s)}</span>`).join('');
    ranks.tipo = Rank($('#rank-tipo'), 'tipo', C.tipo, { limit: 10, sub: true });
    ranks.dep = Rank($('#rank-dep'), 'dep', C.dep, { limit: 10, sub: true });
    ranks.evento = Rank($('#rank-evento'), 'evento', C.evento, { limit: 8 });
    ranks.terr = Rank($('#rank-terr'), 'terr', C.terr, { sub: true });
  }

  function renderPanorama(cur, api) {
    const n = cur.length, ent = api.entering;
    const ms = ent ? 1600 : 700;
    const cnt = api.countBy(cur, 'estatus');
    const at = cnt[ATENDIDO], cu = CURSO.reduce((s, i) => s + cnt[i], 0), ca = cnt[CANC];
    tween($('#k-n'), n, fmt.int, ms, ent ? 300 : 0);
    tween($('#k-at'), at / n, fmt.pct, ms, ent ? 420 : 0);
    tween($('#k-cu'), cu, fmt.int, ms, ent ? 540 : 0);
    tween($('#k-ca'), ca / n, fmt.pct, ms, ent ? 660 : 0);
    const fechas = cur.map(r => r.fecha).sort();
    $('#k-n-sub').textContent = `Del ${fmt.date(fechas[0])} al ${fmt.date(fechas[fechas.length - 1])}`;
    $('#k-at-sub').textContent = `${fmt.int(at)} gestiones resueltas`;
    $('#k-cu-sub').textContent = CURSO.map(i => `${fmt.int(cnt[i])} ${C.estatus[i].toLowerCase()}`).join(', ');
    $('#k-ca-sub').textContent = `${fmt.int(ca)} gestiones canceladas`;
    $$('#k-band i').forEach((el, i) => { el.style.flexGrow = cnt[i] / n; });
    $('#k-band').setAttribute('aria-label', C.estatus.map((s, i) => `${s} ${fmt.pct(cnt[i] / n)}`).join(', '));
    $$('.kpi2-act').forEach(b => { b.textContent = b.getAttribute('aria-pressed') === 'true' ? 'Quitar filtro' : b.dataset.label; });

    // Gestiones por mes, apiladas por estatus
    const rm = api.except('mes');
    const months = C.mes.map((_, i) => i);
    const xs = dims.mes.values;
    const selM = api.state.f.mes;
    const data = C.estatus.map((s, e) => {
      const ys = months.map(m => rm.filter(r => r.mes === m && r.estatus === e).length);
      return {
        type: 'bar', name: s, x: xs, y: ys,
        marker: { color: EST_COL[e], opacity: months.map(m => selM.size && !selM.has(m) ? 0.3 : 1), line: { width: 0 } },
        hovertemplate: `${esc(s)}: <b>%{y}</b><extra></extra>`,
      };
    });
    const tot = months.map(m => rm.filter(r => r.mes === m).length);
    plot('plot-mes', data, layout({
      barmode: 'stack', bargap: 0.32, hovermode: 'x unified', margin: { l: 40, r: 8, t: 10, b: 30 },
      yaxis: { range: [0, Math.max(...tot, 1) * 1.1], title: { text: 'Gestiones', standoff: 6 } },
      xaxis: { type: 'category', tickfont: { size: 12.5, color: '#14201a' } },
    }), data.map(t => ({ y: t.y.map(() => 0) })), p => toggleIdx('mes', xs.indexOf(p.x)));
    const best = tot.indexOf(Math.max(...tot));
    $('#mes-sub').textContent = tot[best] ? `El mes con más registros es ${xs[best].toLowerCase()} (${fmt.int(tot[best])}). Haz clic en una barra para filtrar el mes.` : '';

    // Perfil
    const prof = (dim, colors, mount) => {
      const c = api.countBy(cur, dim), sel = api.state.f[dim];
      $(mount).innerHTML = `<div class="band big">${C[dim].map((_, i) => `<i style="flex-grow:${c[i] / n};background:${colors[i]}"></i>`).join('')}</div>
        <div class="seg-legend">${C[dim].map((s, i) => `<button type="button" class="lg-item" data-toggle-dim="${dim}" data-i="${i}" aria-pressed="${sel.has(i)}">${sw(colors[i])}<span>${esc(s)}</span><b>${fmt.pct(c[i] / n)}</b></button>`).join('')}</div>`;
    };
    prof('prio', PRIO_COL, '#prof-prio');
    prof('indcol', IND_COL, '#prof-ind');
    prof('fidel', FID_COL, '#prof-fid');
    const conEv = cur.filter(r => r.neventos !== null);
    $('#prof-fid-note').textContent = conEv.length ? `Quienes tienen dato han asistido en promedio a ${fmt.f1(conEv.reduce((s, r) => s + r.neventos, 0) / conEv.length)} eventos.` : '';

    // Rankings con % atendido
    const rankWith = (dim, opts = {}) => {
      const rs = api.except(dim);
      const c = api.countBy(rs, dim);
      const groups = C[dim].map(() => []);
      rs.forEach(r => groups[r[dim]].push(r));
      return ranks[dim].update(c, api.state.f[dim], {
        entering: ent, titles: c.map(v => `${fmt.int(v)} gestiones`),
        sub: opts.sub ? i => groups[i].length ? `<span class="pill" title="Porcentaje atendido"><svg class="icon"><use href="#i-check-circle"/></svg>${fmt.pct(atendRate(groups[i]))}</span>` : '' : null,
      });
    };
    rankWith('tipo', { sub: true });
    rankWith('dep', { sub: true });
    rankWith('evento');
    rankWith('terr', { sub: true });
  }

  const toggleIdx = (dim, i) => { if (i >= 0) board.toggle(dim, i); };

  /* ---------------- Mapa ---------------- */
  let mapa = null, sideSec, sideCol;
  const mstate = { view: 'relleno', measure: 'n', color: 'estatus' };
  function secStats(s, rs) {
    const a = rs.filter(r => r.seccion === s);
    return { n: a.length, at: atendRate(a), tipo: a.length ? topOf(a, 'tipo', C.tipo) : null, col: a.length ? topOf(a, 'colonia', C.colonia) : null };
  }
  function initMapa() {
    sideSec = Rank($('#rank-sec'), 'seccion', dims.seccion.values, { limit: 10, sub: true });
    sideCol = Rank($('#rank-col'), 'colonia', C.colonia, { limit: 8 });
    $('#map-ctl').addEventListener('click', e => {
      const b = e.target.closest('[data-mview]'); if (!b) return;
      mstate.view = b.dataset.mview; board.render();
    });
    $('#m-measure').addEventListener('change', e => { mstate.measure = e.target.value; board.render(); });
    $('#m-color').addEventListener('change', e => { mstate.color = e.target.value; board.render(); });
  }
  function ensureMap() {
    if (mapa) { mapa.refresh(); return; }
    let lastRs = raw;
    mapa = Mapa($('#map'), {
      geo: window.SECCIONES,
      onSection: s => toggleIdx('seccion', secIdx.has(s) ? secIdx.get(s) : -1),
      sectionTip: s => {
        const st = secStats(s, mapa._rs || lastRs);
        if (!secIdx.has(s) || !st.n) return `<strong>Sección ${s}</strong><span class="tt-sub">Sin gestiones con los filtros actuales</span>`;
        return `<strong>Sección ${s}</strong><span class="tt-sub">Distrito local ${secDist.get(s)}${st.col ? `, sobre todo ${esc(st.col.name)}` : ''}</span>
          <dl class="tt-list"><div><dt>Gestiones</dt><dd>${fmt.int(st.n)}</dd></div><div><dt>Atendidas</dt><dd>${fmt.pct(st.at)}</dd></div></dl>
          <span class="tt-sub">Más pedida: ${esc(st.tipo.name)} (${fmt.int(st.tipo.n)})</span><span class="tt-hint">Clic para filtrar esta sección</span>`;
      },
      pointTip: r => `<strong>Folio ${r.id}</strong><span class="tt-sub">${esc(C.tipo[r.tipo])}</span>
        <dl class="tt-list"><div><dt>Estatus</dt><dd>${badge(C.estatus[r.estatus], EST_COL[r.estatus])}</dd></div>
        <div><dt>Colonia</dt><dd>${esc(C.colonia[r.colonia])}</dd></div><div><dt>Sección</dt><dd>${r.seccion}</dd></div>
        <div><dt>Registro</dt><dd>${fmt.date(r.fecha)}</dd></div></dl><span class="tt-hint">Clic para ver el detalle</span>`,
      pointPopup: r => detailHtml(r, true),
    });
  }
  function renderMapa(cur, api) {
    ensureMap();
    const rsSec = api.except('seccion');
    mapa._rs = rsSec;
    const groups = new Map();
    rsSec.forEach(r => { if (!groups.has(r.seccion)) groups.set(r.seccion, []); groups.get(r.seccion).push(r); });
    const values = new Map();
    groups.forEach((a, s) => values.set(s, mstate.measure === 'n' ? a.length : atendRate(a)));
    const vs = [...values.values()].filter(Number.isFinite);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    const norm = v => hi === lo ? 0.6 : (v - lo) / (hi - lo);
    const PD = POINT_DIMS[mstate.color];
    const conCoord = cur.filter(r => r.lat !== null);
    const terr = ['distrito', 'seccion', 'colonia'].some(k => api.state.f[k].size);
    mapa.update({
      view: mstate.view, values, color: v => ramp(norm(v)),
      frame: terr ? [...new Set(cur.map(r => r.seccion))].sort((a, b) => a - b) : [],
      selected: new Set([...api.state.f.seccion].map(i => SECS[i])),
      points: conCoord.map(r => ({ id: r.id, lat: r.lat, lon: r.lon, color: PD.colors[r[mstate.color]], shape: 'circle', ...r })),
      animate: api.entering || mapa._lastView !== mstate.view,
    });
    mapa._lastView = mstate.view;

    $$('#map-ctl [data-mview]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mview === mstate.view)));
    $('#m-measure').value = mstate.measure; $('#m-color').value = mstate.color;
    $('#m-color-field').hidden = mstate.view === 'relleno';
    $('#m-measure-field').hidden = mstate.view === 'puntos';

    // Leyendas
    const f = mstate.measure === 'n' ? fmt.int : fmt.pct;
    const fillLg = mstate.view === 'puntos' ? '' : `<div class="lg-block"><p class="lg-title">${mstate.measure === 'n' ? 'Gestiones por sección' : 'Porcentaje atendido por sección'}</p>
      <div class="map-legend"><span>${vs.length ? f(lo) : ''}</span><i class="ramp"></i><span>${vs.length ? f(hi) : ''}</span></div></div>`;
    const sel = api.state.f[mstate.color];
    const cnt = api.countBy(api.except(mstate.color).filter(r => r.lat !== null), mstate.color);
    const ptsLg = mstate.view === 'relleno' ? '' : `<div class="lg-block"><p class="lg-title">Puntos por ${PD.label.toLowerCase()}. Haz clic para mostrar u ocultar.</p>
      <div class="seg-legend">${C[mstate.color].map((s, i) => `<button type="button" class="lg-item" data-toggle-dim="${mstate.color}" data-i="${i}" aria-pressed="${sel.has(i)}">${shapeSvg('circle', PD.colors[i], 13)}<span>${esc(s)}</span><b>${fmt.int(cnt[i])}</b></button>`).join('')}</div></div>`;
    $('#map-lg').innerHTML = fillLg + ptsLg;
    const sinCoord = cur.length - conCoord.length;
    const fuera = cur.filter(r => r.distrito !== 4).length;
    const notes = [];
    if (sinCoord && mstate.view !== 'relleno') notes.push(`${fmt.int(sinCoord)} ${sinCoord === 1 ? 'gestión no tiene' : 'gestiones no tienen'} coordenadas: cuentan en el relleno y en las cifras, pero no aparecen como punto.`);
    if (fuera && !terr) notes.push(`El encuadre muestra el distrito 4. Hay ${fmt.int(fuera)} gestiones de los distritos 1 y 8, al sur; fíltralas o aleja el mapa para verlas.`);
    notes.push('Clic en una sección para filtrarla. Con el mapa seleccionado, la rueda del mouse hace zoom.');
    $('#map-note').textContent = notes.join(' ');

    // Laterales
    const cSec = SECS.map(s => (groups.get(s) || []).length);
    sideSec.update(cSec, api.state.f.seccion, {
      entering: api.entering, titles: cSec.map(v => `${fmt.int(v)} gestiones`),
      sub: i => { const a = groups.get(SECS[i]); return a && a.length ? `<span class="pill" title="Porcentaje atendido"><svg class="icon"><use href="#i-check-circle"/></svg>${fmt.pct(atendRate(a))}</span>` : ''; },
    });
    const rc = api.except('colonia');
    sideCol.update(api.countBy(rc, 'colonia'), api.state.f.colonia, { entering: api.entering });
  }

  /* ---------------- Registros ---------------- */
  function detailHtml(r, compact) {
    const maps = r.lat !== null ? `<a class="link" href="https://www.google.com/maps?q=${r.lat},${r.lon}" target="_blank" rel="noopener">Ver ubicación en Google Maps<svg class="icon"><use href="#i-arrow-right"/></svg></a>` : '<span class="muted">Sin coordenadas</span>';
    return `<div class="detail ${compact ? 'compact' : ''}">
      ${compact ? `<p class="d-title">Folio ${r.id} · ${esc(C.tipo[r.tipo])}</p><p>${badge(C.estatus[r.estatus], EST_COL[r.estatus])} ${badge('Prioridad ' + C.prio[r.prio].toLowerCase(), PRIO_COL[r.prio])}</p>` : ''}
      <div class="d-grid">
        <div class="d-wide"><h4>Descripción</h4><p>${esc(C.desc[r.desc])}</p></div>
        <div class="d-wide"><h4>Seguimiento</h4><p>${esc(C.coment[r.coment])}</p></div>
        <div><h4>Dependencia</h4><p>${esc(C.dep[r.dep])}</p></div>
        <div><h4>Dónde se levantó</h4><p>${esc(C.evento[r.evento])}</p></div>
        <div><h4>Ubicación</h4><p>${esc(C.colonia[r.colonia])}, sección ${r.seccion}, distrito ${r.distrito}</p></div>
        <div><h4>Registro</h4><p>${fmt.date(r.fecha)} por ${esc(C.resp[r.resp])} (territorial: ${esc(C.terr[r.terr])})</p></div>
        <div><h4>Solicitante</h4><p>${esc(C.indcol[r.indcol])}, ${esc(C.fidel[r.fidel].toLowerCase())}${r.neventos !== null ? `, ${r.neventos} ${r.neventos === 1 ? 'evento' : 'eventos'}` : ''}</p></div>
        <div><h4>Mapa</h4><p>${maps}</p></div>
      </div></div>`;
  }
  let pager;
  function initRegistros() {
    pager = Pager({
      table: $('#tbl-reg'), footer: $('#pager'), search: $('#reg-q'), pageSize: 15,
      sort: { key: 'fecha', dir: 'desc' }, id: r => r.id,
      match: (r, q) => MX.norm([r.id, C.tipo[r.tipo], C.colonia[r.colonia], C.desc[r.desc], C.dep[r.dep], r.seccion, C.coment[r.coment]].join(' ')).includes(q),
      columns: [
        { key: 'id', label: 'Folio', value: r => r.id, render: r => `<b>${r.id}</b>`, cls: 'num' },
        { key: 'fecha', label: 'Registro', value: r => r.fecha, render: r => fmt.date(r.fecha) },
        { key: 'seccion', label: 'Sección', value: r => r.seccion, render: r => r.seccion, cls: 'num' },
        { key: 'colonia', label: 'Colonia', value: r => C.colonia[r.colonia], render: r => esc(C.colonia[r.colonia]), cls: 'wrap' },
        { key: 'tipo', label: 'Tipo de solicitud', value: r => C.tipo[r.tipo], render: r => esc(C.tipo[r.tipo]), cls: 'wrap' },
        { key: 'dep', label: 'Dependencia', value: r => C.dep[r.dep], render: r => esc(C.dep[r.dep]), cls: 'wrap small' },
        { key: 'prio', label: 'Prioridad', value: r => -r.prio, render: r => badge(C.prio[r.prio], PRIO_COL[r.prio]) },
        { key: 'estatus', label: 'Estatus', value: r => r.estatus, render: r => badge(C.estatus[r.estatus], EST_COL[r.estatus]) },
      ],
      detail: r => detailHtml(r, false),
    });
  }

  /* ---------------- Board ---------------- */
  const board = Board({
    rows: raw, dims, views: VIEWS, noun: ['gestión', 'gestiones'], fuente: D.fuente,
    railGroups: [
      { title: 'Territorio', dims: ['distrito', 'seccion', 'colonia'] },
      { title: 'Gestión', dims: ['estatus', 'prio', 'indcol', 'tipo', 'dep'] },
      { title: 'Registro', dims: ['mes', 'evento', 'resp', 'terr', 'fidel'] },
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
