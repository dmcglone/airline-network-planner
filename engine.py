import csv,json,math
from collections import defaultdict
from zoneinfo import ZoneInfo
from datetime import datetime,timedelta

DATE=datetime(2026,6,8)   # design day: Monday, 8 June 2026
STA=["SJC","RDU","PIT","AUS","DEN","COS","LAS","MCO"]
ROLE={"SJC":"Hub","PIT":"Hub","MCO":"Hub","DEN":"Focus City","RDU":"Focus City",
      "AUS":"P2P Base","LAS":"P2P Base","COS":"P2P Base"}
BANKS={"Hub":[360,480,600,720,840,960,1080,1230],          # 06:00 08:45 11:45 14:30 17:30 20:30
       "Focus City":[375,540,750,960,1170],        # 06:15 09:00 12:30 16:00 19:30
       "P2P Base":[360,510,660,810,990,1170]}      # 06:00 08:30 11:00 13:30 16:30 19:30
FLEET={"A319":dict(seats=126,rng=2700,kt=447,gnd=35,turn=40,util=11.0),
       "A320":dict(seats=150,rng=2900,kt=450,gnd=35,turn=45,util=11.0),
       "A320E":dict(seats=150,rng=3300,kt=450,gnd=35,turn=60,util=11.5),
       "A321":dict(seats=190,rng=2900,kt=452,gnd=38,turn=50,util=11.0),
       "E175":dict(seats=76,rng=1800,kt=420,gnd=32,turn=35,util=9.5),
       "E145":dict(seats=50,rng=1300,kt=390,gnd=30,turn=30,util=9.0)}
CURFEW={"SJC":(360,1380)}   # no departures before 06:00 or after 23:00 local
# Stations that pull a morning feed from their spokes, and the bank the feed must make.
# SJC/PIT: dawn — earliest bank the aircraft can reach. MCO: the 10:00 Caribbean bank.
FEED_TARGETS={"SJC":"dawn","PIT":"dawn","MCO":600}
MCT=40                      # minimum connect time, minutes
REDEYE_ON=True
# INBOUND: the outstation->base leg flies overnight, so the aircraft lands at its base at
# dawn and works a full day there. (base, outstation)
REDEYE_IN={("PIT","SJC"),("RDU","SJC"),("MCO","SJC"),("RDU","LAS"),("PIT","LAS"),("MCO","LAS"),
           ("RDU","LAX"),("PIT","LAX"),("MCO","SEA"),("MCO","PDX"),("RDU","SEA"),("RDU","PDX"),
           ("PIT","SEA"),("RDU","PHX"),("MCO","LIM")}
# OUTBOUND: the base->outstation leg flies overnight, because the far end has no base of its
# own. The aircraft turns straight round and works its base's afternoon. (base, outstation)
REDEYE_OUT={("SJC","BOS"),("SJC","EWR")}
RED_DEP=(1260,1380)         # a red-eye departs between 21:00 and 23:00 local
RED_ARR_TARGET=405          # and aims to land about 06:45 local
SPOKE_EARLIEST=330          # no spoke pushes before 05:30 local
MIN_MKT_GAP=40
TARGET_SPREAD=95
SPREAD_WINDOW=560           # a market's flights aim to cover this many minutes
DAWN_STAGGER=7              # minutes between successive dawn pushes at the same outstation

coords={};tzs={};apname={}
for row in csv.reader(open('airports.dat',encoding='utf-8')):
    i=row[4]
    if i and i!='\\N' and len(i)==3 and i not in coords:
        coords[i]=(float(row[6]),float(row[7])); tzs[i]=row[11]; apname[i]=row[1]
