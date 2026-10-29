/* Menu "Cambiar de tablero": cierra al hacer clic fuera o con Escape. */
(() => {
  const sw = document.querySelector('.switch');
  if (!sw) return;
  document.addEventListener('click', e => { if (sw.open && !sw.contains(e.target)) sw.open = false; });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sw.open) { sw.open = false; sw.querySelector('summary').focus(); }
  });
})();
