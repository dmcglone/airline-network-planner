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
/* One way to write a duration and one way to write a big amount of money,
   everywhere. Durations of a flight or an aircraft's day read as 3h53, never as
   3.88 hours. Money is rounded to what the model can actually support: the
   network total moves by tens of thousands between equivalent schedules, so
   $22,694,399 claims a precision nothing here has. */
const durHM = min => { const m = Math.round(min);
  return `${Math.floor(m/60)}h${String(m%60).padStart(2,"0")}`; };
const hrsHM = h => durHM(h*60);
/* "an A319", "an E175", "a B737": aircraft codes are read letter by letter, so the
   article follows how the first letter is said, not how it is spelled. */
const article = code => /^[AEFHILMNORSX]/i.test(String(code)) ? "an" : "a";
const moneyK = n => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if(a >= 1e6) return `${s}$${(a/1e6).toFixed(1)}M`;
  if(a >= 1e4) return `${s}$${(a/1e3).toFixed(1)}k`;
  return s + "$" + fmt(Math.round(a));
};
const fmt = (n,d=0) => (n==null||isNaN(n)) ? "–" : n.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
