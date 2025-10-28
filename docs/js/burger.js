const burgerBtn = document.getElementById('burgerBtn');
const burgerMenu = document.getElementById('burgerMenu');
const closeMenu = burgerMenu.querySelector('.close-menu');

burgerBtn.addEventListener('click', () => {
  burgerMenu.classList.add('open');
  burgerBtn.classList.add('active');
});

closeMenu.addEventListener('click', () => {
  burgerMenu.classList.remove('open');
  burgerBtn.classList.remove('active');
});

document.addEventListener('click', (e) => {
  if (!burgerMenu.contains(e.target) && !burgerBtn.contains(e.target)) {
    burgerMenu.classList.remove('open');
    burgerBtn.classList.remove('active');
  }
});
