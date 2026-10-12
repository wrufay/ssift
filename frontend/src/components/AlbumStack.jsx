import { useEffect, useRef, useState } from 'react'
import { createAlbumScene } from '../three/albumScene'

// How far (in px) a drag has to travel to count as a swipe, and how little to count as a click.
const SWIPE_DISTANCE = 40
const CLICK_DISTANCE = 8

export default function AlbumStack({ albums, theme }) {
  // `index` is the album at the front of the stack.
  const [index, setIndex] = useState(0)
  // Which way the last flip went, so the scene knows which case travels round the stack.
  const [direction, setDirection] = useState(null)
  // Whether the pointer is on a case, for the cursor.
  const [overCase, setOverCase] = useState(false)
  const dragStartX = useRef(null)
  // The element the scene draws into, and the scene itself.
  const stage = useRef(null)
  const scene = useRef(null)

  const total = albums.length
  const canFlip = total > 1

  // Build the three.js scene once the stage exists, and tear it down with it.
  useEffect(() => {
    if (!stage.current) return

    scene.current = createAlbumScene(stage.current, albums, {
      background: getComputedStyle(stage.current).getPropertyValue('--bg').trim(),
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    })

    return () => {
      scene.current.dispose()
      scene.current = null
    }
  }, [albums])

  // The scene paints its own background, so it has to be told when the page colour changes.
  useEffect(() => {
    if (!stage.current) return
    scene.current?.setBackground(getComputedStyle(stage.current).getPropertyValue('--bg').trim())
  }, [albums, theme])

  // React owns which album is at the front; the scene just follows.
  useEffect(() => {
    scene.current?.setFront(index, direction)
  }, [albums, index, direction])

  if (total === 0) return <p className="text-muted">No albums yet.</p>

  const front = albums[index]

  // step is +1 (next) or -1 (previous); the modulo makes the stack loop around.
  const flip = (step) => {
    if (!canFlip) return
    setDirection(step > 0 ? 'next' : 'prev')
    setIndex((index + step + total) % total)
  }

  const trackPointer = (event) => {
    const isOver = scene.current.setPointer(event.clientX, event.clientY)
    setOverCase(isOver)
    return isOver
  }

  const handlePointerDown = (event) => {
    trackPointer(event)
    dragStartX.current = event.clientX
  }

  const handlePointerUp = (event) => {
    if (dragStartX.current === null) return
    const distance = event.clientX - dragStartX.current
    dragStartX.current = null

    if (distance <= -SWIPE_DISTANCE) flip(1)
    else if (distance >= SWIPE_DISTANCE) flip(-1)
    // A click only counts on a case; a swipe works anywhere on the stage.
    else if (Math.abs(distance) < CLICK_DISTANCE && trackPointer(event)) flip(1)
  }

  const handlePointerLeave = () => {
    scene.current.clearPointer()
    setOverCase(false)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowRight') flip(1)
    if (event.key === 'ArrowLeft') flip(-1)
  }

  return (
    <main className="flex flex-col items-center">
      {/* As wide as the screen, so a flipped case has room to swing out to the side. */}
      <div
        ref={stage}
        tabIndex={0}
        role="group"
        aria-label={`Stack of albums, ${index + 1} of ${total}: ${front.title} by ${front.artist}. Click, swipe or use the arrow keys to sift through.`}
        onPointerDown={handlePointerDown}
        onPointerMove={trackPointer}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onKeyDown={handleKeyDown}
        className={`h-72 w-screen touch-pan-y select-none -outline-offset-4 outline-muted ${
          overCase ? 'cursor-pointer' : ''
        }`}
      />
      <p className="font-script text-lg text-muted">{front.year}</p>
    </main>
  )
}
