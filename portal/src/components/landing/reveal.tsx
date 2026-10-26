'use client';

import { motion, type HTMLMotionProps } from 'motion/react';

// Fades and lifts content in the first time it scrolls into view.
export function Reveal({ delay = 0, y = 24, ...props }: HTMLMotionProps<'div'> & { delay?: number; y?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      {...props}
    />
  );
}

export function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: React.ReactNode; body?: React.ReactNode }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="text-[13px] font-medium tracking-[-0.005em] text-brand">{eyebrow}</p>
      <h2 className="mt-3 font-display text-[2.1rem] text-ink sm:text-[3.25rem]">{title}</h2>
      {body && <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed tracking-[-0.005em] text-muted sm:text-lg">{body}</p>}
    </Reveal>
  );
}
