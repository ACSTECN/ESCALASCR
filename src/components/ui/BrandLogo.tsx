interface BrandLogoProps {
  compact?: boolean;
  light?: boolean;
  subtitle?: string;
  className?: string;
}

/**
 * Logo da marca. Durante o periodo festivo usa a imagem public/logo-natal.png.
 * Para voltar ao logo textual antigo, restaurar o conteudo do componente.
 */
export function BrandLogo({
  compact = false,
  light = false,
  subtitle = 'SISTEMA DE ESCALAS',
  className = '',
}: BrandLogoProps) {
  const subClass = light ? 'text-cyan-200/85' : 'text-cyan-700';

  if (compact) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <img
          src="/logo-natal.png"
          alt="CR Logistics"
          className="h-12 w-auto object-contain"
          draggable={false}
        />
        <div className="min-w-0 leading-none">
          <div className={`truncate text-[9px] font-semibold uppercase tracking-[0.28em] ${subClass}`}>
            {subtitle}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-start gap-3 ${className}`}>
      <img
        src="/logo-natal.png"
        alt="CR Logistics"
        className="h-auto w-full max-w-md object-contain drop-shadow-[0_8px_30px_rgba(0,0,0,0.55)]"
        draggable={false}
      />
      <div className={`text-[10px] font-semibold uppercase tracking-[0.4em] ${subClass}`}>
        {subtitle}
      </div>
    </div>
  );
}
