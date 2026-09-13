/* ----- sharing a network -----
   The whole airline is a small JSON object — the 404-route example gzips to
   about 2.6 KB — so it fits in a URL and needs no server at all.

   It goes in the FRAGMENT, after the #. A fragment is never sent to the server,
   so a shared network is not in anyone's request logs, including this site's.
   That is worth more than the few characters a query string would save.

   This also answers the problem nobody asks about until it bites them: browser
   storage is not permanent. Safari discards localStorage for a site you have
   not visited in about a week, so somebody who builds a network, comes back a
   fortnight later and finds it gone will reasonably conclude the site lost
   their work. A link they can keep is the cheap fix. */

const SHARE_PREFIX = "#n=";

const b64urlEncode = bytes => {
  let s = ""; for(const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
};
const b64urlDecode = str => {
  const s = atob(str.replace(/-/g,"+").replace(/_/g,"/"));
  const out = new Uint8Array(s.length);
  for(let i=0;i<s.length;i++) out[i] = s.charCodeAt(i);
  return out;
};

async function gzipBytes(str){
  if(typeof CompressionStream !== "function") return null;   // older browser
  const cs = new CompressionStream("gzip");
  const w = cs.writable.getWriter();
  w.write(new TextEncoder().encode(str)); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
async function gunzipBytes(bytes){
  if(typeof DecompressionStream !== "function") return null;
  const ds = new DecompressionStream("gzip");
  const w = ds.writable.getWriter();
  w.write(bytes); w.close();
  return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
}

/* Where a shared link should point.

   NOT necessarily where this page happens to be running. A preview frame, a
   published artifact and a downloaded file all have origins that mean nothing
   to anybody else — `about:srcdoc` most obviously — so a link built from
   location would be unopenable. The canonical site address is configuration, so
   use that when it exists and fall back to the current location only when it
   is a real http(s) page. */
function shareBase(){
  const cfg = (typeof SITE !== "undefined" && SITE.url) ? SITE.url.replace(/\/+$/,"") + "/" : "";
  if(cfg) return cfg;
  return /^https?:$/.test(location.protocol)
    ? location.origin + location.pathname
    : "";
}

/* The link for the network as it stands. */
async function shareLink(){
  const json = JSON.stringify(state);
  const gz = await gzipBytes(json);
  // "z" is gzipped, "r" is raw. Naming the encoding means a browser without
  // CompressionStream can still produce a link the others can read.
  const body = gz ? "z" + b64urlEncode(gz)
                  : "r" + b64urlEncode(new TextEncoder().encode(json));
  return shareBase() + SHARE_PREFIX + body;
}

/* Read a network out of the current URL, if there is one. Returns the state or
   null; never throws, because a mangled link is a thing that happens and should
   not be a blank page. */
async function stateFromHash(){
  const h = location.hash || "";
  if(!h.startsWith(SHARE_PREFIX)) return null;
  const body = h.slice(SHARE_PREFIX.length);
  if(!body) return null;
  try{
    const kind = body[0], bytes = b64urlDecode(body.slice(1));
    const json = kind === "z" ? await gunzipBytes(bytes)
                              : new TextDecoder().decode(bytes);
    if(!json) return null;
    const st = JSON.parse(json);
    return (st && st.routes && st.fleet) ? st : null;
  }catch(e){ console.warn("shared link unreadable", e); return null; }
}

async function doShare(){
  const url = await shareLink();
  const kb = (url.length/1024).toFixed(1);
  try{
    await navigator.clipboard.writeText(url);
    toast(`Link copied. ${kb} KB, with the whole airline in it`);
  }catch(e){
    // clipboard needs a permission this context may not have; show it instead
    prompt("Copy this link to share or keep your airline:", url);
  }
  // Put it in the address bar too, so a bookmark saves the network rather than
  // the site. Replace rather than push: this is the same document. A sandboxed
  // frame refuses this outright — an opaque origin cannot rewrite its own
  // history — and that is fine: the link is already copied.
  try{
    if(/^https?:$/.test(location.protocol) && url.startsWith(location.origin))
      history.replaceState(null, "", url.slice(location.origin.length));
  }catch(e){ /* sandboxed: nothing to do, and nothing wrong */ }
}
