export function slugify(str = '') {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')          // spaces -> hyphen
    .replace(/[^a-z0-9-_]/g, '')   // safe chars
    .replace(/-+/g, '-')           // collapse dashes
}

export function randomTagColor() {
  const palette = ['#22c55e','#3b82f6','#a855f7','#f59e0b','#ef4444','#14b8a6','#8b5cf6']
  return palette[Math.floor(Math.random() * palette.length)]
}
