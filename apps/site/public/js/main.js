// Front-end behavior copied from the style guide script block (theme toggle,
// dock scroll spy, padel ball canvas) with null guards so it also runs on pages
// without every element.
(() => {
  const root = document.documentElement;
  const storedTheme = localStorage.getItem('px-theme');
  const preferred = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  root.dataset.theme = storedTheme || preferred;

  const themeButton = document.getElementById('themeToggle');
  if (themeButton) {
    themeButton.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('px-theme', root.dataset.theme);
    });
  }

  // Dock scroll spy — hrefs are "/#section" so we match on the trailing anchor.
  const sections = [...document.querySelectorAll('main[id], main section[id]')];
  const dockLinks = [...document.querySelectorAll('.dock a')];
  if (sections.length && dockLinks.length) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          dockLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href').endsWith('#' + entry.target.id)));
        }
      });
    }, {rootMargin:'-36% 0px -56% 0px'});
    sections.forEach(s => observer.observe(s));
  }

  // Reserve CTAs: on mobile, point to the Matchpoint app store listing
  // (store page opens the app when installed). Desktop keeps the default href.
  // Skipped when the template flags a real booking URL (data-has-booking) —
  // in that case every device should follow the configured booking link.
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(navigator.userAgent);
  if (isIOS || isAndroid) {
    document.querySelectorAll('a[data-reserve]:not([data-has-booking])').forEach(a => {
      const url = isIOS ? a.dataset.ios : a.dataset.android;
      if (url) a.href = url;
    });
  }

  const canvas = document.getElementById('ballCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const running = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let w = 0, h = 0;

  function resize() {
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  resize();
  addEventListener('resize', resize);

  const count = innerWidth < 700 ? 5 : 9;
  const balls = Array.from({length:count}, () => {
    const r = 9 + Math.random()*13;
    return {
      x: Math.random()*(innerWidth-r*2)+r,
      y: Math.random()*(innerHeight-r*2)+r,
      vx: (0.28+Math.random()*.58)*(Math.random()>.5?1:-1),
      vy: (0.28+Math.random()*.58)*(Math.random()>.5?1:-1),
      r, alpha:.08+Math.random()*.14, spin:Math.random()*Math.PI*2
    };
  });

  function drawBall(b) {
    ctx.save();
    ctx.globalAlpha=b.alpha;
    const g=ctx.createRadialGradient(b.x-b.r*.34,b.y-b.r*.38,b.r*.08,b.x,b.y,b.r);
    g.addColorStop(0,'#efff70'); g.addColorStop(.44,'#c7f000'); g.addColorStop(1,'#668000');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();
    ctx.translate(b.x,b.y);ctx.rotate(b.spin);
    ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=Math.max(1,b.r*.08);
    ctx.beginPath();ctx.arc(-b.r*.55,0,b.r*.85,-.8,.8);ctx.stroke();
    ctx.beginPath();ctx.arc(b.r*.55,0,b.r*.85,Math.PI-.8,Math.PI+.8);ctx.stroke();
    ctx.restore();
  }

  function frame() {
    ctx.clearRect(0,0,w,h);
    balls.forEach(b => {
      b.x+=b.vx;b.y+=b.vy;b.spin+=.008;
      if(b.x+b.r>w){b.x=w-b.r;b.vx*=-1}
      if(b.x-b.r<0){b.x=b.r;b.vx*=-1}
      if(b.y+b.r>h){b.y=h-b.r;b.vy*=-1}
      if(b.y-b.r<0){b.y=b.r;b.vy*=-1}
      drawBall(b);
    });
    if(running) requestAnimationFrame(frame);
  }
  frame();
})();
