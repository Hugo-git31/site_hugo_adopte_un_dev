document.addEventListener("DOMContentLoaded", () => {
  const filterBtn = document.getElementById("filterBtn");
  const filterPanel = document.getElementById("filterPanel");
  const resultsContainer = document.getElementById("resultsContainer");
  const searchInput = document.getElementById("searchInput");
  const cityInput = document.getElementById("cityInput");
  const applyBtn = document.getElementById("applyFilters");

  filterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    filterPanel.classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    if (!filterPanel.contains(e.target) && e.target !== filterBtn) {
      filterPanel.classList.remove("show");
    }
  });

  async function loadFilters() {
    try {
      const res = await fetch("/api/candidate_filters");
      const data = await res.json();

      const skillsSection = filterPanel.querySelector(".filter-section:nth-child(2)");
      const degreesSection = filterPanel.querySelector(".filter-section:nth-child(3)");
      const languagesSection = filterPanel.querySelector(".filter-section:nth-child(4)");
      const experienceSelect = filterPanel.querySelector("select");

      skillsSection.innerHTML = `<h4>Compétences</h4>` + 
        data.skills.map(s => `<label><input type="checkbox" value="${s}"> ${s}</label>`).join("");

      degreesSection.innerHTML = `<h4>Diplômes</h4>` + 
        data.degrees.map(d => `<label><input type="checkbox" value="${d}"> ${d}</label>`).join("");

      languagesSection.innerHTML = `<h4>Langues</h4>` + 
        data.languages.map(l => `<label><input type="checkbox" value="${l}"> ${l}</label>`).join("");

      experienceSelect.innerHTML = `<option value="">Toutes</option>` + 
        data.experiences.map(e => `<option value="${e}">${e} ans</option>`).join("");

    } catch (err) {
      console.error("Erreur lors du chargement des filtres :", err);
    }
  }

  async function applyFilters() {
    const search = searchInput.value.trim();
    const city = cityInput.value.trim();

    const selectedSkills = Array.from(filterPanel.querySelectorAll(".filter-section:nth-child(2) input:checked"))
      .map(i => i.value);
    const selectedDegrees = Array.from(filterPanel.querySelectorAll(".filter-section:nth-child(3) input:checked"))
      .map(i => i.value);
    const selectedLanguages = Array.from(filterPanel.querySelectorAll(".filter-section:nth-child(4) input:checked"))
      .map(i => i.value);
    const experience = filterPanel.querySelector("select").value;

    const params = new URLSearchParams();
    if (search) params.append("q", search);
    if (city) params.append("city", city);
    if (selectedSkills.length) params.append("skills", selectedSkills.join(","));
    if (selectedDegrees.length) params.append("diplomas", selectedDegrees.join(","));
    if (selectedLanguages.length) params.append("languages", selectedLanguages.join(","));
    if (experience) params.append("experience_years", experience);

    try {
      const res = await fetch("/api/profiles?" + params.toString());
      const data = await res.json();
      resultsContainer.innerHTML = data.items.map(p => `
        <div class="candidate-card">
          <strong>${p.first_name} ${p.last_name}</strong>
          <p>${p.city}</p>
          <p>Compétences: ${p.skills || "-"}</p>
          <p>Diplômes: ${p.diplomas || "-"}</p>
          <p>Langues: ${p.languages || "-"}</p>
          <p>Expérience: ${p.experience_years || "-"}</p>
        </div>
      `).join("") || "<p>Aucun candidat trouvé</p>";
    } catch (err) {
      console.error("Erreur lors de la récupération des profils :", err);
      resultsContainer.innerHTML = "<p>Erreur lors de la récupération des candidats</p>";
    }
  }

  applyBtn.addEventListener("click", applyFilters);

  loadFilters();
});
