/* BookNStyle — booknstyle.com (vanilla JS, no dependencies, no tracking) */

/* ==========================================================================
   STORE LINKS: the ONE place to edit when the apps go live.

   Paste each store URL between the quotes and publish the site.
   Fill in BOTH at the same time: the page-wide wording ("Coming soon" ->
   "Get the app", header button, launch pill, download section) switches only
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

  /* ---------- Header: frosted background after scrolling ---------- */
  const header = document.querySelector('[data-header]');
  if (header) {
    let ticking = false;
    const update = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });
    update();
  }

  /* ---------- Mobile menu (full-height panel; page scroll locked while open) ---------- */
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
    nav.addEventListener('click', (e) => {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    });
    window.matchMedia('(min-width: 960px)').addEventListener('change', (e) => {
      if (e.matches) setOpen(false);
    });
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

  /* ---------- Pause / play looping animations (WCAG 2.2.2) ---------- */
  const motionToggle = document.querySelector('[data-motion-toggle]');
  if (motionToggle && !reduceMotion) {
    motionToggle.hidden = false;
    motionToggle.addEventListener('click', () => {
      const paused = motionToggle.getAttribute('aria-pressed') !== 'true';
      motionToggle.setAttribute('aria-pressed', String(paused));
      root.classList.toggle('motion-paused', paused);
    });
  }

  /* ---------- Tabs (How it works) ---------- */
  document.querySelectorAll('[data-tabs]').forEach((tabsEl) => {
    const tabs = Array.from(tabsEl.querySelectorAll('[role="tab"]'));
    const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));

    const select = (index, focus) => {
      tabs.forEach((tab, i) => {
        const on = i === index;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        if (panels[i]) panels[i].hidden = !on;
      });
      tabsEl.style.setProperty('--tab-i', String(index));
      if (focus) tabs[index].focus();
    };

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i, false));
      tab.addEventListener('keydown', (e) => {
        const last = tabs.length - 1;
        const next = {
          ArrowRight: i === last ? 0 : i + 1,
          ArrowLeft: i === 0 ? last : i - 1,
          Home: 0,
          End: last,
        }[e.key];
        if (next !== undefined) {
          e.preventDefault();
          select(next, true);
        }
      });
    });

    select(0, false);
  });

  /* ---------- Scroll reveal ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
    revealEls.forEach((el) => io.observe(el));
  }
  root.classList.add('reveal-ready');
})();
