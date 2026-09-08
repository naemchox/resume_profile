import { useCallback, useEffect, useState } from 'react'
import { PRODUCTS, type Product } from '../data'

export type CartLine = { id: string; qty: number }

const STORAGE_KEY = 'mayagreen_list_v1'

function load(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Drop anything that no longer maps to a real product.
    return parsed.filter(
      (line: CartLine) =>
        line && typeof line.id === 'string' && PRODUCTS.some((p) => p.id === line.id),
    )
  } catch {
    return []
  }
}

export function useCart() {
  const [lines, setLines] = useState<CartLine[]>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    } catch {
      // Storage can be unavailable in private mode — the cart just won't persist.
    }
  }, [lines])

  const add = useCallback((id: string, qty = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.id === id)
      if (existing) return prev.map((l) => (l.id === id ? { ...l, qty: l.qty + qty } : l))
      return [...prev, { id, qty }]
    })
  }, [])

  const setQty = useCallback((id: string, qty: number) => {
    setLines((prev) =>
      qty <= 0 ? prev.filter((l) => l.id !== id) : prev.map((l) => (l.id === id ? { ...l, qty } : l)),
    )
  }, [])

  const remove = useCallback((id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const detailed = lines
    .map((line) => {
      const product = PRODUCTS.find((p) => p.id === line.id)
      return product ? { ...line, product } : null
    })
    .filter(Boolean) as { id: string; qty: number; product: Product }[]

  const count = lines.reduce((sum, l) => sum + l.qty, 0)
  const subtotal = detailed.reduce((sum, l) => sum + l.product.price * l.qty, 0)

  return { lines: detailed, count, subtotal, add, setQty, remove, clear }
}

export type Cart = ReturnType<typeof useCart>
