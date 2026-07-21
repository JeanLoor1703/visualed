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

/* === Animación de Contadores Dinámicos Globales (Hero) === */
document.addEventListener("DOMContentLoaded", () => {
  const configs = [
    { id: "impacto-mensual-counter", end: 12, suffix: "", prefix: "" },
    { id: "vistas-diarias-counter", end: 15000, suffix: "", prefix: "+", isFormatted: true },
    { id: "visibilidad-counter", end: 24, suffix: "", prefix: "" },
    { id: "provincias-counter", end: 3, suffix: "", prefix: "" },
    { id: "loc-vistas-counter", end: 15, suffix: "", prefix: "" },
    { id: "loc-visibilidad-counter", end: 24, suffix: "", prefix: "" },
    { id: "loc-provincias-counter", end: 3, suffix: "", prefix: "" },
    { id: "loc-trafico-counter", end: 1, suffix: "", prefix: "" }
  ];

  const animateCounter = (el, end, duration, prefix, suffix, isFormatted) => {
    const easeOutQuad = t => t * (2 - t);
    let startTime = null;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const currentVal = Math.floor(easeOutQuad(progress) * end);

      let displayText = currentVal.toString();
      if (isFormatted) {
        // Format with thousand separator "."
        displayText = currentVal.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      }

      el.innerText = prefix + displayText + suffix;

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        // Final precise value
        let finalVal = end.toString();
        if (isFormatted) {
          finalVal = end.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        }
        el.innerText = prefix + finalVal + suffix;
      }
    };
    window.requestAnimationFrame(step);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const config = configs.find(c => c.id === el.id);
        if (config) {
          // Duración de 1.8 segundos para una animación fluida
          animateCounter(el, config.end, 1800, config.prefix, config.suffix, config.isFormatted);
        }
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.1 });

  configs.forEach(c => {
    const el = document.getElementById(c.id);
    if (el) {
      observer.observe(el);
    }
  });
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

/* === Golden Ticket Floating Offer === */
document.addEventListener("DOMContentLoaded", () => {
  const ticket = document.getElementById("goldenTicket");
  const closeBtn = document.getElementById("closeTicket");

  if (!ticket || !closeBtn) return;

  // Show the ticket after 3 seconds (3000ms)
  setTimeout(() => {
    ticket.classList.add("active");
  }, 3000);

  // Close the ticket on button click
  closeBtn.addEventListener("click", () => {
    ticket.classList.remove("active");
  });
});

/* === Anti-FOUC removido: body ahora siempre visible (LCP fix) ===
   La clase fouc-hidden fue eliminada del body en todos los HTML
   para evitar el error NO_LCP en Lighthouse Mobile (Moto G Power 4G).
   ================================================================ */