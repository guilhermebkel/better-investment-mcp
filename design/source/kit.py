import math, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

G_DARK="#1fb36d"; G_LIGHT="#0f8a4f"
INK_DARK_BG="#f4f6f8"; INK_LIGHT_BG="#11151a"
TILE="#151a20"

def f(v): return f"{v:.2f}".rstrip("0").rstrip(".")
def circ(cx,cy,r): return f"M{f(cx-r)} {f(cy)}a{f(r)} {f(r)} 0 1 0 {f(2*r)} 0a{f(r)} {f(r)} 0 1 0 {f(-2*r)} 0Z"
def capsule(ax,ay,bx,by,r):
    dx,dy=bx-ax,by-ay; L=math.hypot(dx,dy); nx,ny=-dy/L*r,dx/L*r
    return (f"M{f(ax+nx)} {f(ay+ny)}L{f(bx+nx)} {f(by+ny)}A{f(r)} {f(r)} 0 0 0 {f(bx-nx)} {f(by-ny)}"
            f"L{f(ax-nx)} {f(ay-ny)}A{f(r)} {f(r)} 0 0 0 {f(ax+nx)} {f(ay+ny)}Z")
def hub(n,ros,core,ri,r,cx=128,cy=128,start=-90):
    d=circ(cx,cy,core)
    for k,ro in enumerate(ros):
        a=math.radians(start+360*k/n); ux,uy=math.cos(a),math.sin(a)
        d+=capsule(cx+(ri+r)*ux,cy+(ri+r)*uy,cx+(ro-r)*ux,cy+(ro-r)*uy,r)
    return d
# símbolo principal: 8 barras, núcleo
MAIN=hub(8,[92,112,80,108,88,116,76,102],core=24,ri=44,r=10)
# versão pequena: 6 barras, mais grossas
SMALL=hub(6,[100,118,90,112,96,108],core=30,ri=52,r=14)

def svg(vb,body,title,w=None):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'
def mark(color,d=MAIN,gid="icone",tf=""):
    t=f' transform="{tf}"' if tf else ""
    return f'<g id="{gid}"{t}><path fill="{color}" d="{d}"/></g>'

# ---------- text outlined from Geist Mono Medium (SIL OFL 1.1) ----------
FONT=os.environ.get("GEIST_MONO_TTF","GeistMono-Medium.ttf")  # from the npm package geist, dist/fonts/geist-mono/
font=TTFont(FONT)
gs=font.getGlyphSet(); cmap=font.getBestCmap(); upm=font["head"].unitsPerEm
xh=font["OS/2"].sxHeight
NAME="better-investment-mcp"
def text_path(s,size,x,baseline,track=0):
    sc=size/upm; d=""; cur=x
    for ch in s:
        gn=cmap[ord(ch)]; pen=SVGPathPen(gs, ntos=lambda v:f(v))
        tp=TransformPen(pen,(sc,0,0,-sc,cur,baseline)); gs[gn].draw(tp)
        d+=pen.getCommands(); cur+=gs[gn].width*sc+track
    return d,cur
def lockup_h(g,ink,sym=MAIN):
    size=74; sc=size/upm; base=128+xh*sc/2
    x=256+64
    d1,xe=text_path("better-investment",size,x,base,track=-1.0)
    d2,xe2=text_path("-mcp",size,xe-1.0,base,track=-1.0)
    W=math.ceil(xe2+8)
    body=mark(g,sym)+f'<g id="wordmark"><path fill="{ink}" d="{d1}"/><path fill="{g}" d="{d2}"/></g>'
    return svg(f"0 0 {W} 256",body,NAME)
def lockup_v(g,ink,sym=MAIN):
    size=64; sc=size/upm; adv=font["hmtx"]["a"][0]*sc-1.0
    l1="better-investment"; w1=len(l1)*adv; w2=4*adv; W=math.ceil(w1+40); cx=W/2; ty=300
    d1,_=text_path(l1,size,cx-w1/2,ty,track=-1.0)
    d2,_=text_path("-mcp",size,cx-w2/2,ty+84,track=-1.0)
    body=mark(g,sym,tf=f"translate({f(cx-128)} 0)")+f'<g id="wordmark"><path fill="{ink}" d="{d1}"/><path fill="{g}" d="{d2}"/></g>'
    return svg(f"0 0 {W} {ty+84+30}",body,NAME)
def write(path,txt):
    os.makedirs(os.path.dirname(path),exist_ok=True); open(path,"w").write(txt)
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),"..")
for nm,g,ink in (("dark",G_DARK,INK_DARK_BG),("light",G_LIGHT,INK_LIGHT_BG)):
    write(f"{OUT}/svg/symbol-{nm}.svg",svg("0 0 256 256",mark(g),NAME))
    write(f"{OUT}/svg/symbol-small-{nm}.svg",svg("0 0 256 256",mark(g,SMALL),NAME))
    write(f"{OUT}/svg/horizontal-{nm}.svg",lockup_h(g,ink))
    write(f"{OUT}/svg/stacked-{nm}.svg",lockup_v(g,ink))
for nm,c in (("black","#000000"),("white","#ffffff")):
    write(f"{OUT}/mono/symbol-{nm}.svg",svg("0 0 256 256",mark(c),NAME))
    write(f"{OUT}/mono/horizontal-{nm}.svg",lockup_h(c,c))
    write(f"{OUT}/mono/stacked-{nm}.svg",lockup_v(c,c))
tile="M76 24H180A52 52 0 0 1 232 76V180A52 52 0 0 1 180 232H76A52 52 0 0 1 24 180V76A52 52 0 0 1 76 24Z"
write(f"{OUT}/web/{NAME}-app-icon.svg",svg("0 0 256 256",f'<path fill="{TILE}" d="{tile}"/>'+mark(G_DARK,SMALL,tf="translate(128 128) scale(.66) translate(-128 -128)"),NAME))
