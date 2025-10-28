const jobsContainer = document.getElementById("jobsContainer");
const filterBtn = document.getElementById("filterBtn");
const applyFiltersBtn = document.getElementById("applyFiltersCandidates");
const searchInput = document.getElementById("searchInput");
const cityInput = document.getElementById("cityInput");
const minSalaryInput = document.getElementById("minSalary");
const contractCheckboxes = Array.from(document.querySelectorAll('#filterPanelCandidates input[type="checkbox"][value]'));

let allJobs = [
  {id:1,title:"Développeur Frontend",company:"TechNova",image:"https://picsum.photos/id/1011/300/200",location:"Paris",contract:"CDI",work_mode:"hybrid",salary_min:35000,currency:"EUR"},
  {id:2,title:"Ingénieur Cloud",company:"GreenOps",image:"https://picsum.photos/id/1027/300/200",location:"Lyon",contract:"CDI",work_mode:"remote",salary_min:42000,currency:"EUR"},
  {id:3,title:"Data Analyst",company:"DataPulse",image:"https://picsum.photos/id/1005/300/200",location:"Nantes",contract:"CDI",work_mode:"onsite",salary_min:38000,currency:"EUR"},
  {id:4,title:"Dev Fullstack",company:"WebForge",image:"https://picsum.photos/id/1001/300/200",location:"Bordeaux",contract:"CDD",work_mode:"hybrid",salary_min:32000,currency:"EUR"},
  {id:5,title:"Pentester",company:"SecureMind",image:"https://picsum.photos/id/1012/300/200",location:"Marseille",contract:"CDI",work_mode:"remote",salary_min:45000,currency:"EUR"}
];

function displayJobs(jobs) {
  jobsContainer.innerHTML = "";
  if(jobs.length === 0) {
    jobsContainer.innerHTML = "<p>Aucune offre trouvée.</p>";
    return;
  }
  jobs.forEach(job=>{
    const div = document.createElement("div");
    div.classList.add("job-card");
    div.innerHTML = `
      <img src="${job.image}" alt="${job.title}">
      <h3>${job.title}</h3>
      <p>${job.company} - ${job.location}</p>
      <p>${job.contract} | ${job.work_mode} | ${job.salary_min} ${job.currency}</p>
    `;
    jobsContainer.appendChild(div);
  });
}

function applyFilters() {
  let filtered = [...allJobs];
  const search = searchInput.value.toLowerCase();
  const city = cityInput.value.toLowerCase();
  const minSalary = parseInt(minSalaryInput.value) || 0;
  const selectedContracts = contractCheckboxes.filter(c=>c.checked).map(c=>c.value);
  const selectedWorkModes = contractCheckboxes.filter(c=>c.checked).map(c=>c.value);
  const selectedCurrencies = contractCheckboxes.filter(c=>c.checked).map(c=>c.value);

  filtered = filtered.filter(job=>{
    if(search && !job.title.toLowerCase().includes(search)) return false;
    if(city && !job.location.toLowerCase().includes(city)) return false;
    if(job.salary_min < minSalary) return false;
    if(selectedContracts.length && !selectedContracts.includes(job.contract)) return false;
    if(selectedWorkModes.length && !selectedWorkModes.includes(job.work_mode)) return false;
    if(selectedCurrencies.length && !selectedCurrencies.includes(job.currency)) return false;
    return true;
  });

  displayJobs(filtered);
}

displayJobs(allJobs);

filterBtn.addEventListener("click",()=>document.getElementById("filterPanelCandidates").classList.toggle("show"));
applyFiltersBtn.addEventListener("click",applyFilters);
