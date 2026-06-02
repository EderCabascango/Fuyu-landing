/* --- Fuyu Page Interactivity & Visuals --- */

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Sticky Navigation & Scroll Highlighting
    const header = document.getElementById('header');
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('section');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }

        // Active Link Highlight on Scroll
        let currentSectionId = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 150;
            if (window.scrollY >= sectionTop) {
                currentSectionId = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${currentSectionId}`) {
                link.classList.add('active');
            }
        });
    });

    // 2. Mobile Menu Toggle
    const menuToggle = document.getElementById('menu-toggle');
    const navMenu = document.getElementById('navigation-menu');

    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            const isMenuOpen = navMenu.style.display === 'flex';
            if (isMenuOpen) {
                navMenu.style.display = 'none';
                menuToggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
            } else {
                navMenu.style.display = 'flex';
                navMenu.style.flexDirection = 'column';
                navMenu.style.position = 'absolute';
                navMenu.style.top = '100%';
                navMenu.style.left = '0';
                navMenu.style.width = '100%';
                navMenu.style.backgroundColor = 'white';
                navMenu.style.padding = '24px';
                navMenu.style.boxShadow = '0 10px 15px rgba(10, 31, 68, 0.08)';
                navMenu.style.gap = '20px';
                menuToggle.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            }
        });

        // Close menu on nav link click
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    navMenu.style.display = 'none';
                    menuToggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
                }
            });
        });
    }

    // 4. Client Testimonials Carousel
    const slides = document.querySelectorAll('.testimonial-slide');
    const dots = document.querySelectorAll('.carousel-dots .dot');
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');
    let currentSlide = 0;
    let carouselInterval;

    function showSlide(index) {
        slides.forEach(slide => slide.classList.remove('active'));
        dots.forEach(dot => dot.classList.remove('active'));
        
        currentSlide = (index + slides.length) % slides.length;
        
        slides[currentSlide].classList.add('active');
        dots[currentSlide].classList.add('active');
    }

    function startAutoplay() {
        clearInterval(carouselInterval);
        carouselInterval = setInterval(() => {
            showSlide(currentSlide + 1);
        }, 7000);
    }

    if (prevBtn && nextBtn) {
        prevBtn.addEventListener('click', () => {
            showSlide(currentSlide - 1);
            startAutoplay();
        });

        nextBtn.addEventListener('click', () => {
            showSlide(currentSlide + 1);
            startAutoplay();
        });
    }

    dots.forEach(dot => {
        dot.addEventListener('click', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            showSlide(index);
            startAutoplay();
        });
    });

    startAutoplay();

    // 4. Hero Section Canvas Interactive Network Animation
    const canvas = document.getElementById('hero-network-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let particles = [];
        const maxParticles = 60;
        const maxDistance = 150;

        function resizeCanvas() {
            canvas.width = canvas.parentElement.offsetWidth;
            canvas.height = canvas.parentElement.offsetHeight;
        }

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.vx = (Math.random() - 0.5) * 0.4;
                this.vy = (Math.random() - 0.5) * 0.4;
                this.radius = Math.random() * 2.5 + 1.5;
                
                // Palette derived colors for particles:
                // Yellow/Orange, Pink/Magenta, Light Navy
                const colors = ['rgba(255, 145, 0, 0.4)', 'rgba(233, 30, 99, 0.3)', 'rgba(10, 31, 68, 0.15)'];
                this.color = colors[Math.floor(Math.random() * colors.length)];
            }

            update() {
                this.x += this.vx;
                this.y += this.vy;

                if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
                if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
            }

            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
            }
        }

        function initParticles() {
            particles = [];
            for (let i = 0; i < maxParticles; i++) {
                particles.push(new Particle());
            }
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();

                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < maxDistance) {
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        
                        // Dynamic gradient coloring for connection lines
                        const alpha = (1 - dist / maxDistance) * 0.12;
                        ctx.strokeStyle = `rgba(233, 30, 99, ${alpha})`;
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                    }
                }
            }

            requestAnimationFrame(animate);
        }

        initParticles();
        animate();
        
        // Reinitalize nodes if size changed drastically to keep proportions
        window.addEventListener('resize', () => {
            initParticles();
        });
    }
});
