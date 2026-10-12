// The one place the frontend knows where albums come from.
// For now this is a static file in /public; once the backend exists,
// change this to '/api/albums' and nothing else needs to move.
const ALBUMS_URL = '/albums.json'

export async function fetchAlbums() {
  const response = await fetch(ALBUMS_URL)
  if (!response.ok) {
    throw new Error(`Could not load albums (${response.status})`)
  }
  return response.json()
}
