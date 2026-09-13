/**
 * Links and buttons for the landing page, animated with Framer Motion.
 *
 * Framer Motion owns everything a pointer does on this page — hover, press,
 * the magnetic pull — and GSAP owns everything scroll does. They never animate
 * the same element: GSAP moves sections and their contents, these components
 * move only themselves.
 *
 * Every link is a real anchor with a real href, so it can be opened in a new
 * tab or copied, and a plain click is handed to the router so the app does not
 * reload.
 */
import type { MouseEvent, ReactNode } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { useRouter } from 'expo-router';

/** A click that stays in the app, unless the visitor asked for a new tab. */
export function useGo() {
  const router = useRouter();
  return (href: string) => (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    router.push(href as never);
  };
}

const PRESS = { type: 'spring', stiffness: 700, damping: 32, mass: 0.6 } as const;

export interface PixelCtaProps {
  href: string;
  label: string;
  tone?: 'primary' | 'ghost';
  size?: 'regular' | 'small' | 'huge';
  /** Pull toward the pointer. Only the page's closing call to action uses it. */
  magnetic?: boolean;
  external?: boolean;
}

/**
 * The product's button, rebuilt for the DOM: a face sitting on a solid edge,
 * which the face drops onto when pressed. No blur and no glow, as in the app.
 */
export function PixelCta({ href, label, tone = 'primary', size = 'regular', magnetic = false, external = false }: PixelCtaProps) {
  const go = useGo();
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 180, damping: 16 });
  const sy = useSpring(y, { stiffness: 180, damping: 16 });

  const pull = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (!magnetic || reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * 0.28);
    y.set((e.clientY - (r.top + r.height / 2)) * 0.4);
  };
  const release = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.a
      href={href}
      onClick={external ? undefined : go(href)}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className={`mk-btn mk-btn--${tone} mk-btn--${size}`}
      style={{ x: sx, y: sy }}
      onPointerMove={pull}
      onPointerLeave={release}
      whileHover="lift"
      whileTap="press"
      initial="rest"
    >
      <span className="mk-btn__edge" aria-hidden />
      <motion.span
        className="mk-btn__face"
        variants={reduce ? undefined : { rest: { y: 0 }, lift: { y: -3 }, press: { y: 6 } }}
        transition={PRESS}
      >
        {label}
      </motion.span>
    </motion.a>
  );
}

export interface NavLinkProps {
  href: string;
  children: ReactNode;
}

/** A text link whose underline is drawn from the left on hover. */
export function NavLink({ href, children }: NavLinkProps) {
  const go = useGo();
  return (
    <motion.a href={href} onClick={go(href)} className="mk-navlink" initial="rest" whileHover="hover" whileFocus="hover">
      {children}
      <motion.span
        className="mk-navlink__bar"
        aria-hidden
        variants={{ rest: { scaleX: 0 }, hover: { scaleX: 1 } }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      />
    </motion.a>
  );
}
