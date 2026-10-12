import { useEffect, useState } from 'react'
import { fetchAlbums } from '../api/albums'

// Loads the albums once and reports where the request is at.
export function useAlbums() {
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // If the component unmounts before the fetch finishes, skip the updates.
    let cancelled = false

    fetchAlbums()
      .then((data) => {
        if (!cancelled) setAlbums(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { albums, loading, error }
}
