import { useEffect, useState } from 'react'

/**
 * Hook to detect if we're on the client side (hydrated)
 * Prevents hydration mismatches for client-only content
 */
export function useIsClient() {
  const [isClient, setIsClient] = useState(false)
  
  useEffect(() => {
    setIsClient(true)
  }, [])
  
  return isClient
}