/* Italiano in Viaggio: puente con Google Drive.
   Sustituye el almacenamiento de Claude por un archivo en el Drive del usuario: Italiano/italiano-datos.json
   Comparte la sesión de Google con Wanderlust y FOG (misma dirección web). */
(() => {
  "use strict";
  const CLIENT_ID = "1001663742263-c8898sk2hg3pnrd967un6ed4sednge6a.apps.googleusercontent.com";
  const SCOPE = "https://www.googleapis.com/auth/drive.file";
  const HINT = "perezdelemalaura@gmail.com";
  const API = "https://www.googleapis.com/drive/v3";
  const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
  const FOLDER = "Italiano", DATA_NAME = "italiano-datos.json";
  const LS = { get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }, set(k,v){ try { localStorage.setItem(k,v); } catch(e){} }, del(k){ try { localStorage.removeItem(k); } catch(e){} } };
  /* token keys shared with Wanderlust so one sign-in serves both apps */
  const K_TOK = "wl2.tok", K_OK = "wl2.consented", K_FOLDER = "it.folder", K_DATA = "it.data";

  let token = null, tokenExp = 0, tokenClient = null, pendingAuth = [];
  let folderId = LS.get(K_FOLDER), dataId = LS.get(K_DATA);
  let state = {}, version = null, ready = false;
  const docListeners = [];
  let queue = Promise.resolve();

  const saved = (() => { try { return JSON.parse(LS.get(K_TOK) || "null"); } catch(e){ return null; } })();
  if (saved && saved.exp > Date.now() + 60000){ token = saved.t; tokenExp = saved.exp; }
  const tokenOk = () => token && tokenExp > Date.now() + 30000;

  function loadGis(){
    return new Promise((res, rej) => {
      if (window.google && google.accounts && google.accounts.oauth2) return res();
      const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(new Error("gis")); document.head.append(s);
    });
  }
  async function initClient(){
    await loadGis();
    if (tokenClient) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPE, login_hint: HINT,
      callback: r => {
        if (r && r.access_token){
          token = r.access_token; tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
          LS.set(K_TOK, JSON.stringify({ t: token, exp: tokenExp }));
          hideBanner(); const p = pendingAuth; pendingAuth = []; p.forEach(f => f.res());
        } else { const p = pendingAuth; pendingAuth = []; p.forEach(f => f.rej(new Error("auth"))); }
      },
      error_callback: e => { const p = pendingAuth; pendingAuth = []; p.forEach(f => f.rej(new Error((e && e.type) || "auth"))); }
    });
  }
  function signIn(){
    return new Promise(async (res, rej) => {
      try { await initClient(); } catch(e){ return rej(e); }
      pendingAuth.push({ res, rej });
      tokenClient.requestAccessToken({ prompt: LS.get(K_OK) ? "" : "select_account consent" });
    }).then(() => LS.set(K_OK, "1"));
  }
  function waitForToken(){
    if (tokenOk()) return Promise.resolve();
    showBanner();
    return new Promise((res, rej) => pendingAuth.push({ res, rej }));
  }

  async function api(url, opts = {}, retry = true){
    await waitForToken();
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + token } });
    if (r.status === 401 && retry){ token = null; LS.del(K_TOK); return api(url, opts, false); }
    if (!r.ok){
      const e = new Error("drive " + r.status); e.status = r.status;
      try { const b = await r.json(); e.reason = b.error && b.error.errors && b.error.errors[0] && b.error.errors[0].reason; } catch(_){}
      throw e;
    }
    return r;
  }
  const j = r => r.json(), q = s => encodeURIComponent(s);
  async function findOne(query){
    const r = await api(`${API}/files?q=${q(query + " and trashed=false")}&fields=files(id,name)&spaces=drive&pageSize=10`).then(j);
    return r.files && r.files[0] || null;
  }
  async function stillThere(id){
    if (!id) return false;
    try { const r = await api(`${API}/files/${id}?fields=id,trashed`).then(j); return !r.trashed; } catch(e){ return false; }
  }
  async function multipart(meta, blob){
    const fd = new FormData();
    fd.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
    fd.append("file", blob);
    return api(`${UPLOAD}/files?uploadType=multipart&fields=id,version`, { method: "POST", body: fd }).then(j);
  }
  async function ensureLayout(){
    if (!(await stillThere(folderId))){
      const f = await findOne(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents`);
      folderId = f ? f.id : (await api(`${API}/files?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: FOLDER, mimeType: "application/vnd.google-apps.folder" }) }).then(j)).id;
      LS.set(K_FOLDER, folderId); dataId = null;
    }
    if (!(await stillThere(dataId))){
      const f = await findOne(`name='${DATA_NAME}' and '${folderId}' in parents`);
      dataId = f ? f.id : (await multipart({ name: DATA_NAME, mimeType: "application/json", parents: [folderId] },
        new Blob([JSON.stringify({ app: "Italiano", data: {} })], { type: "application/json" }))).id;
      LS.set(K_DATA, dataId);
    }
  }
  async function remoteVersion(){ return (await api(`${API}/files/${dataId}?fields=version`).then(j)).version; }
  async function readRemote(){
    const v = await remoteVersion();
    const txt = await api(`${API}/files/${dataId}?alt=media`).then(r => r.text());
    let d = {}; try { d = JSON.parse(txt || "{}"); } catch(e){}
    state = d.data || {}; version = v;
  }
  async function writeRemote(){
    const blob = new Blob([JSON.stringify({ app: "Italiano", saved: new Date().toISOString(), data: state })], { type: "application/json" });
    version = (await api(`${UPLOAD}/files/${dataId}?uploadType=media&fields=id,version`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: blob }).then(j)).version;
  }
  function mutate(fn){
    const run = queue.then(async () => {
      const v = await remoteVersion();
      if (v !== version) await readRemote();
      fn(state); await writeRemote(); emit();
    });
    queue = run.catch(() => {});
    return run;
  }
  const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  const split = path => { const i = path.indexOf("/"); return [path.slice(0, i), path.slice(i + 1)]; };
  const docSnap = path => { const [c, id] = split(path); const v = state[c] && state[c][id]; return { id, exists: v !== undefined, data: () => clone(v) }; };
  function emit(){ docListeners.forEach(l => { try { l.cb(docSnap(l.path)); } catch(e){ console.error(e); } }); }
  async function poll(){
    if (!ready || document.hidden || !tokenOk()) return;
    try { const v = await remoteVersion(); if (v !== version){ await queue; await readRemote(); emit(); } } catch(e){}
  }
  setInterval(poll, 45000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });

  const db = {
    doc(path){
      const [col, id] = split(path);
      return {
        set: data => mutate(s => { (s[col] = s[col] || {})[id] = clone(data); }),
        update: patch => mutate(s => { s[col] = s[col] || {}; s[col][id] = Object.assign(s[col][id] || {}, clone(patch)); }),
        delete: () => mutate(s => { if (s[col]) delete s[col][id]; }),
        get: async () => docSnap(path),
        onSnapshot(cb, err){ const l = { path, cb, err }; docListeners.push(l); if (ready) cb(docSnap(path)); return () => { const i = docListeners.indexOf(l); if (i >= 0) docListeners.splice(i, 1); }; }
      };
    }
  };

  /* ---------- sign-in screen + expiry banner (FOG palette) ---------- */
  const css = document.createElement("style");
  css.textContent = `
  .foggate{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:var(--soft,#f5f8f9);padding:24px}
  .foggate .box{background:var(--card,#F7F9F8);color:var(--ink,#1C2A2E);border:1px solid var(--line,#CDD5D2);border-radius:16px;padding:28px 26px;max-width:380px;width:100%;display:grid;gap:14px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.08)}
  .foggate h2{font-family:var(--display);font-weight:700;font-size:30px;letter-spacing:-.02em;margin:0}
  .foggate p{margin:0;color:var(--muted,#5B6B6F);font-size:14px}
  .fogbtn{border:0;border-radius:999px;background:var(--mag,#0080c0);color:#fff;font-weight:700;padding:12px 20px;font-size:15px;cursor:pointer;font-family:inherit}
  .fogbanner{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:70;display:flex;gap:10px;align-items:center;background:var(--card,#fff);color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:8px 8px 8px 16px;box-shadow:0 6px 24px rgba(0,0,0,.14);font-size:13.5px;max-width:calc(100% - 32px)}
  .fogbanner .fogbtn{padding:8px 14px;font-size:13px}`;
  document.head.append(css);
  let gate = null, banner = null;
  function showGate(msg){
    if (gate) return;
    gate = document.createElement("div"); gate.className = "foggate";
    gate.innerHTML = `<div class="box"><h2>Italiano in Viaggio</h2>
      <p>${msg || "Tu progreso se guarda en tu Google Drive. Entra con tu cuenta de Google para verlo."}</p>
      <button class="fogbtn" type="button" id="fogin">Entrar con Google</button><p style="font-size:12px" id="fogerr"></p></div>`;
    document.body.append(gate);
    gate.querySelector("#fogin").onclick = () => signIn().then(start).catch(() => {
      gate.querySelector("#fogerr").textContent = "No se ha podido entrar. Si se ha bloqueado la ventana de Google, permite las ventanas emergentes e inténtalo otra vez.";
    });
  }
  function showBanner(){
    if (!ready){ showGate(); return; }
    if (banner) return;
    banner = document.createElement("div"); banner.className = "fogbanner";
    banner.innerHTML = `<span>La sesión con Google ha caducado</span><button class="fogbtn" type="button">Continuar</button>`;
    banner.querySelector("button").onclick = () => signIn().catch(() => {});
    document.body.append(banner);
  }
  function hideBanner(){ if (banner){ banner.remove(); banner = null; } }

  let started = null, resolveReady;
  const readyP = new Promise(r => resolveReady = r);
  function start(){
    if (started) return started;
    started = (async () => {
      if (gate) gate.querySelector(".box").innerHTML = `<p>Abriendo tu Drive…</p>`;
      await ensureLayout(); await readRemote();
      ready = true; if (gate){ gate.remove(); gate = null; }
      resolveReady(); emit();
    })().catch(e => { started = null; console.error(e); if (gate){ gate.remove(); gate = null; }
      showGate(e && e.reason === "storageQuotaExceeded"
        ? "Tu Google Drive está lleno. Libera espacio en one.google.com/storage para poder guardar."
        : "No se ha podido abrir tu Drive. Vuelve a entrar con Google."); });
    return started;
  }
  if (tokenOk()) start(); else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => showGate()); else showGate();
  initClient().catch(() => {});

  window.claude = {
    use(name){
      if (name === "db") return readyP.then(() => db);
      if (name === "user") return Promise.resolve({ id: async () => "me", can: () => true });
      if (name === "sample") return Promise.resolve(null);   /* AI translation only works inside Claude */
      return Promise.reject(Object.assign(new Error("unavailable"), { code: "unavailable" }));
    }
  };
})();
