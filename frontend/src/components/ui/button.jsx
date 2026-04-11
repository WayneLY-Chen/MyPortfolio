// Shadcn UI — Button component
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold uppercase tracking-widest transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default:     'bg-[var(--accent)] text-black border border-transparent hover:opacity-90',
        outline:     'bg-transparent text-[var(--fg)] border border-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]',
        ghost:       'bg-transparent text-[var(--muted)] border border-transparent hover:text-[var(--fg)]',
        destructive: 'bg-transparent text-red-400 border border-red-500/40 hover:border-red-400 hover:text-red-300',
        accent:      'bg-[rgba(200,148,42,0.1)] text-[var(--accent)] border border-[var(--accent)] hover:bg-[rgba(200,148,42,0.18)]',
      },
      size: {
        default: 'h-9 px-5 text-[11px] rounded',
        sm:      'h-7 px-3 text-[10px] rounded-sm',
        lg:      'h-11 px-8 text-xs rounded-md',
        icon:    'h-9 w-9 rounded',
      },
    },
    defaultVariants: { variant: 'outline', size: 'default' },
  }
)

export function Button({ className, variant, size, ...props }) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
