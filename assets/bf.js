/* Bloomin' Festival page behavior: photo slider and artisan search.
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
