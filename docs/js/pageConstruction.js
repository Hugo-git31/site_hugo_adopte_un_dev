document.addEventListener("DOMContentLoaded", () => {
  const socialPopup = document.getElementById("socialPopup");
  const closePopup = document.querySelector(".close-social");

  if (!socialPopup) return;


  const triggers = [
    
    ...document.querySelectorAll(".logos-reseaux a"),
    
    ...document.querySelectorAll(
      '.logo[alt="Logo 1"], .logo[alt="Logo 2"], .logo[alt="Logo 9"]'
    ),
   
    document.querySelector('.entete-droite a[href="about.html"]'),
    
    ...document.querySelectorAll(
      '.footer-right a'
    ),
   
    ...Array.from(document.querySelectorAll("#burgerMenu a")).filter(
      (a) => !["Profil", "Notifications"].includes(a.textContent.trim())
    ),
  ].filter(Boolean); 

  
  triggers.forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      socialPopup.style.display = "flex";
    });
  });

  
  if (closePopup) {
    closePopup.addEventListener("click", (e) => {
      e.preventDefault();
      socialPopup.style.display = "none";
    });
  }

  
  socialPopup.addEventListener("click", (e) => {
    if (e.target === socialPopup) {
      socialPopup.style.display = "none";
    }
  });
});
