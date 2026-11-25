/* Alibaba — общее пространство имён и реестр предметов. Загружается первым. */
(function (root) {
  'use strict';
  var FB = root.FB || (root.FB = {});
  FB.subjects = FB.subjects || [];

  function clean(s) { return String(s == null ? '' : s).trim(); }

  /* Добавляет предмет. Неправильные вопросы пропускаются с предупреждением в консоли,
     чтобы одна опечатка не ломала весь сайт. */
  FB.addSubject = function (subject) {
    try {
      if (!subject || !subject.id || !subject.title || !Array.isArray(subject.topics)) {
        console.warn('[Alibaba] Предмет пропущен: нужны id, title и topics', subject);
        return;
      }
      if (FB.subjects.some(function (s) { return s.id === subject.id; })) {
        console.warn('[Alibaba] Предмет с id "' + subject.id + '" уже есть — второй пропущен');
        return;
      }
      var topics = [];
      subject.topics.forEach(function (t, ti) {
        if (!t || !t.id || !t.title || !Array.isArray(t.q)) {
          console.warn('[Alibaba] ' + subject.title + ': тема №' + (ti + 1) + ' пропущена (нужны id, title, q)');
          return;
        }
        var qs = [];
        t.q.forEach(function (row, qi) {
          var where = subject.title + ' / ' + t.title + ' / вопрос №' + (qi + 1);
          if (!Array.isArray(row) || row.length !== 6) {
            console.warn('[Alibaba] ' + where + ': нужно ровно 6 элементов [сложность, вопрос, верный, неверный, неверный, неверный]');
            return;
          }
          var d = Number(row[0]);
          if (d !== 1 && d !== 2 && d !== 3) { console.warn('[Alibaba] ' + where + ': сложность должна быть 1, 2 или 3'); return; }
          var text = clean(row[1]);
          var opts = row.slice(2).map(clean);
          if (!text || opts.some(function (o) { return !o; })) { console.warn('[Alibaba] ' + where + ': пустой текст'); return; }
          var uniq = {};
          for (var i = 0; i < opts.length; i++) {
            var k = opts[i].toLowerCase();
            if (uniq[k]) { console.warn('[Alibaba] ' + where + ': варианты ответа повторяются'); return; }
            uniq[k] = 1;
          }
          qs.push({ d: d, text: text, opts: opts }); // opts[0] — верный
        });
        if (!qs.length) { console.warn('[Alibaba] Тема "' + t.title + '" пропущена: нет правильных вопросов'); return; }
        topics.push({
          id: String(t.id), title: clean(t.title), icon: t.icon || '📘', img: t.img ? String(t.img) : '',
          tags: clean(t.tags), q: qs, subjectId: String(subject.id)
        });
      });
      if (!topics.length) { console.warn('[Alibaba] Предмет "' + subject.title + '" пропущен: нет тем'); return; }
      FB.subjects.push({
        id: String(subject.id), title: clean(subject.title), grade: clean(subject.grade),
        icon: subject.icon || '📚', img: subject.img ? String(subject.img) : '', color: subject.color || '#2FB8FF', topics: topics
      });
    } catch (e) {
      console.error('[Alibaba] Ошибка при добавлении предмета', e);
    }
  };

  FB.topicKey = function (subjectId, topicId) { return subjectId + '/' + topicId; };
  FB.findTopic = function (key) {
    var p = String(key).split('/');
    var s = FB.subjects.filter(function (x) { return x.id === p[0]; })[0];
    if (!s) return null;
    var t = s.topics.filter(function (x) { return x.id === p[1]; })[0];
    return t ? { subject: s, topic: t } : null;
  };
})(typeof window !== 'undefined' ? window : globalThis);
