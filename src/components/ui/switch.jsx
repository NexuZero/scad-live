import { cn } from '@/lib/utils'

function Switch({ className, ...props }) {
  return (
    <button
      data-slot='switch'
      role='switch'
      type='button'
      className={cn(
        'peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        className
      )}
      {...props}
    >
      <span
        className='pointer-events-none block h-4 w-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0'
      />
    </button>
  )
}

export { Switch }
