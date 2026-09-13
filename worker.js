/* Cloudflare Worker for the planner.
 *
 * The site is still a static page whose compute all runs in the visitor's
 * browser. This Worker exists for one reason: to receive crash reports. Before
 * it, an error in a stranger's browser went to their console and nowhere else,
 * so "it works for me" was the only evidence available.
 *
 * Everything that is not a report falls through to the static assets, so adding
 * this changes nothing about how the page is served.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not store anything. Reports go to the log, which is what `wrangler
 * tail` reads and what Workers Logs retains. A database would mean deciding how
 * long to keep other people's browser details and answering for that decision;
 * a log line that ages out on its own is a smaller promise to have made.
 *
 * It does not accept anything interesting. The body is capped, the shape is
 * fixed, every field is truncated, and anything unrecognised is dropped rather
 * than logged. A public endpoint that writes arbitrary text into your logs is
 * somebody else's writable surface.
 */

const ERR_PATH = "/_err";
const MAX_BODY = 4096;          // a stack trace, not an essay
const MAX_FIELD = 800;

const str = (v, n) => (typeof v === "string" ? v.slice(0, n || MAX_FIELD) : null);
const num = v => (Number.isFinite(v) ? v : null);

/* Only from the site itself. Without this, anyone can post into your logs from
 * anywhere, and the first person to notice will be doing exactly that. */
function sameOrigin(request) {
  const self = new URL(request.url).origin;
  const origin = request.headers.get("Origin");
  if (origin) return origin === self;
  const referer = request.headers.get("Referer");
  if (referer) { try { return new URL(referer).origin === self; } catch { return false; } }
  return false;                 // sendBeacon always sends one of the two
}

export async function handleReport(request) {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (!sameOrigin(request)) return new Response(null, { status: 403 });

  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > MAX_BODY) return new Response(null, { status: 413 });

  let body;
  try {
    const text = (await request.text()).slice(0, MAX_BODY);
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 204 });   // malformed: drop it quietly
  }
  if (!body || typeof body !== "object") return new Response(null, { status: 204 });

  // Rebuilt field by field. Whatever else was in the payload does not reach
  // the log, which is the point.
  const report = {
    at:      new Date().toISOString(),
    message: str(body.message, MAX_FIELD),
    where:   str(body.where, 40),
    tab:     str(body.tab, 24),
    routes:  num(body.routes),
    ua:      str(body.ua, 200),
    country: request.headers.get("CF-IPCountry") || null,
    ray:     request.headers.get("CF-Ray") || null
  };
  if (!report.message) return new Response(null, { status: 204 });

  console.error("client-error", JSON.stringify(report));
  return new Response(null, { status: 204 });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === ERR_PATH) return handleReport(request);
    return env.ASSETS.fetch(request);
  }
};
