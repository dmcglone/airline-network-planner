/* ----- schedule ----- */
function drawSched(){
  const q=$("#sq").value.trim().toUpperCase(), fs=$("#sStation").value, ft=$("#sType").value, ro=$("#sRon").checked;
  let rows=M.flights.filter(f=>{
    if(fs&&f.o!==fs) return false;
    if(ft&&f.t!==ft) return false;
    if(ro&&!f.ron) return false;
    if(!q) return true;
    return (String(f.fn)+f.o+f.d+f.line).toUpperCase().includes(q);
  });
  $("#schedCount").textContent = fmt(rows.length)+" flights"+(rows.length>400?" · showing first 400":"");
  rows=rows.slice(0,400);
  const t=$("#tSched");
  t.innerHTML="<thead><tr><th>Flight</th><th>Rotation</th><th>Gauge</th><th>From</th><th>To</th><th>Destination</th>"
    +"<th class='r'>Dep</th><th class='r'>Arr</th><th></th><th class='r'>Block</th><th class='r'>Distance</th><th class='r'>Seats</th><th class='r'>Days/wk</th></tr></thead>";
  const tb=el("tbody");
  tb.innerHTML = rows.map(f=>`<tr><td class="code">${f.fn}</td><td class="mono dim">${f.line}</td>`
    +`<td>${f.t}</td><td class="code">${f.o}</td><td class="code">${f.d}</td>`
    +`<td class="dim">${esc(AP[f.d]?AP[f.d][0]:f.d)}</td>`
    +`<td class="num">${hhmm(f.dep)}</td><td class="num">${hhmm(f.arr)}</td>`
    +`<td>${f.day>0?'<span class="chip warn">+1</span>':""}</td>`
    +`<td class="num">${f.blk.toFixed(2)}</td><td class="num">${fmt(f.nm)}</td>`
    +`<td class="num">${SPEC[f.t].seats}</td>`
    +`<td class="num">${f.dow<7?`<span class="chip">${f.dow}×</span>`:"7"}</td></tr>`).join("");
  t.appendChild(tb);
}
