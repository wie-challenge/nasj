'use client';
import { useEffect } from 'react';

// Content is visible by default: elements only start hidden once this script has run.
export function LandingMotion({ activeClass }: { activeClass: string }) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.querySelector('[data-landing]');
    if (!root) return;
    root.classList.add(activeClass);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-shown', '');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    for (const element of document.querySelectorAll('[data-reveal]')) observer.observe(element);
    return () => {
      observer.disconnect();
      root.classList.remove(activeClass);
    };
  }, [activeClass]);
  return null;
}
