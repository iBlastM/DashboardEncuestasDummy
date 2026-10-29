"""Genera js/icons.js: sprite SVG con los iconos Phosphor (MIT) que usan los tableros.
Requiere el paquete @phosphor-icons/core desempacado en .tmp/package (npm pack @phosphor-icons/core@2.1.1).
Uso:  python scripts/build_icons.py
"""
import re, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
src = ROOT / '.tmp' / 'package' / 'assets' / 'regular'
names = [
    # encuesta
    'chart-bar', 'funnel', 'arrow-counter-clockwise', 'x', 'house', 'road-horizon', 'calendar-star',
    'smiley', 'smiley-meh', 'smiley-sad', 'download-simple', 'scales', 'map-pin-area', 'gauge',
    'caret-up', 'caret-down', 'users-three', 'list-checks', 'info', 'check', 'sliders-horizontal',
    'chart-line-up', 'handshake',
    # gestiones / publicidad / inicio
    'map-trifold', 'table', 'clipboard-text', 'megaphone', 'magnifying-glass', 'caret-right', 'caret-left',
    'arrow-right', 'check-circle', 'clock', 'x-circle', 'pause-circle', 'hourglass', 'warning',
    'calendar-blank', 'stack', 'buildings', 'user', 'squares-four', 'arrows-out', 'eye', 'map-pin',
    'house-simple', 'polygon', 'dots-nine', 'paint-brush',
]
syms = []
for n in dict.fromkeys(names):
    svg = (src / f'{n}.svg').read_text(encoding='utf-8')
    inner = re.search(r'<svg[^>]*>(.*)</svg>', svg, re.S).group(1)
    syms.append(f'<symbol id="i-{n}" viewBox="0 0 256 256">{inner}</symbol>')
sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">' + ''.join(syms) + '</svg>'
js = "/* Iconos: Phosphor Icons (MIT), estilo regular. Generado por scripts/build_icons.py */\n" \
     "document.body.insertAdjacentHTML('afterbegin', " + json.dumps(sprite) + ");\n"
(ROOT / 'js' / 'icons.js').write_text(js, encoding='utf-8')
print(len(syms), 'iconos,', len(js) // 1024, 'KB')
