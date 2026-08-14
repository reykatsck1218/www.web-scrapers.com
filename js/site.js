/* web-scrapers.com — minimal site interactivity (no framework).
   Theme toggle, mobile nav, FAQ accordion, code tabs. */
(function () {
  'use strict';

  /* ---------- theme toggle (three-state: light / auto / dark) ---------- */
  var KEY = 'tanuki-theme';
  var mq = window.matchMedia('(prefers-color-scheme: dark)');

  function stored() {
    try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; }
  }
  function apply(setting) {
    var theme = setting === 'auto' ? (mq.matches ? 'dark' : 'light') : setting;
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-theme-setting', setting);
    document.querySelectorAll('[data-theme-set]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-theme-set') === setting));
    });
  }
  document.querySelectorAll('[data-theme-set]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var setting = btn.getAttribute('data-theme-set');
      try { localStorage.setItem(KEY, setting); } catch (e) {}
      apply(setting);
    });
  });
  mq.addEventListener('change', function () { if (stored() === 'auto') apply('auto'); });
  apply(stored());

  /* ---------- mobile nav ---------- */
  var header = document.getElementById('site-header');
  var navToggle = document.querySelector('.navtoggle');
  if (header && navToggle) {
    navToggle.addEventListener('click', function () {
      var open = header.classList.toggle('header--nav-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (e) {
      if (!header.contains(e.target) && header.classList.contains('header--nav-open')) {
        header.classList.remove('header--nav-open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- FAQ accordion (progressive enhancement) ---------- */
  /* Finds an H2 titled "FAQ"/"Frequently…" inside .prose and converts each
     following H3 + its answer nodes into a collapsible item. */
  document.querySelectorAll('.prose h2').forEach(function (h2) {
    if (!/^(faq|frequently asked)/i.test(h2.textContent.trim())) return;
    var wrap = document.createElement('div');
    wrap.className = 'faq';
    var node = h2.nextElementSibling;
    var items = [];
    while (node && node.tagName !== 'H2') {
      var next = node.nextElementSibling;
      if (node.tagName === 'H3') {
        items.push({ q: node, a: [] });
      } else if (items.length) {
        items[items.length - 1].a.push(node);
      }
      node = next;
    }
    if (!items.length) return;
    items.forEach(function (item, i) {
      var el = document.createElement('div');
      el.className = 'faq__item';
      el.setAttribute('data-open', 'false');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'faq__q';
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = '<span></span><span class="faq__sign" aria-hidden="true"></span>';
      btn.firstChild.textContent = item.q.textContent;
      var body = document.createElement('div');
      body.className = 'faq__a';
      body.hidden = true;
      var inner = document.createElement('div');
      inner.className = 'faq__a-inner';
      item.a.forEach(function (n) { inner.appendChild(n); });
      body.appendChild(inner);
      btn.addEventListener('click', function () {
        var open = el.getAttribute('data-open') === 'true';
        el.setAttribute('data-open', String(!open));
        btn.setAttribute('aria-expanded', String(!open));
        body.hidden = open;
      });
      el.appendChild(btn);
      el.appendChild(body);
      wrap.appendChild(el);
      item.q.remove();
    });
    h2.parentNode.insertBefore(wrap, node);
  });

  /* ---------- code tabs (progressive enhancement) ---------- */
  /* Groups runs of language headings (## PHP / ## Node.js / ## Rust on
     solutions pages, ### on some guides) + their code into a tabbed panel. */
  var LANGS = { php: 'php', 'node.js': 'node', nodejs: 'node', rust: 'rust', python: 'python' };
  var DOTS = { php: 'var(--lang-php)', node: 'var(--lang-node)', rust: 'var(--lang-rust)', python: 'var(--lang-python)' };

  function langOf(h) {
    return LANGS[h.textContent.trim().toLowerCase()] || null;
  }
  function stopsSection(node, level) {
    // a section ends at any heading of the same or higher level
    return node.tagName === 'H2' || (level === 'H3' && node.tagName === 'H3');
  }

  ['H2', 'H3'].forEach(function (level) {
    document.querySelectorAll('.prose').forEach(function (prose) {
      var headings = Array.prototype.filter.call(prose.querySelectorAll(level.toLowerCase()), langOf);
      var i = 0;
      while (i < headings.length) {
        var run = [headings[i]];
        var j = i + 1;
        while (j < headings.length) {
          // consecutive language sections: nothing but the previous section's
          // content between this heading and the previous one
          var ok = false;
          var n = run[run.length - 1].nextElementSibling;
          while (n) {
            if (n === headings[j]) { ok = true; break; }
            if (stopsSection(n, level)) break;
            n = n.nextElementSibling;
          }
          if (!ok) break;
          run.push(headings[j]);
          j++;
        }
        if (run.length >= 2) buildTabs(run, level);
        i = j;
      }
    });
  });

  function sectionNodes(h, level) {
    var nodes = [];
    var n = h.nextElementSibling;
    while (n && !stopsSection(n, level)) {
      nodes.push(n);
      n = n.nextElementSibling;
    }
    return nodes;
  }

  function buildTabs(run, level) {
    var box = document.createElement('div');
    box.className = 'code';
    var bar = document.createElement('div');
    bar.className = 'code__bar';
    bar.setAttribute('role', 'tablist');
    box.appendChild(bar);
    // anchor the tab box where the first language heading stood
    run[0].parentNode.insertBefore(box, run[0]);
    var panels = [];
    run.forEach(function (h3, idx) {
      var lang = langOf(h3);
      var tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'code__tab';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(idx === 0));
      tab.innerHTML = '<span class="code__dot" style="color:' + DOTS[lang] + '"></span>' + h3.textContent.trim();
      var panel = document.createElement('div');
      panel.hidden = idx !== 0;
      sectionNodes(h3, level).forEach(function (n) { panel.appendChild(n); });
      panels.push(panel);
      box.appendChild(panel);
      tab.addEventListener('click', function () {
        bar.querySelectorAll('.code__tab').forEach(function (t, k) {
          t.setAttribute('aria-selected', String(t === tab));
          panels[k].hidden = t !== tab;
        });
      });
      bar.appendChild(tab);
      h3.remove();
    });
    box.querySelectorAll('pre').forEach(function (pre) {
      pre.style.border = '0';
      pre.style.borderRadius = '0';
    });
  }
})();
