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