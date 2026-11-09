"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Slide { src: string; caption: string | null }

/** Swipeable, auto-advancing photo slider (pauses on touch/hover, respects reduced motion). */
export default function PhotoSlider({ slides, title }: { slides: Slide[]; title: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el || slides.length === 0) return;
    const next = (i + slides.length) % slides.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }, [slides.length]);

  // Keep the dots in sync with manual swipes.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => go(index + 1), 4000);
    return () => clearInterval(t);
  }, [index, paused, slides.length, go]);

  if (slides.length === 0) return null;

  return (
    <section aria-roledescription="carrousel" aria-label={title} className="relative"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)} onTouchEnd={() => setTimeout(() => setPaused(false), 6000)}>
      <div ref={track} className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {slides.map((s, i) => (
          <figure key={s.src} className="relative shrink-0 w-full snap-center aspect-[4/3] m-0"
            aria-roledescription="diapositive" aria-label={`${i + 1} sur ${slides.length}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.src} alt={s.caption ?? `Réalisation ${i + 1}`} className="absolute inset-0 size-full object-cover"
              loading={i === 0 ? "eager" : "lazy"} draggable={false} />
            {s.caption && (
              <figcaption className="absolute inset-x-0 bottom-0 px-5 pb-8 pt-12 text-white font-semibold text-sm bg-gradient-to-t from-black/60 to-transparent">
                {s.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
          {slides.map((s, i) => (
            <button key={s.src} type="button" onClick={() => go(i)} aria-label={`Photo ${i + 1}`} aria-current={i === index}
              className="p-1.5">
              <span className={`block h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/60"}`} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
