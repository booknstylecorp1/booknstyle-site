/* BookNStyle waitlist form (vanilla JS, no dependencies, no tracking).
   Sends the form to the waitlist-join edge function, then shows "You're in."
   with the share link and share buttons, the Founding badges, the client's
   "3 friends, first booking fee on us" progress, the pro's claimed booking
   link or the client's "Message @handle" cards, and a story image drawn
   right here. Never shows a place in line (owner, Oct 26 2026).
   In steps: 1 Join (the form, with no bar), 2 Your pro (clients: name
   pros, then Message @handle) or Booking link (pros), 3 Friends (the
   reward and sharing) or Share (pros), then the whole view. A 3-step bar
   at the top of the card shows from step 2 on, with Join already filled.
   Every later step can be skipped (it fills grey); the bar never goes back.
   Server side: supabase/functions/waitlist-join and waitlist-info,
   migrations 052 and 053.
   Oct 30 2026 (luxury refinement): a pro's step 3 is "Tell your clients":
   the link they share is their own held page (app.booknstyle.com/book/name),
   with a text for their regulars, and the Founding Pro Kit (story images
   drawn here with their name, and a bio line) replaces the "I'm in." image
   for pros. Under it, a quiet invite for other pros with a count (R1, R5). */

(() => {
  'use strict';

  // The Supabase edge functions (deployed with --no-verify-jwt, so no key is
  // needed here). They answer only to booknstyle.com and localhost (CORS).
  const FN = 'https://ebrxekhmlxlccuvcwiwb.supabase.co/functions/v1/';
  const JOIN_URL = FN + 'waitlist-join';
  const INFO_URL = FN + 'waitlist-info';

  // Friends (joined with a client's link) who make that client's first
  // booking fee free. The server has the final say
  // (waitlist_reward_milestone() in migration 053) and sends it back as
  // "milestone". Badges need no friends: every client is a Founding Member
  // and every pro who joins here is a Founding Pro.
  const MILESTONE = 3;
  const MAX_NOMINATIONS = 3;
  const LINK_HOST = 'app.booknstyle.com/book/';
  const CHECK_DELAY_MS = 450;

  const SHARE_TEXT = {
    client: "I just joined the BookNStyle waitlist. It's a new app for booking barbers, stylists, nail and lash techs and more. Join with my link:",
    // A pro's step 3 is "Tell your clients" (R1): the text for their regulars.
    // The link goes alone on the last line, with no period after it, so it never breaks.
    pro: "I'm moving my bookings to BookNStyle. Join the list so you can book me the day it opens:",
  };
  // What a pro sends another pro (R5). No reward is promised: the free month
  // only works for plans billed on our website, not Apple.
  const PRO_INVITE_TEXT = 'I just claimed my booking link on BookNStyle. Claim yours before someone takes your name:';
  // Pros outside New York: New York opens on launch day, every other state soon
  // after (state rules plan, Oct 30 2026), and their hold runs from their state's opening (R4).
  const LATER_STATE_NOTE = 'Your state opens soon after launch. Your link stays held until 60 days after launch.';
  // "Let your pro know": the message a client sends each pro they named, with
  // their pro invite link (?ref=CODE&role=pro&utm_campaign=<id>) after it.
  // Each browser gets one of these at random and keeps it, so a client always
  // sees the same message. The id rides on the link, so the waitlist export's
  // utm_campaign column shows which message brought each pro in.
  // Owner-approved wording, Oct 26 and 27 2026; ask_thought reworded and
  // ask_nationwide added (an A/B test of the two lines) Oct 30 2026.
  const ASK_TEXTS = [
    { id: 'ask_default', text: "I just joined the BookNStyle waitlist. You should be on it, it's built for pros like you:" },
    { id: 'ask_goto', text: "You're my go-to, so I put you on BookNStyle's list. It's a new booking app made for pros, no commission on your services. Grab your booking link before someone takes your name:" },
    // Oct 30 2026, nationwide: "launching in NYC" became "launching soon across
    // the US" (same utm id so its results keep adding up).
    { id: 'ask_thought', text: "Saw this and thought of you. BookNStyle is launching soon across the US, and pros can claim their booking link now. I'd book you on it in a heartbeat:" },
    { id: 'ask_nationwide', text: "Saw this and thought of you. BookNStyle is coming soon nationwide, and pros can claim their booking link now. I'd book you on it in a heartbeat:" },
    { id: 'ask_clients', text: "Your clients are joining BookNStyle. I just did. Claim your booking link so we can book you there:" },
  ];
  const PRO_INVITE_FALLBACK = 'https://booknstyle.com/waitlist?role=pro&utm_source=client_invite';

  // What each app button says after it shares the story image (or saves it,
  // where the browser can't share files) and copies the link. None of these
  // apps takes a link from a website, so the person adds it in the app.
  const APP_HINTS = {
    instagram: 'Add the image to your Instagram story, then paste your link with the Link sticker.',
    tiktok: 'Post the image on TikTok, then paste your link in the caption or comments.',
    snapchat: 'Add the image to a Snap, then paste your link with the Link tool.',
  };

  // ref: a friend's code from ?ref=; mine: my own code; utm: first visit's
  // tags; key: the manage key this browser got when it joined; state: the
  // last answer, shown at once on a return visit while it refreshes.
  const KEYS = { ref: 'bns_waitlist_ref', mine: 'bns_waitlist_mine', utm: 'bns_waitlist_utm', key: 'bns_waitlist_key', state: 'bns_waitlist_state', ask: 'bns_waitlist_ask', craft: 'bns_waitlist_craft' };
  const CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$/;
  const HANDLE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
  const SOCIAL = /^[a-z0-9._]{1,30}$/;
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const IS_LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const loadedAt = performance.now();
  // After launch main.js (STORE_LINKS filled) shows every data-live-only
  // element. It runs first (both scripts are deferred, in order).
  const isLive = () => { const n = document.querySelector('[data-live-only]'); return !!n && !n.hidden; };

  // localStorage can be missing or throw (private mode, blocked storage).
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const h = (tag, attrs = {}, kids = []) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'text') node.textContent = v;
      else if (v !== null && v !== undefined) node.setAttribute(k, v);
    });
    kids.forEach((c) => node.append(c));
    return node;
  };
  const icon = (id) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id);
    svg.append(use);
    return svg;
  };

  const form = $('[data-wl-form]');
  const success = $('[data-wl-success]');
  if (!form || !success) return;

  const params = new URLSearchParams(location.search);
  // Form controls by name. (Not el('name'): that is the form's own name attribute.)
  const el = (n) => form.elements.namedItem(n);

  // ---------- Steps ----------
  // Step 1 is the form, with the bar hidden. Steps 2 and 3 show parts of
  // the success view (each piece has a data-wl-slot); 'done' shows all of
  // it, as before the steps.
  // seg: each step's result, '' (not yet), 'done' (champagne, with a check:
  // joined, pros saved or a link held, a copy or share on step 3) or
  // 'skipped' (grey, no check: left with nothing kept). Segments only fill
  // (Back moves the highlight, never the fill); a grey one can still turn
  // champagne. Reset only when "Not you?" starts a new sign-up.
  // showBar: only for a new sign-up in this visit. A return visit sees the
  // whole view with no bar (the page doesn't remember what was shared, so
  // it can't say step 3 was done).
  const STEP_LABELS = { client: ['Join', 'Your pro', 'Friends'], pro: ['Join', 'Booking link', 'Your clients'] };
  const STEP_TITLE = { client: 'Invite your friends', pro: 'Tell your clients' };
  const STEP_SLOTS = {
    client: { 2: ['head', 'kicker', 'pros', 'nav'], 3: ['kicker', 'step3', 'reward', 'share', 'story', 'nav'] },
    both: { 2: ['head', 'kicker', 'pros', 'nav'], 3: ['kicker', 'step3', 'reward', 'share', 'story', 'nav'] },
    pro: { 2: ['head', 'kicker', 'claimed', 'probadge', 'nav'], 3: ['kicker', 'step3', 'share', 'kit', 'proinvite', 'nav'] },
  };
  let step = 1; // 1, 2, 3 or 'done'
  let seg = ['', '', ''];
  let showBar = false;
  let acted3 = false; // copied or shared on step 3: the quiet Done turns gold
  const flow = (role) => (role === 'pro' ? 'pro' : role === 'both' ? 'both' : 'client');
  const labelsFor = (role) => STEP_LABELS[role === 'pro' ? 'pro' : 'client'];
  const stepsBar = $('[data-wl-steps-bar]');
  const passed = () => seg.filter(Boolean).length;

  // ---------- Talking to the server (a local mock with ?mock on localhost) ----------
  const MOCK = IS_LOCAL && params.has('mock');
  async function post(body) {
    if (MOCK) return mockPost(body);
    const resp = await fetch(JOIN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: resp.ok, status: resp.status, data: await resp.json().catch(() => null) };
  }
  async function info(query) {
    if (MOCK) return mockInfo(query);
    const resp = await fetch(INFO_URL + '?' + query);
    return { ok: resp.ok, status: resp.status, data: await resp.json().catch(() => null) };
  }

  // ---------- The ?ref= code: remembered, sent with the next new sign-up ----------
  const mine = store.get(KEYS.mine);
  const urlRef = (params.get('ref') || '').trim().toUpperCase();
  if (CODE.test(urlRef) && urlRef !== mine) store.set(KEYS.ref, urlRef);
  const savedRef = store.get(KEYS.ref);
  const refField = $('[data-wl-ref]');
  refField.value = (CODE.test(urlRef) && urlRef !== mine ? urlRef : (savedRef && CODE.test(savedRef) && savedRef !== mine ? savedRef : ''));

  // A pro who opened a client's "Message your pro" link (?ref=CODE&role=pro):
  // say why they're here. Before launch only (it talks about launch).
  const proHook = $('[data-wl-pro-hook]');
  if (proHook && CODE.test(urlRef) && urlRef !== mine && (params.get('role') || '').toLowerCase() === 'pro' && !isLive()) {
    proHook.hidden = false;
  }

  // A client who tapped "Join the list" on a pro's page (app.booknstyle.com/book/name
  // sends utm_source=pro_link&utm_campaign=<name>): say whose list they're joining (R6).
  const clientHook = $('[data-wl-client-hook]');
  const fromProLink = (params.get('utm_source') || '') === 'pro_link' ? (params.get('utm_campaign') || '').toLowerCase() : '';
  if (clientHook && HANDLE.test(fromProLink) && !isLive()) {
    $('[data-wl-client-hook-handle]').textContent = fromProLink;
    clientHook.hidden = false;
  }

  // ---------- UTM tags: the first visit's, kept for a later sign-up ----------
  let utm = null;
  const fromUrl = {};
  UTM_KEYS.forEach((k) => { const v = params.get(k); if (v) fromUrl[k] = v.slice(0, 100); });
  if (Object.keys(fromUrl).length) {
    utm = fromUrl;
    store.set(KEYS.utm, JSON.stringify(fromUrl));
  } else {
    try { utm = JSON.parse(store.get(KEYS.utm) || 'null'); } catch { utm = null; }
  }

  // ---------- Live counter: only when the server says the number is worth showing ----------
  (async () => {
    try {
      const r = await info('count=1');
      const total = r.ok && r.data ? r.data.total : null;
      if (Number.isInteger(total) && total > 0 && !isLive()) {
        $('[data-wl-total]').textContent = total.toLocaleString('en-US');
        $('[data-wl-counter]').hidden = false;
      }
    } catch { /* no counter */ }
  })();

  // ---------- Booking link: clean as you type, preview, check when you pause ----------
  // "Jane's Hair Studio" -> "janes-hair-studio" (as generate_pro_handle does).
  const slugify = (s) => String(s || '').toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 30).replace(/-+$/, '');
  const tidyHandle = (s) => String(s || '').toLowerCase().replace(/^@+/, '').replace(/[\s_.]+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30);
  const formatProblem = (v) => {
    if (v.length < 3) return 'Use at least 3 characters.';
    if (!HANDLE.test(v)) return 'Start and end with a letter or number.';
    return '';
  };
  const checkCache = new Map();

  // One availability checker per input (the form, and the "Change link" box).
  // own(): the link this pro already holds. It is never sent to the server
  // (which, with no key, counts it as taken): it shows as "This is your link".
  function linkChecker(input, statusEl, preview, onChange, own = () => '') {
    let timer = 0;
    let seq = 0;
    const state = { value: '', status: '' }; // status: '', 'format', 'checking', 'own', 'available', 'taken', 'error'
    const show = (kind, text) => {
      statusEl.textContent = '';
      statusEl.removeAttribute('data-state');
      if (!text) return;
      if (kind === 'ok') { statusEl.dataset.state = 'ok'; statusEl.append(icon('i-check')); }
      if (kind === 'bad') statusEl.dataset.state = 'bad';
      statusEl.append(document.createTextNode(text));
    };
    const run = async (value, mySeq) => {
      let answer = checkCache.get(value);
      if (!answer) {
        try {
          const r = await info('handle=' + encodeURIComponent(value));
          if (r.status === 429) { if (mySeq === seq) { state.status = 'error'; show('', ''); } return; }
          if (!r.ok || !r.data || !r.data.status) throw new Error('check failed');
          answer = { available: r.data.available === true, message: r.data.message || '' };
          checkCache.set(value, answer);
        } catch {
          if (mySeq === seq) { state.status = 'error'; show('', ''); }
          return;
        }
      }
      if (mySeq !== seq) return;
      state.status = answer.available ? 'available' : 'taken';
      state.message = answer.message;
      if (answer.available) show('ok', 'Available. It can be yours.');
      else show('bad', answer.message || 'That link is taken. Please try another.');
      if (onChange) onChange(state);
    };
    const update = () => {
      const tidy = tidyHandle(input.value);
      if (tidy !== input.value) {
        const at = input.selectionStart;
        input.value = tidy;
        try { input.setSelectionRange(Math.min(at, tidy.length), Math.min(at, tidy.length)); } catch { /* ignore */ }
      }
      state.value = tidy;
      if (preview) preview.textContent = tidy || 'yourname';
      clearTimeout(timer);
      seq += 1;
      if (!tidy) { state.status = ''; show('', ''); if (onChange) onChange(state); return; }
      const problem = formatProblem(tidy);
      if (problem) {
        state.status = 'format';
        state.message = problem;
        // Short while typing: only say so after a pause.
        show('', '');
        const mySeq = seq;
        timer = setTimeout(() => { if (mySeq === seq) show('bad', problem); }, 900);
        if (onChange) onChange(state);
        return;
      }
      if (own() && tidy === own()) {
        state.status = 'own';
        state.message = '';
        show('ok', 'This is your link now.');
        if (onChange) onChange(state);
        return;
      }
      state.status = 'checking';
      show('', 'Checking...');
      const mySeq = seq;
      timer = setTimeout(() => run(tidy, mySeq), CHECK_DELAY_MS);
      if (onChange) onChange(state);
    };
    input.addEventListener('input', () => { input.dataset.touched = '1'; update(); });
    return { state, update, set(v) { input.value = v; update(); } };
  }

  const handleInput = el('reserved_handle');
  const handlePreview = $('[data-wl-handle-preview]');
  // A link suggested from the name (the pro never typed it). If it's taken,
  // try name-2 up to name-5 (as the app does), then leave the box empty: a
  // suggestion must never block joining.
  const MAX_SUGGEST_TRIES = 5;
  let suggestBase = '';
  let suggestTry = 1;
  const suffixed = (base, n) => base.slice(0, 29 - String(n).length).replace(/-+$/, '') + '-' + n;
  const untouched = () => !handleInput.dataset.touched;
  const handleCheck = linkChecker(handleInput, $('[data-wl-handle-status]'), handlePreview, (st) => {
    clearError('reserved_handle');
    if (!untouched() || !suggestBase || st.status !== 'taken') return;
    if (suggestTry < MAX_SUGGEST_TRIES) {
      suggestTry += 1;
      handleCheck.set(suffixed(suggestBase, suggestTry));
    } else {
      suggestBase = '';
      handleCheck.set('');
    }
  });
  const suggest = (s) => { suggestBase = s; suggestTry = 1; handleCheck.set(s); };

  // Suggest a link from the name until the pro types their own.
  el('name').addEventListener('input', () => {
    if (handleInput.dataset.touched || proWrap.hidden) return;
    const s = slugify(el('name').value);
    if (s.length >= 3 && s !== suggestBase) suggest(s);
    if (s.length < 3 && handleInput.value) { suggestBase = ''; handleCheck.set(''); }
  });

  // ---------- Who's your pro: rows of [Instagram|TikTok] @handle ----------
  function nomRow(first) {
    const select = h('select', { 'aria-label': 'Where they post' }, [
      h('option', { value: 'instagram', text: 'Instagram' }),
      h('option', { value: 'tiktok', text: 'TikTok' }),
    ]);
    const input = h('input', {
      type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: '60',
      placeholder: 'theirhandle', 'aria-label': "Your pro's handle",
    });
    // "@" is shown in front already: drop a typed one.
    input.addEventListener('input', () => { if (input.value.startsWith('@')) input.value = input.value.replace(/^@+/, ''); });
    const box = h('div', { class: 'wl-prefix' }, [h('span', { 'aria-hidden': 'true', text: '@' }), input]);
    const row = h('div', { class: 'wl-nom' }, [select, box]);
    if (!first) {
      const remove = h('button', { class: 'wl-nom__remove', type: 'button', 'aria-label': 'Remove this pro' }, [icon('i-x')]);
      remove.addEventListener('click', () => {
        const list = row.parentElement;
        row.remove();
        list.dispatchEvent(new Event('wl-change'));
        const last = $$('input', list).pop();
        if (last) last.focus();
      });
      box.append(remove);
    }
    return row;
  }
  function nomList(list, addBtn, errId) {
    const sync = () => { addBtn.hidden = $$('.wl-nom', list).length >= MAX_NOMINATIONS; };
    list.addEventListener('wl-change', sync);
    list.addEventListener('input', () => clearNomError(list, errId));
    addBtn.addEventListener('click', () => {
      if ($$('.wl-nom', list).length >= MAX_NOMINATIONS) return;
      const row = nomRow(false);
      list.append(row);
      sync();
      $('input', row).focus();
    });
    list.replaceChildren(nomRow(true));
    sync();
    return {
      read() {
        const out = [];
        let bad = '';
        $$('.wl-nom', list).forEach((row) => {
          const raw = $('input', row).value.trim();
          if (!raw) return;
          let platform = $('select', row).value;
          let handle = raw;
          const m = raw.match(/^(?:https?:\/\/)?(?:www\.|m\.)?(instagram\.com|tiktok\.com)\/@?([^/?#\s]+)/i);
          if (m) { platform = m[1].toLowerCase().startsWith('tiktok') ? 'tiktok' : 'instagram'; handle = m[2]; }
          handle = handle.replace(/^@+/, '').toLowerCase();
          if (!SOCIAL.test(handle)) { bad = bad || '@' + handle.slice(0, 30); return; }
          if (!out.some((n) => n.handle === handle)) out.push({ platform, handle });
        });
        return { list: out.slice(0, MAX_NOMINATIONS), bad };
      },
      reset() { list.replaceChildren(nomRow(true)); sync(); },
    };
  }
  function clearNomError(list, errId) {
    const msg = document.getElementById(errId);
    if (msg) { msg.textContent = ''; msg.hidden = true; }
    $$('input', list).forEach((i) => i.removeAttribute('aria-invalid'));
  }
  // (The first form no longer asks "Who's your pro?": that is step 2, saved
  // with the late panel's update call below.)

  // ---------- Role: pro extras for pros ----------
  const proWrap = $('[data-wl-pro]');
  // Their own Instagram or TikTok: pros and both only. The daily summary of
  // named pros checks it (migration 056); nothing reads a client's.
  const socialField = $('[data-wl-social]');
  const roleInputs = $$('input[name="role"]', form);
  const currentRole = () => (roleInputs.find((r) => r.checked) || {}).value;
  const syncRole = () => {
    const role = currentRole();
    const isPro = role === 'pro' || role === 'both';
    proWrap.hidden = !isPro;
    socialField.hidden = !isPro;
    if (step === 1) paintSteps(role);
    if (!isPro) { el('specialty').value = ''; el('social_handle').value = ''; clearError('social_handle'); if (licenseNote) licenseNote.hidden = true; }
    else if (!handleInput.value && !handleInput.dataset.touched) {
      const s = slugify(el('name').value);
      if (s.length >= 3) suggest(s);
    }
  };
  const pickRole = (value) => {
    const input = roleInputs.find((r) => r.value === value);
    if (input) { input.checked = true; syncRole(); }
  };
  roleInputs.forEach((r) => r.addEventListener('change', () => { syncRole(); clearError('role'); }));
  // Massage and tattoo open after a quick license check (R4).
  const licenseNote = $('[data-wl-license]');
  const syncLicense = () => { licenseNote.hidden = !['massage_therapist', 'tattoo_artist'].includes(el('specialty').value); };
  el('specialty').addEventListener('change', syncLicense);
  // The first syncRole() runs below, after the error helpers exist (it can
  // start a link check, whose callback clears an error).

  // ---------- Region, from the ZIP ----------
  // Open nationwide (Oct 30 2026): the "I live outside New York" box and the
  // city field are gone. The page still sends outside_ny (true for a US ZIP
  // outside New York State) so waitlist-join, which is unchanged, keeps
  // filling region the same way. Same rule as isNyZip() on the server.
  // New York State ZIPs: 005, 100 to 149, and 06390.
  const nyZip = (z) => { const p = Number(z.slice(0, 3)); return (p >= 100 && p <= 149) || ['00501', '00544', '06390'].includes(z.slice(0, 5)); };
  const localRegion = () => {
    const m = el('zip_or_area').value.trim().match(/^(\d{5})(?:-\d{4})?$/);
    return m ? (nyZip(m[1]) ? 'ny' : 'outside_ny') : null;
  };

  // ---------- Errors ----------
  const FIELD_INPUT = {
    name: () => el('name'),
    email: () => el('email'),
    role: () => roleInputs[0],
    specialty: () => el('specialty'),
    zip_or_area: () => el('zip_or_area'),
    social_handle: () => el('social_handle'),
    reserved_handle: () => handleInput,
    consent: () => el('consent'),
  };
  const ERROR_ID = {
    name: 'wl-name-err', email: 'wl-email-err', role: 'wl-role-err', specialty: 'wl-specialty-err',
    zip_or_area: 'wl-zip-err', social_handle: 'wl-social-err', reserved_handle: 'wl-handle-err',
    consent: 'wl-consent-err',
  };
  const formError = $('[data-wl-form-error]');

  function showError(field, message) {
    const msg = document.getElementById(ERROR_ID[field]);
    if (msg) { msg.textContent = message; msg.hidden = false; }
    if (field === 'role') {
      $('.wl-choices', form).setAttribute('data-invalid', '');
      roleInputs.forEach((r) => r.setAttribute('aria-invalid', 'true'));
    } else {
      const input = FIELD_INPUT[field] && FIELD_INPUT[field]();
      if (input) input.setAttribute('aria-invalid', 'true');
    }
    if (field === 'reserved_handle') { const st = $('[data-wl-handle-status]'); st.textContent = ''; st.removeAttribute('data-state'); }
  }
  function clearError(field) {
    const msg = document.getElementById(ERROR_ID[field]);
    if (msg) { msg.textContent = ''; msg.hidden = true; }
    if (field === 'role') {
      $('.wl-choices', form).removeAttribute('data-invalid');
      roleInputs.forEach((r) => r.removeAttribute('aria-invalid'));
    } else {
      const input = FIELD_INPUT[field] && FIELD_INPUT[field]();
      if (input) input.removeAttribute('aria-invalid');
    }
  }
  const clearAll = () => { Object.keys(ERROR_ID).forEach(clearError); formError.hidden = true; formError.textContent = ''; };
  ['name', 'email', 'zip_or_area', 'social_handle', 'specialty'].forEach((f) => {
    FIELD_INPUT[f]().addEventListener('input', () => clearError(f));
  });
  el('consent').addEventListener('change', () => clearError('consent'));

  // Now the role from ?role= (the home page's "Claim your booking link"),
  // or the one the browser restored.
  const urlRole = (params.get('role') || '').toLowerCase();
  if (['client', 'pro', 'both'].includes(urlRole)) pickRole(urlRole);
  $$('[data-wl-pick-role]').forEach((a) => a.addEventListener('click', () => {
    if (!success.hidden) return;
    pickRole(a.dataset.wlPickRole);
  }));
  syncRole();

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function validate(role) {
    const errors = [];
    if (!el('name').value.trim()) errors.push(['name', 'Please enter your name.']);
    const email = el('email').value.trim();
    if (!email) errors.push(['email', 'Please enter your email.']);
    else if (!EMAIL.test(email)) errors.push(['email', "That email doesn't look right. Please check it."]);
    if (!role) errors.push(['role', 'Please choose pro, client, or both.']);
    if (role === 'pro' || role === 'both') {
      const st = handleCheck.state;
      // Only a link the pro typed can stop the form (a suggestion is dropped).
      if (st.value && !untouched() && (st.status === 'format' || st.status === 'taken')) {
        errors.push(['reserved_handle', st.message || 'Please pick another link.']);
      }
    }
    const handle = (role === 'pro' || role === 'both') ? el('social_handle').value.trim().replace(/^@+/, '') : '';
    if (handle && !/^[A-Za-z0-9._]{1,30}$/.test(handle) && !/(instagram|tiktok)\.com\//i.test(handle)) {
      errors.push(['social_handle', 'Letters, numbers, dots and underscores only.']);
    }
    if (!el('consent').checked) errors.push(['consent', 'Please tick the box so we can email you about the launch.']);
    return errors;
  }

  // The link to send: what the pro typed, or a suggestion that is free (or
  // still being checked; the server has the last word, see the retry below).
  const linkToSend = () => {
    const st = handleCheck.state;
    if (!st.value) return null;
    if (!untouched()) return st.value;
    return st.status === 'available' || st.status === 'checking' ? st.value : null;
  };

  // ---------- Submit ----------
  const submitBtn = $('[data-wl-submit]');
  const submitLabel = $('[data-wl-submit-label]');
  let busy = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    clearAll();
    const role = currentRole();
    const errors = validate(role);
    if (errors.length) {
      errors.forEach(([f, m]) => showError(f, m));
      const first = FIELD_INPUT[errors[0][0]]();
      if (first) first.focus();
      return;
    }

    const isPro = role === 'pro' || role === 'both';
    const payload = {
      action: 'join',
      name: el('name').value.trim(),
      email: el('email').value.trim(),
      role,
      specialty: isPro ? (el('specialty').value || null) : null,
      reserved_handle: isPro ? linkToSend() : null,
      // Named in step 2 now (an 'update' with this sign-up's key), so the
      // join itself always sends none, as it did when that box was left empty.
      nominations: [],
      zip_or_area: el('zip_or_area').value.trim() || null,
      outside_ny: localRegion() === 'outside_ny',
      city: null,
      social_handle: isPro ? (el('social_handle').value.trim() || null) : null,
      consent: el('consent').checked === true,
      ref: refField.value || null,
      utm,
      referrer: document.referrer || null,
      manage_token: store.get(KEYS.key) || null,
      website: el('website').value,
      elapsed_ms: Math.round(performance.now() - loadedAt),
    };

    // The kit opens on this craft (only this browser keeps it; the server isn't asked).
    if (isPro && el('specialty').value) store.set(KEYS.craft, el('specialty').value);

    busy = true;
    submitBtn.setAttribute('aria-busy', 'true');
    submitBtn.disabled = true;
    submitLabel.textContent = 'Joining...';
    try {
      let { ok, data } = await post(payload);
      // The suggested link turned out to be taken (or still checking): join
      // without it. The pro can claim one from the success panel.
      if (!ok && data && data.field === 'reserved_handle' && payload.reserved_handle && untouched()) {
        payload.reserved_handle = null;
        ({ ok, data } = await post(payload));
      }
      if (ok && data && data.referral_code) {
        showSuccess(data, { role, region: localRegion(), fromForm: true });
        return;
      }
      if (data && data.field && ERROR_ID[data.field]) {
        showError(data.field, data.error || 'Please check this field.');
        const input = FIELD_INPUT[data.field]();
        if (input) input.focus();
      } else {
        formError.textContent = (data && data.error) || "We couldn't add you just now. Please try again in a minute.";
        formError.hidden = false;
      }
    } catch {
      formError.textContent = "We couldn't reach BookNStyle. Check your connection and try again.";
      formError.hidden = false;
    } finally {
      busy = false;
      submitBtn.removeAttribute('aria-busy');
      submitBtn.disabled = false;
      submitLabel.textContent = 'Join the waitlist';
    }
  });

  // ---------- Success ----------
  const status = $('[data-wl-status]');
  // Step 2 hides the share box (and its status line): it has its own.
  const stepStatus = $('[data-wl-step-status]');
  let statusTimer = 0;
  const say = (msg) => {
    const target = $('.wl-sharebox').hasAttribute('data-wl-off') ? stepStatus : status;
    status.textContent = '';
    stepStatus.textContent = '';
    target.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = ''; stepStatus.textContent = ''; }, 6000);
  };

  async function copy(text, fallbackInput) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // The link box shows the link without "https://"; put the full one in
      // for the old-style copy, then put the short one back.
      const input = fallbackInput || $('[data-wl-link]');
      const shown = input.value;
      if (!fallbackInput) input.value = text;
      input.focus();
      input.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch {}
      if (!fallbackInput) input.value = shown;
      return ok;
    }
  }

  // Copies any text (the kit's text and bio line, the pro invite link). If the
  // clipboard API is refused, the old-style copy from a box off screen.
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const box = h('textarea', { readonly: '', 'aria-hidden': 'true', style: 'position:fixed;top:0;left:-9999px;opacity:0' });
      box.value = text;
      document.body.append(box);
      box.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch {}
      box.remove();
      return ok;
    }
  }

  let current = null; // the answer on screen, plus what the page knows locally
  // The manage key, also kept in memory for this visit: with storage blocked
  // a new sign-up can still name pros or claim a link in step 2.
  let memKey = null;
  const myKey = () => store.get(KEYS.key) || memKey;
  const isOwner = () => !!(current && current.owner && myKey());

  function showSuccess(data, local = {}) {
    const role = data.role || local.role || 'client';
    const isPro = role === 'pro' || role === 'both';
    const isClient = role === 'client' || role === 'both';
    const code = String(data.referral_code || '').toUpperCase();
    const url = data.share_url || `https://booknstyle.com/waitlist/?ref=${encodeURIComponent(code)}`;
    current = { ...data, role, share_url: url, region: data.region || local.region || null, city: data.city || local.city || null };

    if (CODE.test(code)) {
      store.set(KEYS.mine, code);
      store.del(KEYS.ref);
    }
    if (data.manage_token) { store.set(KEYS.key, data.manage_token); memKey = data.manage_token; }
    if (data.owner && store.get(KEYS.key)) {
      // Kept so a return visit shows this at once. No email, no key.
      const { manage_token: _drop, ...keep } = current;
      store.set(KEYS.state, JSON.stringify(keep));
    }

    // Headline and lead
    const returning = !!data.already_joined;
    // Steps: a new sign-up from the form goes on to step 2 (step 1 done).
    // Anyone else (a return visit, an email already on the list) sees the
    // whole view, as before. An update keeps the step it was on.
    const wasHidden = success.hidden;
    if (wasHidden) {
      const fresh = local.fromForm && !returning && isOwner();
      step = fresh ? 2 : 'done';
      seg = fresh ? ['done', '', ''] : ['', '', ''];
      showBar = fresh;
      acted3 = false;
      skipSaveTried = false;
    }
    $('[data-wl-eyebrow]').textContent = returning ? 'Welcome back' : "You're on the list";
    let lead = local.fromStorage
      ? "Here's your link and your progress."
      : returning
        ? (data.owner ? "You're already on the list. Here's your link and your progress." : "You're already on the list. Here's your share link.")
        : 'Check your inbox for a welcome email.';
    // Joining again never re-subscribes anyone (anyone can type an address).
    if (returning && data.unsubscribed === true) {
      lead += ' You unsubscribed from our emails earlier. To get launch news again, use Resubscribe on the page linked in your email.';
    }
    $('[data-wl-lead]').textContent = lead;

    renderClaimed(isPro);
    renderAsk(isClient);
    renderBadges(isPro, isClient);

    // Share link and buttons
    // Shown without "https://" so the whole code fits; Copy and the share
    // buttons always use the full link. A pro (not "both", who has the
    // friends reward) shares their own held page with their regulars; with
    // no link claimed yet, their waitlist link for clients.
    const proOnly = role === 'pro';
    const shareUrl = proOnly ? clientLinkFor(current) : url;
    $('[data-wl-link]').value = shareUrl.replace(/^https?:\/\//, '');
    $('label[for="wl-link"]').textContent = proOnly && current.reserved_handle ? 'Your booking link' : 'Your link';
    const text = proOnly ? SHARE_TEXT.pro : SHARE_TEXT.client;
    // X and Facebook have web share pages. (Facebook takes only the link; the
    // page's Open Graph tags give the picture and title.)
    $('[data-wl-share="x"]').href = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    $('[data-wl-share="facebook"]').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    const nativeItem = $('[data-wl-native]');
    const shareData = { title: proOnly ? 'BookNStyle' : 'BookNStyle waitlist', text, url: shareUrl };
    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      nativeItem.hidden = false;
      $('[data-wl-share-native]').onclick = async () => {
        try { await navigator.share(shareData); } catch { /* closed the share sheet */ }
      };
    }
    $('[data-wl-copy]').onclick = async () => {
      say((await copy(shareUrl)) ? 'Link copied.' : 'Press and hold the link to copy it.');
    };
    // Instagram, TikTok and Snapchat: no web share links. Copy the link and
    // hand over the story image (the phone's share sheet lists the apps), or
    // save it where the browser can't share files.
    $$('[data-wl-share-app]').forEach((btn) => {
      btn.onclick = () => shareToApp(btn.dataset.wlShareApp, shareUrl, proOnly);
    });

    // Pros get the kit instead of the "I'm in." story image (a drawing still
    // under way is dropped).
    if (!proOnly) prepareStory(); else { storySeq += 1; $('.wl-story').hidden = true; }
    renderKit(isPro);
    renderProInvite(isPro);
    $('[data-wl-reset]').hidden = !local.fromStorage;

    form.hidden = true;
    success.hidden = false;
    applyStep();
    if (wasHidden && !local.fromStorage) {
      bringCardIntoView();
      $('[data-wl-done]').focus({ preventScroll: true });
    }
  }

  function bringCardIntoView() {
    const card = $('[data-wl-card]');
    const top = card.getBoundingClientRect().top;
    // Phones and tablets: bring the result to the top. Desktop: only if it's off screen.
    if (top < 0 || (window.innerWidth < 960 && top > 100) || top > window.innerHeight * 0.6) {
      card.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  // ---------- Steps (the state is declared near the top) ----------
  function paintSteps(role) {
    const labels = labelsFor(role);
    const here = step === 'done' ? 0 : step;
    $$('[data-wl-step-label]').forEach((li, i) => {
      $('span', li).textContent = labels[i];
      li.dataset.state = seg[i];
      li.toggleAttribute('data-here', i + 1 === here);
    });
    $$('[data-wl-seg]').forEach((node, i) => {
      node.dataset.state = seg[i];
      node.toggleAttribute('data-here', i + 1 === here);
    });
    // The top line counts the steps passed; the step's own heading says
    // which step this is ("Step 2 of 3, Your pro").
    const n = passed();
    const count = n === 3 ? 'All done' : `${n} of 3 done`;
    $('[data-wl-steps-count]').textContent = count;
    stepsBar.setAttribute('aria-valuenow', String(n));
    const skipped = labels.filter((_, i) => seg[i] === 'skipped');
    const note = skipped.length ? ` ${skipped.join(' and ')} skipped.` : '';
    stepsBar.setAttribute('aria-valuetext', step === 'done' || step === 1
      ? `${count}.${note}`
      : `Step ${step} of 3, ${labels[step - 1]}. ${count}.${note}`);
  }
  // After Done: one line under the bar. "Your link is held" only when it is.
  function allSetText() {
    const held = !!(current && (current.role === 'pro' || current.role === 'both') && current.reserved_handle && !current.handle_applied);
    if (isLive()) return held ? 'All set. Your link is held.' : 'All set.';
    if (held) return "All set. Your link is held. We'll email you the day BookNStyle is out.";
    return current && current.role === 'pro'
      ? "All set. We'll email you the day BookNStyle is out."
      : "All set. We'll email you the moment BookNStyle is out.";
  }
  // Something to keep on this step: Next instead of Skip.
  const stepHasResult = () => {
    if (step === 3) return acted3;
    if (!current) return false;
    if (flow(current.role) === 'pro') return !!current.reserved_handle;
    return !$('[data-wl-ask]').hidden;
  };
  function applyStep() {
    const role = current ? current.role : currentRole();
    // Something kept fills the step at once: a pro who claimed a link on
    // step 1 lands on "2 of 3 done", a copy or share fills step 3.
    if (step === 2 && stepHasResult()) seg[1] = 'done';
    if (step === 3 && acted3) seg[2] = 'done';
    $('[data-wl-steps]').hidden = !showBar;
    paintSteps(role);
    const allSet = $('[data-wl-allset]');
    allSet.hidden = !(showBar && step === 'done');
    allSet.textContent = allSet.hidden ? '' : allSetText();
    const kicker = $('[data-wl-step-kicker]');
    kicker.hidden = step !== 2 && step !== 3;
    kicker.textContent = kicker.hidden ? '' : `Step ${step} of 3, ${labelsFor(role)[step - 1]}`;
    const show = step === 2 || step === 3 ? STEP_SLOTS[flow(role)][step] : null;
    $$('[data-wl-slot]', success).forEach((n) => n.toggleAttribute('data-wl-off', !!show && !show.includes(n.dataset.wlSlot)));
    const title = $('[data-wl-step-title]');
    title.hidden = step !== 3;
    title.textContent = STEP_TITLE[role === 'pro' ? 'pro' : 'client'];
    const nav = $('[data-wl-stepnav]');
    nav.hidden = !show;
    $('[data-wl-step-status]').hidden = !show;
    if (!show) return;
    const result = stepHasResult();
    $('[data-wl-back]').hidden = step !== 3;
    $('[data-wl-skip]').hidden = result;
    $('[data-wl-skip]').textContent = step === 3 ? 'Done' : 'Skip';
    $('[data-wl-next]').hidden = !result;
    $('[data-wl-next-label]').textContent = step === 3 ? 'Done' : 'Next';
  }
  function goStep(to) {
    // Moving on with nothing kept: grey, but passed. (Back fills nothing.)
    if (to === 3 && !seg[1]) seg[1] = 'skipped';
    if (to === 'done' && !seg[2]) seg[2] = 'skipped';
    step = to;
    // A message from the last step doesn't belong on this one.
    $$('[data-wl-status], [data-wl-step-status]').forEach((n) => { n.textContent = ''; });
    applyStep();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Array.from(success.children)
        .filter((n) => !n.hidden && !n.hasAttribute('data-wl-off') && n.animate)
        .forEach((n, i) => n.animate(
          [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
          { duration: 520, delay: Math.min(i, 5) * 60, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards' },
        ));
    }
    bringCardIntoView();
    // Focus the step's heading: "You're in." on step 2, the step title on
    // step 3, the "All set" line on the whole view.
    (step === 3 ? $('[data-wl-step-title]') : step === 'done' && showBar ? $('[data-wl-allset]') : $('[data-wl-done]')).focus({ preventScroll: true });
  }
  let skipSaveTried = false;
  $('[data-wl-noms-late]').addEventListener('input', () => { skipSaveTried = false; });
  $('[data-wl-skip]').addEventListener('click', async () => {
    // Pros typed into "Who's your pro?" but not saved yet: Skip saves them
    // instead (the one-page form always sent what was typed) and stays on
    // this step, so the Message @handle cards show up next to Next. Only
    // once: if that save fails (a bad handle, no connection), the next Skip
    // moves on.
    if (step === 2 && !skipSaveTried && !$('[data-wl-nominate-late]').hidden && lateNomsTyped()) {
      skipSaveTried = true;
      await saveLateNoms();
      return;
    }
    goStep(step === 2 ? 3 : 'done');
  });
  $('[data-wl-next]').addEventListener('click', () => goStep(step === 2 ? 3 : 'done'));
  $('[data-wl-back]').addEventListener('click', () => goStep(2));
  // A copy or share on step 3 counts as done (and fills it champagne).
  success.addEventListener('click', (e) => {
    if (step !== 3 || acted3) return;
    const hit = e.target.closest('button, a');
    if (hit && hit.closest('[data-wl-slot="share"], [data-wl-slot="story"], [data-wl-slot="kit"], [data-wl-slot="proinvite"]')
      && !hit.closest('[data-wl-kit-shots]')) { acted3 = true; applyStep(); }
  });

  // ----- Pro: the claimed link -----
  // Same promise as the welcome email and the Privacy Policy (migration 053).
  const HOLD_SIGNUP = 'Sign up in the app as a pro with this email to get it. With Sign in with Apple, choose Share My Email.';
  const HOLD_NOTE = `Held for you until 60 days after launch. ${HOLD_SIGNUP}`;
  const claimed = $('[data-wl-claimed]');
  const linkForm = $('[data-wl-link-form]');
  const linkInput = $('#wl-handle2');
  const linkCheck = linkChecker(linkInput, $('[data-wl-handle2-status]'), null, () => {
    const err = $('#wl-handle2-err'); err.hidden = true; err.textContent = '';
  }, () => (current && current.reserved_handle) || '');
  function renderClaimed(isPro) {
    claimed.hidden = !isPro;
    if (!isPro) return;
    const handle = current.reserved_handle || '';
    const owner = isOwner();
    const view = $('[data-wl-claimed-view]');
    $('[data-wl-claimed-help]').hidden = owner || !current.already_joined;
    if (handle) {
      $('[data-wl-claimed-title]').textContent = 'Your booking link';
      $('[data-wl-claimed-handle]').textContent = handle;
      $('[data-wl-claimed-note]').textContent = current.handle_applied
        ? "It's on your BookNStyle profile. Share it with your clients."
        : current.region === 'outside_ny' && !isLive()
          ? `${LATER_STATE_NOTE} ${HOLD_SIGNUP}`
          : HOLD_NOTE;
      view.hidden = false;
      linkForm.hidden = true;
      $('[data-wl-change-link]').hidden = !owner || current.handle_applied;
    } else if (owner) {
      // Joined without one: claim it here.
      $('[data-wl-claimed-title]').textContent = 'Claim your booking link';
      view.hidden = true;
      linkForm.hidden = false;
      $('[data-wl-link-cancel]').hidden = true;
    } else {
      // Returning by email from another browser: we don't say whether a link is held.
      claimed.hidden = !current.already_joined;
      $('[data-wl-claimed-title]').textContent = 'Your booking link';
      view.hidden = true;
      linkForm.hidden = true;
    }
  }
  $('[data-wl-change-link]').addEventListener('click', () => {
    $('[data-wl-claimed-view]').hidden = true;
    linkForm.hidden = false;
    $('[data-wl-link-cancel]').hidden = false;
    linkCheck.set(current.reserved_handle || '');
    linkInput.focus();
  });
  $('[data-wl-link-cancel]').addEventListener('click', () => renderClaimed(true));
  linkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#wl-handle2-err');
    const st = linkCheck.state;
    if (st.status === 'own') { renderClaimed(true); return; } // nothing to change
    if (!st.value || st.status === 'format' || st.status === 'taken') {
      err.textContent = st.value ? (st.message || 'Please pick another link.') : 'Type the name you want.';
      err.hidden = false;
      linkInput.focus();
      return;
    }
    const btn = $('[data-wl-link-save]');
    btn.disabled = true;
    try {
      const { ok, status: code, data } = await post({ action: 'update', manage_token: myKey(), set_handle: true, reserved_handle: st.value });
      if (ok && data && data.referral_code) {
        // Answers about the old and new names are out of date now.
        checkCache.clear();
        showSuccess({ ...data, already_joined: current.already_joined }, { role: current.role, region: current.region, city: current.city });
        say('Your booking link is saved.');
        return;
      }
      if (code === 404) { forget(); return; }
      err.textContent = (data && data.error) || "We couldn't save that just now. Please try again.";
      err.hidden = false;
    } catch {
      err.textContent = "We couldn't reach BookNStyle. Check your connection and try again.";
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  // ----- Client: let the pros they named know -----
  function pickAskText() {
    let pick = ASK_TEXTS.find((a) => a.id === store.get(KEYS.ask));
    if (!pick) {
      pick = ASK_TEXTS[Math.floor(Math.random() * ASK_TEXTS.length)];
      store.set(KEYS.ask, pick.id);
    }
    return pick;
  }
  // Their pro invite link: the share link with role=pro (as in the welcome
  // email, plus the message's utm_campaign), or the plain pro page if no code
  // is known.
  const proInviteUrl = (id) => {
    const code = String(current.referral_code || '').toUpperCase();
    const base = CODE.test(code) ? current.share_url + (current.share_url.includes('?') ? '&' : '?') + 'role=pro' : PRO_INVITE_FALLBACK;
    return base + '&utm_campaign=' + id;
  };
  // Starts the copy inside the tap, before the profile opens (iOS only lets a
  // page write the clipboard during a tap). If that fails, the old-style copy
  // runs from the message box; the box stays open, selected, only if that
  // fails too, so it can be copied by hand.
  async function copyForPro(msg) {
    const manual = $('[data-wl-ask-manual]');
    const box = $('[data-wl-ask-msg]');
    try {
      await navigator.clipboard.writeText(msg);
      manual.hidden = true;
      return true;
    } catch {
      box.value = msg;
      manual.hidden = false; // a hidden box can't be selected
      box.focus({ preventScroll: true });
      box.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch {}
      manual.hidden = ok;
      return ok;
    }
  }
  function proCard(n, msg) {
    const tiktok = n.platform === 'tiktok';
    const where = tiktok ? 'TikTok' : 'Instagram';
    const profile = tiktok ? `https://www.tiktok.com/@${n.handle}` : `https://www.instagram.com/${n.handle}/`;
    const note = h('p', { class: 'wl-status wl-pro__status', role: 'status', 'aria-live': 'polite' });
    // A plain link, not window.open: Instagram's in-app browser blocks
    // pop-ups. The copy runs in its click, with no preventDefault, so the
    // profile still opens.
    const open = h('a', { class: 'btn btn--gold btn--sm wl-pro__msg', href: profile, target: '_blank', rel: 'noopener' }, [
      icon('i-send'), h('span', { text: 'Message @' + n.handle }), h('span', { class: 'wl-sr', text: `, copies a message and opens their ${where} profile` }),
    ]);
    open.addEventListener('click', async () => {
      $$('.wl-pro__status', $('[data-wl-ask-list]')).forEach((s) => { s.textContent = ''; });
      note.textContent = (await copyForPro(msg))
        ? 'Message copied. Tap Message on their profile and paste it.'
        : 'Copy the message below, then tap Message on their profile and paste it.';
    });
    const actions = h('div', { class: 'wl-pro__actions' }, [open]);
    const data = { text: msg };
    // Text messages, WhatsApp and the rest: the phone's share sheet.
    if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
      const share = h('button', { class: 'wl-share__btn wl-pro__share', type: 'button', 'aria-label': `Share the message for @${n.handle}` }, [icon('i-share'), h('span', { text: 'Share' })]);
      share.addEventListener('click', async () => { try { await navigator.share(data); } catch { /* closed */ } });
      actions.append(share);
    }
    return h('li', { class: 'wl-pro' }, [
      h('span', { class: 'wl-pro__who' }, [h('strong', { text: '@' + n.handle }), h('small', { text: where })]),
      actions,
      note,
    ]);
  }
  const lateNoms = nomList($('[data-wl-noms-late]'), $('[data-wl-add-nom-late]'), 'wl-noms-late-err');
  function renderAsk(isClient) {
    const list = (Array.isArray(current.nominations) ? current.nominations : []).filter((n) => n && SOCIAL.test(n.handle || ''));
    const ask = $('[data-wl-ask]');
    const late = $('[data-wl-nominate-late]');
    ask.hidden = !isClient || !list.length;
    late.hidden = !isClient || list.length > 0 || !isOwner();
    if (!isClient) return;
    const askText = pickAskText();
    const msg = `${askText.text} ${proInviteUrl(askText.id)}`;
    $('[data-wl-ask-msg]').value = msg;
    $('[data-wl-ask-manual]').hidden = true;
    $('[data-wl-ask-list]').replaceChildren(...list.map((n) => proCard(n, msg)));
  }
  // Any handle typed into the step 2 boxes (saved or not).
  const lateNomsTyped = () => $$('input', $('[data-wl-noms-late]')).some((i) => i.value.trim());
  // Saves the step 2 pros (the Save button, or Skip with handles typed).
  let savingNoms = false;
  async function saveLateNoms() {
    if (savingNoms) return;
    const err = $('#wl-noms-late-err');
    const n = lateNoms.read();
    if (n.bad || !n.list.length) {
      err.textContent = n.bad ? `Check ${n.bad}. Handles use letters, numbers, dots and underscores only.` : "Add your pro's Instagram or TikTok handle.";
      err.hidden = false;
      return;
    }
    savingNoms = true;
    try {
      const { ok, status: code, data } = await post({ action: 'update', manage_token: myKey(), nominations: n.list });
      if (ok && data && data.referral_code) {
        showSuccess({ ...data, already_joined: current.already_joined }, { role: current.role, region: current.region, city: current.city });
        say('Thanks. Now let them know.');
        // The late panel is gone now: keep focus with their new cards.
        if (!$('[data-wl-ask]').hidden) $('#wl-ask-title').focus();
        return;
      }
      if (code === 404) { forget(); return; }
      err.textContent = (data && data.error) || "We couldn't save that just now. Please try again.";
      err.hidden = false;
    } catch {
      err.textContent = "We couldn't reach BookNStyle. Check your connection and try again.";
      err.hidden = false;
    } finally {
      savingNoms = false;
    }
  }
  $('[data-wl-nom-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    saveLateNoms();
  });

  // ----- Founding badges and the client reward (never a place in line) -----
  // Founding Pro: every pro (pro or both) who joins here. Founding Member:
  // every client (client or both) who joins here. Both are earned on joining.
  // Clients also see "N of 3 friends joined": at 3, their first booking fee
  // is on us once they sign up in the app with this email (migration 053).
  // Joined from another browser (typed the email, owner false): no badges or
  // progress here, since the answer says nothing about that sign-up.
  function renderBadges(isPro, isClient) {
    const known = current.owner === true && Number.isInteger(current.referral_count);
    $('[data-wl-pro-badge]').hidden = !(isPro && known && current.founding_pro !== false);
    $('[data-wl-member-badge]').hidden = !(isClient && known && current.founding_member !== false);

    const panel = $('[data-wl-reward]');
    panel.hidden = !isClient;
    if (!isClient) return;
    const goal = Number.isInteger(current.milestone) && current.milestone > 0 ? current.milestone : MILESTONE;
    const count = known ? Math.max(0, current.referral_count) : 0;
    const done = known && (current.reward_earned === true || count >= goal);
    const granted = known && current.reward_granted === true;
    const bar = $('[data-wl-progress]');
    const countText = $('[data-wl-progress-text]');
    const note = $('[data-wl-reward-note]');
    $$('[data-wl-milestone]').forEach((n) => { n.textContent = String(goal); });
    bar.setAttribute('aria-valuemax', String(goal));
    bar.hidden = !known;
    countText.hidden = !known;
    $('[data-wl-reward-state]').hidden = !done;
    $('[data-wl-reward-medal]').classList.toggle('wl-medal--locked', !done);
    panel.classList.toggle('wl-reward--done', done);
    if (!known) {
      note.textContent = `Bring ${goal} friends with your link, and your first booking fee is on us. Your progress shows on this page in the browser you joined from.`;
      return;
    }
    bar.setAttribute('aria-valuenow', String(Math.min(count, goal)));
    const pct = Math.round((Math.min(count, goal) / goal) * 100);
    requestAnimationFrame(() => { $('[data-wl-progress-fill]').style.width = (done ? 100 : Math.max(pct, 3)) + '%'; });
    countText.textContent = `${Math.min(count, goal)} of ${goal} ${goal === 1 ? 'friend' : 'friends'} joined`;
    note.textContent = granted
      ? "It's on your BookNStyle account: your first booking fee is on us."
      : done
        ? "Your first booking fee is on us. Sign up in the BookNStyle app with this email after launch and it's added to your account. If it isn't, email support@booknstyle.com from this address. No cash value."
        : `Bring ${goal} friends with your link. When you sign up in the app with this email, your first booking fee is on us.`;
  }

  // ---------- One-tap story image (1080 x 1920, drawn here, no server) ----------
  let storyBlob = null;
  let storyUrl = '';
  let storyFile = null;
  let storyCanShare = false;
  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  async function drawStory(d, live = isLive()) {
    const W = 1080;
    const H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext('2d');
    try {
      await Promise.all([
        document.fonts.load('500 200px "Bodoni Moda"'),
        document.fonts.load('italic 500 200px "Bodoni Moda"'),
        document.fonts.load('600 40px "Inter"'),
        document.fonts.load('400 40px "Inter"'),
      ]);
    } catch { /* system fonts */ }
    const SERIF = '"Bodoni Moda", "Bodoni 72", Didot, Georgia, serif';
    // Rounded rectangle path (roundRect is missing in older Safari).
    const rounded = (x, y, w, hh, r) => {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + hh, r);
      c.arcTo(x + w, y + hh, x, y + hh, r);
      c.arcTo(x, y + hh, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    };
    const SANS = 'Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

    // Background: navy, with the site's champagne glows.
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#16182B');
    bg.addColorStop(1, '#10121F');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    const glow = (x, y, r, a) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(223, 185, 144, ${a})`);
      g.addColorStop(1, 'rgba(223, 185, 144, 0)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    };
    glow(W * 0.78, H * 0.30, 760, 0.16);
    glow(W * 0.15, H * 0.92, 700, 0.09);

    // Thin champagne frame
    c.strokeStyle = 'rgba(223, 185, 144, .28)';
    c.lineWidth = 2;
    rounded(48, 48, W - 96, H - 96, 44);
    c.stroke();

    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';

    // The B mark and the wordmark
    try {
      const mark = await loadImage('../assets/mark.webp');
      const mw = 220;
      const mh = mw * (mark.naturalHeight / mark.naturalWidth);
      c.drawImage(mark, (W - mw) / 2, 300, mw, mh);
    } catch { /* no mark */ }
    c.fillStyle = '#DFB990';
    c.font = `500 76px ${SERIF}`;
    c.fillText('BookNStyle', W / 2, 640);

    // Shrink a line until it fits (long links, the live eyebrow).
    const fit = (text, weight, size, min, maxWidth, family = SANS) => {
      let px = size;
      c.font = `${weight} ${px}px ${family}`;
      while (c.measureText(text).width > maxWidth && px > min) { px -= 2; c.font = `${weight} ${px}px ${family}`; }
      return px;
    };
    // "Launching soon" -> "L A U N C H I N G   S O O N" (the site's wide eyebrow).
    const spaced = (t) => t.toUpperCase().split('').join(' ');

    // Eyebrow with rules. After launch the page says "BookNStyle is live",
    // and so does the image.
    c.fillStyle = '#DFB990';
    const eyebrow = spaced(live ? 'Now on iPhone and Android' : 'Launching soon');
    fit(eyebrow, 600, 30, 20, W - 340);
    c.fillText(eyebrow, W / 2, 790);
    const ew = c.measureText(eyebrow).width;
    c.fillRect(W / 2 - ew / 2 - 76, 779, 52, 2);
    c.fillRect(W / 2 + ew / 2 + 24, 779, 52, 2);

    // "I'm in."
    c.font = `500 230px ${SERIF}`;
    const a = "I'm ";
    c.font = `italic 500 230px ${SERIF}`;
    const bw = c.measureText('in.').width;
    c.font = `500 230px ${SERIF}`;
    const aw = c.measureText(a).width;
    const x0 = (W - (aw + bw)) / 2;
    c.textAlign = 'left';
    c.fillStyle = '#FAFAF7';
    c.fillText(a, x0, 1060);
    c.font = `italic 500 230px ${SERIF}`;
    const gold = c.createLinearGradient(x0 + aw, 880, x0 + aw + bw, 1060);
    gold.addColorStop(0, '#E6C7A2');
    gold.addColorStop(0.55, '#C8956A');
    gold.addColorStop(1, '#B98659');
    c.fillStyle = gold;
    c.fillText('in.', x0 + aw, 1060);
    c.textAlign = 'center';

    c.font = `400 50px ${SANS}`;
    c.fillStyle = 'rgba(250, 250, 247, .78)';
    c.fillText(live ? 'BookNStyle is live.' : 'BookNStyle is launching soon.', W / 2, 1170);

    // Pros: the link they claimed
    let y = 1290;
    const handle = (d.role === 'pro' || d.role === 'both') && d.reserved_handle ? d.reserved_handle : '';
    if (handle) {
      c.font = `400 36px ${SANS}`;
      c.fillStyle = 'rgba(250, 250, 247, .64)';
      c.fillText(live ? 'Book me at my link:' : 'My booking link is claimed:', W / 2, y);
      c.fillStyle = '#DFB990';
      // Up to 54 characters (a 30-character name): keep it inside the frame.
      fit(LINK_HOST + handle, 600, 40, 24, W - 220);
      c.fillText(LINK_HOST + handle, W / 2, y + 60);
      y += 130;
    }

    // The join card with their short link
    const cardY = Math.max(y + 20, 1440);
    c.fillStyle = 'rgba(250, 250, 247, .06)';
    c.strokeStyle = 'rgba(223, 185, 144, .35)';
    rounded(130, cardY, W - 260, 230, 36);
    c.fill();
    c.stroke();
    c.font = `600 30px ${SANS}`;
    c.fillStyle = '#DFB990';
    c.fillText(spaced(live ? 'Join me on BookNStyle' : 'Join me on the list'), W / 2, cardY + 80);
    const short = String(d.share_url || 'booknstyle.com/waitlist').replace(/^https?:\/\//, '');
    fit(short, 600, 46, 28, W - 340);
    c.fillStyle = '#FAFAF7';
    c.fillText(short, W / 2, cardY + 160);

    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  }

  // Each call draws from the answer on screen at that moment. A newer call
  // (a return visit's fresh copy, a changed link) wins: an older drawing
  // that finishes later is dropped.
  let storySeq = 0;
  async function prepareStory() {
    const mySeq = ++storySeq;
    const btn = $('[data-wl-story]');
    const label = $('[data-wl-story-label]');
    const thumb = $('[data-wl-story-thumb]');
    const live = isLive();
    let blob = null;
    try {
      blob = await drawStory(current, live);
    } catch { blob = null; }
    if (mySeq !== storySeq) return;
    if (!blob) { $('.wl-story').hidden = true; return; }
    $('.wl-story').hidden = false;
    storyBlob = blob;
    if (storyUrl) URL.revokeObjectURL(storyUrl);
    storyUrl = URL.createObjectURL(storyBlob);
    thumb.src = storyUrl;
    thumb.alt = live
      ? "Your story image: I'm in. BookNStyle is live, with your link."
      : "Your story image: I'm in. BookNStyle is launching soon, with your link.";
    thumb.hidden = false;
    const file = new File([storyBlob], 'booknstyle-story.png', { type: 'image/png' });
    const canShareFile = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
    storyFile = file;
    storyCanShare = canShareFile;
    label.textContent = canShareFile ? 'Share to your story' : 'Save story image';
    btn.onclick = async () => {
      if (canShareFile) {
        try { await navigator.share({ files: [file], title: 'BookNStyle' }); return; } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      const copied = current && current.share_url ? await copy(current.share_url) : false;
      saveStory();
      say(copied
        ? 'Story image saved and link copied. Post it, then add your link with the Link sticker.'
        : 'Story image saved. Post it, then add your link with the Link sticker.');
    };
  }

  function saveStory() { download(storyUrl, 'booknstyle-story.png'); }
  function download(href, name) {
    const a = h('a', { href, download: name });
    document.body.append(a);
    a.click();
    a.remove();
  }

  // The Instagram, TikTok and Snapchat buttons. The link is copied first,
  // without waiting, so the share sheet still opens inside the tap.
  async function shareToApp(app, url, proOnly = false) {
    const hint = APP_HINTS[app] || APP_HINTS.instagram;
    const copied = copy(url);
    // Pros share the kit image they picked; everyone else the "I'm in." image.
    const kitShot = proOnly ? kit.shots[kit.active] : null;
    if (proOnly && kitShot && kitShot.blob) {
      const file = new File([kitShot.blob], kitFileName(kitShot), { type: 'image/png' });
      if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'BookNStyle' });
          say(((await copied) ? 'Link copied. ' : '') + hint);
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      const ok = await copied;
      download(kitShot.url, kitFileName(kitShot));
      say((ok ? 'Story image saved and link copied. ' : 'Story image saved. Copy your link above. ') + hint);
      return;
    }
    if (storyFile && storyCanShare) {
      try {
        await navigator.share({ files: [storyFile], title: 'BookNStyle' });
        say(((await copied) ? 'Link copied. ' : '') + hint);
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    const ok = await copied;
    if (storyUrl) {
      saveStory();
      say((ok ? 'Story image saved and link copied. ' : 'Story image saved. Copy your link above. ') + hint);
    } else {
      say((ok ? 'Link copied. ' : 'Copy your link above. ') + hint);
    }
  }


  // ---------- A pro's link for their clients ----------
  // Their held page once they have a name (it says "@name is coming to
  // BookNStyle" and collects their clients), or else their waitlist link
  // for clients.
  function clientLinkFor(d) {
    if (d && d.reserved_handle) return 'https://' + LINK_HOST + d.reserved_handle;
    const base = (d && d.share_url) || 'https://booknstyle.com/waitlist/';
    return base + (base.includes('?') ? '&' : '?') + 'role=client';
  }
  const regularsText = (d) => `${SHARE_TEXT.pro}\n${clientLinkFor(d)}`;

  // ---------- The Founding Pro Kit (R1): 1080 x 1920 story images drawn here ----------
  // The same look and copy as the Pro Kit images (BookNStyle-Notes, Pro-Growth-
  // Sprint, Pro Kit Images/template). In a headline, *words* are the champagne
  // italic; " / " is the line break. Version 3 (launch day) shows only once
  // BookNStyle is live. Copy rules: no prices, no "free", nothing not built.
  const KIT_SOON_SUB = "Soon you can book me on BookNStyle. Join my list and you'll hear the day it opens. Until then, book me the way you always do.";
  const KIT_LIVE_SUB = 'Tap the link, get the BookNStyle app and pick your time.';
  const KIT_ROWS = ['See my open times and book on your own', 'A reminder before every appointment', 'Message me right in the app'];
  const KIT_CRAFTS = {
    general: { h: ['Booking me is / about to get *easier.*', 'Your next appointment, / *in a few taps.*', 'Booking me / just got *easier.*'], bio: '' },
    barber: { h: ['Your next cut, / *on your schedule.*', 'Stay fresh. / *Book in a few taps.*', 'The chair is open. / *Book me here.*'],
      rows: ['See my open times and book on your own', 'A reminder before every cut', 'Reschedule once on your own'], bio: 'Cuts, fades, lineups' },
    braids: { h: ['Your next style, / *booked with ease.*', 'Installs and retwists, / *in a few taps.*', 'Braids or locs? / *Book me here.*'],
      rows: ['Book long appointments on your own', 'My deposit and cancel policy, up front', 'A reminder before every appointment'], bio: 'Braids, locs, retwists' },
    nails: { h: ['Fill day, / *made simple.*', 'Your next set, / *a few taps away.*', 'New set? / *Book me here.*'],
      rows: ['Pick your time and book on your own', 'A reminder before every fill', 'Message me right in the app'], bio: 'Nails and nail art' },
    lashes: { h: ['Your fills, / *right on schedule.*', 'Lashes and brows, / *in a few taps.*', 'Fill time? / *Book your spot.*'],
      rows: ['Book your fill on your own', 'A reminder before every appointment', 'Reschedule once on your own'], bio: 'Lashes and brows' },
    makeup: { h: ['Your next glam, / *beautifully booked.*', 'Event coming up? / *Hold your date.*', 'Glam on the calendar. / *Book me here.*'],
      rows: ['Hold your date with a deposit', 'A reminder before your appointment', 'Message me right in the app'], bio: 'Glam, bridal, editorial' },
    skin: { h: ['Your skin routine, / *on schedule.*', 'Your next facial, / *a few taps away.*', 'Skin day? / *Book me here.*'],
      rows: ['Book your facial on your own', 'Fill out my intake form in the app', 'A reminder before every appointment'], bio: 'Facials and skincare' },
    massage: { h: ['Your next session, / *simply booked.*', 'Your regular session, / *a few taps away.*', 'Time to reset? / *Book your session.*'],
      rows: ['Book your session on your own', 'A reminder before every session', 'Message me right in the app'], bio: '' },
    tattoo: { h: ['Your next piece / *starts here.*', 'Consults and sessions, / *in one place.*', 'Books are open. / *Claim your spot.*'],
      rows: ['Book consults and sessions on your own', 'Deposits handled right in the app', 'Message me right in the app'], bio: 'Custom, fine line, traditional' },
  };
  // The waitlist's specialty -> the kit's craft.
  const CRAFT_OF = {
    barber: 'barber', hairstylist: 'general', braider: 'braids', loctician: 'braids', nail_tech: 'nails', lash_tech: 'lashes',
    brow_artist: 'lashes', esthetician: 'skin', makeup_artist: 'makeup', massage_therapist: 'massage', tattoo_artist: 'tattoo', other: 'general',
  };
  const KIT_NAMES = ['coming-soon', 'how-to-book', 'launch-day'];
  const KIT_LABELS = ['Coming soon', 'How to book', 'Launch day'];
  const bioLine = (craft, live) => {
    const prefix = (KIT_CRAFTS[craft] || {}).bio;
    const line = live ? 'Book me on BookNStyle. Tap the link below.' : 'Booking on BookNStyle soon. Join my list at the link below.';
    return prefix ? `${prefix} | ${line}` : line;
  };
  const kitFileName = (shot) => `booknstyle-${shot.name}-${KIT_NAMES[shot.v - 1]}.png`;
  // The 4-point star used on the website, 24 units across.
  const SPARK_PATH = 'M12 0c.6 6.2 5.8 11.4 12 12-6.2.6-11.4 5.8-12 12-.6-6.2-5.8-11.4-12-12 6.2-.6 11.4-5.8 12-12z';

  async function drawKit(craftId, v, name, live) {
    const W = 1080;
    const H = 1920;
    const craft = KIT_CRAFTS[craftId] || KIT_CRAFTS.general;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext('2d');
    try {
      await Promise.all([
        document.fonts.load('400 120px "Bodoni Moda"'), document.fonts.load('italic 400 120px "Bodoni Moda"'),
        document.fonts.load('500 86px "Bodoni Moda"'), document.fonts.load('600 26px "Inter"'),
        document.fonts.load('500 35px "Inter"'), document.fonts.load('400 38px "Inter"'),
      ]);
    } catch { /* system fonts */ }
    const SERIF = '"Bodoni Moda", "Bodoni 72", Didot, Georgia, serif';
    const SANS = 'Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    const CHAMP_L = '#DFB990';
    const TEXT_3 = 'rgba(245, 244, 238, .56)';
    const rounded = (x, y, w, hh, r) => {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + hh, r);
      c.arcTo(x + w, y + hh, x, y + hh, r);
      c.arcTo(x, y + hh, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    };
    const goldFill = (x0, x1, y) => {
      const g = c.createLinearGradient(x0, y, x1, y);
      g.addColorStop(0, '#F0D3AE'); g.addColorStop(0.35, '#DFB990'); g.addColorStop(0.7, '#C8956A'); g.addColorStop(1, '#E7C59D');
      return g;
    };
    // Letter-spaced line, centered on cx (canvas letterSpacing isn't in every browser yet).
    const tracked = (text, cx, y, track) => {
      const chars = Array.from(text);
      const widths = chars.map((ch) => c.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
      let x = cx - total / 2;
      c.textAlign = 'left';
      chars.forEach((ch, i) => { c.fillText(ch, x, y); x += widths[i] + track; });
      c.textAlign = 'center';
      return total;
    };
    const wrap = (text, maxW) => {
      const out = [];
      let line = '';
      text.split(' ').forEach((word) => {
        const next = line ? line + ' ' + word : word;
        if (c.measureText(next).width > maxW && line) { out.push(line); line = word; } else line = next;
      });
      if (line) out.push(line);
      return out;
    };

    // Background: the site's navy with champagne glows, and a thin champagne frame.
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#16182B'); bg.addColorStop(0.38, '#12142A'); bg.addColorStop(1, '#0C0D17');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    const glow = (x, y, r, a) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(200, 149, 106, ${a})`);
      g.addColorStop(1, 'rgba(200, 149, 106, 0)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    };
    glow(W / 2, 288, 740, 0.2);
    glow(86, 1843, 820, 0.08);
    c.strokeStyle = 'rgba(223, 185, 144, .30)';
    c.lineWidth = 1.5;
    rounded(44, 44, W - 88, H - 88, 44);
    c.stroke();
    c.textBaseline = 'middle';
    c.textAlign = 'center';

    // Logo: the B mark in its halo rings, the wordmark and a champagne rule.
    const mx = W / 2;
    const my = 350;
    const halo = c.createRadialGradient(mx, my, 0, mx, my, 178);
    halo.addColorStop(0, 'rgba(200, 149, 106, .26)'); halo.addColorStop(0.5, 'rgba(58, 46, 34, .14)'); halo.addColorStop(0.76, 'rgba(10, 11, 17, 0)');
    c.fillStyle = halo;
    c.fillRect(mx - 180, my - 180, 360, 360);
    [[118, 0.08], [92, 0.16]].forEach(([r, a]) => { c.strokeStyle = `rgba(223, 185, 144, ${a})`; c.beginPath(); c.arc(mx, my, r, 0, Math.PI * 2); c.stroke(); });
    try {
      const mark = await loadImage('../assets/mark.webp');
      const mw = 112;
      const mh = mw * (mark.naturalHeight / mark.naturalWidth);
      c.drawImage(mark, mx - mw / 2, my - mh / 2, mw, mh);
    } catch { /* no mark */ }
    c.fillStyle = '#F5F4EE';
    c.font = `600 25px ${SANS}`;
    tracked('BOOKNSTYLE', mx + 5, 474, 10.5);
    const rule = c.createLinearGradient(mx - 75, 0, mx + 75, 0);
    rule.addColorStop(0, 'rgba(200,149,106,0)'); rule.addColorStop(0.5, '#C8956A'); rule.addColorStop(1, 'rgba(200,149,106,0)');
    c.fillStyle = rule;
    c.fillRect(mx - 75, 512, 150, 1.5);

    // Foot line, at the bottom of the safe area (clear of Instagram's reply bar).
    c.fillStyle = TEXT_3;
    c.font = `600 21px ${SANS}`;
    tracked((live ? 'Now on iPhone and Android' : 'Launching soon across the US').toUpperCase(), mx + 3, 1719, 6.3);

    // The headline: two lines, shrunk until the wider one fits 800px.
    const lines = craft.h[v - 1].split(' / ').map((line) => line.split(/(\*[^*]+\*)/).filter(Boolean)
      .map((part) => (part.startsWith('*') ? { t: part.slice(1, -1), em: true } : { t: part, em: false })));
    let fs = 120;
    const lineWidth = (segs) => segs.reduce((w, sg) => { c.font = `${sg.em ? 'italic ' : ''}400 ${fs}px ${SERIF}`; return w + c.measureText(sg.t).width; }, 0);
    while (Math.max(...lines.map(lineWidth)) > 800 && fs > 64) fs -= 2;
    const lh = fs * 1.06;

    // The sub line (versions 1 and 3) or three rows (version 2).
    c.font = `400 38px ${SANS}`;
    const subLines = v === 2 ? [] : wrap(live ? KIT_LIVE_SUB : KIT_SOON_SUB, 820);
    const rows = v === 2 ? (craft.rows || KIT_ROWS) : [];
    const middleH = v === 2 ? 52 + rows.length * 99.5 : 40 + subLines.length * 57;
    const cardH = 285;
    const total = 26 + 44 + lh * 2 + middleH + 60 + cardH + 30 + 36;
    let y = 515 + Math.max(0, (1679 - 515 - total) / 2);

    // Eyebrow with two short rules.
    c.fillStyle = CHAMP_L;
    c.font = `600 26px ${SANS}`;
    const eyebrow = (v === 2 ? 'Booking me, made easy' : live ? 'Now booking' : 'Coming soon').toUpperCase();
    const ew = tracked(eyebrow, mx + 3, y + 13, 6.76);
    c.globalAlpha = 0.55;
    c.fillRect(mx - ew / 2 - 22 - 54, y + 12, 54, 1.5);
    c.fillRect(mx + ew / 2 + 22, y + 12, 54, 1.5);
    c.globalAlpha = 1;
    y += 26 + 44;

    lines.forEach((segs, i) => {
      const lw = lineWidth(segs);
      let x = mx - lw / 2;
      const cy = y + lh * i + lh / 2;
      c.textAlign = 'left';
      segs.forEach((sg) => {
        c.font = `${sg.em ? 'italic ' : ''}400 ${fs}px ${SERIF}`;
        const w = c.measureText(sg.t).width;
        c.fillStyle = sg.em ? goldFill(x, x + w, cy) : '#FAFAF7';
        c.fillText(sg.t, x, cy);
        x += w;
      });
      c.textAlign = 'center';
    });
    y += lh * 2;

    if (v === 2) {
      y += 52;
      const left = (W - 820) / 2;
      c.fillStyle = 'rgba(245, 244, 238, .10)';
      c.fillRect(left, y, 820, 1.5);
      const spark = new Path2D(SPARK_PATH);
      rows.forEach((row) => {
        const cy = y + 99.5 / 2;
        c.save();
        c.translate(left + 4, cy - 15);
        c.scale(30 / 24, 30 / 24);
        c.fillStyle = CHAMP_L;
        c.fill(spark);
        c.restore();
        c.fillStyle = '#F5F4EE';
        c.font = `500 35px ${SANS}`;
        c.textAlign = 'left';
        c.fillText(row, left + 4 + 30 + 26, cy);
        c.textAlign = 'center';
        y += 99.5;
        c.fillStyle = 'rgba(245, 244, 238, .10)';
        c.fillRect(left, y - 1.5, 820, 1.5);
      });
    } else {
      y += 40;
      c.fillStyle = 'rgba(245, 244, 238, .78)';
      c.font = `400 38px ${SANS}`;
      subLines.forEach((line) => { c.fillText(line, mx, y + 57 / 2); y += 57; });
    }

    // The link card: where the pro drops Instagram's Link sticker.
    y += 60;
    const cx0 = (W - 860) / 2;
    c.save();
    c.shadowColor = 'rgba(0, 0, 0, .55)';
    c.shadowBlur = 60;
    c.shadowOffsetY = 30;
    const cardBg = c.createLinearGradient(0, y, 0, y + cardH);
    cardBg.addColorStop(0, 'rgba(29, 32, 56, .92)'); cardBg.addColorStop(1, 'rgba(22, 24, 43, .96)');
    c.fillStyle = cardBg;
    rounded(cx0, y, 860, cardH, 38);
    c.fill();
    c.restore();
    c.strokeStyle = 'rgba(223, 185, 144, .30)';
    c.lineWidth = 1.5;
    rounded(cx0, y, 860, cardH, 38);
    c.stroke();
    c.fillStyle = CHAMP_L;
    c.font = `600 23px ${SANS}`;
    tracked((live ? 'Book with me' : 'Join my list').toUpperCase(), mx + 3, y + 44 + 11, 6);
    c.fillStyle = TEXT_3;
    c.font = `500 32px ${SANS}`;
    c.fillText('app.booknstyle.com/book/', mx, y + 44 + 23 + 26 + 19);
    // The name, large in champagne Bodoni (hyphens in Inter: Bodoni's is a hairline).
    const parts = name.split(/(-)/).filter(Boolean);
    let ns = 86;
    const nameW = () => parts.reduce((w, part) => { c.font = part === '-' ? `500 ${ns}px ${SANS}` : `500 ${ns}px ${SERIF}`; return w + c.measureText(part).width; }, 0);
    while (nameW() > 780 && ns > 34) ns -= 2;
    const nw = nameW();
    let nx = mx - nw / 2;
    const ny = y + 44 + 23 + 26 + 38 + 4 + 52;
    c.textAlign = 'left';
    const nameGold = goldFill(nx, nx + nw, ny);
    parts.forEach((part) => {
      c.font = part === '-' ? `500 ${ns}px ${SANS}` : `500 ${ns}px ${SERIF}`;
      c.fillStyle = nameGold;
      c.fillText(part, nx, ny);
      nx += c.measureText(part).width;
    });
    c.textAlign = 'center';
    y += cardH + 30;
    c.fillStyle = TEXT_3;
    c.font = `500 28px ${SANS}`;
    c.fillText(live ? 'Tap the link to book' : 'Tap the link to join my list', mx, y + 18);

    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  }

  // The kit on screen: one thumbnail per version, the chosen one saved or shared.
  const kit = { craft: '', name: '', live: false, shots: [], active: 0, seq: 0 };
  const kitStatus = $('[data-wl-kit-status]');
  let kitTimer = 0;
  const kitSay = (msg) => { kitStatus.textContent = msg; clearTimeout(kitTimer); kitTimer = setTimeout(() => { kitStatus.textContent = ''; }, 6000); };
  function paintKitShots() {
    const box = $('[data-wl-kit-shots]');
    box.style.setProperty('--n', String(kit.shots.length));
    box.replaceChildren(...kit.shots.map((shot, i) => {
      const pic = shot.url ? h('img', { src: shot.url, alt: '', width: '108', height: '192' }) : h('span', { class: 'wl-kit__ph', 'aria-hidden': 'true' });
      const btn = h('button', { class: 'wl-kit__shot', type: 'button', 'aria-pressed': String(i === kit.active), 'aria-label': `${KIT_LABELS[shot.v - 1]} story image` }, [pic, h('span', { text: KIT_LABELS[shot.v - 1] })]);
      btn.addEventListener('click', () => { kit.active = i; paintKitShots(); });
      return btn;
    }));
    const canShare = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }));
    $('[data-wl-kit-save-label]').textContent = canShare ? 'Share image' : 'Save image';
  }
  async function drawKitShots() {
    const mySeq = ++kit.seq;
    const versions = kit.live ? [3] : [1, 2];
    kit.shots.forEach((shot) => { if (shot.url) URL.revokeObjectURL(shot.url); });
    kit.shots = versions.map((v) => ({ v, name: kit.name, blob: null, url: '' }));
    kit.active = 0;
    paintKitShots();
    for (const shot of kit.shots) {
      let blob = null;
      try { blob = await drawKit(kit.craft, shot.v, kit.name, kit.live); } catch { blob = null; }
      if (mySeq !== kit.seq) return;
      if (blob) { shot.blob = blob; shot.url = URL.createObjectURL(blob); }
      paintKitShots();
    }
  }
  function renderKit(isPro) {
    const panel = $('[data-wl-kit]');
    panel.hidden = !isPro;
    if (!isPro) return;
    const handle = current.reserved_handle || '';
    $('[data-wl-kit-body]').hidden = !handle;
    $('[data-wl-kit-nolink]').hidden = !!handle;
    if (!handle) { kit.seq += 1; kit.name = ''; return; }
    const select = $('[data-wl-kit-craft]');
    if (!kit.craft) kit.craft = CRAFT_OF[store.get(KEYS.craft) || ''] || 'general';
    select.value = kit.craft;
    const live = isLive();
    if (handle !== kit.name || live !== kit.live || !kit.shots.length) {
      kit.name = handle;
      kit.live = live;
      drawKitShots();
    }
  }
  $('[data-wl-kit-craft]').addEventListener('change', (e) => { kit.craft = e.target.value; if (kit.name) drawKitShots(); });
  $('[data-wl-kit-save]').addEventListener('click', async () => {
    const shot = kit.shots[kit.active];
    if (!shot || !shot.blob) { kitSay('Your image is still being drawn. Try again in a moment.'); return; }
    const file = new File([shot.blob], kitFileName(shot), { type: 'image/png' });
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'BookNStyle' }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    download(shot.url, kitFileName(shot));
    const copied = await copyText(clientLinkFor(current));
    kitSay(copied ? 'Image saved and link copied. Add your link with the Link sticker on the gold box.' : 'Image saved. Add your link with the Link sticker on the gold box.');
  });
  $('[data-wl-kit-text]').addEventListener('click', async () => {
    const text = regularsText(current);
    kitSay((await copyText(text)) ? 'Text copied. Paste it to your regulars.' : text);
  });
  $('[data-wl-kit-bio]').addEventListener('click', async () => {
    const line = bioLine(kit.craft, isLive());
    kitSay((await copyText(line)) ? 'Bio line copied. Put your link in the link field.' : line);
  });

  // ---------- Invite another pro (R5): a link, a share and a count, never names ----------
  const proInviteLink = (d) => {
    const code = String((d && d.referral_code) || '').toUpperCase();
    if (!CODE.test(code)) return 'https://booknstyle.com/pro';
    return d.share_url + (d.share_url.includes('?') ? '&' : '?') + 'role=pro&utm_campaign=pro_invite';
  };
  function renderProInvite(isPro) {
    const panel = $('[data-wl-proinvite]');
    panel.hidden = !isPro;
    if (!isPro) return;
    const link = proInviteLink(current);
    $('[data-wl-pi-link]').value = link.replace(/^https?:\/\//, '');
    const status = $('[data-wl-pi-status]');
    $('[data-wl-pi-copy]').onclick = async () => { status.textContent = (await copyText(link)) ? 'Link copied.' : 'Press and hold the link to copy it.'; };
    const share = $('[data-wl-pi-share]');
    const data = { title: 'BookNStyle', text: PRO_INVITE_TEXT, url: link };
    share.hidden = !(navigator.share && (!navigator.canShare || navigator.canShare(data)));
    share.onclick = async () => { try { await navigator.share(data); } catch { /* closed */ } };
    // Everyone who joined with this pro's code. Their code now travels only
    // on this invite (their clients get the held page), hence "your invite".
    const n = current.owner === true && Number.isInteger(current.referral_count) ? current.referral_count : null;
    const count = $('[data-wl-pi-count]');
    count.hidden = n === null;
    count.textContent = n === null ? '' : `Joined from your invite: ${n}`;
  }

  // ---------- Coming back: this browser's saved key ----------
  function forget() {
    store.del(KEYS.key);
    store.del(KEYS.state);
    current = null;
    memKey = null;
    success.hidden = true;
    form.hidden = false;
    step = 1;
    seg = ['', '', ''];
    showBar = false;
    acted3 = false;
    applyStep();
  }
  $('[data-wl-reset]').addEventListener('click', () => {
    forget();
    store.del(KEYS.mine);
    form.reset();
    handleInput.removeAttribute('data-touched');
    handleCheck.set('');
    syncRole();
    el('name').focus();
  });

  const savedKey = store.get(KEYS.key);
  const previewing = IS_LOCAL && params.has('preview');
  if (savedKey && !previewing) {
    // Saved data first (no spinner), then the server's fresh copy.
    try {
      const saved = JSON.parse(store.get(KEYS.state) || 'null');
      if (saved && saved.referral_code) showSuccess({ ...saved, already_joined: true, owner: true }, { fromStorage: true });
    } catch { /* ignore */ }
    (async () => {
      try {
        const { ok, status: code, data } = await post({ action: 'status', manage_token: savedKey });
        if (ok && data && data.referral_code) showSuccess(data, { fromStorage: true });
        else if (code === 404) forget();
      } catch { /* keep the saved view */ }
    })();
  }

  // ---------- Local preview only (localhost): ?mock and ?preview ----------
  // Ignored anywhere else, so none of this can run on booknstyle.com.
  function mockDetail(over) {
    return {
      referral_code: 'K7M2QXP', share_url: 'https://booknstyle.com/waitlist/?ref=K7M2QXP', already_joined: false,
      owner: true, unsubscribed: false, referral_count: 1, milestone: MILESTONE, role: 'pro',
      founding_pro: true, founding_member: false, reward_earned: false, reward_granted: false,
      reserved_handle: 'jasmine-braids', booking_link: 'https://app.booknstyle.com/book/jasmine-braids',
      handle_applied: false, nominations: [], region: 'ny', city: null, ...over,
    };
  }
  const MOCK_TAKEN = new Set(['kai', 'kai-cuts', 'jasmine', 'braids', 'nails']);
  const MOCK_RESERVED = new Set(['admin', 'support', 'waitlist', 'privacy', 'terms', 'help', 'api', 'app', 'pro', 'book']);
  async function mockInfo(query) {
    await new Promise((r) => setTimeout(r, 250));
    const q = new URLSearchParams(query);
    if (q.has('count')) {
      const n = Number(params.get('counter') || 0);
      return { ok: true, status: 200, data: { total: n >= 500 ? Math.floor(n / 50) * 50 : null } };
    }
    const v = q.get('handle') || '';
    const status = MOCK_RESERVED.has(v) || v.includes('booknstyle') ? 'reserved' : MOCK_TAKEN.has(v) ? 'taken' : 'available';
    const message = { reserved: "That name isn't available. Please try another.", taken: 'That link is taken. Please try another.', available: 'Available' }[status];
    return { ok: true, status: 200, data: { handle: v, status, available: status === 'available', message } };
  }
  async function mockPost(body) {
    await new Promise((r) => setTimeout(r, 300));
    if (body.action === 'status') return { ok: true, status: 200, data: mockDetail({ already_joined: true }) };
    if (body.action === 'update') return { ok: true, status: 200, data: mockDetail({ already_joined: true, reserved_handle: body.reserved_handle || 'jasmine-braids', nominations: body.nominations || [] }) };
    // ?race=<name>: someone else took that link between the check and the join.
    if (body.reserved_handle && params.get('race') === body.reserved_handle) {
      return { ok: false, status: 400, data: { error: 'That link is taken. Please try another.', field: 'reserved_handle' } };
    }
    const role = body.role;
    return { ok: true, status: 200, data: mockDetail({ role, referral_count: 0, founding_pro: role !== 'client', founding_member: role !== 'pro', reserved_handle: role === 'client' ? null : body.reserved_handle, nominations: body.nominations || [], region: body.outside_ny ? 'outside_ny' : 'ny', city: body.city, manage_token: 'mock-key' }) };
  }
  if (IS_LOCAL) window.__wlDrawStory = (d, live) => drawStory(mockDetail(d || {}), !!live);
  if (IS_LOCAL) window.__wlDrawKit = (craft, v, name, live) => drawKit(craft, v, name, !!live);
  if (previewing) {
    const role = ['client', 'both'].includes(params.get('role')) ? params.get('role') : 'pro';
    const outside = params.get('outside') === '1';
    const n = Number(params.get('friends') || 1);
    if (role !== 'pro' || params.has('owner')) store.set(KEYS.key, 'mock-key');
    // ?stranger=1: someone typed this email in another browser (owner false:
    // the share link only, as waitlist-join answers).
    const stranger = params.get('stranger') === '1';
    if (stranger) store.del(KEYS.key);
    const detail = mockDetail({
      role,
      referral_count: n,
      founding_pro: role !== 'client',
      founding_member: role !== 'pro',
      reward_earned: role !== 'pro' && n >= MILESTONE,
      reserved_handle: role === 'client' ? null : (params.get('handle') || 'jasmine-braids'),
      nominations: role === 'pro' ? [] : [{ platform: 'instagram', handle: 'nails.by.tee' }, { platform: 'tiktok', handle: 'fadeking.nyc' }],
      region: outside ? 'outside_ny' : 'ny',
      city: outside ? (params.get('city') || 'Atlanta') : null,
      already_joined: stranger || params.get('returning') === '1',
      unsubscribed: params.get('returning') === 'unsub',
    });
    if (stranger) {
      ['unsubscribed', 'referral_count', 'founding_pro', 'founding_member', 'reward_earned', 'reward_granted', 'role',
        'reserved_handle', 'booking_link', 'handle_applied', 'nominations', 'region', 'city'].forEach((k) => delete detail[k]);
      detail.owner = false;
    }
    showSuccess(detail, { role });
  }
})();
