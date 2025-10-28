// company_profile.js — espace recruteur (fiche société + upload bannière)
const API = "http://127.0.0.1:8000";
const TOKEN_KEY = "jb_token";
const token = () => localStorage.getItem(TOKEN_KEY);
const authHeader = () => (token() ? { Authorization: `Bearer ${token()}` } : {});
const $ = (id) => document.getElementById(id);

function toRelativeUpload(u) {
  if (!u) return "";
  try { const abs = new URL(u, API); return abs.pathname; } catch { return u; }
}
function fullUrl(u) { if (!u) return ""; if (/^https?:\/\//i.test(u)) return u; return `${API}${u}`; }

function setMsg(t, ok=false){ const m=$("msg"); if(!m) return; m.textContent=t||""; m.style.color=ok?"#0bb07b":"#b00020"; }
function setGuard(t){ const g=$("guard"); if(g) g.textContent=t||""; }
function setStatus(logged){
  const p=$("statusPill"); if(!p) return;
  p.textContent = logged ? "Connecté" : "Non connecté";
  p.style.background = logged ? "#e6fbf1" : "#fff1f1";
  p.style.color = logged ? "#127c52" : "#a73636";
  p.style.border = "1px solid " + (logged ? "#c7f4e1" : "#ffdada");
}

async function api(path, {method="GET", body=null, headers={}} = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : null
  });
  let data={}; try{ data=await res.json() }catch{}
  if(!res.ok) throw data;
  return data;
}

function previewBanner(url) {
  const img = $("bannerPreview");
  const empty = $("bannerEmpty");
  const rel = toRelativeUpload(url);
  if (rel) { img.src = fullUrl(rel); img.style.display = "block"; empty.style.display = "none"; }
  else { img.style.display = "none"; empty.style.display = "flex"; }
}

function fill(c) {
  $("co_name").value = c.name || "";
  $("co_city").value = c.hq_city || "";
  $("co_sector").value = c.sector || "";
  $("co_desc").value = c.description || "";
  $("co_web").value = c.website || "";
  $("co_headcount").value = c.headcount || "";
  $("co_banner").value = c.banner_url || "";
  previewBanner(c.banner_url || "");
  $("btnSave").dataset.id = c.id;
}

async function loadOrCreate() {
  if(!token()){ setGuard("Non connecté — connecte-toi d’abord."); setStatus(false); return; }
  setStatus(true);
  try {
    const list = await api("/api/companies?page=1&page_size=1", { headers: authHeader() });
    const company = (list.items || [])[0] || null;
    if (company) fill(company);
    else setGuard("Aucune entreprise. Renseigne le nom et clique Enregistrer pour créer.");
  } catch(e) { setMsg(e?.detail || "Erreur au chargement", false); }
}

function readPayload() {
  return {
    name: $("co_name").value.trim(),
    hq_city: $("co_city").value.trim() || null,
    sector: $("co_sector").value.trim() || null,
    description: $("co_desc").value.trim() || null,
    website: $("co_web").value.trim() || null,
    headcount: $("co_headcount").value ? $("co_headcount").value.trim() : null,
    banner_url: $("co_banner").value.trim() || null,
  };
}

async function save() {
  const payload = readPayload();
  if (!payload.name) return setMsg("Le nom est requis.", false);

  try {
    const id = $("btnSave").dataset.id;
    if (id) {
      const updated = await api(`/api/companies/${id}`, { method:"PUT", headers:authHeader(), body:payload });
      fill(updated);
      setMsg("Entreprise mise à jour ✅", true);
      setTimeout(() => {window.location.href = "index_entreprises.html";}, 1200);
    } else {
      const created = await api("/api/companies", { method:"POST", headers:authHeader(), body:{ name: payload.name, website: payload.website, banner_url: payload.banner_url }});
      $("btnSave").dataset.id = created.id;
      setMsg("Entreprise créée ✅ (tu peux compléter les autres champs)", true);
    }
  } catch(e){ setMsg(e?.detail || "Erreur", false); }
}

async function uploadBanner() {
  const f = $("file").files[0];
  if(!f) return alert("Choisis une image.");
  const fd = new FormData(); fd.append("file", f);
  try {
    const res = await fetch(`${API}/upload/image`, { method:"POST", headers:authHeader(), body:fd });
    const data = await res.json();
    if (!res.ok) throw data;

    const rel = toRelativeUpload(data.url || data.path || data.location || "");
    $("co_banner").value = rel;
    previewBanner(rel);
    setMsg("Bannière envoyée ✅", true);

    const id = $("btnSave").dataset.id;
    if (id && rel) {
      await api(`/api/companies/${id}`, { method: "PUT", headers: authHeader(), body: { banner_url: rel } });
      setMsg("Bannière enregistrée ✅", true);
    }
  } catch(e){ setMsg(e?.detail || "Upload échoué", false); }
}

function wireShortcuts() {
  const id = $("btnSave").dataset.id;
  $("#goJobs").onclick = () => location.href = "index_entreprises.html";
  $("#goList").onclick = () => location.href = "index_entreprises.html";
  $("#goProfile").onclick = () => {
    if (!id) return setMsg("Crée d’abord l’entreprise.", false);
    alert("Page publique non encore implémentée.");
  };
}

document.addEventListener("DOMContentLoaded", async () => {
  $("btnSave").onclick = save;
  $("btnSaveTop").onclick = save;
  $("btnUpload").onclick = uploadBanner;
  $("co_banner").addEventListener("input", (e)=> previewBanner(e.target.value.trim()));
  await loadOrCreate();
  wireShortcuts();
});
