// Flocos com posições/velocidades determinísticas (sem Math.random) para
// evitar re-render instável e ficar leve. Camada fixa sobre toda a tela.
const pseudo = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

interface NatalSnowProps {
  quantidade?: number;
}

export function NatalSnow({ quantidade = 45 }: NatalSnowProps) {
  const flocos = Array.from({ length: quantidade }, (_, i) => ({
    left: `${(pseudo(i * 7 + 2) * 100).toFixed(2)}%`,
    size: `${(2 + pseudo(i * 7 + 1) * 4).toFixed(1)}px`,
    duration: `${(8 + pseudo(i * 7 + 3) * 9).toFixed(2)}s`,
    delay: `${-(pseudo(i * 7 + 4) * 12).toFixed(2)}s`,
  }));

  return (
    <div className="natal-snow" aria-hidden="true">
      {flocos.map((floco, index) => (
        <span
          key={index}
          className="natal-snow-flake"
          style={{
            left: floco.left,
            width: floco.size,
            height: floco.size,
            animationDuration: floco.duration,
            animationDelay: floco.delay,
          }}
        />
      ))}
    </div>
  );
}
