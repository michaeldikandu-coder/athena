'use client';

import { useEffect, useRef } from 'react';

/**
 * Mounts the dealt tasteskill moment (letters-assemble) from /kit/moments.
 * The statement is plain HTML, so it reads finished without script, on a
 * phone, and under reduced motion; the moment only adds the motion.
 */
export function LettersAssemble({ statement, sub }: { statement: string; sub: string }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let destroyed = false;
    let handle: { unmountAll?: (root?: Element) => void } | null = null;
    (window as unknown as { __momentsManual?: boolean }).__momentsManual = true;
    import(/* webpackIgnore: true */ '/kit/moments/moments.js' as string)
      .then((mod: { mount: (el: Element) => Promise<unknown>; unmountAll: (root?: Element) => void }) => {
        if (destroyed) return;
        handle = mod;
        return mod.mount(el);
      })
      .catch(() => el.classList.add('mo-safe'));
    return () => {
      destroyed = true;
      handle?.unmountAll?.(el.parentElement ?? undefined);
    };
  }, []);

  return (
    <section ref={ref} data-moment="letters-assemble" className="lp-section" aria-labelledby="statement-h">
      <div className="wrap">
        <h2 id="statement-h" className="mo-la__type">{statement}</h2>
        <p className="mo-la__sub">{sub}</p>
      </div>
    </section>
  );
}
