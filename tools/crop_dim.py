"""Вирізає фото товарів з PDF-каталогу 'Товари для дому' за координатами артикулів."""
import re, sys, os, json, subprocess, html
import numpy as np
from PIL import Image
from scipy import ndimage

PDF, OUT, TMP = sys.argv[1], sys.argv[2], sys.argv[3]
DPI = 150; S = DPI/72
os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)
subprocess.run(['pdftoppm','-r',str(DPI),'-png',PDF,f'{TMP}/pg'],check=True,stderr=subprocess.DEVNULL)
subprocess.run(['pdftotext','-bbox',PDF,f'{TMP}/bbox.html'],check=True,stderr=subprocess.DEVNULL)
doc=open(f'{TMP}/bbox.html',encoding='utf8').read()
pages=doc.split('<page ')[1:]
files=sorted(f for f in os.listdir(TMP) if f.startswith('pg'))
result={}
MANUAL={'SW-00002656':(4,(40,300,1200,835)),'SW-00002657':(4,(40,1010,1200,1680)),
 'SW-00002658':(5,(40,300,1200,835)),'SW-00002659':(5,(40,1010,1200,1680)),
 'SW-00001540':(14,(25,445,620,1045)),'SW-00001548':(14,(25,1127,620,1727)),
 'SW-00002492':(23,(100,985,330,1290))}
for pi,(pg,fn) in enumerate(zip(pages,files),1):
    if pi==1: continue
    im=Image.open(f'{TMP}/{fn}').convert('RGB'); a=np.asarray(im).copy()
    words=[(float(x0),float(y0),float(x1),float(y1),html.unescape(w)) for x0,y0,x1,y1,w in re.findall(r'xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<',pg)]
    H,W=a.shape[:2]
    from PIL import ImageDraw
    clean=im.copy(); dr=ImageDraw.Draw(clean)
    for x0,y0,x1,y1,w in words:
        if y0>0.15*853: dr.rectangle([x0*S-1,y0*S-1,x1*S+1,y1*S+1],fill='white')
    mask=(a.min(axis=2)<232)
    for x0,y0,x1,y1,w in words:
        mask[int(y0*S)-2:int(y1*S)+2, int(x0*S)-2:int(x1*S)+2]=False
    mask[:int(0.17*H if pi>1 else 0)]=False  # шапка сторінки
    mask=ndimage.binary_closing(mask,iterations=4)
    mask=ndimage.binary_opening(mask,iterations=2)
    lab,n=ndimage.label(mask)
    comps=[]
    for i,sl in enumerate(ndimage.find_objects(lab),1):
        ys,xs=sl; h=ys.stop-ys.start; w=xs.stop-xs.start
        if h>60 and w>60: comps.append((xs.start/S,ys.start/S,xs.stop/S,ys.stop/S))
    for x0,y0,x1,y1,w in words:
        m=re.match(r'SW-(\d{8})',w)
        if not m: continue
        sku='SW-'+m.group(1)
        best=None
        for c in comps:
            ov=min(x1,c[2])-max(x0,c[0])
            if ov<=0: continue
            gap_below=c[1]-y1; gap_above=y0-c[3]
            if -15<=gap_below<=90: d=gap_below
            elif -15<=gap_above<=60: d=gap_above+40
            else: continue
            if best is None or d<best[0]: best=(d,c)
        if not best: print('no image', pi, sku); continue
        c=best[1]; p=4
        box=(max(0,int((c[0]-p)*S)),max(0,int((c[1]-p)*S)),min(W,int((c[2]+p)*S)),min(H,int((c[3]+p)*S)))
        crop=clean.crop(box)
        crop.thumbnail((900,900))
        crop.save(f'{OUT}/{sku}.jpg',quality=82,optimize=True)
        result[sku]={'page':pi}
    for sku,(opg,box) in MANUAL.items():
        if opg==pi:
            crop=clean.crop(box); crop.thumbnail((900,900)); crop.save(f'{OUT}/{sku}.jpg',quality=82,optimize=True); result[sku]={'page':pi}
    # сторінка цілком як додаткове фото
json.dump(result,open(f'{OUT}/_index.json','w'),indent=1)
print(len(result),'crops')
