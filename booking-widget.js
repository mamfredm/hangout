/*!
 * Booking Widget — drop-in Calendly-style booking for static sites.
 * Backend: Google Apps Script (see Code.gs).
 *
 * ═══════════════════════════════════════════════════════════════
 * WHAT'S "UNIVERSAL" vs WHAT YOU EDIT PER SITE
 *
 * This whole file is meant to be reused as-is on any project — you
 * should not need to open it up and change code inside. Everything
 * site-specific (colors, which service is being booked, hours, your
 * calendar) is passed in from the OUTSIDE, via the init(cfg) options
 * below. If you find yourself editing something inside this file to
 * make a new site work, that's usually a sign it should become a new
 * cfg option instead.
 *
 * Basic usage:
 *   <div id="booking"></div>
 *   <script src="booking-widget.js"></script>
 *   <script>
 *     BookingWidget.init({
 *       el: '#booking',
 *       endpoint: 'https://script.google.com/macros/s/XXXX/exec', // or 'mock'
 *       lang: 'de',            // 'de' | 'en'
 *       accent: '#fcba01'      // brand color
 *     });
 *   </script>
 *
 * Full list of init(cfg) options:
 *   el          (required) CSS selector or element to render into.
 *   endpoint    (required) Your Apps Script /exec URL, or the string
 *               'mock' to demo the widget with fake data (see mockApi
 *               below) without any backend at all.
 *   lang        'de' | 'en' — defaults to 'de'.
 *   accent      Any CSS color. Sets --cbw-accent. For deeper theming
 *               (backgrounds, text color, etc.) override the widget's
 *               other --cbw-* CSS custom properties from your own
 *               page's stylesheet, scoped to your container — see
 *               ask-her-out.html's #bookingMount block for an example
 *               of re-theming the whole widget without touching this
 *               file.
 *   forceService  Optional. { id, name, duration }. Skips the widget's
 *               own "what would you like to book?" step entirely and
 *               uses this service instead of whatever the backend's
 *               config returns. Handy when the embedding page already
 *               knows what's being booked (e.g. a single-purpose
 *               landing page) rather than showing a menu of services.
 *   onBooked    Optional callback: function(details). Fires once a
 *               booking is actually confirmed, with
 *               { service, date, time, lang }. Lets the embedding
 *               page react — e.g. show its own "see you then!" screen
 *               instead of leaving the visitor on the widget's built-in
 *               done screen.
 *   fields      Optional. Which contact fields to show, in order.
 *               Any of 'name', 'email', 'phone', 'note'. Defaults to all
 *               four. 'email' is always included (bookings need it).
 *               e.g. fields: ['email', 'note']
 *   text        Optional. Override any UI text from the I18N table below
 *               for this one embed, e.g. { email: 'Where should the
 *               invite go?', book: 'Lock it in' }. Placeholders can be
 *               set the same way: namePlaceholder, emailPlaceholder,
 *               phonePlaceholder, notePlaceholder.
 *   extra       Optional. Object (or function returning one) of extra
 *               key/value strings sent along with the booking, e.g.
 *               { food: 'Pizza 🍕', vibe: 'comfy' }. Code.gs shows them
 *               in the calendar event, the emails and the .ics file.
 *   consent     Optional. Shows a checkbox above the submit button.
 *               { required: true } blocks booking until it's ticked.
 *               Text comes from t.consent (plain text) or t.consentHtml
 *               (HTML, e.g. with a link to your privacy policy) — set
 *               either via the text option. Error: t.consentRequired.
 *   mock        Optional. Only used when endpoint is the string 'mock'.
 *               Lets you override the built-in demo data — see
 *               DEFAULT_MOCK below — with your own { businessName,
 *               services, hours, slotTimes, maxAdvanceDays,
 *               minNoticeHours } for a more realistic demo. Ignored
 *               once endpoint points at a real backend.
 * ═══════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════
     1. TRANSLATIONS — all UI text, per language. Add a language by
        adding a new key here (e.g. "fr: { ... }") with the same
        set of fields as "de"/"en".
     ═══════════════════════════════════════════════════════════════ */
  var I18N = {
    de: {
      chooseService: 'Was möchtest du buchen?',
      chooseTime: 'Wähle Datum & Uhrzeit',
      yourDetails: 'Deine Kontaktdaten',
      minutes: 'Min.',
      loading: 'Lade Termine…',
      noSlots: 'An diesem Tag sind keine Termine frei.',
      pickDay: 'Bitte wähle einen Tag aus.',
      name: 'Name',
      email: 'E-Mail',
      phone: 'Telefon (optional)',
      note: 'Anmerkung (optional)',
      back: 'Zurück',
      book: 'Verbindlich buchen',
      booking: 'Wird gebucht…',
      done: 'Termin bestätigt!',
      doneText: 'Du erhältst gleich eine Bestätigung per E-Mail – inklusive Kalendereintrag für Apple, Google & Co.',
      again: 'Weiteren Termin buchen',
      errGeneric: 'Das hat leider nicht geklappt. Bitte versuche es erneut.',
      errTaken: 'Dieser Termin wurde gerade vergeben – bitte wähle einen anderen.',
      required: 'Bitte Name und eine gültige E-Mail angeben.',
      consent: 'Ich habe die Datenschutzerklärung gelesen und stimme zu.',
      consentRequired: 'Bitte stimme der Datenschutzerklärung zu.',
      weekdays: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
      months: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
               'August', 'September', 'Oktober', 'November', 'Dezember'],
      at: 'um', oclock: 'Uhr',
      busyHint: 'Durchgestrichen = da bin ich schon verplant.'
    },
    en: {
      chooseService: 'What would you like to book?',
      chooseTime: 'Pick a date & time',
      yourDetails: 'Your details',
      minutes: 'min',
      loading: 'Loading times…',
      noSlots: 'No free times on this day.',
      pickDay: 'Please pick a day.',
      name: 'Name',
      email: 'Email',
      phone: 'Phone (optional)',
      note: 'Note (optional)',
      back: 'Back',
      book: 'Confirm booking',
      booking: 'Booking…',
      done: 'Booking confirmed!',
      doneText: 'A confirmation email is on its way — including a calendar file for Apple, Google & more.',
      again: 'Book another appointment',
      errGeneric: 'Something went wrong. Please try again.',
      errTaken: 'That time was just taken — please pick another slot.',
      required: 'Please enter your name and a valid email.',
      consent: 'I have read and agree to the privacy policy.',
      consentRequired: 'Please agree to the privacy policy.',
      weekdays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July',
               'August', 'September', 'October', 'November', 'December'],
      at: 'at', oclock: '',
      busyHint: 'Crossed out = already booked.'
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     2. STYLES — injected into <head> once, scoped under the .cbw
        class. All colors reference --cbw-* CSS custom properties,
        which is what makes the widget re-themeable from outside
        this file (see the top-of-file comment).
     ═══════════════════════════════════════════════════════════════ */
  var CSS = '' +
  '.cbw{--cbw-accent:#fcba01;--cbw-ink:#1d1d1f;--cbw-mut:#6e6e73;--cbw-line:#e5e5e8;' +
    '--cbw-bg:#fff;--cbw-soft:#f6f6f7;--cbw-radius:14px;' +
    'font-family:inherit;color:var(--cbw-ink);background:var(--cbw-bg);' +
    'border:1px solid var(--cbw-line);border-radius:var(--cbw-radius);' +
    'max-width:460px;padding:22px;box-sizing:border-box}' +
  '.cbw *,.cbw *:before,.cbw *:after{box-sizing:inherit}' +
  '.cbw-steps{display:flex;gap:6px;margin-bottom:18px}' +
  '.cbw-steps i{flex:1;height:3px;border-radius:2px;background:var(--cbw-line);transition:background .25s}' +
  '.cbw-steps i.on{background:var(--cbw-accent)}' +
  '.cbw h3{margin:0 0 14px;font-size:17px;font-weight:650;line-height:1.3}' +
  '.cbw-svc{display:flex;flex-direction:column;gap:8px}' +
  '.cbw-svc button{display:flex;justify-content:space-between;align-items:center;gap:10px;' +
    'padding:13px 15px;border:1.5px solid var(--cbw-line);border-radius:11px;background:var(--cbw-bg);' +
    'font:inherit;font-size:15px;cursor:pointer;text-align:left;color:var(--cbw-ink);transition:border-color .15s,background .15s}' +
  '.cbw-svc button:hover{border-color:var(--cbw-accent);background:var(--cbw-soft)}' +
  '.cbw-svc small{color:var(--cbw-mut);white-space:nowrap}' +
  '.cbw-cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}' +
  '.cbw-cal-head b{font-size:14.5px}' +
  '.cbw-nav{border:none;background:var(--cbw-soft);border-radius:8px;width:30px;height:30px;' +
    'cursor:pointer;font-size:15px;color:var(--cbw-ink)}' +
  '.cbw-nav:disabled{opacity:.35;cursor:default}' +
  '.cbw-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:14px}' +
  '.cbw-grid span{font-size:11px;color:var(--cbw-mut);text-align:center;padding:4px 0}' +
  '.cbw-grid button{border:none;background:none;font:inherit;font-size:13.5px;padding:0;' +
    'aspect-ratio:1;border-radius:50%;cursor:pointer;color:var(--cbw-ink)}' +
  '.cbw-grid button:hover:not(:disabled){background:var(--cbw-soft)}' +
  '.cbw-grid button:disabled{color:var(--cbw-line);cursor:default}' +
  '.cbw-grid button.sel{background:var(--cbw-accent);font-weight:650}' +
  '.cbw-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:7px;' +
    'max-height:180px;overflow-y:auto;padding:2px}' +
  '.cbw-slots button{padding:9px 0;border:1.5px solid var(--cbw-line);border-radius:9px;' +
    'background:var(--cbw-bg);font:inherit;font-size:13.5px;cursor:pointer;color:var(--cbw-ink);transition:all .12s}' +
  '.cbw-slots button:hover{border-color:var(--cbw-accent)}' +
  '.cbw-slots button.sel{background:var(--cbw-accent);border-color:var(--cbw-accent);font-weight:650}' +
  '.cbw-hint{color:var(--cbw-mut);font-size:13.5px;padding:10px 2px}' +
  '.cbw-sum{background:var(--cbw-soft);border-radius:10px;padding:10px 13px;font-size:13.5px;margin-bottom:14px}' +
  '.cbw label{display:block;font-size:12.5px;color:var(--cbw-mut);margin:10px 0 4px}' +
  '.cbw input,.cbw textarea{width:100%;padding:10px 12px;border:1.5px solid var(--cbw-line);' +
    'border-radius:9px;font:inherit;font-size:14.5px;background:var(--cbw-bg);color:var(--cbw-ink)}' +
  '.cbw input:focus,.cbw textarea:focus{outline:none;border-color:var(--cbw-accent)}' +
  '.cbw-row{display:flex;gap:10px;margin-top:18px}' +
  '.cbw-btn{flex:1;padding:12px;border-radius:10px;font:inherit;font-size:15px;font-weight:600;' +
    'cursor:pointer;border:1.5px solid var(--cbw-line);background:var(--cbw-bg);color:var(--cbw-ink)}' +
  '.cbw-btn.pri{background:var(--cbw-accent);border-color:var(--cbw-accent)}' +
  '.cbw-btn:disabled{opacity:.55;cursor:default}' +
  '.cbw-err{color:#c0392b;font-size:13px;margin-top:10px}' +
  '.cbw-grid button.full{text-decoration:line-through;text-decoration-thickness:1.5px}' +
  '.cbw-slots button.taken,.cbw-slots button.taken:hover{text-decoration:line-through;text-decoration-thickness:1.5px;' +
    'opacity:.38;cursor:default;border-color:var(--cbw-line)}' +
  '.cbw-loader{transition:opacity .2s ease}.cbw-loader.out{opacity:0}' +
  '.cbw-loader canvas{display:block;width:100%}' +
  '.cbw-legend{color:var(--cbw-mut);font-size:12px;margin:-6px 2px 12px}' +
  '.cbw label.cbw-consent{display:flex;gap:10px;align-items:flex-start;margin:16px 0 0;' +
    'font-size:13px;line-height:1.45;color:var(--cbw-ink);cursor:pointer}' +
  '.cbw .cbw-consent input{width:18px;height:18px;flex:none;margin:1px 0 0;padding:0;accent-color:var(--cbw-accent)}' +
  '.cbw .cbw-consent a{color:inherit}' +
  '.cbw-done{text-align:center;padding:14px 4px}' +
  '.cbw-done .ico{width:54px;height:54px;border-radius:50%;background:var(--cbw-accent);' +
    'display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:26px}' +
  '.cbw-done p{color:var(--cbw-mut);font-size:14px;line-height:1.5}' +
  '@media(prefers-reduced-motion:no-preference){.cbw-view{animation:cbwIn .18s ease}}' +
  '@keyframes cbwIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}';

  function injectCss() {
    if (document.getElementById('cbw-css')) return;
    var s = document.createElement('style');
    s.id = 'cbw-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ───────── helpers ───────── */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function iso(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function niceDate(isoStr, lang) {
    var p = isoStr.split('-');
    return lang === 'de' ? p[2] + '.' + p[1] + '.' + p[0] : isoStr;
  }

  /* ═══════════════════════════════════════════════════════════════
     3. MOCK BACKEND — lets you preview/demo the widget with
        endpoint: 'mock' and no real backend at all. This is
        template/placeholder data on purpose (not tied to any real
        business) — override any of it per-site via cfg.mock, e.g.
        { hours, slotTimes, services, maxAdvanceDays, minNoticeHours,
        businessName } passed into init(). See ask-her-out.html's
        initBookingWidget() for a real example of overriding hours
        and slotTimes for a "dinner date" use case.
     ═══════════════════════════════════════════════════════════════ */
  var DEFAULT_MOCK = {
    businessName: 'Your Business Name',
    services: [
      { id: 'service-a', name: 'Service A · 45 min', duration: 45 },
      { id: 'service-b', name: 'Service B · 60 min', duration: 60 },
      { id: 'service-c', name: 'Service C · 90 min', duration: 90 }
    ],
    // Closed Sundays, open every other day 09:00–18:00 — adjust freely,
    // this is just placeholder data for the 'mock' demo mode.
    hours: { 0: [], 1: ['09:00-18:00'], 2: ['09:00-18:00'], 3: ['09:00-18:00'],
             4: ['09:00-18:00'], 5: ['09:00-18:00'], 6: ['09:00-18:00'] },
    slotTimes: ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'],
    maxAdvanceDays: 60,
    minNoticeHours: 12
  };

  // pseudo-random availability per date, just for the demo:
  // some times taken, roughly every 7th day fully booked
  function mockDay(m, date) {
    var seed = date.split('-').join('') % 7;
    if (seed === 3) return { slots: [], taken: m.slotTimes.slice() };
    return {
      slots: m.slotTimes.filter(function (_, i) { return (i + seed) % 3 !== 0; }),
      taken: m.slotTimes.filter(function (_, i) { return (i + seed) % 3 === 0; })
    };
  }

  // ---- mock API implementation (only used when endpoint === 'mock') ----
  function mockApi(action, params, overrides) {
    var m = {
      businessName: (overrides && overrides.businessName) || DEFAULT_MOCK.businessName,
      services: (overrides && overrides.services) || DEFAULT_MOCK.services,
      hours: (overrides && overrides.hours) || DEFAULT_MOCK.hours,
      slotTimes: (overrides && overrides.slotTimes) || DEFAULT_MOCK.slotTimes,
      maxAdvanceDays: (overrides && overrides.maxAdvanceDays) || DEFAULT_MOCK.maxAdvanceDays,
      minNoticeHours: (overrides && overrides.minNoticeHours) != null ? overrides.minNoticeHours : DEFAULT_MOCK.minNoticeHours
    };
    return new Promise(function (res) {
      setTimeout(function () {
        if (action === 'config') {
          res({
            businessName: m.businessName, services: m.services, hours: m.hours,
            maxAdvanceDays: m.maxAdvanceDays, minNoticeHours: m.minNoticeHours
          });
        } else if (action === 'slots') {
          var day = new Date(params.date + 'T12:00:00').getDay();
          if (!(m.hours[day] || []).length) return res({ slots: [] }); // closed that day
          // pseudo-random availability per date, just for the demo
          res(mockDay(m, params.date));
        } else if (action === 'days') {
          // fully booked days in the bookable window
          var full = [], d0 = new Date(); d0.setHours(12, 0, 0, 0);
          for (var k = 0; k <= m.maxAdvanceDays; k++) {
            var dd = new Date(d0.getTime() + k * 864e5);
            var key = dd.getFullYear() + '-' + ('0' + (dd.getMonth() + 1)).slice(-2) + '-' + ('0' + dd.getDate()).slice(-2);
            if ((m.hours[dd.getDay()] || []).length && !mockDay(m, key).slots.length) full.push(key);
          }
          res({ full: full });
        } else {
          res({ ok: true });
        }
      }, 350);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     3b. LOADER — a tilting, extruded "ticket" with pulsing letters and
        a block progress bar, drawn on a canvas inside the widget.
        Colors come from the widget itself (text color = ink, card
        background = face), so it matches any theme automatically.
        loader(container, { word, font, height, grid }) → { stop(cb) }
     ═══════════════════════════════════════════════════════════════ */
  function loader(container, o) {
    o = o || {};
    var MAX_SKEW_DEG = 7, SWING_SECONDS = 2.4, GLITCH = 0.12;
    var word = String(o.word || 'LOADING').toUpperCase();
    var H = o.height || 230;
    var wrap = el('div', 'cbw-loader');
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-label', o.label || word);
    var canvas = document.createElement('canvas');
    canvas.style.height = H + 'px';
    wrap.appendChild(canvas);
    container.appendChild(wrap);
    var ctx = canvas.getContext('2d');
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var last = performance.now(), time = 0, raf = 0, stopped = false;

    // colors: ink = widget text color, face = first non-transparent background up the tree
    function faceColor(n) {
      for (; n && n.nodeType === 1; n = n.parentNode) {
        var b = getComputedStyle(n).backgroundColor;
        if (b && b !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(b)) return b;
      }
      return '#fff';
    }
    var ink = null, face = null;
    function resolveColors() {   // the container may not be in the page yet on the first call
      if (ink || !wrap.isConnected) return;
      ink = getComputedStyle(wrap).color || '#000';
      face = faceColor(wrap);
    }

    function draw(t) {
      resolveColors();
      if (!ink) return;
      var w = wrap.clientWidth || 300, h = H, dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (o.grid !== false) {                        // faint graph-paper grid
        ctx.strokeStyle = ink; ctx.globalAlpha = 0.08; ctx.lineWidth = 1;
        for (var x = (w % 24) / 2; x < w; x += 24) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
        for (var y = (h % 24) / 2; y < h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }

      var skew = (reduce ? 0 : MAX_SKEW_DEG * Math.sin(t * 2 * Math.PI / SWING_SECONDS)) * Math.PI / 180;
      var pitch = reduce ? 0.12 : Math.sin(t * 1.5) * 0.08 + 0.15;
      var depth = Math.round(Math.min(18, h * 0.08));
      var boxW = Math.min(w - 2 * depth - 24, 360), boxH = Math.min(124, h - 2 * depth - 40);
      var bx = -boxW / 2 - depth / 2, by = -boxH / 2 - depth / 2;

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.transform(1, Math.tan(skew), 0, Math.cos(pitch), 0, 0);

      // extrusion: solid back plate + stacked outlines
      ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
      for (var d = depth; d > 0; d -= 3) {
        ctx.beginPath(); ctx.rect(bx + d, by + d, boxW, boxH);
        if (d === depth) { ctx.fillStyle = ink; ctx.fill(); }
        ctx.stroke();
      }
      // front face, same color as the card it sits on
      ctx.fillStyle = face; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.rect(bx, by, boxW, boxH); ctx.fill(); ctx.stroke();

      // corner accents
      ctx.fillStyle = ink;
      [[bx - 3, by - 3], [bx + boxW - 7, by - 3], [bx - 3, by + boxH - 7], [bx + boxW - 7, by + boxH - 7]]
        .forEach(function (p) { ctx.fillRect(p[0], p[1], 10, 10); });

      // block progress bar
      var barW = boxW - 40, barH = 14, barX = bx + 20, barY = by + boxH - 30;
      ctx.lineWidth = 2; ctx.strokeRect(barX, barY, barW, barH);
      var blocks = 14, active = reduce ? blocks - 1 : Math.floor(((t * 0.8) % 1) * blocks), bw = (barW - 6) / blocks;
      for (var i = 0; i <= active; i++) ctx.fillRect(barX + 3 + i * bw, barY + 3, bw - 2, barH - 6);

      // pulsing, letter-spaced word — font size shrinks to fit the face
      var pulse = reduce ? 0.6 : (Math.sin(t * 3.5) + 1) / 2;
      var maxSpacing = 18, spacing = 3 + pulse * (maxSpacing - 3);
      var size = 30;
      ctx.font = '900 ' + size + 'px ' + (o.font || 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace');
      var plain = ctx.measureText(word).width + (word.length - 1) * maxSpacing;
      if (plain > boxW - 36) {
        size = Math.max(14, Math.floor(size * (boxW - 36) / plain));
        ctx.font = '900 ' + size + 'px ' + (o.font || 'ui-monospace, monospace');
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var widths = [], total = 0;
      for (i = 0; i < word.length; i++) {
        widths.push(ctx.measureText(word[i]).width);
        total += widths[i] + (i < word.length - 1 ? spacing : 0);
      }
      var glitching = !reduce && Math.random() < GLITCH && Math.sin(t * 12) > 0.4;
      if (glitching) {
        ctx.globalAlpha = 0.15;
        ctx.fillRect(bx, by + Math.random() * (boxH - 12), boxW, 12);
        ctx.globalAlpha = 1;
      }
      var sx = bx + boxW / 2 - total / 2, ty = by + (boxH - 30) / 2 + 2;
      ctx.globalAlpha = 0.4 + pulse * 0.6;
      for (i = 0; i < word.length; i++) {
        var cx = sx + widths[i] / 2, cy = ty;
        if (glitching && Math.random() > 0.5) { cx += (Math.random() - 0.5) * 7; cy += (Math.random() - 0.5) * 5; }
        ctx.fillText(word[i], cx, cy);
        if (!reduce && i === Math.floor((t * 6) % word.length)) ctx.fillRect(cx - widths[i] / 2, cy + size * 0.58, widths[i], 3);
        sx += widths[i] + spacing;
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    function frame(now) {
      if (stopped) return;
      if (!canvas.isConnected && ink) return;       // removed by a re-render → stop quietly
      time += (now - last) / 1000; last = now;
      draw(time);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return {
      stop: function (cb) {
        wrap.classList.add('out');
        setTimeout(function () { stopped = true; cancelAnimationFrame(raf); if (cb) cb(); }, reduce ? 0 : 220);
      }
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     4. WIDGET — the actual UI. Everything below runs once per
        init() call, so a page could technically embed more than
        one independent booking widget if it ever needed to.
     ═══════════════════════════════════════════════════════════════ */
  function init(cfg) {
    injectCss();
    var root = typeof cfg.el === 'string' ? document.querySelector(cfg.el) : cfg.el;
    if (!root) { console.error('[BookingWidget] element not found:', cfg.el); return; }

    var lang = cfg.lang === 'en' ? 'en' : 'de';
    var t = {};
    Object.keys(I18N[lang]).forEach(function (k) { t[k] = I18N[lang][k]; });
    if (cfg.text) Object.keys(cfg.text).forEach(function (k) { t[k] = cfg.text[k]; });

    var fields = (cfg.fields && cfg.fields.length) ? cfg.fields.slice() : ['name', 'email', 'phone', 'note'];
    if (fields.indexOf('email') === -1) fields.unshift('email');
    var mock = cfg.endpoint === 'mock';

    var box = el('div', 'cbw');
    if (cfg.accent) box.style.setProperty('--cbw-accent', cfg.accent);
    root.appendChild(box);

    var state = {
      remote: null, service: null, date: null, time: null,
      monthCursor: startOfMonth(new Date()), slots: null, loadingSlots: false,
      pendingService: null, taken: null, fullDays: {}, daysFor: null
    };

    // forceService: skip the "what would you like to book" step entirely and
    // use a client-defined service instead of anything from the backend's
    // service list. Useful when the widget is embedded for a single, known
    // purpose (e.g. "Dinner date") rather than a business with a menu of
    // bookable services. { id, name, duration }
    var forced = cfg.forceService || null;
    var totalSteps = forced ? 2 : 3;

    // showBusy (default on): cross out fully booked days right in the month
    // view and show taken times struck through instead of hiding them.
    // Needs a backend that answers ?action=days; older backends are fine,
    // the calendar then simply looks like before.
    var showBusy = cfg.showBusy !== false;

    // loader: false = plain text instead; or { word, slotsWord, font, minMs }
    var lo = cfg.loader === false ? null : (cfg.loader || {});
    function showLoader(container, word, height, grid) {
      if (!lo) { container.appendChild(el('div', 'cbw-hint', t.loading)); return { stop: function (cb) { if (cb) cb(); } }; }
      return loader(container, { word: word, font: lo.font, height: height, grid: grid, label: t.loading });
    }
    function loadBusyDays() {
      if (!showBusy || !state.service || state.daysFor === state.service.id) return Promise.resolve();
      var forSvc = state.daysFor = state.service.id;
      state.fullDays = {};
      return api('days', { service: forSvc }).then(function (r) {
        if (!r || !r.full || state.daysFor !== forSvc) return;
        state.fullDays = {};
        r.full.forEach(function (d) { state.fullDays[d] = true; });
        if (box.querySelector('.cbw-grid')) renderCalendar();
      }).catch(function () {});
    }

    function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

    function api(action, params, body) {
      if (mock) return mockApi(action, params || {}, cfg.mock);
      if (body) {
        return fetch(cfg.endpoint, {
          method: 'POST', body: JSON.stringify(body),
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow'
        }).then(function (r) { return r.json(); });
      }
      var q = Object.keys(params || {}).map(function (k) {
        return k + '=' + encodeURIComponent(params[k]);
      }).join('&');
      return fetch(cfg.endpoint + '?action=' + action + (q ? '&' + q : ''), { redirect: 'follow' })
        .then(function (r) { return r.json(); });
    }

    /* steps indicator */
    function steps(n) {
      var w = el('div', 'cbw-steps');
      for (var i = 1; i <= totalSteps; i++) w.appendChild(el('i', i <= n ? 'on' : ''));
      return w;
    }
    function view() {
      box.innerHTML = '';
      var v = el('div', 'cbw-view');
      box.appendChild(v);
      return v;
    }

    // Jump straight to the calendar with a given service pre-selected —
    // e.g. when a service is clicked from a price list elsewhere on the
    // page, or (as in ask-her-out.html) via forceService above.
    function selectServiceById(id) {
      if (!state.remote) { state.pendingService = id; return; } // config not loaded yet
      var matches = state.remote.services.filter(function (s) { return s.id === id; });
      if (!matches.length) { renderServices(); return; } // no match → just show the normal list
      state.service = matches[0]; state.date = null; state.time = null; state.slots = null;
      renderCalendar();
      loadBusyDays();
    }

    // ---- step 1: choose a service (skipped entirely if forceService is set) ----
    function renderServices() {
      var v = view();
      v.appendChild(steps(1));
      v.appendChild(el('h3', null, t.chooseService));
      var list = el('div', 'cbw-svc');
      state.remote.services.forEach(function (s) {
        var b = el('button');
        b.appendChild(el('span', null, s.name));
        b.appendChild(el('small', null, s.duration + ' ' + t.minutes));
        b.onclick = function () {
          state.service = s; state.date = null; state.time = null; state.slots = null;
          renderCalendar();
          loadBusyDays();
        };
        list.appendChild(b);
      });
      v.appendChild(list);
    }

    /* persistent summary — grows as service/date/time get picked, shown from step 2 onward */
    function summaryBar() {
      if (!state.service) return null;
      var parts = [state.service.name];
      if (state.date) parts.push(niceDate(state.date, lang));
      if (state.time) parts.push(state.time + (lang === 'de' ? ' ' + t.oclock : ''));
      return el('div', 'cbw-sum', parts.join(' · '));
    }

    // ---- step 2: pick a day, then a time slot ----
    function isDayOpen(d) {
      var hours = state.remote.hours || {};
      var wd = d.getDay();
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var max = new Date(today.getTime() + (state.remote.maxAdvanceDays || 60) * 864e5);
      return d >= today && d <= max && (hours[wd] || []).length > 0;
    }

    function renderCalendar() {
      var v = view();
      v.appendChild(steps(forced ? 1 : 2));
      v.appendChild(el('h3', null, t.chooseTime));
      var sum = summaryBar();
      if (sum) v.appendChild(sum);

      var head = el('div', 'cbw-cal-head');
      var prev = el('button', 'cbw-nav', '‹');
      var next = el('button', 'cbw-nav', '›');
      var m = state.monthCursor;
      head.appendChild(prev);
      head.appendChild(el('b', null, t.months[m.getMonth()] + ' ' + m.getFullYear()));
      head.appendChild(next);
      v.appendChild(head);

      var thisMonth = startOfMonth(new Date());
      prev.disabled = m <= thisMonth;
      prev.onclick = function () { state.monthCursor = new Date(m.getFullYear(), m.getMonth() - 1, 1); renderCalendar(); };
      next.onclick = function () { state.monthCursor = new Date(m.getFullYear(), m.getMonth() + 1, 1); renderCalendar(); };

      var grid = el('div', 'cbw-grid');
      t.weekdays.forEach(function (w) { grid.appendChild(el('span', null, w)); });
      var firstDow = (new Date(m.getFullYear(), m.getMonth(), 1).getDay() + 6) % 7; // Mon-first
      for (var i = 0; i < firstDow; i++) grid.appendChild(el('span'));
      var days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      for (var d = 1; d <= days; d++) {
        (function (d) {
          var date = new Date(m.getFullYear(), m.getMonth(), d);
          var b = el('button', null, String(d));
          var full = isDayOpen(date) && state.fullDays[iso(date)];
          b.disabled = !isDayOpen(date) || !!full;
          if (full) { b.classList.add('full'); b.setAttribute('aria-label', d + ' (' + t.busyHint + ')'); }
          if (state.date === iso(date)) b.classList.add('sel');
          b.onclick = function () { state.date = iso(date); state.time = null; loadSlots(); renderCalendar(); };
          grid.appendChild(b);
        })(d);
      }
      v.appendChild(grid);
      if (showBusy && Object.keys(state.fullDays).length) v.appendChild(el('div', 'cbw-legend', t.busyHint));

      var area = el('div');
      if (!state.date) {
        area.appendChild(el('div', 'cbw-hint', t.pickDay));
      } else if (state.loadingSlots) {
        showLoader(area, (lo && lo.slotsWord) || (lo && lo.word) || 'LOADING', 150, false);
      } else if (state.slots && !state.slots.length && !(showBusy && state.taken && state.taken.length)) {
        area.appendChild(el('div', 'cbw-hint', t.noSlots));
      } else if (state.slots) {
        var slots = el('div', 'cbw-slots');
        var taken = showBusy ? (state.taken || []) : [];
        state.slots.concat(taken).sort().forEach(function (s) {
          var isTaken = taken.indexOf(s) !== -1;
          var b = el('button', isTaken ? 'taken' : (state.time === s ? 'sel' : ''), s);
          if (isTaken) { b.disabled = true; b.setAttribute('aria-label', s + ' (' + t.busyHint + ')'); }
          else b.onclick = function () { state.time = s; renderForm(); };
          slots.appendChild(b);
        });
        area.appendChild(slots);
      }
      v.appendChild(area);

      if (!forced) {
        var row = el('div', 'cbw-row');
        var back = el('button', 'cbw-btn', t.back);
        back.onclick = renderServices;
        row.appendChild(back);
        v.appendChild(row);
      }
    }

    function loadSlots() {
      state.loadingSlots = true; state.slots = null;
      var forDate = state.date;
      api('slots', { date: forDate, service: state.service.id }).then(function (r) {
        if (state.date !== forDate) return; // stale
        state.loadingSlots = false;
        state.slots = r.slots || [];
        state.taken = r.taken || [];
        renderCalendar();
      }).catch(function () {
        state.loadingSlots = false; state.slots = []; state.taken = [];
        renderCalendar();
      });
    }

    // ---- step 3: contact details form ----
    function renderForm() {
      var v = view();
      v.appendChild(steps(forced ? 2 : 3));
      v.appendChild(el('h3', null, t.yourDetails));
      var sum = summaryBar();
      if (sum) v.appendChild(sum);

      function field(labelText, tag, type, name) {
        v.appendChild(el('label', null, labelText));
        var i = el(tag);
        if (type) i.type = type;
        i.name = name;
        v.appendChild(i);
        return i;
      }
      var inputs = {};
      fields.forEach(function (f) {
        if (f === 'name')  inputs.name  = field(t.name, 'input', 'text', 'name');
        if (f === 'email') inputs.email = field(t.email, 'input', 'email', 'email');
        if (f === 'phone') inputs.phone = field(t.phone, 'input', 'tel', 'phone');
        if (f === 'note')  { inputs.note = field(t.note, 'textarea', null, 'note'); inputs.note.rows = 2; }
        if (inputs[f] && t[f + 'Placeholder']) inputs[f].placeholder = t[f + 'Placeholder'];
      });
      if (inputs.email) inputs.email.autocomplete = 'email';
      if (inputs.name) inputs.name.autocomplete = 'name';
      if (inputs.phone) inputs.phone.autocomplete = 'tel';
      var fMail = inputs.email;

      var fConsent = null;
      if (cfg.consent) {
        var cl = el('label', 'cbw-consent');
        fConsent = el('input');
        fConsent.type = 'checkbox';
        var ct = el('span');
        if (t.consentHtml) ct.innerHTML = t.consentHtml; else ct.textContent = t.consent;
        cl.appendChild(fConsent);
        cl.appendChild(ct);
        v.appendChild(cl);
      }

      var err = el('div', 'cbw-err');
      v.appendChild(err);

      var row = el('div', 'cbw-row');
      var back = el('button', 'cbw-btn', t.back);
      back.onclick = renderCalendar;
      var submit = el('button', 'cbw-btn pri', t.book);
      row.appendChild(back);
      row.appendChild(submit);
      v.appendChild(row);

      submit.onclick = function () {
        err.textContent = '';
        var email = fMail.value.trim();
        var nameOk = !inputs.name || inputs.name.value.trim();
        if (!nameOk || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          err.textContent = t.required; return;
        }
        if (fConsent && cfg.consent.required && !fConsent.checked) {
          err.textContent = t.consentRequired; return;
        }
        submit.disabled = back.disabled = true;
        submit.textContent = t.booking;
        var payload = {
          service: state.service.id, date: state.date, time: state.time,
          email: email, lang: lang
        };
        // the name shown to the visitor (matters with forceService, where the
        // backend's own service list doesn't know e.g. "Dinner: Pizza · …")
        payload.serviceName = state.service.name;
        if (fConsent) payload.consent = fConsent.checked;
        var extra = typeof cfg.extra === 'function' ? cfg.extra() : cfg.extra;
        if (extra) payload.extra = extra;
        ['name', 'phone', 'note'].forEach(function (f) {
          if (inputs[f]) payload[f] = inputs[f].value.trim();
        });
        api(null, null, payload).then(function (r) {
          if (r && r.ok) { state.daysFor = null; return renderDone(payload); }
          submit.disabled = back.disabled = false;
          submit.textContent = t.book;
          err.textContent = r && r.error === 'slot_taken' ? t.errTaken : t.errGeneric;
          if (r && r.error === 'slot_taken') { state.time = null; loadSlots(); }
        }).catch(function () {
          submit.disabled = back.disabled = false;
          submit.textContent = t.book;
          err.textContent = t.errGeneric;
        });
      };
    }

    // ---- confirmation screen, shown after a successful booking ----
    function renderDone(sent) {
      var v = view();
      var d = el('div', 'cbw-done');
      d.appendChild(el('div', 'ico', '✓'));
      d.appendChild(el('h3', null, t.done));
      d.appendChild(el('p', null, t.doneText));
      var again = el('button', 'cbw-btn', t.again);
      again.style.marginTop = '16px';
      again.onclick = function () {
        state.service = state.date = state.time = state.slots = null;
        renderServices();
      };
      d.appendChild(again);
      v.appendChild(d);

      // optional hook: let the embedding page react once a slot is actually booked
      // (e.g. advance to a "see you then" screen, show the confirmed date/time, etc.)
      if (typeof cfg.onBooked === 'function') {
        cfg.onBooked({
          service: state.service,
          date: state.date,
          time: state.time,
          name: sent && sent.name,
          email: sent && sent.email,
          lang: lang
        });
      }
    }

    // ---- boot: fetch config, then decide which step to open on ----
    var boot = showLoader(box, (lo && lo.word) || 'LOADING', 300, true);
    var bootStart = Date.now(), minMs = lo && lo.minMs != null ? lo.minMs : 1100;
    function afterBoot(fn) {
      setTimeout(function () { boot.stop(fn); }, Math.max(0, minMs - (Date.now() - bootStart)));
    }
    // with a fixed service, fetch the busy days in parallel so the month
    // view appears with them already crossed out (gives up waiting after 4s)
    var daysReady = Promise.resolve();
    if (forced) {
      state.service = forced;
      daysReady = Promise.race([loadBusyDays(), new Promise(function (res) { setTimeout(res, 4000); })]);
    }
    api('config', {}).then(function (r) {
      state.remote = r;
      if (forced) {
        daysReady.then(function () {
          afterBoot(function () {
            state.date = null; state.time = null; state.slots = null;
            renderCalendar();
          });
        });
      } else {
        afterBoot(function () {
          if (state.pendingService) {
            var id = state.pendingService; state.pendingService = null;
            selectServiceById(id);
          } else {
            renderServices();
          }
        });
      }
    }).catch(function () {
      boot.stop(function () {
        box.innerHTML = '';
        box.appendChild(el('div', 'cbw-err', t.errGeneric));
      });
    });

    return { selectService: selectServiceById };
  }

  /* ═══════════════════════════════════════════════════════════════
     5. PUBLIC API — this is the only thing the outside world sees:
        window.BookingWidget.init(cfg). Everything above is private.
     ═══════════════════════════════════════════════════════════════ */
  global.BookingWidget = { init: init };
})(window);
