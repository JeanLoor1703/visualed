'use strict';

(() => {
  const route = document.currentScript?.dataset?.flow;
  if (route !== 'invite') return;

  const query = new URLSearchParams(window.location.search);
  query.set('flow', route);
  const target = `/?${query.toString()}${window.location.hash}`;
  window.location.replace(target);
})();
