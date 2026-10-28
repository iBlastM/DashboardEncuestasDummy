"""Convierte los GeoJSON de geojson/ en js/geo.js (rutas SVG ya proyectadas y simplificadas),
para que el mapa del tablero funcione abriendo index.html con doble clic.

Supuesto: "Distrito I" a "Distrito VII" de la encuesta son los distritos locales 1 a 7 de Queretaro
(los siete que cubren el municipio de Queretaro y parte de Corregidora). Se disuelven las secciones
electorales de SE_EDO_QRO_24_25.geojson por distrito local.

Uso:  python scripts/build_geo.py
"""
import json, math, pathlib, collections
from shapely.geometry import shape, box, mapping
from shapely.ops import unary_union

ROOT = pathlib.Path(__file__).resolve().parent.parent
GJ = ROOT / 'geojson'
N_DIST = 7
FIELD = '25_D_LOCAL'

secciones = json.loads((GJ / 'SE_EDO_QRO_24_25.geojson').read_text(encoding='utf-8'))['features']
munis = json.loads((GJ / 'MUNICIPIOS QRO.geojson').read_text(encoding='utf-8'))['features']

# 1) Disolver secciones por distrito local
geoms = collections.defaultdict(list)
cuentas = collections.defaultdict(collections.Counter)
for f in secciones:
    p = f['properties']
    d = p[FIELD]
    if d is None or not (1 <= int(d) <= N_DIST):
        continue
    g = shape(f['geometry']).buffer(0)
    geoms[int(d)].append(g)
    cuentas[int(d)][p['NOM_MUN']] += 1

dist = {}
for d in range(1, N_DIST + 1):
    # buffer +/- cierra rendijas entre secciones vecinas antes de simplificar
    u = unary_union([g.buffer(0.00008) for g in geoms[d]]).buffer(-0.00008)
    dist[d] = u

allu = unary_union(list(dist.values()))
minx, miny, maxx, maxy = allu.bounds
padx, pady = (maxx - minx) * 0.05, (maxy - miny) * 0.04
view = box(minx - padx, miny - pady, maxx + padx, maxy + pady)

# 2) Proyeccion equirectangular local (suficiente a esta escala)
lat0 = (miny + maxy) / 2
lon0 = view.bounds[0]
kx = math.cos(math.radians(lat0))
W = 1000.0
scale = W / ((view.bounds[2] - view.bounds[0]) * kx)
H = (view.bounds[3] - view.bounds[1]) * scale
def proj(x, y):
    return ((x - lon0) * kx * scale, (view.bounds[3] - y) * scale)

def ring_path(coords):
    pts = [proj(x, y) for x, y, *_ in coords]
    return 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z'

def geom_path(g):
    polys = [g] if g.geom_type == 'Polygon' else [p for p in g.geoms if p.geom_type == 'Polygon']
    out = []
    for p in polys:
        if p.is_empty:
            continue
        out.append(ring_path(p.exterior.coords))
        for r in p.interiors:
            out.append(ring_path(r.coords))
    return ''.join(out)

def label_point(g):
    polys = [g] if g.geom_type == 'Polygon' else list(g.geoms)
    big = max(polys, key=lambda p: p.area)
    pt = big.representative_point()
    x, y = proj(pt.x, pt.y)
    return round(x, 1), round(y, 1)

distritos = []
for d in range(1, N_DIST + 1):
    g = dist[d].simplify(0.00035, preserve_topology=True)
    cx, cy = label_point(g)
    distritos.append({
        'i': d - 1,
        'd': geom_path(g),
        'cx': cx, 'cy': cy,
        'munis': {k.title().replace('Queretaro', 'Querétaro'): v for k, v in cuentas[d].most_common()},
        'secciones': sum(cuentas[d].values()),
    })

# 3) Municipios de contexto (recortados al encuadre)
ctx = []
for f in munis:
    g = shape(f['geometry']).buffer(0)
    if not g.intersects(view):
        continue
    clip = g.intersection(view).simplify(0.0008, preserve_topology=True)
    if clip.is_empty or clip.area < 1e-6:
        continue
    # etiqueta: punto representativo de la porcion visible
    lx, ly = label_point(clip)
    nm = f['properties']['NOM_MUN'].title().replace(' De ', ' de ')
    nm = nm.replace('Queretaro', 'Querétaro').replace('Marques', 'Marqués').replace('Colon', 'Colón')
    ctx.append({'name': nm, 'd': geom_path(clip), 'cx': lx, 'cy': ly})

payload = {'w': round(W), 'h': round(H), 'distritos': distritos, 'municipios': ctx}
out = ROOT / 'js' / 'geo.js'
out.write_text('/* Generado por scripts/build_geo.py a partir de geojson/ */\nwindow.GEO = ' +
               json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
print(f'{out.name}: {out.stat().st_size/1024:.0f} KB, viewBox {W:.0f}x{H:.0f}')
for d in distritos:
    print(' Distrito', d['i'] + 1, d['secciones'], 'secciones', d['munis'])
print(' contexto:', [m['name'] for m in ctx])

