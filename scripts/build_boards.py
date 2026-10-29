"""Genera los datos de los tableros de Gestiones y Publicidad.

Salidas:
  js/data-gestiones.js   window.GESTIONES
  js/data-propaganda.js  window.PUBLICIDAD
  js/geo-secciones.js    window.SECCIONES (GeoJSON de secciones electorales, simplificado)

Privacidad: NO se exportan nombres, apellidos, telefonos, correos, liderazgos ni ligas de evidencia,
porque el sitio se publica en GitHub Pages. Solo campos de analisis.

Uso:  python scripts/build_boards.py
"""
import json, pathlib, re
import pandas as pd
from shapely.geometry import shape, Point, mapping
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
GJ = ROOT / 'geojson'
OUT = ROOT / 'js'

MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
MENORES = {'de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en'}


def titulo(s):
    s = str(s).strip().lower()
    out = []
    for i, w in enumerate(s.split()):
        out.append(w if (i and w in MENORES) else w[:1].upper() + w[1:])
    return ' '.join(out)


def write_js(name, var, payload):
    p = OUT / name
    p.write_text(f'/* Generado por scripts/build_boards.py. No editar a mano. */\nwindow.{var} = '
                 + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(f'{name}: {p.stat().st_size / 1024:.0f} KB')


class Cat:
    """Codifica columnas categoricas como indices a un catalogo."""
    def __init__(self, order=None):
        self.values = list(order) if order else []
        self.idx = {v: i for i, v in enumerate(self.values)}

    def __call__(self, v):
        if v not in self.idx:
            self.idx[v] = len(self.values)
            self.values.append(v)
        return self.idx[v]

    def sorted_by(self, key):
        """Reordena el catalogo; devuelve mapa viejo->nuevo."""
        new = sorted(self.values, key=key)
        remap = {self.idx[v]: i for i, v in enumerate(new)}
        self.values = new
        self.idx = {v: i for i, v in enumerate(new)}
        return remap


# ---------------------------------------------------------------- Secciones
se = json.loads((GJ / 'SE_EDO_QRO_24_25.geojson').read_text(encoding='utf-8'))['features']
SEC = {}
for f in se:
    p = f['properties']
    SEC[int(p['25_SECCION'])] = {'d': int(p['25_D_LOCAL']), 'mun': titulo(p['NOM_MUN']).replace('Queretaro', 'Querétaro'),
                                  'g': shape(f['geometry']).buffer(0)}
keys = list(SEC)
tree = STRtree([SEC[k]['g'] for k in keys])


def seccion_de(lat, lon):
    pt = Point(lon, lat)
    for i in tree.query(pt):
        if SEC[keys[i]]['g'].contains(pt):
            return keys[i]
    return None


# ---------------------------------------------------------------- Gestiones
G = pd.read_excel(next(DATA.glob('Base Dummy Gestiones*.xlsx')))
G.columns = [c.strip() for c in G.columns]
col = {
    'id': 'No°', 'resp': 'Responsable de la solicitud', 'fecha': 'Fecha de Registro', 'terr': 'Territorial',
    'dist': 'Distrito', 'secc': 'Seccion', 'colonia': 'Colonia', 'evento': 'Evento donde se levanta la solicitud',
    'tipo': 'Tipo de solicitud', 'desc': 'Descripción de solicitud', 'indcol': 'Solicitud Ind/colec',
    'lat': 'latitud', 'lon': 'longitud', 'dep': 'Dependencia', 'coment': 'Comentarios',
    'estatus': 'Seguimiento/Estatus', 'prio': 'NIVEL DE PRIORIDAD',
    'neventos': 'NÚMERO DE EVENTOS A LOS QUE A IDO EL SOLICITANTE', 'fidel': 'FIDELIZACIÓN DEL SOLICITANTE',
}

ESTATUS = ['Atendido', 'En proceso', 'En espera de oficio', 'En pausa', 'Cancelada']
EST_MAP = {'ATENDIDO': 'Atendido', 'EN PROCESO': 'En proceso', 'EN ESPERA DE OFICIO': 'En espera de oficio',
           'EN PAUSA': 'En pausa', 'CANCELADA': 'Cancelada'}
PRIO = ['Alto', 'Medio', 'Bajo']
INDCOL = ['Individual', 'Colectivo / prioritario']
FIDEL = ['Fidelizada', 'No fidelizada', 'Sin dato']

c = {k: Cat() for k in ['resp', 'terr', 'colonia', 'evento', 'tipo', 'dep', 'desc', 'coment']}
c['estatus'] = Cat(ESTATUS); c['prio'] = Cat(PRIO); c['indcol'] = Cat(INDCOL); c['fidel'] = Cat(FIDEL)
meses_g = sorted({(d.year, d.month) for d in G[col['fecha']]})
c['mes'] = Cat([f'{MESES[m - 1]} {y}' for y, m in meses_g])

grows = []
for r in G.itertuples(index=False):
    r = dict(zip(G.columns, r))
    f = pd.Timestamp(r[col['fecha']])
    lat, lon = r[col['lat']], r[col['lon']]
    has = pd.notna(lat) and pd.notna(lon)
    ne = r[col['neventos']]
    grows.append([
        int(r[col['id']]),
        f.strftime('%Y-%m-%d'),
        c['mes'](f'{MESES[f.month - 1]} {f.year}'),
        c['resp'](titulo(r[col['resp']])),
        c['terr'](str(r[col['terr']]).strip()),
        int(r[col['dist']]),
        int(r[col['secc']]),
        c['colonia'](str(r[col['colonia']]).strip()),
        c['evento'](str(r[col['evento']]).strip()),
        c['tipo'](str(r[col['tipo']]).strip()),
        c['desc'](str(r[col['desc']]).strip()),
        c['indcol']('Individual' if str(r[col['indcol']]).upper().startswith('IND') else 'Colectivo / prioritario'),
        round(float(lat), 6) if has else None,
        round(float(lon), 6) if has else None,
        c['dep'](str(r[col['dep']]).strip()),
        c['coment'](str(r[col['coment']]).strip()),
        c['estatus'](EST_MAP[str(r[col['estatus']]).strip().upper()]),
        c['prio'](titulo(r[col['prio']])),
        int(ne) if pd.notna(ne) else None,
        c['fidel']({'FIDELIZADA': 'Fidelizada', 'NO FIDELIZADA': 'No fidelizada'}.get(str(r[col['fidel']]).strip().upper(), 'Sin dato')),
    ])

GCOLS = ['id', 'fecha', 'mes', 'resp', 'terr', 'distrito', 'seccion', 'colonia', 'evento', 'tipo', 'desc',
         'indcol', 'lat', 'lon', 'dep', 'coment', 'estatus', 'prio', 'neventos', 'fidel']
# Orden alfabetico para listas largas (estable y facil de buscar)
for k in ['colonia', 'evento', 'tipo', 'dep', 'terr', 'resp']:
    remap = c[k].sorted_by(lambda v: v.lower().replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u'))
    j = GCOLS.index(k)
    for row in grows:
        row[j] = remap[row[j]]

write_js('data-gestiones.js', 'GESTIONES', {
    'fuente': next(DATA.glob('Base Dummy Gestiones*.xlsx')).name,
    'cols': GCOLS,
    'cats': {k: v.values for k, v in c.items()},
    'rows': grows,
})

# ---------------------------------------------------------------- Publicidad
PX = next(DATA.glob('Base Dummy Publicidad*.xlsx'))
P = pd.read_excel(PX, sheet_name=0)
K = pd.read_excel(PX, sheet_name='Coordenadas')
assert (P['#'].values == K['#'].values).all(), 'Las hojas de publicidad no estan alineadas por #'

PARTIDOS = ['PAN', 'MORENA', 'MC']
TIPOS = ['Lona', 'Espectacular', 'Barda', 'Mupi']
pc = {'partido': Cat(PARTIDOS), 'tipo': Cat(TIPOS), 'temp': Cat(['Precampaña', 'Campaña']),
      'cand': Cat(), 'colonia': Cat(), 'dom': Cat()}
fechas = pd.to_datetime(P['Fecha'], dayfirst=True)
meses_p = sorted({(d.year, d.month) for d in fechas})
pc['mes'] = Cat([f'{MESES[m - 1]} {y}' for y, m in meses_p])

prows, sin_sec = [], 0
for (r, k), f in zip(zip(P.itertuples(index=False), K.itertuples(index=False)), fechas):
    r = dict(zip(P.columns, r)); k = dict(zip(K.columns, k))
    lat, lon = float(k['Latitud']), float(k['Longitud'])
    s = seccion_de(lat, lon)
    if s is None:
        sin_sec += 1
    prows.append([
        int(r['#']), f.strftime('%Y-%m-%d'), pc['mes'](f'{MESES[f.month - 1]} {f.year}'),
        pc['temp'](str(r['Temporalidad']).strip()), pc['partido'](str(r['Partido']).strip().upper()),
        pc['cand'](str(r['Candidato']).strip()), pc['tipo'](str(r['Tipo']).strip()),
        pc['colonia'](titulo(r['Colonia'])), pc['dom'](str(r['Domicilio']).strip()),
        int(r['Código Postal']), int(r['Distrito Local']), s, round(lat, 6), round(lon, 6),
    ])
PCOLS = ['id', 'fecha', 'mes', 'temp', 'partido', 'cand', 'tipo', 'colonia', 'dom', 'cp', 'distrito', 'seccion', 'lat', 'lon']
for kname in ['cand', 'colonia']:
    remap = pc[kname].sorted_by(lambda v: v.lower())
    j = PCOLS.index(kname)
    for row in prows:
        row[j] = remap[row[j]]
cand_partido = {}
for row in prows:
    cand_partido[row[PCOLS.index('cand')]] = row[PCOLS.index('partido')]

write_js('data-propaganda.js', 'PUBLICIDAD', {
    'fuente': PX.name,
    'cols': PCOLS,
    'cats': {k: v.values for k, v in pc.items()},
    'candPartido': [cand_partido[i] for i in range(len(pc['cand'].values))],
    'rows': prows,
})
if sin_sec:
    print(f'AVISO: {sin_sec} piezas de publicidad sin seccion')

# ---------------------------------------------------------------- Geometria
usadas = {row[GCOLS.index('seccion')] for row in grows} | {row[PCOLS.index('seccion')] for row in prows if row[PCOLS.index('seccion')]}
distritos_base = {4}
incluir = sorted(k for k in SEC if SEC[k]['d'] in distritos_base or k in usadas)


def rnd(geom, nd=5):
    def r(c):
        return [round(c[0], nd), round(c[1], nd)]
    m = mapping(geom)
    if m['type'] == 'Polygon':
        m['coordinates'] = [[r(c) for c in ring] for ring in m['coordinates']]
    else:
        m['coordinates'] = [[[r(c) for c in ring] for ring in poly] for poly in m['coordinates']]
    return m


feats = []
for k in incluir:
    g = SEC[k]['g'].simplify(0.00004, preserve_topology=True)
    rp = SEC[k]['g'].representative_point()
    feats.append({'type': 'Feature', 'properties': {'s': k, 'd': SEC[k]['d'], 'm': SEC[k]['mun'], 'p': [round(rp.y, 5), round(rp.x, 5)]}, 'geometry': rnd(g)})

contornos = []
for d in sorted({SEC[k]['d'] for k in incluir}):
    if d not in distritos_base:
        continue
    todo = [SEC[k]['g'] for k in SEC if SEC[k]['d'] == d]
    u = unary_union([x.buffer(0.00008) for x in todo]).buffer(-0.00008).simplify(0.00008)
    contornos.append({'type': 'Feature', 'properties': {'d': d}, 'geometry': rnd(u)})

write_js('geo-secciones.js', 'SECCIONES', {
    'secciones': {'type': 'FeatureCollection', 'features': feats},
    'distritos': {'type': 'FeatureCollection', 'features': contornos},
})
print(f'{len(feats)} secciones ({len(usadas)} con registros)')
