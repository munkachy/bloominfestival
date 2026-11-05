/* Sweepstakes ticket order form (ticket-tshirts/).
   The card is taken by Blackbaud's own secure pop-up; this page never sees card numbers.
   The order (sheets, gift, name, email, address) goes over HTTPS to the development office's
   betterBB server on the office Mac, which works out the amount, completes the payment with
   Blackbaud, and records it in Raiser's Edge on the 43rd Bloomin' Festival event.
   Nothing is stored in this site, the mailbox, or the browser. */
(function () {
  var API = 'https://br.taile138aa.ts.net';
  var PAYMENT_CONFIG = 'b133c14b-575e-4808-8098-d5e77cf9b67d';   // Blackbaud: St. Bernard Preparatory School
  var PRICE = 25, PER_SHEET = 6, MAX = 100;
  var PHONE = '256-739-6682';

  var f = document.getElementById('tk-form');
  if (!f) return;
  var msg = document.getElementById('tk-msg'), btn = document.getElementById('tk-pay');
  var done = document.getElementById('tk-done'), ref = null, checkout = null;

  function say(t) { msg.textContent = t || ''; msg.hidden = !t; if (t) msg.scrollIntoView({ block: 'center' }); }
  function sheets() { var n = parseInt(f.sheets.value, 10); return isNaN(n) ? 0 : Math.max(0, Math.min(MAX, n)); }
  function gift() { var g = parseFloat((f.gift.value || '').replace(/[$,\s]/g, '')); return isNaN(g) || g < 0 ? 0 : g; }
  function money(n) { return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function update() {
    var s = sheets();
    document.getElementById('tk-count').textContent = s ? (s * PER_SHEET) + ' tickets' : 'No tickets';
    document.getElementById('tk-total').textContent = money(s * PRICE + gift());
  }
  document.getElementById('tk-minus').addEventListener('click', function () { f.sheets.value = Math.max(0, sheets() - 1); update(); });
  document.getElementById('tk-plus').addEventListener('click', function () { f.sheets.value = Math.min(MAX, sheets() + 1); update(); });
  f.addEventListener('input', update);
  update();

  function post(step, data) {
    return fetch(API + '/give/web/' + step, { method: 'POST', body: new URLSearchParams(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._ok = r.ok; return j; }); });
  }
  function offline() {
    say("We can't take orders online right now. Please try again later, or call " + PHONE + '.');
    btn.disabled = false;
  }

  function setup() {
    if (checkout || typeof window.BlackbaudCheckout !== 'function') return checkout;
    checkout = window.BlackbaudCheckout({
      paymentConfigurationId: PAYMENT_CONFIG, workflowMode: 'modal', transactionMode: 'payment',
      feeOffsetType: 0, primaryColor: '#2c736d'
    });
    checkout.checkoutComplete.subscribe(function (e) {
      var id = e && e.transaction && e.transaction.id;
      if ((e && e.success === false) || !id) {
        say('The payment did not go through, and your card was not charged. You can try again.');
        btn.disabled = false; return;
      }
      say('Finishing your order… please keep this page open.');
      post('complete', { ref: ref, transaction_id: id }).then(function (j) {
        if (!j._ok) { say(j.error || ('Please call ' + PHONE + '.')); btn.disabled = false; return; }
        f.hidden = true; say('');
        document.getElementById('tk-paid').textContent = money(parseFloat(j.total));
        done.hidden = false; done.scrollIntoView({ block: 'start' });
      }, function () { say('We lost the connection while finishing. Please call ' + PHONE + ' so we can confirm your order. Do not pay again.'); });
    });
    if (checkout.canceled) checkout.canceled.subscribe(function () { btn.disabled = false; say(''); });
    return checkout;
  }

  btn.addEventListener('click', function () {
    say('');
    if (!f.reportValidity()) return;
    if (sheets() * PRICE + gift() < 1) { say('Please choose at least one sheet or add a gift.'); return; }
    if (!setup()) { offline(); return; }
    btn.disabled = true;
    post('start', new FormData(f)).then(function (j) {
      if (!j._ok) { say(j.error || ('Please call ' + PHONE + '.')); btn.disabled = false; return; }
      ref = j.ref;
      checkout.checkoutModal.openPaymentForm({ baseAmount: j.baseAmount, transactionCategory: 'donation' });
    }, offline);
  });
})();
