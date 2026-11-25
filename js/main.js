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
    FB.UI.home();
  }
  // кнопка «назад» в браузере во время игры не должна молча ломать экран
  root.addEventListener('popstate', function () {
    if (FB.Host.active() || FB.Player.active()) return;
    boot();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