OFF={}
for a in coords:
    try: OFF[a]=int(ZoneInfo(tzs[a]).utcoffset(DATE).total_seconds()//60)
    except Exception: OFF[a]=0

def gc(a,b):
    la1,lo1=map(math.radians,coords[a]); la2,lo2=map(math.radians,coords[b])
    return 3440.065*2*math.asin(math.sqrt(math.sin((la2-la1)/2)**2+math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2))
DIST={}
def dist(a,b):
    k=(a,b)
    if k not in DIST: DIST[k]=gc(a,b)
    return DIST[k]
def block(a,b,t):
    f=FLEET[t]; return f['gnd']+dist(a,b)/f['kt']*60      # minutes
def loc(ap,utc_min): return utc_min+OFF[ap]
def utc(ap,local_min): return local_min-OFF[ap]
def hhmm(m):
    d,m=divmod(int(round(m)),1440); return f"{m//60:02d}:{m%60:02d}",d

D=json.load(open('legs.json'))
legs=defaultdict(int)
for k,v in D['legs'].items():
    o,d,t=k.split('|'); legs[(o,d,t)]=v
weekly={tuple(k.split('|')):v for k,v in D['weekly'].items()}
size=defaultdict(int)
for (o,d,t),n in legs.items(): size[o]+=n

# ---- assign each turn an owning base ----
turns=defaultdict(list)      # (base,type) -> [dest,...]
pool=dict(legs)
pairs=defaultdict(int)
for (o,d,t),n in list(pool.items()):
    if o in STA and d in STA:
        if o<d: pairs[(o,d,t)]=n
    elif o in STA:
        turns[(o,t)] += [d]*n           # spoke turn owned by the station
for (a,b,t),n in pairs.items():
    sa,sb=size[a],size[b]
    na=int(round(n*sa/(sa+sb)))
    na=max(0,min(n,na))
    turns[(a,t)]+= [b]*na
    turns[(b,t)]+= [a]*(n-na)

tot_turns=sum(len(v) for v in turns.values())
print(f"turns to fly: {tot_turns}  (= {tot_turns*2} legs)")

# ---- feed plan: each spoke is fed by whichever feed station serves it most ----
spoke_freq=defaultdict(lambda: defaultdict(int)); spoke_size=defaultdict(int)
for (o,d,t),n in legs.items():
    if o in STA and d not in STA: spoke_freq[d][o]+=n
    if o not in STA: spoke_size[o]+=n
FEED_PAIR=set(); FEED_OF={}
for d,m in spoke_freq.items():
    c={b:n for b,n in m.items() if b in FEED_TARGETS}
    if not c: continue
    b=max(c.items(), key=lambda x:(x[1], -dist(d,x[0])))[0]
    FEED_PAIR.add((b,d)); FEED_OF[d]=b
print(f"feed plan: {len(FEED_PAIR)} spokes assigned a primary feed station")
FED=set()
RED_USED=set()
NIGHT_PAIR=set()            # at most one overnight return per base/outstation pair
RON_COUNT=defaultdict(int)  # overnight aircraft already parked at each outstation
# A small station cannot have half its flying start as a dawn push, or it ends up with
# no afternoon departures at all. Roughly one overnight per five daily departures.
RON_CAP={d: max(1, round(n/5)) for d,n in spoke_size.items()}
MKT=defaultdict(list)       # (origin,dest) -> local departure minutes already placed
DAWN_N=defaultdict(int)     # dawn pushes already placed at each outstation
MKT_FREQ=defaultdict(int)
for (o,d,t),n in legs.items(): MKT_FREQ[(o,d)]+=n
def want_gap(o,d):
    # thin markets spread across the day; high-frequency shuttles need only a decent interval
    f=max(1,MKT_FREQ[(o,d)])
    return min(TARGET_SPREAD, max(MIN_MKT_GAP, SPREAD_WINDOW//f))
def gap_ok(o,d,t):
    lt=loc(o,t)%1440; g=want_gap(o,d)
    return all(min(abs(lt-x),1440-abs(lt-x))>=g-1e-6 for x in MKT[(o,d)])
def mkt_add(o,d,t): MKT[(o,d)].append(loc(o,t)%1440)
def civil_ok(o,t,blkmin):
    # a departure may only sit in the small hours if it is a genuine long red-eye
    lt=loc(o,t)%1440
    return (330<=lt<=1410) or blkmin>=240
def push_until(o,d,t,limit=90):
    n=0
    while not gap_ok(o,d,t) and n<limit: t+=5; n+=1
    return t

# ---- build lines ----
lines=[]
EPS=1e-6
SLOT=defaultdict(int)   # departures already scheduled at each outstation local minute
for (B,T) in sorted(turns, key=lambda k:(-len(turns[k]),k)):
    spec=FLEET[T]; banks=BANKS[ROLE[B]]; turn=spec['turn']
    rem=sorted(turns[(B,T)], key=lambda d:-(block(B,d,T)+block(d,B,T)))
    li=0
    while rem:
        li+=1
        stag=(li%8)*6          # spread each bank's push over ~45 minutes
        startbank=banks[(li-1)%3]   # rotate which morning bank the line originates in
        night=None; is_feed=False; is_red=False
        dur0=block(B,rem[0],T)+turn+block(rem[0],B,T)
        red=[i for i,d in enumerate(rem)
             if REDEYE_ON and (B,d) in (REDEYE_IN|REDEYE_OUT) and (B,d) not in RED_USED
             and (B,d) not in NIGHT_PAIR]
        if red:
            i=red[0]; night=rem.pop(i); RED_USED.add((B,night)); is_red=True
        elif dur0>13*60:
            night=rem.pop(0)                      # too long to fit inside a day: must be the overnight
        if night is None:
            cand=[i for i,d in enumerate(rem) if (B,d) in FEED_PAIR and d not in FED and (B,d) not in NIGHT_PAIR
                  and RON_COUNT[d] < RON_CAP.get(d,1)]
            if cand:
                i=max(cand, key=lambda i: spoke_size[rem[i]])
                night=rem.pop(i); FED.add(night); is_feed=True
            elif night is None and dur0>=240:
                free=[i for i,d in enumerate(rem) if (B,d) not in NIGHT_PAIR
                      and RON_COUNT[d] < RON_CAP.get(d,1)]
                if free: night=rem.pop(free[0])
        if night is not None: NIGHT_PAIR.add((B,night)); RON_COUNT[night]+=1
        flights=[]; blk=0.0
        if night:
            bo=block(night,B,T); bi=block(B,night,T)
            # pick the outstation push time (05:30-08:00 local) that best lands on a bank at base
            best=None
            lo_m=max(SPOKE_EARLIEST, CURFEW[night][0]) if night in CURFEW else SPOKE_EARLIEST
            # a station with a named feed bank (MCO) times ALL its overnight returns to make it
            named = B in FEED_TARGETS and FEED_TARGETS[B]!="dawn"
            if is_red and (B,night) in REDEYE_IN:
                # push from the outstation late last night so we land at the base around dawn
                best_r=None
                for m in range(RED_DEP[0],RED_DEP[1]+1,5):
                    if night in CURFEW and not(CURFEW[night][0]<=m<=CURFEW[night][1]): continue
                    dX=utc(night,m)-1440; aB=dX+bo
                    pen=abs(loc(B,aB)%1440-RED_ARR_TARGET)
                    if best_r is None or pen<best_r[0]: best_r=(pen,dX,aB)
                depX=best_r[1]; arrB=best_r[2]
                fb=next((bk for bk in banks if utc(B,bk)>=arrB+MCT-EPS), None)
                startbank=fb if fb is not None else banks[0]
            elif is_red and (B,night) in REDEYE_OUT:
                # the overnight leg is the evening one; come back mid-morning to work the base day
                depX=utc(night,480); arrB=depX+bo
                fb=next((bk for bk in banks if utc(B,bk)>=arrB+MCT-EPS), None)
                startbank=fb if fb is not None else banks[-1]
            elif is_feed or named:
                mode=FEED_TARGETS[B] if B in FEED_TARGETS else "dawn"
                if mode=="dawn":
                    depX=utc(night, lo_m + DAWN_N[night]*DAWN_STAGGER)   # queue the morning pushes
                else:                              # land in time for the named bank, but spread the
                    # arrivals over a two-hour window so they don't all need a gate at once
                    depX=utc(B, mode-MCT-(li%9)*15)-bo
                    depX=max(depX, utc(night,lo_m))
                if B in CURFEW: depX=max(depX, utc(B,CURFEW[B][0])-bo)
                arrB=depX+bo
                # the line's day now starts at the first bank this arrival can actually feed
                fb=next((bk for bk in banks if utc(B,bk)>=arrB+MCT-EPS), None)
                startbank=fb if fb is not None else banks[0]
            else:
                hi_m=min(480, CURFEW[night][1]) if night in CURFEW else 480
                for m in range(lo_m,hi_m+1,5):
                    dX=utc(night,m); aB=dX+bo
                    pen=abs(loc(B,aB)-(startbank-30))
                    if best is None or pen<best[0]: best=(pen,dX,aB)
                _,depX,arrB=best
            depX=push_until(night,B,depX)          # keep same-market departures apart
            while SLOT[(night,int(round(loc(night,depX)))%1440)]>=2:   # no more than 2 pushes a minute
                if night in CURFEW and loc(night,depX)%1440>=CURFEW[night][1]: break
                depX+=5
            DAWN_N[night]+=1
            mkt_add(night,B,depX)
            SLOT[(night,int(round(loc(night,depX)))%1440)]+=1
            arrB=depX+bo
            arrB=depX+bo
            flights.append([night,B,depX,arrB,bo]); blk+=bo+bi   # reserve both overnight legs
            t=arrB+turn
            latest = depX+1440-bi-turn-15          # must be back at the outstation in time
            if B in CURFEW: latest=min(latest, utc(B,CURFEW[B][1]))   # and out before the curfew
        else:
            t=utc(B,startbank)+stag; latest=t+1440-turn
        first=t
        while rem:
            pick=None
            for i,d in enumerate(rem):
                out=block(B,d,T); back=block(d,B,T)
                if ROLE[B]=="Hub":                      # banked connecting complex
                    dep=next((utc(B,b)+stag for b in banks if utc(B,b)+stag>=t-EPS), None)
                    if dep is None: break
                    if dep-t>60: dep=math.ceil(t/5)*5     # hybrid: don't idle for a bank
                else:                                    # rolling point-to-point schedule
                    dep=max(t, utc(B,startbank)+stag)
                    dep=math.ceil(dep/5)*5
                    if dep>utc(B,banks[-1])+90: break
                if B in CURFEW and not(CURFEW[B][0]-EPS<=loc(B,dep)%1440<=CURFEW[B][1]+EPS): continue
                n=0
                while (not gap_ok(B,d,dep) or not gap_ok(d,B,dep+out+turn)
                       or not civil_ok(B,dep,out) or not civil_ok(d,dep+out+turn,back)) and n<90: dep+=5; n+=1
                if B in CURFEW and not(CURFEW[B][0]-EPS<=loc(B,dep)%1440<=CURFEW[B][1]+EPS): continue
                if not civil_ok(B,dep,out) or not civil_ok(d,dep+out+turn,back): continue
                fin=dep+out+turn+back
                if fin+turn > latest+EPS: continue
                if blk+out+back > spec['util']*60+90: continue
                if pick is None or out+back>pick[1]: pick=(i,out+back,dep,out,back,fin)
            if pick is None: break
            i,_,dep,out,back,fin=pick
            d=rem.pop(i)
            mkt_add(B,d,dep); mkt_add(d,B,dep+out+turn)
            flights.append([B,d,dep,dep+out,out])
            flights.append([d,B,dep+out+turn,fin,back])
            blk+=out+back; t=fin+turn
        if night:
            bi=block(B,night,T)
            if ROLE[B]=="Hub":
                cand=[utc(B,b)+stag for b in banks if t-EPS<=utc(B,b)+stag<=latest+EPS]
                dep=min(cand) if cand else min(max(t,utc(B,banks[0])),latest)
            else:
                dep=min(max(math.ceil(t/5)*5, utc(B,startbank)), latest)
            if is_red and (B,night) in REDEYE_OUT:
                lo_r,hi_r=RED_DEP
                if B in CURFEW: hi_r=min(hi_r,CURFEW[B][1])
                want=[utc(B,m) for m in range(lo_r,hi_r+1,5)]
                ok=[x for x in want if t-EPS<=x<=latest+EPS]
                if ok: dep=min(ok, key=lambda x: abs(loc(night,x+bi)%1440-RED_ARR_TARGET))
                else:  dep=max(t,min(want))
            if B in CURFEW: dep=min(dep,utc(B,CURFEW[B][1]))
            dep=max(dep,t)
            if not gap_ok(B,night,dep):                       # keep the evening push clear of the market
                def ok_at(x):
                    return gap_ok(B,night,x) and t-EPS<=x<=latest+EPS and civil_ok(B,x,bi) and \
                        not(B in CURFEW and not(CURFEW[B][0]-EPS<=loc(B,x)%1440<=CURFEW[B][1]+EPS))
                alt=None
                for step in range(1,97):
                    for x in (dep+step*5, dep-step*5):
                        if ok_at(x): alt=x; break
                    if alt is not None: break
                if alt is not None: dep=alt
            if not civil_ok(B,dep,bi):                        # never leave a short flight in the small hours
                alt=None
                for step in range(1,145):
                    for x in (dep-step*5, dep+step*5):
                        if civil_ok(B,x,bi) and t-EPS<=x<=latest+EPS and \
                           not(B in CURFEW and not(CURFEW[B][0]-EPS<=loc(B,x)%1440<=CURFEW[B][1]+EPS)):
                            alt=x; break
                    if alt is not None: break
                if alt is not None: dep=alt
            mkt_add(B,night,dep)
            flights.append([B,night,dep,dep+bi,bi])
        lines.append(dict(base=B,type=T,ron=night,flights=flights,block=blk))
# ---- consolidation pass: fold stub rotations into gaps in other rotations ----
TGT={t:FLEET[t]['util'] for t in FLEET}
MAX_SPAN=21*60      # an aircraft's day, first departure to last arrival
def at_base(l):
    B=l['base']; return all(g[0]==B or g[1]==B for g in l['flights']) and l['ron'] is None
def span_of(fl): return fl[-1][3]-fl[0][2]
merged=0; absorbed=[]
for S in sorted([l for l in lines if l['block']<0.45*TGT[l['type']]*60], key=lambda z:z['block']):
    if S.get('gone') or not at_base(S): continue
    B,T=S['base'],S['type']; turn=FLEET[T]['turn']
    s0,s1=S['flights'][0][2], S['flights'][-1][3]
    host=None
    for H in lines:
        if H is S or H.get('gone') or H['base']!=B or H['type']!=T: continue
        if H['block']+S['block'] > TGT[T]*60+180: continue
        F=H['flights']
        # every point at which the host is sitting at its base
        slots=[(F[i][3],F[i+1][2],i+1) for i in range(len(F)-1) if F[i][1]==B]
        slots.append((F[-1][3], F[0][2]+1440, len(F)))
        for a,b,pos in slots:
            for sh in (0,1440,-1440):
                if a+turn <= s0+sh and s1+sh+turn <= b:
                    cand=sorted(H['flights']+[[g[0],g[1],g[2]+sh,g[3]+sh,g[4]] for g in S['flights']],key=lambda g:g[2])
                    if span_of(cand) <= MAX_SPAN and cand[0][0]==cand[-1][1]:
                        host=(H,pos,sh); break
            if host: break
        if host: break
    if host:
        H,pos,sh=host
        H['flights']=H['flights'][:pos]+[[g[0],g[1],g[2]+sh,g[3]+sh,g[4]] for g in S['flights']]+H['flights'][pos:]
        H['flights'].sort(key=lambda g:g[2])
        H['block']+=S['block']; S['gone']=True; merged+=1
        absorbed.append((S['id'] if 'id' in S else f"{B}-{T}", round(S['block']/60,2), round(H['block']/60,2)))
lines=[l for l in lines if not l.get('gone')]
print(f"consolidation: {merged} stub rotations folded into other aircraft")
print("lines built:",len(lines))
byT=defaultdict(int)
for l in lines: byT[l['type']]+=1
print("tails by type:",dict(sorted(byT.items())))
json.dump(dict(lines=lines,off=OFF),open('lines.json','w'))
# quick utilization
for t in FLEET:
    ls=[l for l in lines if l['type']==t]
    if ls: print(f"  {t}: {len(ls)} tails, avg block {sum(l['block'] for l in ls)/len(ls)/60:.2f} h/day")
