// Pictures are served by authenticated views, so an <img src> cannot load them: they are fetched with the user's login and shown as blob URLs.
export const IMAGE_API = "/api/avatar_weather_card/image";

const cache = new Map();   // url (with its ?v=) -> Promise<blob URL>
export function blobUrl(hass, url) {
  let p = cache.get(url);
  if (!p) {
    p = hass.fetchWithAuth(url).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); }).then((b) => URL.createObjectURL(b));
    p.catch(() => cache.delete(url));
    cache.set(url, p);
    if (cache.size > 1500) { const [k, old] = cache.entries().next().value; cache.delete(k); old.then((u) => setTimeout(() => URL.revokeObjectURL(u), 60000), () => {}); }
  }
  return p;
}

// Every <img data-asrc="..."> inside `root` gets its picture when it comes near the screen (the picture grid has hundreds).
export function hydrate(root, getHass) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const im = e.target, url = im.dataset.asrc;
      io.unobserve(im);
      if (!url || im.dataset.aloaded === url) continue;
      blobUrl(getHass(), url).then((u) => { if (im.dataset.asrc === url) { im.src = u; im.dataset.aloaded = url; } }, () => {});
    }
  }, { rootMargin: "400px" });
  const watch = (im) => { if (im.dataset.aloaded !== im.dataset.asrc) io.observe(im); };
  const scan = (n) => { if (n.nodeType !== 1) return; if (n.matches("img[data-asrc]")) watch(n); n.querySelectorAll("img[data-asrc]").forEach(watch); };
  new MutationObserver((ms) => { for (const m of ms) { if (m.type === "attributes") watch(m.target); else m.addedNodes.forEach(scan); } })
    .observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-asrc"] });
  root.querySelectorAll("img[data-asrc]").forEach(watch);
}
