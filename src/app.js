// Opens an app inside the page, one at a time. The iframe src is only set on
// open and cleared on close, so no app boots until someone asks for it.
(function () {
  var modal = document.getElementById('viewer');
  if (!modal) return;

  var frame = modal.querySelector('.modal-frame');
  var title = modal.querySelector('.modal-title');
  var openInTab = modal.querySelector('.modal-open-tab');
  var lastFocus = null;

  // Embedding a full app inside a small screen gives a window-in-a-window.
  // Below this width we send people straight to the app instead.
  var MIN_EMBED_WIDTH = 700;

  function open(card) {
    var url = card.getAttribute('data-url');
    var name = card.getAttribute('data-name');

    if (window.innerWidth < MIN_EMBED_WIDTH || card.getAttribute('data-embed') === 'false') {
      window.open(url, '_blank', 'noopener');
      return;
    }

    lastFocus = document.activeElement;
    title.textContent = name;
    openInTab.href = url;
    frame.setAttribute('title', name);
    frame.src = url;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    modal.querySelector('.modal-close').focus();
  }

  function close() {
    modal.hidden = true;
    frame.src = 'about:blank';
    document.body.classList.remove('modal-open');
    if (lastFocus) lastFocus.focus();
  }

  document.querySelectorAll('[data-open-app]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      open(btn.closest('.card'));
    });
  });

  modal.querySelector('.modal-close').addEventListener('click', close);

  modal.addEventListener('mousedown', function (e) {
    if (e.target === modal) close();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) close();
  });
})();

// Email addresses are stored split across two attributes and only joined
// here, so the served HTML contains no address for scrapers to pick up.
(function () {
  document.querySelectorAll('[data-mail-user]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      window.location.href =
        'mailto:' + btn.getAttribute('data-mail-user') + '@' + btn.getAttribute('data-mail-domain');
    });
  });
})();
