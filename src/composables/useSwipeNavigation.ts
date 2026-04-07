import { onMounted, onUnmounted, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useIsMobile } from './useIsMobile'

const MAIN_ROUTES = [
  '/settings',
  '/invoices/new',
  '/quotes/new',
  '/invoices/accounting',
]

const SWIPE_THRESHOLD = 60
const VERTICAL_LIMIT = 1.2 // max dy/dx ratio — above this it's a scroll, not a swipe

export function useSwipeNavigation(el: Ref<HTMLElement | null>) {
  const router = useRouter()
  const isMobile = useIsMobile()

  let startX = 0
  let startY = 0

  const onTouchStart = (e: TouchEvent) => {
    if (!isMobile.value) return
    startX = e.touches[0]!.clientX
    startY = e.touches[0]!.clientY
  }

  const onTouchEnd = (e: TouchEvent) => {
    if (!isMobile.value) return
    const dx = e.changedTouches[0]!.clientX - startX
    const dy = e.changedTouches[0]!.clientY - startY

    // Ignore if vertical movement dominates (user is scrolling)
    if (Math.abs(dy) > Math.abs(dx) * VERTICAL_LIMIT) return
    if (Math.abs(dx) < SWIPE_THRESHOLD) return

    const currentPath = router.currentRoute.value.path
    const idx = MAIN_ROUTES.indexOf(currentPath)
    if (idx === -1) return

    if (dx < 0 && idx < MAIN_ROUTES.length - 1) {
      // Swipe left → next route
      router.push(MAIN_ROUTES[idx + 1]!)
    } else if (dx > 0 && idx > 0) {
      // Swipe right → previous route
      router.push(MAIN_ROUTES[idx - 1]!)
    }
  }

  onMounted(() => {
    el.value?.addEventListener('touchstart', onTouchStart, { passive: true })
    el.value?.addEventListener('touchend', onTouchEnd, { passive: true })
  })

  onUnmounted(() => {
    el.value?.removeEventListener('touchstart', onTouchStart)
    el.value?.removeEventListener('touchend', onTouchEnd)
  })
}
