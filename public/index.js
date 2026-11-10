// Fuyu · portada: entradas suaves al hacer scroll y la muestra de revisión.

(() => {
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Entradas: cada elemento aparece al entrar en pantalla, escalonado dentro de su sección
    const elementos = document.querySelectorAll('.revelar, .foto-ancha, .comparacion');
    if (!('IntersectionObserver' in window)) {
        elementos.forEach((el) => el.classList.add('visible'));
    } else {
        document.querySelectorAll('section, article, .servicios-extra').forEach((bloque) => {
            bloque.querySelectorAll(':scope .revelar').forEach((el, i) => {
                if (!quieto) el.style.transitionDelay = `${Math.min(i, 5) * 80}ms`;
            });
        });
        const observador = new IntersectionObserver((entradas) => {
            entradas.forEach((e) => {
                if (e.isIntersecting) {
                    e.target.classList.add('visible');
                    observador.unobserve(e.target);
                }
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
        elementos.forEach((el) => observador.observe(el));
    }

    // Muestra de la demo: corregir la variedad que no existe
    const muestra = document.getElementById('muestra');
    const boton = document.getElementById('muestra-corregir');
    if (muestra && boton) {
        boton.addEventListener('click', () => {
            const corregida = muestra.classList.toggle('corregida');
            document.getElementById('muestra-variedad').textContent = corregida ? 'Pink Floyd' : 'Pink Moonlight';
            document.getElementById('muestra-estado').textContent = corregida ? 'Todo cuadra' : '1 punto en rojo';
            document.getElementById('muestra-alerta').textContent = corregida
                ? 'Pink Floyd 50 cm está en el catálogo. Listo para aprobar.'
                : '“Pink Moonlight” no existe en el catálogo de la finca.';
            boton.textContent = corregida ? 'Deshacer' : 'Corregir a Pink Floyd';
        });
    }
})();
