type SkelProps = {
  className?: string
  w?: string
  h?: string
}

export function Skel({ className = '', w, h }: SkelProps) {
  return <span className={`skel ${className}`.trim()} style={{ width: w, height: h }} />
}

export function TableSkeleton({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr className="skel-row" key={row}>
          {Array.from({ length: cols }, (_, col) => (
            <td key={col}><Skel className={col === 0 ? 'skel-line mid' : 'skel-line short'} /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function KpiSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>
          <Skel className="skel-line short" />
          <Skel className="skel-value" />
        </div>
      ))}
    </>
  )
}
