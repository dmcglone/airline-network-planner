import json,math,csv
from collections import defaultdict
from zoneinfo import ZoneInfo
from datetime import datetime
D=json.load(open('lines.json')); lines=D['lines']; OFF=D['off']
L=json.load(open('legs.json'))
need=defaultdict(int)
for k,v in L['legs'].items():
    o,d,t=k.split('|'); need[(o,d,t)]=v
FL={"A319":40,"A320":45,"A320E":60,"A321":50,"E175":35,"E145":30}
got=defaultdict(int); errs=defaultdict(list)
for n,l in enumerate(lines):
    f=l['flights']; T=l['type']; turn=FL[T]
    for g in f: got[(g[0],g[1],T)]+=1
    # continuity
    for i in range(len(f)-1):
        if f[i][1]!=f[i+1][0]: errs['space'].append((n,i,f[i][1],f[i+1][0]))
        gap=f[i+1][2]-f[i][3]
        if gap<turn-1e-6: errs['ground'].append((n,i,round(gap),turn))
    # closes: last arrival station == first departure station, and overnight ground ok
    if f[0][0]!=f[-1][1]: errs['close'].append((n,f[0][0],f[-1][1]))
    else:
        overnight=(f[0][2]+1440)-f[-1][3]
        if overnight<turn: errs['overnight'].append((n,round(overnight)))
    span=f[-1][3]-f[0][2]
    if span>1440: errs['span'].append((n,round(span/60,1)))
miss=[(k,need[k],got.get(k,0)) for k in need if got.get(k,0)!=need[k]]
extra=[(k,got[k]) for k in got if k not in need]
print("legs required:",sum(need.values()),"legs flown:",sum(got.values()))
print("mismatched leg counts:",len(miss)); print("  ",miss[:10])
print("legs flown that were not required:",len(extra),extra[:5])
for k,v in errs.items(): print(f"ERROR {k}: {len(v)}  e.g. {v[:4]}")
if not errs: print("all rotations continuous, closed, and within 24h")
# station balance from flown schedule
dep=defaultdict(int); arr=defaultdict(int)
for l in lines:
    for g in l['flights']: dep[g[0]]+=1; arr[g[1]]+=1
imb=[(a,dep[a],arr[a]) for a in set(list(dep)+list(arr)) if dep[a]!=arr[a]]
print("stations where deps != arrs:",imb if imb else "none")
