// The confirm page for one-tap unsubscribe from marketing emails (item 59).
// The email's link brings the signed key (?k=). Opening the page changes
// nothing; only a tap on Unsubscribe POSTs the key to the
// marketing-unsubscribe edge function (deployed with --no-verify-jwt), which
// turns off tips, updates and offers for that one account. Booking, payment
// and account emails are not affected.
(() => {
  'use strict';
  const API_URL = 'https://ebrxekhmlxlccuvcwiwb.supabase.co/functions/v1/marketing-unsubscribe';
  // The same shape as UNSUBSCRIBE_KEY_PATTERN in _shared/marketingUnsubscribe.ts.
  const KEY = /^u1\.[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/;
  const params = new URLSearchParams(location.search);
  const key = (params.get('k') || '').trim();
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  const title = document.querySelector('[data-u-title]');
  const text = document.querySelector('[data-u-text]');
  const error = document.querySelector('[data-u-error]');
  const unsub = document.querySelector('[data-u-unsub]');
  const back = document.querySelector('[data-u-back]');
  // The gold button is the main action: Unsubscribe while asking, then Back.
  const backIsMain = () => { back.className = 'btn btn--gold'; };

  const show = (t, body) => { title.textContent = t; text.textContent = body; title.focus(); };
  const fail = (msg) => { error.textContent = msg; error.hidden = false; };

  const unsubscribed = () => {
    show("You're unsubscribed", "You won't get any more tips, updates or offers from BookNStyle by email. Emails about your bookings, payments and account still come. Questions? Email support@booknstyle.com.");
    unsub.hidden = true;
    backIsMain();
  };

  unsub.addEventListener('click', async () => {
    error.hidden = true;
    unsub.disabled = true;
    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ k: key }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data || !data.ok) throw new Error((data && data.error) || 'Something went wrong. Please try again.');
      unsubscribed();
    } catch (e) {
      show("We couldn't unsubscribe you yet", 'Please tap Unsubscribe again, or reply "unsubscribe" to our email.');
      fail(e.message);
    } finally {
      unsub.disabled = false;
    }
  });

  // Local preview only (ignored on booknstyle.com).
  if (isLocal && params.get('preview') === 'done') { unsubscribed(); return; }

  if (!KEY.test(key)) {
    show("This link isn't complete", 'Please use the Unsubscribe link in your BookNStyle email, or reply "unsubscribe" to that email.');
    backIsMain();
    return;
  }
  unsub.hidden = false;
})();
