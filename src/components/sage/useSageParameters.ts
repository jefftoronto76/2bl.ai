'use client'

import { useEffect, useState } from 'react'
import type { SageParameterPublic } from '@/services/chat/ui/v1/parseBookingCards'

export function useSageParameters(): SageParameterPublic[] {
  const [params, setParams] = useState<SageParameterPublic[]>([])

  useEffect(() => {
    let cancelled = false
    console.log('[sage] fetching sage parameters')
    fetch('/api/sage/parameters')
      .then(async r => {
        if (!r.ok) {
          console.error('[sage] sage parameters fetch failed:', r.status)
          return
        }
        const data: SageParameterPublic[] = await r.json()
        if (cancelled) return
        console.log('[sage] sage parameters fetched:', data.length)
        setParams(data)
      })
      .catch(err => {
        console.error('[sage] sage parameters fetch threw:', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return params
}
