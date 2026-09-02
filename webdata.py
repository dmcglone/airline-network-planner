import csv,json
from collections import defaultdict
from zoneinfo import ZoneInfo
from datetime import datetime
DATE=datetime(2026,6,8)
STA=["SJC","RDU","PIT","AUS","DEN","COS","LAS","MCO"]
REG={"United States","Canada","Mexico","Bahamas","Cuba","Jamaica","Haiti","Dominican Republic","Puerto Rico",
"Aruba","Netherlands Antilles","Turks and Caicos Islands","Cayman Islands","Bermuda","Belize","Guatemala",
"Honduras","El Salvador","Nicaragua","Costa Rica","Panama","Colombia","Ecuador","Peru","Venezuela","Chile",
"Argentina","Brazil","Uruguay","Barbados","Trinidad and Tobago","Saint Lucia","Antigua and Barbuda",
"Dominica","Grenada","Saint Kitts and Nevis","Saint Vincent and the Grenadines","British Virgin Islands",
"Virgin Islands","Guyana","Suriname","Bolivia","Paraguay"}
AP={}
for row in csv.reader(open('airports.dat',encoding='utf-8')):
    iata,cty,name,city,ctry=row[4],row[11],row[1],row[2],row[3]
    if not iata or iata=='\\N' or len(iata)!=3: continue
    if iata in AP: continue
    if ctry not in REG: continue
    if row[12]!='airport': continue
    try: off=int(ZoneInfo(cty).utcoffset(DATE).total_seconds()//60)
    except Exception: continue
    name=name.replace(" International Airport"," Intl").replace(" Airport","").replace(" International"," Intl")
    AP[iata]=[name,city,round(float(row[6]),4),round(float(row[7]),4),off,ctry]
LG=json.load(open('legs.json'))
legs=defaultdict(int); weekly={}
for k,v in LG['legs'].items():
    o,d,t=k.split('|'); legs[(o,d,t)]=v
for k,v in LG['weekly'].items():
    o,d,t=k.split('|'); weekly[(o,d,t)]=v
need=set()
for (o,d,t) in legs: need.add(o); need.add(d)
missing=[a for a in need if a not in AP]
print("network airports missing from list:",missing)
mk=defaultdict(dict)
for (o,d,t),n in legs.items():
    if o in STA: mk[(o,d)][t]=n
routes=[]
for (o,d),m in sorted(mk.items()):
    n=sum(m.values())
    w=sum(weekly.get((o,d,t),7.0*m[t]) for t in m)     # total weekly flights on the route
    dow=max(1,min(7,int(round(w/n)))) if n else 7
    routes.append({"o":o,"d":d,"dow":dow,"mix":m})
print("routes:",len(routes),"airports in picker:",len(AP))
out={"airports":AP,"routes":routes,"stations":STA}
s=json.dumps(out,separators=(',',':'))
open('webdata.json','w').write(s)
print("payload KB:",round(len(s)/1024,1))
print("sample:",routes[0],routes[50])
print("dow<7 count:",sum(1 for r in routes if r['dow']<7))
