// Shadcn UI — Badge component
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center border font-medium transition-colors select-none',
  {
    variants: {
      variant: {
        default:  'bg-[var(--accent)] text-black border-transparent',
        outline:  'border-[var(--muted)] text-[#888] hover:border-[var(--accent)] hover:text-[var(--accent)]',
        ghost:    'border-transparent text-[var(--muted)] hover:text-[var(--fg)]',
        accent:   'bg-[rgba(200,148,42,0.12)] border-[rgba(200,148,42,0.5)] text-[var(--accent)]',
      },
      size: {
        default: 'px-3.5 py-1.5 text-[11px] tracking-widest rounded-sm',
        sm:      'px-2.5 py-1 text-[10px] tracking-wider rounded-sm',
        lg:      'px-5 py-2 text-xs tracking-wider rounded',
      },
    },
    defaultVariants: { variant: 'outline', size: 'default' },
  }
)

export function Badge({ className, variant, size, ...props }) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
}
