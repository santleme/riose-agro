const page = document.querySelector('.manifesto-page');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

page.classList.add('has-reveal');
if (reducedMotion.matches || !('IntersectionObserver' in window)) {
  document.querySelectorAll('[data-reveal]').forEach((element) => element.classList.add('is-visible'));
} else {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, {threshold: 0, rootMargin: '0px'});
  document.querySelectorAll('[data-reveal]').forEach((element) => revealObserver.observe(element));
}
