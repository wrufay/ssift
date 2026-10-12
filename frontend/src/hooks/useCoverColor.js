import { useEffect, useState } from 'react'
import { getCoverColor } from '../utils/coverColor'

// The background colour that suits a cover, or null until it has been worked
// out (and if the cover cannot be read, in which case the page keeps its own).
export function useCoverColor(coverUrl) {
  const [result, setResult] = useState({ url: null, color: null })

  useEffect(() => {
    if (!coverUrl) return
    // If the album changes before this cover is read, drop the late answer.
    let cancelled = false

    getCoverColor(coverUrl)
      .then((color) => {
        if (!cancelled) setResult({ url: coverUrl, color })
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [coverUrl])

  // Only hand back a colour that belongs to the cover being asked about.
  return result.url === coverUrl ? result.color : null
}
