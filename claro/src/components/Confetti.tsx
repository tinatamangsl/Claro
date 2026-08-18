import { useEffect } from "react";

/** Deterministic spread — organic-looking without being random on every render. */
const PIECES = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2 + (i % 3) * 0.35;
  const spread = 42 + (i % 5) * 16;
  return {
    dx: `${Math.round(Math.cos(angle) * spread)}px`,
    dy: `${Math.round(Math.sin(angle) * spread - 30)}px`,
    rotate: `${(i % 2 === 0 ? 1 : -1) * (120 + i * 17)}deg`,
    delay: `${(i % 6) * 28}ms`,
    tone: i % 3,
  };
});

const TONES = [
  "hsl(22 73% 67%)", // Claro amber
  "hsl(28 78% 60%)",
  "hsl(152 55% 42%)", // completion green
];

/**
 * One small celebration when every habit for the day is ticked — and nothing
 * else. It never appears for a missed day, it cannot be "lost", and it is
 * silent for anyone who has asked for reduced motion (see `.confetti-piece`).
 */
export function Confetti({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 1500);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <span aria-hidden className="confetti">
      {PIECES.map((piece, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              background: TONES[piece.tone],
              "--dx": piece.dx,
              "--dy": piece.dy,
              "--rot": piece.rotate,
              animationDelay: piece.delay,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
