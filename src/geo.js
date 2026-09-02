/* ---------- geo & time ---------- */
const off = a => AP[a] ? AP[a][4] : 0;
const dcache = new Map();
function dist(a,b){
  const k = a<b ? a+b : b+a; let v = dcache.get(k); if(v!==undefined) return v;
  const A=AP[a], B=AP[b]; if(!A||!B) return 0;
  const r=Math.PI/180, la1=A[2]*r, lo1=A[3]*r, la2=B[2]*r, lo2=B[3]*r;
  const h=Math.sin((la2-la1)/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin((lo2-lo1)/2)**2;
  v = 3440.065*2*Math.asin(Math.sqrt(h)); dcache.set(k,v); return v;
}
let SPEC = {};
const blk = (a,b,t) => SPEC[t] ? SPEC[t].gnd + dist(a,b)/SPEC[t].kt*60 : 0;
const loc = (ap,u) => u + off(ap);
const utc = (ap,l) => l - off(ap);
const mod = (n,m) => ((n%m)+m)%m;
const hhmm = m => { const v = mod(Math.round(m),1440); return String(Math.floor(v/60)).padStart(2,"0")+":"+String(v%60).padStart(2,"0"); };
const fmt = (n,d=0) => (n==null||isNaN(n)) ? "–" : n.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
