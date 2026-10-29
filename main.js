/* BookNStyle, booknstyle.com (vanilla JS, no dependencies, no tracking)
   Shared by the home page and the waitlist page. The STORE_LINKS block and
   the data-soon-only / data-live-only switch work exactly as on the live site. */

/* ==========================================================================
   STORE LINKS: the ONE place to edit when the apps go live.

   Paste each store URL between the quotes and publish the site.
   Fill in BOTH at the same time: the page-wide wording ("Coming soon" ->
   "Get the app", header button, launch line, download section) switches only
   when both are filled in.

   - Empty ('')  : that badge shows as a plain image, with "Coming soon" wording nearby.
   - Filled in   : that badge (hero + download section) becomes a link to the store.
   - Both filled : every element marked data-soon-only is hidden and every
                   element marked data-live-only is shown.

   The invite-link site (web/links/index.html) already uses
   https://apps.apple.com/app/id6813224710 and
   https://play.google.com/store/apps/details?id=com.booknstyle.app
   Confirm both are live before pasting them here. Also uncomment the
   apple-itunes-app meta tag in index.html once the iPhone app is live.
   ========================================================================== */
const STORE_LINKS = {
  appStore: '',
  googlePlay: '',
};

(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // html.is-static: no parallax (only the local preview tools set it, for full-page screenshots).
  const isStatic = () => root.classList.contains('is-static');

  /* ---------- Store badges ---------- */
  const STORE_LABELS = {
    appStore: 'Download on the App Store',
    googlePlay: 'Get it on Google Play',
  };

  document.querySelectorAll('[data-store]').forEach((badge) => {
    const key = badge.dataset.store;
    const url = (STORE_LINKS[key] || '').trim();
    if (!url) return;

    const link = document.createElement('a');
    link.className = 'store-badge';
    link.href = url;
    link.rel = 'noopener';
    link.dataset.store = key;
    link.setAttribute('aria-label', STORE_LABELS[key] || 'Download BookNStyle');

    const img = badge.querySelector('img');
    if (img) {
      img.removeAttribute('loading');
      link.append(img);
    }
    badge.replaceWith(link);
  });

  const allLive = Object.values(STORE_LINKS).every((u) => (u || '').trim() !== '');
  if (allLive) {
    document.querySelectorAll('[data-soon-only]').forEach((el) => { el.hidden = true; });
    document.querySelectorAll('[data-live-only]').forEach((el) => { el.hidden = false; });
  }

  /* ---------- Header: frosted after scrolling; logo docks after the hero logo leaves ---------- */
  const header = document.querySelector('[data-header]');
  const dock = document.querySelector('[data-dock]');
  const heroLogo = document.querySelector('[data-hero-logo]');
  if (dock) {
    const dockLogo = dock.querySelector('.gr--inview');
    const setDocked = (on) => {
      dock.classList.toggle('is-docked', on);
      // The header logo plays its quick reveal the first time it docks.
      if (on && dockLogo) dockLogo.classList.add('is-on');
    };
    if (heroLogo && 'IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => setDocked(!entry.isIntersecting), { rootMargin: '-72px 0px 0px 0px' }).observe(heroLogo);
    } else {
      setDocked(true);
    }
  }

  /* ---------- Parallax (transform only, on-screen elements only) ---------- */
  const parallaxEls = reduceMotion ? [] : Array.from(document.querySelectorAll('[data-parallax]'));
  const visible = new Set();
  if (parallaxEls.length && 'IntersectionObserver' in window) {
    const pio = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
      // Elements that just appeared (the hero swap) take their offset now, not on the next scroll
      if (!ticking) { ticking = true; window.requestAnimationFrame(onFrame); }
    }, { rootMargin: '20% 0px 20% 0px' });
    parallaxEls.forEach((el) => pio.observe(el));
  }

  let ticking = false;
  const onFrame = () => {
    ticking = false;
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
    if (isStatic()) return;
    const vh = window.innerHeight;
    visible.forEach((el) => {
      const r = el.getBoundingClientRect();
      const offset = r.top + r.height / 2 - vh / 2;
      const speed = parseFloat(el.dataset.parallax) || 0.08;
      el.style.transform = `translate3d(0, ${(-offset * speed).toFixed(1)}px, 0)`;
    });
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onFrame); }
  }, { passive: true });
  window.addEventListener('resize', onFrame, { passive: true });
  onFrame();

  /* ---------- Mobile menu ---------- */
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (toggle && nav) {
    const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
    const setOpen = (open) => {
      root.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    toggle.addEventListener('click', () => setOpen(!isOpen()));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) { setOpen(false); toggle.focus(); }
    });
    window.matchMedia('(min-width: 960px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }

  /* ---------- Active section in the nav ---------- */
  const navLinks = Array.from(document.querySelectorAll('.site-nav ul a[href^="#"]'));
  if ('IntersectionObserver' in window && navLinks.length) {
    const byId = new Map(navLinks.map((a) => [a.getAttribute('href').slice(1), a]));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const active = byId.get(entry.target.id);
        navLinks.forEach((a) => a.classList.toggle('is-active', a === active));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main > section[id]').forEach((s) => spy.observe(s));
  }

  /* ---------- Films (For pros, Switching, For clients) ----------
     Muted loops: the file loads when the film nears the screen, plays while it is on screen and pauses
     when it leaves. The speaker button turns sound on for one film at a time (browsers allow sound only
     after a tap, so it always starts muted). Tall film on portrait phones and tablets, wide otherwise, landscape phones included
     (the same media query as .film in styles.css and the <source media> fallback in index.html). No
     autoplay with reduced motion or Data Saver, or when the browser refuses it: the poster shows with a
     play button instead. If the file fails to load, the poster stays as a still and the button goes. */
  const TALL_FILM = '(orientation: portrait) and (max-width: 1023px)';
  const tallFilm = window.matchMedia(TALL_FILM);
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
  const canWatch = 'IntersectionObserver' in window;
  const films = [];

  document.querySelectorAll('[data-film]').forEach((el) => {
    const video = el.querySelector('video');
    const button = el.querySelector('[data-film-toggle]');
    const sound = el.querySelector('[data-film-sound]');
    const tall = video && video.querySelector('source[media]');
    const wide = video && video.querySelector('source:not([media])');
    if (!button || !tall || !wide) return;

    const start = parseFloat(video.dataset.start) || 0; // the poster's frame, so play picks up right where it is
    let wants = canWatch && !reduceMotion && !saveData; // play whenever on screen
    let onScreen = false;
    let held = false; // the page-wide "Pause animations" button is on

    video.muted = true; // the property as well as the attribute (iOS Safari, in-app browsers)
    video.removeAttribute('controls');
    button.hidden = false;
    if (sound) sound.hidden = false;
    el.classList.toggle('is-manual', !wants);

    const load = () => {
      const src = (tallFilm.matches ? tall : wide).getAttribute('src');
      if (video.getAttribute('src') === src) return;
      const at = video.getAttribute('src') ? video.currentTime : start;
      video.src = src;
      video.addEventListener('loadedmetadata', () => { video.currentTime = at; }, { once: true });
    };
    const play = () => {
      load();
      const p = video.play();
      if (p && p.catch) {
        p.catch((err) => {
          if (!err || err.name !== 'NotAllowedError') return;
          // Sound refused without a fresh tap (some browsers, coming back on screen): keep playing muted
          if (!video.muted) { video.muted = true; play(); return; }
          // Autoplay refused (Low Power Mode, some in-app browsers): wait for a tap instead
          wants = false; el.classList.add('is-manual');
        });
      }
    };
    const sync = () => {
      if (onScreen && wants && !held) play();
      else if (!video.paused) video.pause();
    };
    const setState = () => {
      const paused = video.paused;
      button.setAttribute('aria-pressed', String(paused));
      button.setAttribute('aria-label', paused ? 'Play film' : 'Pause film');
      if (!paused) el.classList.remove('is-manual');
    };
    video.addEventListener('play', setState);
    video.addEventListener('pause', setState);
    // JS sets video.src, so a failed load (404, dropped connection) fires here, not on the <source>s
    video.addEventListener('error', () => {
      wants = false; button.hidden = true; el.classList.remove('is-manual');
      if (sound) sound.hidden = true;
    });

    const toggle = () => {
      if (video.paused) { wants = true; held = false; play(); } else { wants = false; video.pause(); }
    };
    button.addEventListener('click', toggle);
    video.addEventListener('click', toggle);

    if (sound) {
      const syncSound = () => sound.setAttribute('aria-pressed', String(!video.muted));
      video.addEventListener('volumechange', syncSound);
      sound.addEventListener('click', () => {
        if (!video.muted) { video.muted = true; syncSound(); return; }
        films.forEach((f) => { if (f.el !== el) f.mute(); }); // one film with sound at a time
        video.muted = false;
        wants = true; held = false; play(); // sound on means play it, inside the tap so the browser allows sound
        syncSound(); // set it here too: a film's first load drops the queued volumechange event
      });
    }

    films.push({
      el,
      near: () => { if (wants) { video.preload = 'auto'; load(); } },
      seen: (on) => { onScreen = on; sync(); },
      hold: (on) => { held = on; sync(); },
      mute: () => { video.muted = true; },
      // Phone turned or window resized across the breakpoint: swap the film if it has started loading
      swap: () => { if (video.getAttribute('src')) { load(); sync(); } },
    });
  });

  if (films.length && canWatch) {
    const byEl = new Map(films.map((f) => [f.el, f]));
    const nearIo = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        byEl.get(entry.target).near();
        nearIo.unobserve(entry.target);
      });
    }, { rootMargin: '75% 0px 75% 0px' });
    const seenIo = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const film = byEl.get(entry.target);
        if (entry.intersectionRatio >= 0.35) film.seen(true);
        else if (!entry.isIntersecting) film.seen(false);
      });
    }, { threshold: [0, 0.35] });
    films.forEach((f) => { nearIo.observe(f.el); seenIo.observe(f.el); });
    tallFilm.addEventListener('change', () => films.forEach((f) => f.swap()));
  }

  /* ---------- Pause / play looping animations (WCAG 2.2.2) ---------- */
  const motionToggle = document.querySelector('[data-motion-toggle]');
  const motionCell = document.querySelector('[data-motion-cell]');
  if (motionToggle && !reduceMotion) {
    if (motionCell) motionCell.hidden = false;
    motionToggle.addEventListener('click', () => {
      const paused = motionToggle.getAttribute('aria-pressed') !== 'true';
      motionToggle.setAttribute('aria-pressed', String(paused));
      motionToggle.setAttribute('aria-label', paused ? 'Play animations' : 'Pause animations');
      root.classList.toggle('motion-paused', paused);
      films.forEach((f) => f.hold(paused)); // the films pause with everything else
    });
  }

  /* ---------- Tabs (How it works) ---------- */
  document.querySelectorAll('[data-tabs]').forEach((tabsEl) => {
    const tabs = Array.from(tabsEl.querySelectorAll('[role="tab"]'));
    const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
    const list = tabsEl.querySelector('[role="tablist"]');
    const select = (index, focus) => {
      tabs.forEach((tab, i) => {
        const on = i === index;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        if (panels[i]) panels[i].hidden = !on;
      });
      if (list) list.style.setProperty('--tab-i', String(index));
      if (focus) tabs[index].focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i, false));
      tab.addEventListener('keydown', (e) => {
        const last = tabs.length - 1;
        const next = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key];
        if (next !== undefined) { e.preventDefault(); select(next, true); }
      });
    });
    select(0, false);
  });

  /* ---------- Audience switch: pros first, clients one tap away ----------
     The page leads with pros. "I'm a client" (or a link with ?for=clients, which the inline script in
     index.html reads before the first paint) swaps the top section to the client version, moves the
     For clients section up to sit right under it, renumbers the sections and opens the For clients tab
     in How it works. The address keeps ?for=clients, so a copied link opens the same version. */
  const audSwitch = document.querySelector('[data-aud-switch]');
  if (audSwitch) {
    const hero = document.querySelector('.hero');
    const ribbon = document.querySelector('.ribbon');
    const switchSection = document.getElementById('switch');
    const clientsSection = document.getElementById('clients');
    const proRule = document.querySelector('[data-pro-rule]') || switchSection; // the hairline under Switching, pro order only
    const audButtons = Array.from(audSwitch.querySelectorAll('[data-aud-set]'));

    const setAud = (aud, tapped) => {
      const client = aud === 'client';
      root.classList.toggle('aud-client', client);
      audButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.audSet === aud)));
      if (ribbon && switchSection && clientsSection) {
        if (client) ribbon.after(clientsSection); else proRule.after(clientsSection);
        // Between two hairlines in the pro order it is tight top and bottom; first in the client order, full
        clientsSection.classList.toggle('section--tight-top', !client);
        clientsSection.classList.toggle('section--tight-bottom', !client);
        document.querySelectorAll('main .eyebrow__num').forEach((n, i) => { n.textContent = String(i + 1).padStart(2, '0'); });
      }
      const tab = document.getElementById(client ? 'tab-clients' : 'tab-pros');
      if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
      if (!tapped) return;
      if (hero) hero.classList.add('is-switched');
      try {
        const url = new URL(window.location.href);
        if (client) url.searchParams.set('for', 'clients'); else url.searchParams.delete('for');
        window.history.replaceState(window.history.state, '', url);
      } catch (e) { /* the address just stays as it was */ }
    };

    audButtons.forEach((b) => b.addEventListener('click', () => {
      if (b.getAttribute('aria-pressed') !== 'true') setAud(b.dataset.audSet, true);
    }));
    if (root.classList.contains('aud-client')) setAud('client', false);
  }

  /* ---------- Scroll reveal + in-view Gold Reveal logos (not the docked header one) ---------- */
  const revealEls = document.querySelectorAll('.reveal, main .gr--inview');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('is-visible', 'is-on'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible', 'is-on');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealEls.forEach((el) => io.observe(el));
  }
})();
