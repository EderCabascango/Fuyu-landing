/* Fuyu · portada: encabezado, menú en celular, fondo de red de datos y animaciones de entrada */

document.addEventListener('DOMContentLoaded', () => {
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 1. Encabezado fijo: fondo blanco y sombra al hacer scroll; enlace activo según la sección
    const header = document.getElementById('header');
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('section[id]');

    const alHacerScroll = () => {
        header.classList.toggle('scrolled', window.scrollY > 30);
        let actual = 'inicio';
        sections.forEach((s) => { if (window.scrollY >= s.offsetTop - 160) actual = s.id; });
        navLinks.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === `#${actual}`));
    };
    window.addEventListener('scroll', alHacerScroll, { passive: true });
    alHacerScroll();

    // 2. Menú en celular
    const toggle = document.getElementById('menu-toggle');
    const menu = document.getElementById('navigation-menu');
    if (toggle && menu) {
        const cerrar = () => {
            menu.classList.remove('abierto');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
        };
        toggle.addEventListener('click', () => {
            const abierto = menu.classList.toggle('abierto');
            toggle.setAttribute('aria-expanded', String(abierto));
            toggle.innerHTML = abierto ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
        });
        navLinks.forEach((l) => l.addEventListener('click', cerrar));
    }

    // 3. Animaciones de entrada al hacer scroll
    const elementos = document.querySelectorAll('.reveal');
    if (quieto || !('IntersectionObserver' in window)) {
        elementos.forEach((el) => el.classList.add('visible'));
    } else {
        document.querySelectorAll('section, .grid').forEach((bloque) => {
            bloque.querySelectorAll(':scope > .reveal, :scope > .container > .reveal, :scope .hero-content > .reveal').forEach((el, i) => {
                el.style.transitionDelay = `${Math.min(i, 5) * 80}ms`;
            });
        });
        const obs = new IntersectionObserver((entradas) => {
            entradas.forEach((e) => {
                if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
        elementos.forEach((el) => obs.observe(el));
    }

    // 4. Fondo animado de red de datos en el hero
    const canvas = document.getElementById('hero-network-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        const colores = ['rgba(255, 145, 0, 0.45)', 'rgba(233, 30, 99, 0.35)', 'rgba(10, 31, 68, 0.18)'];
        const distanciaMax = 150;
        let puntos = [];
        let ancho = 0, alto = 0;

        const crearPuntos = () => {
            const cantidad = Math.round(Math.min(70, Math.max(28, (ancho * alto) / 16000)));
            puntos = Array.from({ length: cantidad }, () => ({
                x: Math.random() * ancho, y: Math.random() * alto,
                vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
                r: Math.random() * 2.5 + 1.5,
                c: colores[Math.floor(Math.random() * colores.length)],
            }));
        };
        const ajustar = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            ancho = canvas.parentElement.offsetWidth;
            alto = canvas.parentElement.offsetHeight;
            canvas.width = ancho * dpr; canvas.height = alto * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            crearPuntos();
        };
        const dibujar = (mover) => {
            ctx.clearRect(0, 0, ancho, alto);
            for (let i = 0; i < puntos.length; i++) {
                const p = puntos[i];
                if (mover) {
                    p.x += p.vx; p.y += p.vy;
                    if (p.x < 0 || p.x > ancho) p.vx *= -1;
                    if (p.y < 0 || p.y > alto) p.vy *= -1;
                }
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = p.c; ctx.fill();
                for (let j = i + 1; j < puntos.length; j++) {
                    const q = puntos[j];
                    const d = Math.hypot(p.x - q.x, p.y - q.y);
                    if (d < distanciaMax) {
                        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
                        ctx.strokeStyle = `rgba(233, 30, 99, ${(1 - d / distanciaMax) * 0.14})`;
                        ctx.lineWidth = 0.8; ctx.stroke();
                    }
                }
            }
        };

        ajustar();
        window.addEventListener('resize', () => { ajustar(); if (quieto) dibujar(false); });

        if (quieto) {
            dibujar(false); // red fija, sin movimiento
        } else {
            let visible = true;
            new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
            const animar = () => { if (visible && !document.hidden) dibujar(true); requestAnimationFrame(animar); };
            animar();
        }
    }
});
