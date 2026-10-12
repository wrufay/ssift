import Header from './components/Header'
import AlbumStack from './components/AlbumStack'
import { useAlbums } from './hooks/useAlbums'

export default function App() {
  const { albums, loading, error } = useAlbums()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 overflow-x-clip px-4 py-12">
      <Header />

      {loading && <p className="text-muted">Loading albums…</p>}
      {error && <p className="text-muted">{error}</p>}
      {!loading && !error && <AlbumStack albums={albums} />}
    </div>
  )
}
