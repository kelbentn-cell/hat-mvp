const checkoutButtons = document.querySelectorAll('[data-checkout]');
const nameAddonTargets = document.querySelectorAll('[data-name-addon]');
const standardPriceTargets = document.querySelectorAll('[data-standard-price]');

const apiBase = (() => {
  const meta = document.querySelector('meta[name="hat-api-base"]');
  const fromWindow = typeof window !== 'undefined' ? window.HAT_API_BASE : '';
  const raw = (fromWindow || (meta && meta.content) || '').trim();
  if (!raw) return '';
  return raw.replace(/\/$/, '');
})();

function apiUrl(path) {
  return apiBase ? `${apiBase}${path}` : path;
}

async function loadConfig() {
  try {
    const res = await fetch(apiUrl('/api/config'));
    const data = await res.json();
    const checkoutUrl = (data.checkoutUrl || '').trim();
    const checkoutUrls = data.checkoutUrls || {};
    const foundersContactUrl = (data.foundersContactUrl || '').trim();
    const nameAddonPrice = Number.isFinite(Number(data.nameAddonPrice)) ? Number(data.nameAddonPrice) : 5;
    const standardPrice = Number.isFinite(Number(data.standardPrice)) ? Number(data.standardPrice) : 3;

    nameAddonTargets.forEach((el) => {
      el.textContent = nameAddonPrice.toString();
    });

    standardPriceTargets.forEach((el) => {
      el.textContent = standardPrice.toString();
    });

    checkoutButtons.forEach((btn) => {
      const tier = (btn.dataset.checkout || 'default').toLowerCase();
      const fallbackUrl = tier === 'standard_addon'
        ? (checkoutUrls.standard_addon || '').trim()
        : (checkoutUrls[tier] || checkoutUrls.default || checkoutUrl || '').trim();
      const tierUrl = tier === 'founders' && foundersContactUrl ? foundersContactUrl : fallbackUrl;
      const opensInNewTab = /^https?:\/\//i.test(tierUrl);

      if (tierUrl) {
        btn.href = tierUrl;
        if (opensInNewTab) {
          btn.target = '_blank';
          btn.rel = 'noopener';
        } else {
          btn.removeAttribute('target');
          btn.removeAttribute('rel');
        }
        btn.classList.remove('is-disabled');
      } else {
        btn.href = '#';
        btn.classList.add('is-disabled');
      }
    });
  } catch (err) {
    checkoutButtons.forEach((btn) => {
      btn.href = '#';
      btn.classList.add('is-disabled');
    });
  }
}

