"""Revisa si alguna ruta del sitio coincide con reglas genericas de bloqueadores de anuncios.
Uso: python scripts/check_adblock.py  (requiere las listas en .tmp/)"""
import re, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
lists = [p for p in (ROOT / '.tmp').glob('*.txt')]
rules = []
for p in lists:
    for line in p.read_text(encoding='utf-8', errors='ignore').splitlines():
        line = line.strip()
        if not line or line.startswith(('!', '[', '@@', '||', '|')) or '#' in line:
            continue
        pat, _, opts = line.partition('$')
        # Reglas de un sitio concreto o solo de terceros no aplican a nuestro dominio
        if re.search(r'(^|,)(domain=|from=|3p|third-party|~1p|redirect)', opts):
            continue
        if len(pat) < 4:
            continue
        rx = re.escape(pat).replace(r'\*', '.*').replace(r'\^', r'([/?&=:.]|$)')
        try:
            rules.append((line, p.name, re.compile(rx, re.I)))
        except re.error:
            pass

paths = []
for f in ROOT.rglob('*'):
    if f.is_file() and not any(part.startswith('.') for part in f.relative_to(ROOT).parts) and f.suffix in {'.html', '.js', '.css', '.png', '.woff2', '.json', '.geojson'}:
        paths.append('/DashboardEncuestasDummy/' + f.relative_to(ROOT).as_posix())
hits = 0
for u in paths:
    for line, src, rx in rules:
        if rx.search(u):
            print(f'BLOQUEABLE {u}  <- {line}  ({src})')
            hits += 1
            break
print(f'{len(paths)} rutas revisadas contra {len(rules)} reglas; {hits} coincidencias')
sys.exit(1 if hits else 0)
