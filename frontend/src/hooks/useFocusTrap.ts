import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Modal / Drawer 的焦點管理：
 * - 開啟時把焦點移到面板內第一個可聚焦元素（沒有則聚焦面板本身）
 * - Tab / Shift+Tab 在面板內循環（focus trap）
 * - Esc 觸發 onEscape
 * - 關閉後把焦點還給開啟前的元素
 * - 鎖住背景捲動
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
  options?: { lockScroll?: boolean },
) {
  const escapeRef = useRef(onEscape)
  escapeRef.current = onEscape
  const lockScroll = options?.lockScroll ?? true

  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return

    const previous = document.activeElement as HTMLElement | null
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )

    const first = focusables()[0]
    ;(first ?? node).focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        // 沒有指定 onEscape 時不要攔截，讓外層（例如列印預覽）自己處理
        if (!escapeRef.current) return
        event.stopPropagation()
        escapeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        node?.focus()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault()
        lastEl.focus()
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    const previousOverflow = document.body.style.overflow
    if (lockScroll) document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      if (lockScroll) document.body.style.overflow = previousOverflow
      previous?.focus?.()
    }
  }, [active, ref, lockScroll])
}