function initVerifyForm() {
  const verifyForm = document.getElementById('verify-form');
  const verifyResult = document.getElementById('verify-result');

  if (!verifyForm || !verifyResult) return;

  verifyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = verifyForm.querySelector('input[name="token"]');
    const token = input.value.trim().toUpperCase();

    if (!token) {
      verifyResult.textContent = 'Enter a token like HAT-000001.';
      return;
    }

    verifyResult.textContent = 'Checking token...';

    try {
      const res = await fetch(apiUrl(`/api/verify?token=${encodeURIComponent(token)}`));
      const data = await res.json();

      if (!data.valid) {
        verifyResult.textContent = `${token} is not valid in the issuance log.`;
        return;
      }

      const name = data.name ? ` Name: ${data.name}.` : ' Name: private.';
      const created = data.created_at ? ` Issued: ${new Date(data.created_at).toLocaleString()}.` : '';
      verifyResult.textContent = `Verified ${data.token}.${name}${created}`;
    } catch (err) {
      verifyResult.textContent = 'Verification failed. Please try again.';
    }
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toLocalDate(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
}

function openCertificatePrintView(certificate) {
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=980,height=760');
  if (!popup) {
    return false;
  }

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HAT Certificate ${escapeHtml(certificate.certificate_number || '')}</title>
  <style>
    body{font-family: 'Space Grotesk', system-ui, sans-serif; background:#f5eddf; color:#171613; margin:0; padding:40px}
    .sheet{max-width:900px; margin:0 auto; border:1px solid rgba(0,0,0,.2); border-radius:20px; background:linear-gradient(170deg,rgba(255,255,255,.95),rgba(255,245,225,.9)); box-shadow:0 24px 50px rgba(45,34,18,.16)}
    .head{padding:22px 28px; border-bottom:1px solid rgba(0,0,0,.12); display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap}
    .title{font-family: 'Fraunces', serif; font-size:14px; text-transform:uppercase; letter-spacing:.11em; color:#3a3d41}
    .serial{font-size:13px; color:#5c5f63}
    .body{padding:30px 28px}
    h1{font-family:'Fraunces', serif; font-size:36px; margin:0 0 12px}
    p{line-height:1.65; margin:0 0 20px}
    .grid{display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px}
    .cell{border:1px dashed rgba(0,0,0,.2); border-radius:12px; background:rgba(255,255,255,.74); padding:12px}
    .label{font-size:12px; letter-spacing:.09em; text-transform:uppercase; color:#5c5f63}
    .value{display:block; margin-top:6px; font-weight:700}
    .token{display:inline-flex; padding:6px 12px; border-radius:999px; background:linear-gradient(120deg,#f3a742,#98d7c7); font-weight:700; letter-spacing:.08em; margin-top:6px}
    @media print{body{padding:0;background:#fff}.sheet{border-radius:0;box-shadow:none;border:1px solid rgba(0,0,0,.2)}}
  </style>
</head>
<body>
  <article class="sheet">
    <header class="head">
      <p class="title">Human Authentication Certificate</p>
      <p class="serial">Certificate: ${escapeHtml(certificate.certificate_number || 'N/A')}</p>
    </header>
    <section class="body">
      <h1>Certificate of Human-Origin Attestation</h1>
      <p>This certifies that token holder <span class="token">${escapeHtml(certificate.token || 'N/A')}</span> has been issued a unique private identifier in the HAT registry.</p>
      <div class="grid">
        <div class="cell"><span class="label">Private User Identifier</span><span class="value">${escapeHtml(certificate.user_identifier || 'N/A')}</span></div>
        <div class="cell"><span class="label">Issued At</span><span class="value">${escapeHtml(toLocalDate(certificate.created_at))}</span></div>
        <div class="cell"><span class="label">Display Name</span><span class="value">${escapeHtml(certificate.name || 'Private')}</span></div>
        <div class="cell"><span class="label">Token</span><span class="value">${escapeHtml(certificate.token || 'N/A')}</span></div>
      </div>
    </section>
  </article>
  <script>window.onload=function(){window.print();}</script>
</body>
</html>`;

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  return true;
}

function initCertificateForm() {
  const form = document.getElementById('certificate-form');
  const result = document.getElementById('certificate-result');
  const card = document.getElementById('certificate-card');
  const printButton = document.getElementById('certificate-print');
  const downloadButton = document.getElementById('certificate-download');

  if (!form || !result || !card || !printButton || !downloadButton) return;

  const numberEl = card.querySelector('[data-cert-number]');
  const tokenEl = card.querySelector('[data-cert-token]');
  const userIdEl = card.querySelector('[data-cert-user-id]');
  const issuedEl = card.querySelector('[data-cert-issued]');
  const nameEl = card.querySelector('[data-cert-name]');

  let currentCertificate = null;
  let currentAccess = null;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const orderId = (form.querySelector('input[name="orderId"]') || {}).value?.trim() || '';
    const email = (form.querySelector('input[name="email"]') || {}).value?.trim() || '';

    if (!orderId || !email) {
      result.textContent = 'Enter both order reference and purchase email.';
      return;
    }

    result.textContent = 'Retrieving certificate...';

    try {
      const response = await fetch(apiUrl('/api/certificate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderId, email })
      });

      const payload = await response.json();
      if (!response.ok || !payload.valid || !payload.certificate) {
        result.textContent = payload.error || 'Certificate lookup failed.';
        card.hidden = true;
        currentCertificate = null;
        return;
      }

      currentCertificate = payload.certificate;
      currentAccess = { orderId, email };
      numberEl.textContent = currentCertificate.certificate_number || 'N/A';
      tokenEl.textContent = currentCertificate.token || 'N/A';
      userIdEl.textContent = currentCertificate.user_identifier || 'N/A';
      issuedEl.textContent = toLocalDate(currentCertificate.created_at);
      nameEl.textContent = currentCertificate.name || 'Private';
      card.hidden = false;
      result.textContent = 'Certificate issued. You can now open print view.';
    } catch (err) {
      result.textContent = 'Certificate lookup failed.';
      card.hidden = true;
      currentCertificate = null;
      currentAccess = null;
    }
  });

  printButton.addEventListener('click', () => {
    if (!currentCertificate) {
      result.textContent = 'Retrieve a certificate first.';
      return;
    }

    const opened = openCertificatePrintView(currentCertificate);
    if (!opened) {
      result.textContent = 'Pop-up blocked. Allow pop-ups and try again.';
    }
  });

  downloadButton.addEventListener('click', async () => {
    if (!currentAccess) {
      result.textContent = 'Retrieve a certificate first.';
      return;
    }

    result.textContent = 'Generating PDF...';
    try {
      const response = await fetch(apiUrl('/api/certificate-pdf'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(currentAccess)
      });

      if (!response.ok) {
        let errorText = 'PDF download failed.';
        try {
          const payload = await response.json();
          errorText = payload.error || errorText;
        } catch (err) {
          // no-op
        }
        result.textContent = errorText;
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeCertId = (currentCertificate?.certificate_number || 'hat-certificate').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
      link.href = objectUrl;
      link.download = `${safeCertId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      result.textContent = 'PDF downloaded.';
    } catch (err) {
      result.textContent = 'PDF download failed.';
    }
  });
}

function initTicker() {
  const track = document.getElementById('ticker-track');
  if (!track) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  track.innerHTML = `${track.innerHTML}${track.innerHTML}`;
}

function initRevealAnimations() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const elements = document.querySelectorAll('.reveal');
  if (!elements.length) return;

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    elements.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18, rootMargin: '0px 0px -40px 0px' }
  );

  elements.forEach((el) => observer.observe(el));
}

function initParallax() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const targets = document.querySelectorAll('.hero-panel, .context-card, .price-card');
  if (!targets.length) return;

  const state = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2
  };

  window.addEventListener('pointermove', (event) => {
    state.x = event.clientX;
    state.y = event.clientY;
  }, { passive: true });

  function animate() {
    const wx = (state.x / window.innerWidth - 0.5) * 2;
    const wy = (state.y / window.innerHeight - 0.5) * 2;

    targets.forEach((target, index) => {
      const factor = 3 + (index % 3) * 0.8;
      const tx = wx * factor;
      const ty = wy * factor;
      target.style.setProperty('--parallax-x', `${tx.toFixed(2)}px`);
      target.style.setProperty('--parallax-y', `${ty.toFixed(2)}px`);
    });

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

function initCanvas() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width = 0;
  let height = 0;
  let mouseX = 0.5;
  let mouseY = 0.5;

  const blobs = [
    { x: 0.1, y: 0.18, r: 0.58, hue: 34, sat: 83, light: 66, alpha: 0.37, speed: 0.00007, offset: 0.4 },
    { x: 0.74, y: 0.12, r: 0.46, hue: 205, sat: 74, light: 72, alpha: 0.31, speed: 0.00006, offset: 1.4 },
    { x: 0.56, y: 0.8, r: 0.53, hue: 156, sat: 65, light: 67, alpha: 0.27, speed: 0.00005, offset: 2.2 },
    { x: 0.24, y: 0.75, r: 0.42, hue: 44, sat: 85, light: 70, alpha: 0.24, speed: 0.00008, offset: 3.1 }
  ];

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw(time) {
    ctx.clearRect(0, 0, width, height);
    const minDimension = Math.min(width, height);

    blobs.forEach((blob) => {
      const waveX = Math.sin(time * blob.speed + blob.offset) * 0.09;
      const waveY = Math.cos(time * blob.speed * 0.75 + blob.offset) * 0.07;
      const pointerX = (mouseX - 0.5) * 0.08;
      const pointerY = (mouseY - 0.5) * 0.08;

      const x = (blob.x + waveX + pointerX) * width;
      const y = (blob.y + waveY + pointerY) * height;
      const radius = blob.r * minDimension;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `hsla(${blob.hue}, ${blob.sat}%, ${blob.light}%, ${blob.alpha})`);
      gradient.addColorStop(0.45, `hsla(${blob.hue}, ${blob.sat}%, ${blob.light}%, ${blob.alpha * 0.6})`);
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    });

    const lineGradient = ctx.createLinearGradient(0, height * 0.2, width, height * 0.8);
    lineGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    lineGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.14)');
    lineGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = lineGradient;
    ctx.fillRect(0, 0, width, height);

    if (!prefersReducedMotion) {
      requestAnimationFrame(draw);
    }
  }

  window.addEventListener('mousemove', (event) => {
    mouseX = event.clientX / window.innerWidth;
    mouseY = event.clientY / window.innerHeight;
  }, { passive: true });

  window.addEventListener('resize', resize);

  resize();
  draw(0);
}

loadConfig();
initVerifyForm();
initCertificateForm();
initTicker();
initRevealAnimations();
initParallax();
initCanvas();
