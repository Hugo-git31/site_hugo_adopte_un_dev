const API_BASE = "http://127.0.0.1:8000";
const grid = document.querySelector(".offres");
const companiesGrid = document.querySelector(".entreprises");
const pagination = document.querySelector(".jobs-pagination");
const PAGE_SIZE = 9;
let currentPage = 1;
let totalPages = 1;
let currentQuery = "";

function esc(s = "") {
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
}

function jobToCard(j) {
    return `
    <div class="carte">
        <div class="carte-image">
            <img src="${j.company_banner_url || "../assets/company_logo_default.png"}" alt="Offre ${esc(j.id)}"> 
        </div>
        <div class="carte-contenu">
            <h3>${esc(j.title)}</h3>
            <p class="entreprise">${esc(j.company_name || "")}</p>
            <p class="description">${esc(j.short_desc || "")}</p>
            <div class="tags">
                <span>${esc(j.contract_type || "—")}</span>
                <span>${esc(j.location || "—")}</span>
                <span>${esc(j.work_mode || "—")}</span>
            </div>
            <a class="learn-more" href="#popup" data-id="${j.id}">En savoir plus</a>
        </div>
    </div>`; 
}

function renderPagination() {
    if (!pagination) return;
    if (totalPages <= 1) {
        pagination.innerHTML = "";
        pagination.style.display = "none";
        return;
    }
    pagination.style.display = "flex";
    pagination.innerHTML = `
        <button class="page-btn" data-action="prev" ${currentPage === 1 ? "disabled" : ""}>Précédent</button>
        <span class="page-info">Page ${currentPage} / ${totalPages}</span>
        <button class="page-btn" data-action="next" ${currentPage === totalPages ? "disabled" : ""}>Suivant</button>
    `;
}

async function loadJobs(page = 1, pageSize = PAGE_SIZE, q = "") {
    const qs = new URLSearchParams({page, page_size: pageSize, q});
    const res = await fetch(`${API_BASE}/api/jobs?${qs}`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    if (!data.items.length && page > 1 && !data.total) {
        totalPages = Math.max(1, page - 1);
        renderPagination();
        return loadJobs(page - 1, pageSize, q);
    }
    currentPage = page;
    currentQuery = q;
    totalPages = data.total ? Math.max(1, Math.ceil(data.total / pageSize)) : (data.items.length < pageSize ? page : page + 1);
    grid.innerHTML = data.items.map(jobToCard).join("") || "<p>Aucune offre</p>";
    renderPagination();
}

if (pagination) {
    pagination.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;

        if (btn.dataset.action === "prev" && currentPage > 1) {
            loadJobs(currentPage - 1, PAGE_SIZE, currentQuery).catch(handleLoadError);
        } else if (btn.dataset.action === "next" && currentPage < totalPages) {
            loadJobs(currentPage + 1, PAGE_SIZE, currentQuery).catch(handleLoadError);
        }
    });
}

function handleLoadError(err) {
    grid.innerHTML = `<p style="color:red">Erreur chargement: ${esc(err.message)}</p>`;
    if (pagination) pagination.innerHTML = "";
}

loadJobs().catch(handleLoadError);

// Pop-ups

const popupEl = document.getElementById("popup");
const pTitle = document.getElementById("popupTitle");
const pCompany = document.getElementById("popupCompany");
const pTags = document.getElementById("popupTags");
const pShort = document.getElementById("popupShort");
const pFull = document.getElementById("popupFull");
const pBanner = document.getElementById("popupBanner");
const pApply = document.getElementById("popupApply");

function nl2p(text="") {
    const safe = esc(text);
    return safe.split(/\n+/).map(t => `<p>${t}</p>`).join("");
}

async function openJobPopup(jobId) {
    try {
        const res = await fetch(`${API_BASE}/api/jobs/${jobId}`);
        if(!res.ok) throw new Error(await res.text());
        const j = await res.json();

        pTitle.textContent = j.title || "";
        pCompany.textContent = j.company_name || "";
        pTags.innerHTML = [j.contract_type || "—", j.location || "—", j.work_mode || "—"].map(t => `<span>${esc(t)}</span>`).join("");
        pShort.textContent = j.short_desc || "";
        pFull.innerHTML = j.full_desc ? nl2p(j.full_desc) : "<p>(pas de description détaillée)</p>";

        if (j.company_banner_url) {
            pBanner.src = j.company_banner_url;
            pBanner.alt = j.company_name ? `Bannière ${j.company_name}` : "Bannière";
            pBanner.style.display = "";
        } else {
            pBanner.style.display = "none";
            pBanner.removeAttribute("src");
        }

        if (!popupEl) {
            console.warn("Popup introuvable, rien à afficher");
            return;
        }

        if (pApply) pApply.href = `postuler.html?job_id=${encodeURIComponent(j.id)}`;

        if (
            popupEl.style.display === "none" ||
            (!popupEl.style.display && getComputedStyle(popupEl).display === "none")
        ) {
            popupEl.style.display = "flex";
        }

        location.hash = "popup";
    } catch (err) {
        console.error("Impossible de charger l'offre :", err);
    }
}

document.addEventListener("click", (e) => {
    const a = e.target.closest(".learn-more");
    if (!a) return;

    const id = a.dataset.id;

    location.hash = "popup";

    const popupEl = document.getElementById("popup");
    if (popupEl && getComputedStyle(popupEl).display === "none") {
        popupEl.style.display = "flex";
    }
    openJobPopup(id);
});

window.addEventListener("hashchange", () => {
    if (location.hash !== "#popup" && popupEl) {
        if (popupEl.style.display === "block") popupEl.style.display = "";
    }
});
