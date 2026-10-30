/* Bloomin' Festival page behavior: photo slider, exhibitor payment questions and artisan search.
   Works the same on the standalone site and inside a WordPress Custom HTML block. */
(function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-bf-slider]').forEach(function (slider) {
    var slides = slider.querySelectorAll('.bf-slide');
    var pauseBtn = slider.querySelector('[data-bf-pause]');
    var i = 0;
    var timer = null;
    var playing = !reduceMotion;

    function show(n) {
      slides[i].classList.remove('is-on');
      slides[i].setAttribute('aria-hidden', 'true');
      i = (n + slides.length) % slides.length;
      slides[i].classList.add('is-on');
      slides[i].removeAttribute('aria-hidden');
    }
    function start() { stop(); if (playing) timer = setInterval(function () { show(i + 1); }, 5500); }
    function stop() { if (timer) clearInterval(timer); timer = null; }
    function setPlaying(p) {
      playing = p;
      pauseBtn.setAttribute('aria-label', p ? 'Pause slideshow' : 'Play slideshow');
      pauseBtn.textContent = p ? '❚❚' : '▶';
      start();
    }

    slider.querySelector('[data-bf-prev]').addEventListener('click', function () { show(i - 1); start(); });
    slider.querySelector('[data-bf-next]').addEventListener('click', function () { show(i + 1); start(); });
    pauseBtn.addEventListener('click', function () { setPlaying(!playing); });
    slider.addEventListener('mouseenter', stop);
    slider.addEventListener('mouseleave', start);
    slider.addEventListener('focusin', stop);
    slider.addEventListener('focusout', start);
    setPlaying(playing);
  });

  // Exhibitor payment: the payment form appears only after a vendor says they have applied and been approved.
  document.querySelectorAll('[data-bf-gate]').forEach(function (gate) {
    var pay = document.querySelector('[data-bf-pay]');
    var answers = {};
    var loaded = false;
    function show(sel, on) { var el = gate.querySelector(sel); if (el) el.hidden = !on; }
    function update() {
      show('[data-step="approved"]', answers.applied === 'yes');
      show('[data-msg="apply-first"]', answers.applied === 'no');
      show('[data-msg="wait"]', answers.applied === 'yes' && answers.approved === 'no');
      var ok = answers.applied === 'yes' && answers.approved === 'yes';
      show('[data-msg="pay"]', ok);
      if (!pay) return;
      pay.hidden = !ok;
      if (ok && !loaded) {   // load the payment form only once it is needed
        loaded = true;
        var sc = document.createElement('script');
        sc.src = 'https://sky.blackbaudcdn.net/static/reg-form-loader/5/main.js';
        sc.onload = function () {   // Blackbaud's loader starts on the page's load event, which has usually passed by now
          var bb = window.BBEventRegistrationFormLoader;
          if (document.readyState === 'complete' && bb && bb.newEventRegistrationForm) bb.newEventRegistrationForm(window);
        };
        document.body.appendChild(sc);
      }
    }
    gate.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-q]');
      if (!b) return;
      var q = b.getAttribute('data-q');
      answers[q] = b.getAttribute('data-a');
      if (q === 'applied' && answers.applied === 'no') delete answers.approved;
      gate.querySelectorAll('button[data-q="' + q + '"]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      if (q === 'applied') gate.querySelectorAll('button[data-q="approved"]').forEach(function (x) { if (!answers.approved) x.setAttribute('aria-pressed', 'false'); });
      update();
    });
  });

  document.querySelectorAll('[data-bf-filter]').forEach(function (input) {
    var list = document.getElementById(input.getAttribute('data-bf-filter'));
    var items = list.querySelectorAll('li');
    var count = document.getElementById(input.id + '-count');
    var empty = document.getElementById(input.id + '-empty');
    function run() {
      var q = input.value.trim().toLowerCase();
      var shown = 0;
      items.forEach(function (li) {
        var hit = !q || li.textContent.toLowerCase().indexOf(q) !== -1;
        li.hidden = !hit;
        if (hit) shown++;
      });
      count.textContent = shown + (shown === 1 ? ' artisan' : ' artisans');
      empty.hidden = shown !== 0;
    }
    input.addEventListener('input', run);
    run();
  });
})();
