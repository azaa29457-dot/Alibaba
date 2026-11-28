/* © 2026 azaa29457-dot. Все права защищены. Копирование без разрешения автора запрещено (см. LICENSE). */
/* Alibaba — запуск. */
(function (root) {
  'use strict';
  var FB = root.FB;
  function boot() {
    if (!FB.subjects.length) {
      document.getElementById('app').innerHTML = '<p style="padding:2rem;color:#fff">Не найдено ни одного предмета. Проверьте файлы в папке data и строки &lt;script&gt; в index.html.</p>';
      return;
    }
    var m = /[?&]code=(\d{6})/.exec(location.search);
    if (m) { FB.Player.start(m[1]); return; }
    if (location.hash === '#admin' && FB.Admin) { FB.Admin.open(); return; } // админ-панель: только по адресу и паролю
    FB.UI.home();
  }
  // кнопка «назад» в браузере во время игры не должна молча ломать экран
  root.addEventListener('popstate', function () {
    if (FB.Host.active() || FB.Player.active()) return;
    boot();
  });
  // #admin в адресе — админ-панель; во время игры не мешает, после конца игры открывается
  root.addEventListener('hashchange', function () {
    if (location.hash !== '#admin' || !FB.Admin || FB.Player.active()) return;
    if (FB.Host.active()) {
      if (FB.Host.savedGame()) { FB.UI.toast('Админ-панель откроется после конца игры'); return; }
      FB.Host.stop();
    }
    FB.Admin.open();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
