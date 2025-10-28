const searchBar = document.getElementById('main-search-bar');
const locationBar = document.getElementById('main-location-bar');
const filterBtn = document.getElementById('main-filter-btn');
const suggestionsBox = document.getElementById('search-suggestions');

const locationSuggestionsBox = document.createElement('div');
locationSuggestionsBox.style.position = 'absolute';
locationSuggestionsBox.style.left = locationBar.offsetLeft + 'px';
locationSuggestionsBox.style.top = (locationBar.offsetTop + locationBar.offsetHeight) + 'px';
locationSuggestionsBox.style.zIndex = '9999';
locationSuggestionsBox.style.background = '#fff';
locationSuggestionsBox.style.border = '1px solid rgba(0,0,0,0.08)';
locationSuggestionsBox.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)';
locationSuggestionsBox.style.display = 'none';
locationSuggestionsBox.style.maxHeight = '260px';
locationSuggestionsBox.style.overflowY = 'auto';
locationSuggestionsBox.style.borderRadius = '6px';
document.querySelector('.search-bar-container').appendChild(locationSuggestionsBox);

const profilesSection = document.getElementById('profilesSection');
let jobs = [];

fetch('json/candidates.json')
  .then(res => res.json())
  .then(data => {
    jobs = data;
    displayJobs(jobs);
  });

function displayJobs(list) {
    if (!list.length) {
        profilesSection.innerHTML = '<p>Aucune offre trouvée.</p>';
        return;
    }
    profilesSection.innerHTML = list.map(job => `
        <div class="carte">
            <div class="carte-image">
                <img src="${job.company_banner}" alt="${job.company}">
            </div>
            <div class="carte-contenu">
                <h3>${job.title}</h3>
                <p class="entreprise">${job.company} - ${job.location}</p>
                <div class="tags">
                    ${job.tags.split(',').map(tag => `<span>${tag}</span>`).join('')}
                </div>
                <button class="learn-more" data-title="${job.title}">En savoir plus</button>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.learn-more').forEach(btn => {
        btn.addEventListener('click', () => {
            const job = jobs.find(j => j.title === btn.dataset.title);
            if (!job) return;
            showJobPopup(job);
        });
    });
}

function showJobPopup(job) {
    let popup = document.getElementById('jobPopup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'jobPopup';
        popup.classList.add('popup');
        popup.innerHTML = `
            <div class="popup-content">
                <span class="close-popup">&times;</span>
                <img id="popupBanner" src="" alt="Bannière entreprise" style="width:100%; height:auto; display:block; margin-bottom:15px;">
                <h2 id="popupTitle"></h2>
                <p id="popupCompany"></p>
                <div id="popupTags" class="tags"></div>
                <a id="popupApply" href="#" class="apply-btn">Postuler</a>
            </div>
        `;
        document.body.appendChild(popup);

        popup.querySelector('.close-popup').addEventListener('click', () => {
            popup.style.display = 'none';
        });
    }

    popup.querySelector('#popupBanner').src = job.company_banner || '';
    popup.querySelector('#popupBanner').style.display = job.company_banner ? 'block' : 'none';
    popup.querySelector('#popupTitle').textContent = job.title;
    popup.querySelector('#popupCompany').textContent = `${job.company} - ${job.location}`;
    popup.querySelector('#popupTags').innerHTML = job.tags.split(',').map(tag => `<span>${tag}</span>`).join('');
    popup.querySelector('#popupApply').href = '#';
    popup.style.display = 'flex';
}

searchBar.addEventListener('input', () => {
    const query = searchBar.value.toLowerCase();
    if (!query) return suggestionsBox.style.display = 'none';
    const matches = jobs.filter(j => j.title.toLowerCase().includes(query));
    if (!matches.length) return suggestionsBox.style.display = 'none';
    suggestionsBox.innerHTML = matches.map(j => `<div class="suggestion-item" data-title="${j.title}">${j.title}</div>`).join('');
    suggestionsBox.style.display = 'block';
});

locationBar.addEventListener('input', () => {
    const query = locationBar.value.toLowerCase();
    if (!query) return locationSuggestionsBox.style.display = 'none';
    const matches = jobs.filter(j => j.location.toLowerCase().includes(query));
    if (!matches.length) return locationSuggestionsBox.style.display = 'none';
    const uniqueLocations = [...new Set(matches.map(j => j.location))];
    locationSuggestionsBox.innerHTML = uniqueLocations.map(loc => `<div class="location-item" data-location="${loc}">${loc}</div>`).join('');
    locationSuggestionsBox.style.display = 'block';
});

suggestionsBox.addEventListener('click', e => {
    if (!e.target.classList.contains('suggestion-item')) return;
    searchBar.value = e.target.dataset.title;
    suggestionsBox.style.display = 'none';
    const filtered = jobs.filter(j => j.title === e.target.dataset.title);
    displayJobs(filtered);
});

locationSuggestionsBox.addEventListener('click', e => {
    if (!e.target.classList.contains('location-item')) return;
    locationBar.value = e.target.dataset.location;
    locationSuggestionsBox.style.display = 'none';
    const filtered = jobs.filter(j => j.location === e.target.dataset.location);
    displayJobs(filtered);
});

filterBtn.addEventListener('click', () => {
    const titleQuery = searchBar.value.toLowerCase();
    const locQuery = locationBar.value.toLowerCase();
    const filtered = jobs.filter(j =>
        j.title.toLowerCase().includes(titleQuery) &&
        (!locQuery || j.location.toLowerCase().includes(locQuery))
    );
    displayJobs(filtered);
});

document.addEventListener('click', e => {
    if (!searchBar.contains(e.target) && !suggestionsBox.contains(e.target)) suggestionsBox.style.display = 'none';
    if (!locationBar.contains(e.target) && !locationSuggestionsBox.contains(e.target)) locationSuggestionsBox.style.display = 'none';
});
