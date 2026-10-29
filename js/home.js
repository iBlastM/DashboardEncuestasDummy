/* Inicio: cifras reales de cada base con contador animado. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nf = new Intl.NumberFormat('es-MX');
  const F = { int: v => nf.format(Math.round(v)), pct: v => Math.round(v * 100) + '%', f2: v => v.toFixed(2) };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sw = c => `<i class="sw" style="--c:${c}"></i>`;

  function countUp(el, to, f, delay) {
    if (REDUCE) { el.textContent = f(to); return; }
    const ms = 1500;
    setTimeout(() => {
      const t0 = performance.now();
      const step = now => {
        const p = Math.min(1, (now - t0) / ms);
        el.textContent = f(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, delay);
  }
  const vals = {};
  const band = (id, parts) => {
    const b = $(id);
    if (!b.children.length) b.innerHTML = parts.map(p => `<i style="background:${p.c}"></i>`).join('');
    b.setAttribute('aria-label', parts.map(p => `${p.label} ${F.pct(p.v)}`).join(', '));
    requestAnimationFrame(() => requestAnimationFrame(() => [...b.children].forEach((el, i) => { el.style.flexGrow = parts[i].v; })));
  };

  // Encuesta
  const E = window.ENCUESTA;
  if (E) {
    const k = E.cols.indexOf('kuri');
    const ks = E.rows.map(r => r[k]);
    vals['e-n'] = ks.length;
    vals['e-kuri'] = ks.reduce((a, b) => a + b, 0) / ks.length;
    const lo = ks.filter(v => v <= 5).length / ks.length, hi = ks.filter(v => v >= 8).length / ks.length;
    const parts = [{ label: 'Reprueba', v: lo, c: 'var(--bad)' }, { label: 'Suficiente', v: 1 - lo - hi, c: 'var(--mid)' }, { label: 'Buena', v: hi, c: 'var(--green)' }];
    band('#e-band', parts);
    $('#e-lg').innerHTML = parts.map(p => `<span>${sw(p.c)}${p.label} ${F.pct(p.v)}</span>`).join('');
    $('#e-file').textContent = `${E.cats.distrito.length} distritos`;
  }

  // Gestiones
  const G = window.GESTIONES;
  if (G) {
    const e = G.cols.indexOf('estatus');
    const cnt = G.cats.estatus.map(() => 0); G.rows.forEach(r => cnt[r[e]]++);
    const n = G.rows.length;
    vals['g-n'] = n;
    vals['g-at'] = cnt[G.cats.estatus.indexOf('Atendido')] / n;
    const COL = ['#226726', '#1f7fc0', '#d08a12', '#7d8a83', '#b84a34'];
    band('#g-band', G.cats.estatus.map((s, i) => ({ label: s, v: cnt[i] / n, c: COL[i] })));
    $('#g-lg').innerHTML = G.cats.estatus.map((s, i) => `<span>${sw(COL[i])}${esc(s)}</span>`).join('');
    const secs = new Set(G.rows.map(r => r[G.cols.indexOf('seccion')]));
    $('#g-file').textContent = `${secs.size} secciones electorales`;
  }

  // Publicidad
  const P = window.PUBLICIDAD;
  if (P) {
    const pi = P.cols.indexOf('partido');
    const cnt = P.cats.partido.map(() => 0); P.rows.forEach(r => cnt[r[pi]]++);
    const n = P.rows.length;
    vals['p-n'] = n; vals['p-c'] = P.cats.cand.length;
    const META = { PAN: ['#0b4ea2', 'pan', 'PAN'], MORENA: ['#a3123a', 'morena', 'Morena'], MC: ['#f07c1b', 'mc', 'MC'] };
    band('#p-band', P.cats.partido.map((k, i) => ({ label: META[k][2], v: cnt[i] / n, c: META[k][0] })));
    $('#p-lg').innerHTML = P.cats.partido.map((k, i) => `<span><span class="lbox lbox-sm"><img class="logo ${k === 'MORENA' ? 'wide' : ''}" src="imagenes/partidos/${META[k][1]}-recorte.png" alt=""></span>${META[k][2]} ${F.pct(cnt[i] / n)}</span>`).join('');
    $('#p-file').textContent = 'Distrito local 4, Querétaro';
  }

  document.querySelectorAll('[data-to]').forEach((el, i) => {
    const v = vals[el.dataset.to];
    if (Number.isFinite(v)) countUp(el, v, F[el.dataset.fmt || 'int'], 350 + i * 110);
  });
})();
