/* Mapa territorial por seccion electoral (Leaflet).
   Vistas: "relleno" (poligono coloreado por concentracion), "puntos" (solo bordes + registros individuales)
   y "ambos". Clic en una seccion = filtrarla. */
(() => {
  'use strict';
  const { Tip, shapeSvg, REDUCE, esc } = window.MX;

  const BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
  const REF = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}';
  const ATTR = 'Mapa base: Esri, HERE, Garmin, © colaboradores de OpenStreetMap | Secciones: geojson/SE_EDO_QRO_24_25';

  function Mapa(el, opts) {
    const map = L.map(el, {
      zoomSnap: 0.25, zoomDelta: 0.5, scrollWheelZoom: false, preferCanvas: false,
      attributionControl: true, zoomControl: false, minZoom: 11, maxZoom: 18,
    });
    L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
    map.attributionControl.setPrefix(false);

    // La rueda del mouse solo hace zoom cuando el mapa tiene el foco (no secuestra el scroll de la pagina)
    el.addEventListener('focus', () => map.scrollWheelZoom.enable());
    el.addEventListener('blur', () => map.scrollWheelZoom.disable());
    map.on('click', () => { el.focus({ preventScroll: true }); });

    map.createPane('labels'); map.getPane('labels').style.zIndex = 450; map.getPane('labels').style.pointerEvents = 'none';
    map.createPane('outline'); map.getPane('outline').style.zIndex = 460; map.getPane('outline').style.pointerEvents = 'none';
    map.createPane('pts'); map.getPane('pts').style.zIndex = 620;

    const base = L.tileLayer(BASE, { attribution: ATTR, maxZoom: 18, maxNativeZoom: 16, className: 'tiles' }).addTo(map);
    const ref = L.tileLayer(REF, { maxZoom: 18, maxNativeZoom: 16, pane: 'labels', className: 'tiles' }).addTo(map);
    let tilesOn = true;

    const st = { view: 'relleno', values: new Map(), color: () => '#dde3da', selected: new Set(), dim: false };
    const layers = new Map();

    const secLayer = L.geoJSON(opts.geo.secciones, {
      style: () => ({ className: 'sec' }),
      onEachFeature: (f, lyr) => {
        const s = f.properties.s;
        layers.set(s, lyr);
        lyr.on('mouseover', e => { lyr.getElement()?.classList.add('hover'); lyr.bringToFront(); Tip.show(opts.sectionTip(s), e.originalEvent.clientX, e.originalEvent.clientY); });
        lyr.on('mousemove', e => Tip.move(e.originalEvent.clientX, e.originalEvent.clientY));
        lyr.on('mouseout', () => { lyr.getElement()?.classList.remove('hover'); Tip.hide(); });
        lyr.on('click', () => { Tip.hide(); opts.onSection(s); });
      },
    }).addTo(map);
    const outline = L.geoJSON(opts.geo.distritos, { pane: 'outline', interactive: false, style: { color: '#14201a', weight: 2.2, fill: false, dashArray: '6 5', opacity: 0.8 } }).addTo(map);

    // Etiquetas de numero de seccion (solo con zoom cercano)
    const labels = L.layerGroup();
    opts.geo.secciones.features.forEach(f => {
      labels.addLayer(L.marker(f.properties.p, { pane: 'labels', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'sec-label', html: String(f.properties.s), iconSize: [40, 16], iconAnchor: [20, 8] }) }));
    });
    const syncLabels = () => { if (map.getZoom() >= 14.5) labels.addTo(map); else labels.remove(); };
    map.on('zoomend', syncLabels);

    /* Encuadre: el distrito completo, o las secciones que cumplen los filtros territoriales */
    const homeBounds = outline.getBounds();
    let frameKey = '';
    function boundsOf(list) {
      let b = null;
      list.forEach(s => {
        const l = layers.get(s); if (!l) return;
        const lb = l.getBounds();
        b = b ? b.extend(lb) : L.latLngBounds(lb.getSouthWest(), lb.getNorthEast());
      });
      return b;
    }
    const fit = (animate = true) => {
      const b = (st.frame && st.frame.length && boundsOf(st.frame)) || homeBounds;
      map.fitBounds(b, { padding: [24, 24], maxZoom: 16, animate: animate && !REDUCE, duration: 0.6 });
    };
    fit(false);

    // Boton reencuadrar + capa de calles
    const Ctl = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const d = L.DomUtil.create('div', 'leaflet-bar mx-ctl');
        d.innerHTML = `<a href="#" role="button" title="Reencuadrar el mapa" aria-label="Reencuadrar el mapa" data-fit><svg class="icon"><use href="#i-arrows-out"/></svg></a>
          <a href="#" role="button" title="Mostrar u ocultar calles" aria-label="Mostrar u ocultar calles" aria-pressed="true" data-tiles><svg class="icon"><use href="#i-map-trifold"/></svg></a>`;
        L.DomEvent.disableClickPropagation(d);
        d.addEventListener('click', e => {
          const a = e.target.closest('a'); if (!a) return;
          e.preventDefault();
          if (a.hasAttribute('data-fit')) fit();
          if (a.hasAttribute('data-tiles')) {
            tilesOn = !tilesOn;
            if (tilesOn) { base.addTo(map); ref.addTo(map); } else { base.remove(); ref.remove(); }
            a.setAttribute('aria-pressed', String(tilesOn));
            el.classList.toggle('no-tiles', !tilesOn);
          }
        });
        return d;
      },
    });
    map.addControl(new Ctl());

    /* ----- Puntos ----- */
    const pts = L.layerGroup().addTo(map);
    const markers = new Map();
    function iconFor(p) {
      const s = p.shape === 'star' ? 20 : p.shape === 'triangle' ? 17 : 14;
      return L.divIcon({ className: 'mk', html: shapeSvg(p.shape, p.color, s), iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
    }
    function setPoints(list, animate) {
      const keep = new Set();
      for (const p of list) {
        keep.add(p.id);
        const key = p.color + p.shape;
        let m = markers.get(p.id);
        if (!m) {
          m = L.marker([p.lat, p.lon], { pane: 'pts', icon: iconFor(p), keyboard: false, riseOnHover: true });
          m._key = key; m._p = p;
          m.on('mouseover', e => Tip.show(opts.pointTip(m._p), e.originalEvent.clientX, e.originalEvent.clientY));
          m.on('mousemove', e => Tip.move(e.originalEvent.clientX, e.originalEvent.clientY));
          m.on('mouseout', () => Tip.hide());
          m.on('click', () => {
            Tip.hide();
            L.popup({ className: 'mx-popup', maxWidth: 320, minWidth: 240, offset: [0, -4], autoPanPadding: [20, 20] })
              .setLatLng(m.getLatLng()).setContent(opts.pointPopup(m._p)).openOn(map);
          });
          markers.set(p.id, m);
        } else {
          m._p = p;
          if (m._key !== key) { m.setIcon(iconFor(p)); m._key = key; }
        }
        if (!pts.hasLayer(m)) {
          pts.addLayer(m);
          const e = m.getElement();
          if (e && animate && !REDUCE) { e.classList.remove('in'); void e.offsetWidth; e.classList.add('in'); e.style.setProperty('--d', Math.round(Math.random() * 380) + 'ms'); }
        }
      }
      markers.forEach((m, id) => { if (!keep.has(id) && pts.hasLayer(m)) pts.removeLayer(m); });
    }

    function paint() {
      const fillOp = st.view === 'relleno' ? 0.82 : st.view === 'ambos' ? 0.5 : 0;
      layers.forEach((lyr, s) => {
        const has = st.values.has(s);
        const sel = st.selected.has(s);
        const faded = st.selected.size > 0 && !sel;
        lyr.setStyle({
          fillColor: has ? st.color(st.values.get(s), s) : '#eef1ec',
          fillOpacity: st.view === 'puntos' ? (sel ? 0.12 : 0.001) : (faded ? fillOp * 0.35 : fillOp),
          color: sel ? '#14201a' : st.view === 'puntos' ? '#4b5a52' : '#ffffff',
          weight: sel ? 3 : st.view === 'puntos' ? 1.3 : 1.2,
          opacity: faded && st.view === 'puntos' ? 0.45 : 1,
        });
        if (sel) lyr.bringToFront();
      });
      el.dataset.view = st.view;
    }

    return {
      map,
      update(o) {
        Object.assign(st, o);
        paint();
        setPoints(st.view === 'relleno' ? [] : (o.points || []), o.animate);
        const k = (st.frame || []).join(',');
        if (k !== frameKey) { frameKey = k; fit(true); }
      },
      refresh() { map.invalidateSize(); },
      fit,
    };
  }

  window.MX.Mapa = Mapa;
})();
