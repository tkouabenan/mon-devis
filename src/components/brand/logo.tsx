import { cn } from '@/lib/utils';

/** Signature de marque MON DEVIS : monogramme « MD » dans un carré dégradé. */
export function Logo({
  className,
  showWordmark = true,
  size = 'md',
  variant = 'default',
}: {
  className?: string;
  showWordmark?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'light';
}) {
  const sizes = {
    sm: { box: 'size-7 rounded-lg', text: 'text-base', svg: 16 },
    md: { box: 'size-9 rounded-xl', text: 'text-lg', svg: 20 },
    lg: { box: 'size-11 rounded-2xl', text: 'text-xl', svg: 24 },
  };
  const current = sizes[size];

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'relative inline-flex items-center justify-center bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800 text-white shadow-sm shadow-primary/30',
          current.box,
        )}
        aria-hidden
      >
        <svg width={current.svg} height={current.svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 19V5l7 8 7-8v14" />
        </svg>
      </span>
      {showWordmark ? (
        <span className={cn('font-display font-extrabold tracking-tight', current.text, variant === 'light' ? 'text-white' : 'text-navy-900 dark:text-white')}>
          MON<span className="text-primary-600 dark:text-primary-400">DEVIS</span>
        </span>
      ) : null}
    </span>
  );
}
