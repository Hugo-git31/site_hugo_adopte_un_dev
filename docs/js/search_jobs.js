const searchBar = document.getElementById('main-search-bar')
const locationBar = document.getElementById('main-location-bar')
const filterBtn = document.getElementById('main-filter-btn')
const suggestionsBox = document.getElementById('search-suggestions')
const locationSuggestionsBox = document.createElement('div')
locationSuggestionsBox.style.position = 'absolute'
locationSuggestionsBox.style.left = '220px'
locationSuggestionsBox.style.top = '44px'
locationSuggestionsBox.style.zIndex = '9999'
locationSuggestionsBox.style.background = '#fff'
locationSuggestionsBox.style.border = '1px solid rgba(0,0,0,0.08)'
locationSuggestionsBox.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)'
locationSuggestionsBox.style.display = 'none'
locationSuggestionsBox.style.maxHeight = '260px'
locationSuggestionsBox.style.overflow = 'auto'
locationSuggestionsBox.style.borderRadius = '6px'
document.querySelector('.search-bar-container').appendChild(locationSuggestionsBox)

const offresSection = document.querySelector('.offres')
let jobs = []

fetch('json/jobs.json')
  .then(res => res.json())
  .then(data => {
    jobs = data
    displayJobs(jobs)
  })

searchBar.addEventListener('input', () => {
  const query = searchBar.value.toLowerCase()
  if (!query) {
    suggestionsBox.style.display = 'none'
    return
  }
  const matches = jobs.filter(job => job.title.toLowerCase().includes(query))
  if (!matches.length) {
    suggestionsBox.style.display = 'none'
    return
  }
  suggestionsBox.innerHTML = matches
    .map(job => `<div class="suggestion-item" data-title="${job.title}">${job.title}</div>`)
    .join('')
  suggestionsBox.style.display = 'block'
})

locationBar.addEventListener('input', () => {
  const query = locationBar.value.toLowerCase()
  if (!query) {
    locationSuggestionsBox.style.display = 'none'
    return
  }
  const matches = jobs.filter(job => job.location.toLowerCase().includes(query))
  if (!matches.length) {
    locationSuggestionsBox.style.display = 'none'
    return
  }
  locationSuggestionsBox.innerHTML = matches
    .map(job => `<div class="location-item" data-location="${job.location}">${job.location}</div>`)
    .join('')
  locationSuggestionsBox.style.display = 'block'
})

suggestionsBox.addEventListener('click', e => {
  if (e.target.classList.contains('suggestion-item')) {
    searchBar.value = e.target.dataset.title
    suggestionsBox.style.display = 'none'
    const jobFound = jobs.find(job => job.title === e.target.dataset.title)
    displayJobs(jobFound ? [jobFound] : [])
  }
})

locationSuggestionsBox.addEventListener('click', e => {
  if (e.target.classList.contains('location-item')) {
    locationBar.value = e.target.dataset.location
    locationSuggestionsBox.style.display = 'none'
    const filtered = jobs.filter(job => job.location === e.target.dataset.location)
    displayJobs(filtered)
  }
})

filterBtn.addEventListener('click', () => {
  const query = searchBar.value.toLowerCase()
  const location = locationBar.value.toLowerCase()
  const filtered = jobs.filter(job =>
    job.title.toLowerCase().includes(query) &&
    (!location || job.location.toLowerCase().includes(location))
  )
  displayJobs(filtered)
})

document.addEventListener('click', e => {
  if (!searchBar.contains(e.target) && !suggestionsBox.contains(e.target)) {
    suggestionsBox.style.display = 'none'
  }
  if (!locationBar.contains(e.target) && !locationSuggestionsBox.contains(e.target)) {
    locationSuggestionsBox.style.display = 'none'
  }
})

function displayJobs(jobsArray) {
  if (!jobsArray.length) {
    offresSection.innerHTML = '<p>Aucune offre trouvée.</p>'
    return
  }

  offresSection.innerHTML = jobsArray.map(job => `
    <div class="carte">
      <div class="carte-image">
        ${job.company_banner ? `<img src="${job.company_banner}" alt="${job.company}">` : ''}
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
  `).join('')

  document.querySelectorAll('.learn-more').forEach(btn => {
    btn.addEventListener('click', () => {
      const job = jobs.find(j => j.title === btn.dataset.title)
      if (!job) return
      document.getElementById('popupBanner').src = job.company_banner || ''
      document.getElementById('popupBanner').style.display = job.company_banner ? 'block' : 'none'
      document.getElementById('popupTitle').textContent = job.title
      document.getElementById('popupCompany').textContent = job.company
      const tagsContainer = document.getElementById('popupTags')
      tagsContainer.innerHTML = ''
      job.tags.split(',').forEach(tag => {
        const span = document.createElement('span')
        span.textContent = tag
        tagsContainer.appendChild(span)
      })
      document.getElementById('popupShort').textContent = job.location
      document.getElementById('popupFull').innerHTML = ''
      document.getElementById('popupApply').href = 'postuler.html'
      document.getElementById('popup').style.display = 'flex'
    })
  })
}

document.querySelectorAll('.popup .close').forEach(closeBtn => {
  closeBtn.addEventListener('click', e => {
    e.preventDefault()
    closeBtn.closest('.popup').style.display = 'none'
  })
})
