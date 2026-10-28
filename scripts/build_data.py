"""Convierte la base de Excel en js/data.js para que el tablero funcione abriendo index.html
con doble clic (sin servidor). Uso:  python scripts/build_data.py"""
import json, pathlib
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent.parent
XLSX = next((ROOT / 'data').glob('*.xlsx'))
df = pd.read_excel(XLSX)
df.columns = ['id', 'distrito', 'animo', 'lugar', 'muni', 'estatal', 'kuri', 'problema', 'preocupacion', 'gusta']

# Cada columna categorica se guarda como indice a un catalogo: el archivo pesa 5 veces menos.
cats = {}
rows = []
for c in ['distrito', 'animo', 'lugar', 'problema', 'preocupacion', 'gusta']:
    cats[c] = sorted(df[c].unique(), key=lambda v: (len(v) > 0 and v))
# Distritos en orden romano, no alfabetico
romano = ['Distrito I', 'Distrito II', 'Distrito III', 'Distrito IV', 'Distrito V', 'Distrito VI', 'Distrito VII']
cats['distrito'] = [d for d in romano if d in set(df['distrito'])]
cats['animo'] = ['Feliz', 'Regular', 'Triste']
cats['lugar'] = ['Calle', 'Casa', 'Evento']

for r in df.itertuples(index=False):
    rows.append([
        int(r.id),
        cats['distrito'].index(r.distrito),
        cats['animo'].index(r.animo),
        cats['lugar'].index(r.lugar),
        int(r.muni), int(r.estatal), int(r.kuri),
        cats['problema'].index(r.problema),
        cats['preocupacion'].index(r.preocupacion),
        cats['gusta'].index(r.gusta),
    ])

payload = {
    'fuente': XLSX.name,
    'cols': ['id', 'distrito', 'animo', 'lugar', 'muni', 'estatal', 'kuri', 'problema', 'preocupacion', 'gusta'],
    'cats': cats,
    'rows': rows,
}
out = ROOT / 'js' / 'data.js'
out.write_text('window.ENCUESTA = ' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
print(f'{len(rows)} registros -> {out} ({out.stat().st_size/1024:.0f} KB)')
