export default function TagColorDot({ color = '#cbd5e1', className = '' }) {
  return <span className={`inline-block w-3 h-3 rounded-full`} style={{ backgroundColor: color }} aria-hidden />
}
