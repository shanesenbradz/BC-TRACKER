/* Wallpaper: a photo drawn behind the app, one per profile.
   Ported from APStudy's photo pipeline:
   - Opens almost any picture, including HEIC from iPhones (a converter
     loads from the internet only when a HEIC file is picked and the
     WebView cannot open it on its own).
   - Shrinks the photo on the device (longest side 1920 px) so it stays
     light, and saves it as a Blob in IndexedDB rather than in
     localStorage, so start-up never stalls on a big string.
   - Blur is baked into a small copy once you stop dragging the slider,
     instead of blurring the full layer every frame. */

const Wallpaper = (function () {
  const DEFAULTS = { op: 35, blur: 0, fit: "cover", frost: true };
  const PHOTO_EXT = /\.(jpe?g|jfif|png|gif|webp|avif|heic|heif|hif|bmp)$/i;

  let userId = null;
  let blob = null;       // saved, already shrunk photo
  let sharpUrl = null;   // blob: URL of the sharp photo
  let shownUrl = null;   // blob: URL currently drawn
  let opts = Object.assign({}, DEFAULTS);
  let bakedBlur = -1, bakeTimer = 0, bakeSeq = 0, busy = false;

  /* Tiny IndexedDB key-value store, with localStorage as the fallback */
  const idb = (function () {
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        try {
          const rq = indexedDB.open("bct-db", 1);
          rq.onupgradeneeded = () => rq.result.createObjectStore("kv");
          rq.onsuccess = () => res(rq.result);
          rq.onerror = () => rej(rq.error);
        } catch (e) { rej(e); }
      });
      dbp.catch(() => { dbp = null; });
      return dbp;
    }
    function run(mode, fn) {
      return open().then(db => new Promise((res, rej) => {
        const tx = db.transaction("kv", mode), rq = fn(tx.objectStore("kv"));
        tx.oncomplete = () => res(rq && rq.result);
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error);
      }));
    }
    return {
      get: k => run("readonly", s => s.get(k)),
      set: (k, v) => run("readwrite", s => s.put(v, k)),
      del: k => run("readwrite", s => s.delete(k))
    };
  })();

  const el = () => document.getElementById("bg-photo");
  const key = () => "wall_" + userId;

  function setShown(url) {
    if (shownUrl && shownUrl !== url && shownUrl !== sharpUrl) URL.revokeObjectURL(shownUrl);
    shownUrl = url;
    const e = el();
    if (e) e.style.backgroundImage = url ? 'url("' + url + '")' : "";
  }

  function useBlob(b) {
    if (sharpUrl) URL.revokeObjectURL(sharpUrl);
    if (shownUrl && shownUrl !== sharpUrl) URL.revokeObjectURL(shownUrl);
    shownUrl = null;
    blob = b;
    sharpUrl = b ? URL.createObjectURL(b) : null;
    bakedBlur = -1;
  }

  function liveBlur(px) {
    const s = document.documentElement.style;
    s.setProperty("--photo-blur", px + "px");
    s.setProperty("--photo-scale", String(px ? 1 + px * 0.012 : 1));
  }

  function apply(newImage) {
    const r = document.documentElement;
    if (opts.frost) r.setAttribute("data-frost", ""); else r.removeAttribute("data-frost");
    if (!sharpUrl) { r.removeAttribute("data-photo"); setShown(null); renderControls(); return; }
    if (newImage || !shownUrl) { setShown(sharpUrl); bakedBlur = 0; }
    r.style.setProperty("--photo-op", String(opts.op / 100));
    const e = el();
    if (e) e.setAttribute("data-fit", opts.fit === "contain" ? "contain" : "cover");
    r.setAttribute("data-photo", "");
    const want = opts.blur || 0;
    if (want === bakedBlur) liveBlur(0);
    else {
      liveBlur(want);
      clearTimeout(bakeTimer);
      bakeTimer = setTimeout(bakeBlur, 280);
    }
    renderControls();
  }

  const canvasBlurOk = (function () {
    try { const x = document.createElement("canvas").getContext("2d"); x.filter = "blur(2px)"; return x.filter === "blur(2px)"; } catch (e) { return false; }
  })();

  function bakeBlur() {
    const want = opts.blur || 0, seq = ++bakeSeq;
    if (!blob) return;
    if (!want) { setShown(sharpUrl); bakedBlur = 0; liveBlur(0); return; }
    if (!canvasBlurOk) return;
    decodeImage(blob).then(src => {
      if (seq !== bakeSeq) { src.done(); return; }
      const k = Math.min(1, 1024 / Math.max(src.w, src.h));
      const w = Math.max(1, Math.round(src.w * k)), h = Math.max(1, Math.round(src.h * k));
      const screenLong = Math.max(window.innerWidth, window.innerHeight) || 900;
      const px = Math.max(0.5, want * Math.max(w, h) / screenLong);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const x = c.getContext("2d");
      const m = Math.ceil(px * 2.5);
      x.filter = "blur(" + px.toFixed(2) + "px)";
      x.drawImage(src.img, -m, -m, w + m * 2, h + m * 2);
      src.done();
      c.toBlob(b => {
        if (!b || seq !== bakeSeq) return;
        setShown(URL.createObjectURL(b));
        bakedBlur = want;
        liveBlur(0);
      }, "image/jpeg", 0.85);
    }).catch(() => {});
  }

  function decodeImage(b) {
    const viaImg = () => new Promise((res, rej) => {
      const u = URL.createObjectURL(b), img = new Image();
      img.onload = () => res({ img: img, w: img.naturalWidth || 1600, h: img.naturalHeight || 1600, done: () => URL.revokeObjectURL(u) });
      img.onerror = () => { URL.revokeObjectURL(u); rej(new Error("decode")); };
      img.src = u;
    });
    if (window.createImageBitmap) {
      return createImageBitmap(b, { imageOrientation: "from-image" })
        .catch(() => createImageBitmap(b))
        .then(bm => ({ img: bm, w: bm.width, h: bm.height, done: () => { try { bm.close(); } catch (e) {} } }))
        .catch(viaImg);
    }
    return viaImg();
  }

  function sniffHeic(b) {
    return b.slice(0, 16).arrayBuffer().then(buf => {
      const s = String.fromCharCode.apply(null, new Uint8Array(buf));
      return s.slice(4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(s.slice(8, 12));
    }).catch(() => false);
  }

  let heicLoader = null;
  function heicToJpeg(b) {
    if (!heicLoader) heicLoader = new Promise((res, rej) => {
      if (window.heic2any) { res(window.heic2any); return; }
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
      s.async = true;
      s.onload = () => window.heic2any ? res(window.heic2any) : rej(new Error("missing"));
      s.onerror = () => { heicLoader = null; s.remove(); rej(new Error("offline")); };
      document.head.appendChild(s);
    });
    return heicLoader.then(conv => conv({ blob: b, toType: "image/jpeg", quality: 0.9 }))
      .then(out => Array.isArray(out) ? out[0] : out);
  }

  /* Longest side 1920 px. WebP where the browser can make it, JPEG otherwise. */
  function shrink(b) {
    return decodeImage(b).then(src => new Promise((res, rej) => {
      const encode = (max, q, type) => new Promise(done => {
        const k = Math.min(1, max / Math.max(src.w, src.h));
        const w = Math.max(1, Math.round(src.w * k)), h = Math.max(1, Math.round(src.h * k));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const x = c.getContext("2d");
        x.fillStyle = "#000000";
        x.fillRect(0, 0, w, h);
        x.imageSmoothingQuality = "high";
        x.drawImage(src.img, 0, 0, w, h);
        c.toBlob(out => done(out), type, q);
      });
      const tries = [[1920, 0.82], [1440, 0.74], [1080, 0.68]];
      const go = (i, type) => encode(tries[i][0], tries[i][1], type).then(out => {
        if (!out) { if (type !== "image/jpeg") return go(i, "image/jpeg"); throw new Error("encode"); }
        if (type === "image/webp" && out.type !== "image/webp") return go(i, "image/jpeg");
        if (out.size > 1100000 && i < tries.length - 1) return go(i + 1, type);
        return out;
      });
      go(0, "image/webp").then(out => { src.done(); res(out); }, e => { src.done(); rej(e); });
    }));
  }

  function pick(file, onSaved) {
    if (busy || !userId || !file) return;
    const name = file.name || "";
    const typeOk = !file.type || /^image\//i.test(file.type) || /octet-stream|heic|heif/i.test(file.type);
    if (!typeOk && !PHOTO_EXT.test(name)) { Motion.toast("That file is not a picture."); Motion.haptic("reject"); return; }
    busy = true;
    Motion.toast("Preparing your wallpaper…");
    const forUser = userId;
    const nameHeic = /\.(heic|heif|hif)$/i.test(name) || /hei[cf]/i.test(file.type || "");
    file.arrayBuffer().then(buf => {
      if (!buf || !buf.byteLength) throw new Error("empty");
      const b = new Blob([buf], { type: file.type || "" });
      return Promise.resolve(nameHeic || sniffHeic(b)).then(isHeic =>
        shrink(b).catch(err => {
          if (!isHeic) throw err;
          Motion.toast("Converting HEIC photo…");
          return heicToJpeg(b).then(shrink, () => { throw new Error("heic"); });
        }));
    }).then(out => {
      if (forUser !== userId) return null;
      useBlob(out);
      apply(true);
      Motion.haptic("confirm");
      return idb.set("wall_" + forUser, out).then(() => true, () => false);
    }).then(saved => {
      if (saved === null) return;
      Motion.toast(saved ? "Wallpaper set" : "Wallpaper set for now, but this browser could not save it.");
      if (onSaved) onSaved();
    }).catch(e => {
      Motion.haptic("reject");
      Motion.toast(e && e.message === "heic"
        ? "Could not convert that HEIC photo. Connect to the internet once and try again, or pick a JPG or PNG."
        : "Could not open that picture. Try a JPG, PNG or WebP.", 3600);
    }).then(() => { busy = false; });
  }

  function remove() {
    if (!userId) return;
    useBlob(null);
    idb.del(key()).catch(() => {});
    apply();
    Motion.toast("Wallpaper removed");
  }

  /* Called on log in. Settings live with the profile data; the photo
     itself lives in IndexedDB, keyed by profile. */
  function load(uid, settings) {
    userId = uid;
    opts = Object.assign({}, DEFAULTS, settings || {});
    useBlob(null);
    apply();
    idb.get("wall_" + uid).then(b => {
      if (uid !== userId || !b || !(b instanceof Blob) || !b.size) return;
      useBlob(b);
      apply(true);
    }).catch(() => {});
  }

  function unload() {
    userId = null;
    useBlob(null);
    opts = Object.assign({}, DEFAULTS);
    apply();
  }

  function setOpts(patch) {
    opts = Object.assign({}, opts, patch);
    apply();
    return Object.assign({}, opts);
  }

  function renderControls() {
    const thumb = document.getElementById("wall-thumb");
    if (!thumb) return;
    const has = !!sharpUrl;
    const was = thumb.classList.contains("has-photo");
    thumb.style.backgroundImage = has ? 'url("' + sharpUrl + '")' : "";
    thumb.classList.toggle("has-photo", has);
    if (has && !was) Motion.replay(thumb, "has-photo");
    document.getElementById("btn-wall-remove").classList.toggle("hidden", !has);
    document.getElementById("btn-wall-pick").textContent = has ? "Change photo" : "Choose photo";
    document.getElementById("wall-controls").classList.toggle("hidden", !has);
    document.getElementById("wall-op").value = opts.op;
    document.getElementById("wall-op-val").textContent = opts.op + "%";
    document.getElementById("wall-blur").value = opts.blur;
    document.getElementById("wall-blur-val").textContent = opts.blur ? opts.blur + " px" : "Off";
    document.querySelectorAll("#wall-fit .seg-btn").forEach(b => b.classList.toggle("active", b.dataset.value === opts.fit));
    document.getElementById("wall-frost").setAttribute("aria-checked", opts.frost ? "true" : "false");
  }

  return { load, unload, pick, remove, setOpts, renderControls, hasPhoto: () => !!sharpUrl, DEFAULTS };
})();
