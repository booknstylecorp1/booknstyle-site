/* BookNStyle, booknstyle.com: the no-show cost calculator (home page, #calculator).
   Built to the pro marketing plan of Nov 10 2026, section 5 (and the three
   choices, section 8.2).

   Privacy: plain JavaScript, everything happens in this page. No network
   calls, no cookies, no localStorage or sessionStorage, no analytics, and
   the numbers are never put in a link. The page's Content-Security-Policy
   (connect-src 'self') backs up "Nothing is sent or saved."

   It shows the cost from the pro's own numbers and nothing more. Never add a
   line that says BookNStyle recovers this money or stops no-shows: pros
   can't mark a no-show in the app yet, and the no-show fee is not built. */
(() => {
  'use strict';

  const root = document.querySelector('[data-calc]');
  if (!root) return;

  const $ = (sel) => root.querySelector(sel);
  const inputs = {};
  root.querySelectorAll('[data-calc-in]').forEach((el) => { inputs[el.dataset.calcIn] = el; });

  const DAYS_START = 5;
  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

  // The price box takes cents ("85.50"); the other boxes take whole numbers.
  const hasCents = (el) => el.dataset.calcIn === 'price';

  // The price as typed or pasted, cut down to a plain number: "$1,200.50"
  // reads 1200.50. A comma with 1 or 2 digits after it, and no point after
  // it, is the decimal point: "12,50" reads 12.50, "85,5" reads 85.5 and
  // "1.234,56" reads 1234.56 (the points before it are thousands). Any other
  // comma is thousands: "1,200" reads 1200. One point is kept, with at most 2
  // digits after it ("1.2.3" reads 1.23). Zeros in front go.
  function priceText(raw) {
    let t = String(raw || '').replace(/[^\d.,]/g, '');
    const comma = t.lastIndexOf(',');
    if (comma > t.lastIndexOf('.') && /^\d{1,2}$/.test(t.slice(comma + 1))) {
      t = t.slice(0, comma).replace(/[.,]/g, '') + '.' + t.slice(comma + 1);
    } else {
      t = t.replace(/,/g, '');
    }
    const dot = t.indexOf('.');
    if (dot < 0) return t.replace(/^0+(?=\d)/, '');
    const whole = t.slice(0, dot).replace(/^0+(?=\d)/, '');
    return whole + '.' + t.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  }

  // A box's text cut down to a plain number. A count stops at its first
  // point or comma ("3.5" and "3,5" no-shows read as 3) and drops everything
  // but digits. Zeros in front go. A count takes no thousands comma: every
  // count tops out under 1,000, so "1,000" minutes reads 1, not the top.
  function plain(el) {
    const raw = String(el.value || '');
    if (hasCents(el)) return priceText(raw);
    return raw.split(/[.,]/)[0].replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  }

  // A box's number: null when empty, else its number clamped to its range
  // (cents kept in the price here; render() rounds it to whole dollars).
  function read(name) {
    const el = inputs[name];
    const text = plain(el);
    if (!/\d/.test(text)) return null;
    const n = Number(text.charAt(0) === '.' ? '0' + text : text);
    return Math.min(Number(el.dataset.max), Math.max(Number(el.dataset.min), n));
  }

  // While typing: a count box keeps a plain number only, and the price box
  // keeps its digits, points and commas as typed (so "12,50" can be typed key
  // by key). Both drop anything else ("$", spaces, letters). A count box that
  // has a point or comma in it is left as typed too, until the box is left:
  // cutting "3." back to "3" would turn the next key into "35", so "3.5"
  // typed key by key stays "3.5" and reads 3. A number past the top of its
  // range shows as the top (60 no-shows, $2,000), so the box always matches
  // the result. A number under the bottom (0 days) is fixed when the box is
  // left, so a pro can still clear the box and type a new one. Leaving the
  // box also tidies it: "007" reads 7, "3.5" and "3,5" no-shows read 3,
  // "85." reads 85, "12.5" and "12,50" read 12.50, "1,200" reads 1200.
  function tidy(el, leaving) {
    const raw = String(el.value || '');
    // The price box, or a count box with a point or comma typed in it
    const asTyped = hasCents(el) || /[.,]/.test(raw);
    let next = plain(el);
    if (/\d/.test(next)) {
      const n = Number(next.charAt(0) === '.' ? '0' + next : next);
      const max = Number(el.dataset.max);
      const min = Number(el.dataset.min);
      if (n > max) next = String(max);
      else if (leaving) {
        const v = Math.max(min, n);
        next = Number.isInteger(v) ? String(v) : v.toFixed(2);
      } else if (asTyped) {
        next = raw.replace(/[^\d.,]/g, '').replace(/^0+(?=\d)/, '');
      }
    } else if (leaving) {
      next = el.dataset.calcIn === 'days' ? String(DAYS_START) : '';
    } else if (asTyped) {
      next = raw.replace(/[^\d.,]/g, '');
    }
    if (next !== raw) el.value = next;
  }

  const prompt = $('[data-calc-prompt]');
  const month = $('[data-calc-month]');
  const monthN = $('[data-calc-month-n]');
  const year = $('[data-calc-year]');
  const yearN = $('[data-calc-year-n]');
  const hours = $('[data-calc-hours]');
  const fine = $('[data-calc-fine]');
  const live = $('[data-calc-live]');
  const daysRow = $('[data-calc-days]');
  const result = $('[data-calc-result]');

  let liveTimer = 0;
  let lastSpoken = '';
  // Nothing is read aloud until the visitor first types in a box: on page
  // load the prompt is only on screen, never announced.
  let typed = false;

  // "no-shows" never breaks at its hyphen ("no-" at a line end, "shows" on
  // the next): the word goes in a span that keeps it on one line.
  function setText(el, text) {
    const parts = text.split('no-shows');
    const nodes = [];
    parts.forEach((part, i) => {
      if (i) {
        const nw = document.createElement('span');
        nw.className = 'calc__nw';
        nw.textContent = 'no-shows';
        nodes.push(nw);
      }
      if (part) nodes.push(part);
    });
    el.replaceChildren(...nodes);
  }

  function render() {
    // The price counts in whole dollars (plan section 5), so the year is
    // always exactly 12 times the month shown. Cents may be typed; a price
    // that rounds to $0 (0.40) counts as no price.
    const typedPrice = read('price');
    const price = typedPrice === null ? null : Math.round(typedPrice);
    const noshow = read('noshow');
    const late = read('late');
    const minutes = read('minutes');
    const daysFilled = read('days');
    const days = daysFilled === null ? DAYS_START : daysFilled;

    // Box 5 shows only once box 4 is filled.
    daysRow.hidden = minutes === null;

    // Which result shows (plan section 5, states A to D)
    let state;
    if (!price || (noshow === null && late === null)) state = 'A';
    else if ((noshow || 0) > 0 || (late || 0) > 0) state = 'B';
    else if (noshow === 0 && late === 0) state = 'C';
    else state = 'D';

    let message = '';
    if (state === 'A') message = 'Add your price and your no-shows to see the cost.';
    else if (state === 'C') message = 'Nothing lost in a typical month. Nice.';
    else if (state === 'D') message = 'Add your no-shows and late cancels (0 is fine) to see the total.';
    setText(prompt, message);
    prompt.hidden = state === 'B';
    prompt.classList.toggle('calc__prompt--nice', state === 'C');

    let spoken = message;
    if (state === 'B') {
      const missed = (noshow || 0) + (late || 0);
      const perMonth = price * missed;
      monthN.textContent = money(perMonth);
      // The figure's rough width in em, so styles.css can keep it on one line at its largest
      monthN.style.setProperty('--calc-em', (monthN.textContent.length * 0.55 + 0.15).toFixed(2));
      yearN.textContent = money(perMonth * 12);
      spoken = `About ${money(perMonth)} in a typical month. About ${money(perMonth * 12)} a year.`;
    }
    month.hidden = state !== 'B';
    year.hidden = state !== 'B';
    fine.hidden = state !== 'B';

    // The hours line works on its own, in every state, whenever box 4 is above 0.
    if (minutes > 0) {
      const z = Math.round((minutes * days * 52 / 12 / 60) * 10) / 10;
      const zText = z.toLocaleString('en-US', { maximumFractionDigits: 1 }) + (z === 1 ? ' hour' : ' hours');
      const lead = state === 'B' || state === 'C' ? 'Plus about ' : 'About ';
      const strong = document.createElement('strong');
      strong.textContent = zText;
      hours.replaceChildren(lead, strong, ' a month on booking messages.');
      hours.hidden = false;
      spoken += ` ${lead}${zText} a month on booking messages.`;
    } else {
      hours.hidden = true;
      hours.textContent = '';
    }
    result.dataset.state = state;

    // Screen readers hear the result once typing pauses, not on every key,
    // and only after the visitor has typed.
    clearTimeout(liveTimer);
    if (!typed) return;
    liveTimer = setTimeout(() => {
      if (spoken === lastSpoken) return;
      lastSpoken = spoken;
      live.textContent = spoken;
    }, 700);
  }

  Object.values(inputs).forEach((el) => {
    el.addEventListener('input', () => { typed = true; tidy(el, false); render(); });
    el.addEventListener('blur', () => { tidy(el, true); render(); });
    // Enter moves to the next box (or closes the keyboard on the last one); nothing is submitted.
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const order = Object.values(inputs).filter((i) => i.offsetParent !== null);
      const next = order[order.indexOf(el) + 1];
      if (next) next.focus(); else el.blur();
    });
  });

  // Opening "Add your time" puts the cursor in its first box.
  const more = $('.calc__more');
  if (more) {
    more.addEventListener('toggle', () => {
      if (more.open && document.activeElement === more.querySelector('summary')) inputs.minutes.focus();
    });
  }

  // ---------- The choices: the visitor's own link tags ride along ----------
  // Each choice sets its own utm_campaign (choice_claim, choice_remind) and
  // utm_term=calc, replacing any utm_campaign the visitor came with. The role
  // is always pro: a visitor who arrived with role=client (or any other role)
  // still claims a pro link here. The visitor's utm_source, utm_medium and
  // utm_content and a client's ref code go on unchanged. With none of the
  // three tags, utm_source=short_link.
  // (Only link tags from the address bar; never a number typed above.)
  // main.js carries the visitor's tags onto every other link to the waitlist;
  // these two links are written here in full, after it.
  let params;
  try { params = new URLSearchParams(location.search); } catch { params = new URLSearchParams(); }
  const PASS = ['utm_source', 'utm_medium', 'utm_content', 'ref'];
  const clean = (v) => String(v || '').slice(0, 100);
  const hasTag = ['utm_source', 'utm_medium', 'utm_content'].some((k) => params.get(k));
  root.querySelectorAll('[data-calc-choice]').forEach((a) => {
    const q = new URLSearchParams();
    q.set('role', 'pro');
    PASS.forEach((k) => { const v = params.get(k); if (v) q.set(k, clean(v)); });
    if (!hasTag) q.set('utm_source', 'short_link');
    q.set('utm_campaign', a.dataset.calcChoice);
    q.set('utm_term', 'calc');
    a.href = 'waitlist/?' + q.toString();
  });

  render();
})();
