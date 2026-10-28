import re, json, pathlib
src = pathlib.Path('.tmp/package/assets/regular')
names = ['chart-bar','funnel','arrow-counter-clockwise','x','house','road-horizon','calendar-star',
         'smiley','smiley-meh','smiley-sad','download-simple','scales','map-pin-area','gauge',
         'caret-up','caret-down','users-three','list-checks','info','check','sliders-horizontal','chart-line-up','handshake']
syms = []
for n in names:
    svg = (src / f'{n}.svg').read_text(encoding='utf-8')
    inner = re.search(r'<svg[^>]*>(.*)</svg>', svg, re.S).group(1)
    syms.append(f'<symbol id="i-{n}" viewBox="0 0 256 256">{inner}</symbol>')
sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">' + ''.join(syms) + '</svg>'
js = "/* Iconos: Phosphor Icons (MIT), estilo regular. Generado por scripts/build_icons.py */\n" \
     "document.body.insertAdjacentHTML('afterbegin', " + json.dumps(sprite) + ");\n"
pathlib.Path('js/icons.js').write_text(js, encoding='utf-8')
print(len(js))
