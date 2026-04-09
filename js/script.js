/* === Auto-play 15s para los 3 sliders === */

function autoPlay(sliderId) {
  var container = document.getElementById(sliderId);
  if (!container) return;
  var imgs = container.querySelectorAll('.slider-img');
  if (imgs.length <= 1) return;
  var current = 0;

  setInterval(function () {
    imgs[current].classList.remove('active');
    current = (current + 1) % imgs.length;
    imgs[current].classList.add('active');
  }, 15000);
}

autoPlay('slider-vallas');
autoPlay('slider-retail');
autoPlay('slider-bebidas');

/* === Menú Móvil === */
function toggleMenu() {
  var nav = document.getElementById('navLinks');
  var ham = document.getElementById('ham');
  if (nav) nav.classList.toggle('open');
  if (ham) ham.classList.toggle('open');
}

function closeMenu() {
  var nav = document.getElementById('navLinks');
  var ham = document.getElementById('ham');
  if (nav) nav.classList.remove('open');
  if (ham) ham.classList.remove('open');
}

/* === Animación del contador === */
document.addEventListener("DOMContentLoaded", () => {
  const counterObj = document.getElementById("counterNum");
  if (!counterObj) return;

  const animateCounter = () => {
    const end = 10000;
    const duration = 2000;
    const easeOutQuad = t => t * (2 - t);
    
    let startTime = null;
    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      counterObj.innerText = Math.floor(easeOutQuad(progress) * end).toLocaleString('en-US');
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        counterObj.innerText = end.toLocaleString('en-US');
        counterObj.parentElement.classList.add('counter-done');
      }
    };
    window.requestAnimationFrame(step);
  };

  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      animateCounter();
      observer.disconnect();
    }
  });
  observer.observe(counterObj);
});

/* === Animacion de estrellas (Testimonios) === */
document.addEventListener("DOMContentLoaded", () => {
  const tCards = document.querySelectorAll('.t-card');
  if (tCards.length === 0) return;

  const starObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-stars');
        obs.unobserve(entry.target); // Solo animar la primera vez
      }
    });
  }, { threshold: 0.3 }); // Activar cuando el 30% de la card es visible

  tCards.forEach(card => {
    starObserver.observe(card);
  });
});

/* === Animaciones Fade-up (IntersectionObserver) === */
document.addEventListener("DOMContentLoaded", () => {
  const fadeElements = document.querySelectorAll('.fade-up');
  if (fadeElements.length === 0) return;

  const fadeObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        obs.unobserve(entry.target); // Animamos solo una vez
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

  fadeElements.forEach(el => fadeObserver.observe(el));
});