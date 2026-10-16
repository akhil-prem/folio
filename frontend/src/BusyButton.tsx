import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean
  busyLabel?: ReactNode
  idleIcon?: ReactNode
}

export function BusyButton({
  busy = false,
  busyLabel,
  idleIcon,
  children,
  className = 'button primary',
  disabled,
  type = 'button',
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={`${className}${busy ? ' loading' : ''}`}
      disabled={busy || disabled}
      aria-busy={busy}
      {...props}
    >
      {busy ? <Loader2 size={16} className="spinning" /> : idleIcon}
      {busy ? busyLabel ?? children : children}
    </button>
  )
}
