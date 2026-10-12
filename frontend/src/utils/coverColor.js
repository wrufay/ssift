// The cover is shrunk to this many pixels a side before it is read: plenty to
// judge its overall colour, and quick to go through.
const SAMPLE_SIZE = 32
// How much of the cover's colour goes into the background (0 = plain white,
// 1 = the colour itself). Kept low: the page should read as off-white with a
// hint of the album, and the dark text has to stay readable on it.
const TINT = 0.16

// Covers already worked out, by URL, so sifting back to one is instant.
const cache = new Map()

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    // Needed to read the pixels of an image from another site.
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load cover ${url}`))
    image.src = url
  })
}

// The cover's most characteristic colour, as [r, g, b] from 0 to 1. A plain
// average comes out muddy, so vivid pixels count for far more than grey ones.
function dominantColour(image) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SAMPLE_SIZE
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
  const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

  const sum = [0, 0, 0]
  let totalWeight = 0
  for (let i = 0; i < data.length; i += 4) {
    const pixel = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]
    const vividness = Math.max(...pixel) - Math.min(...pixel)
    // The small constant keeps a completely grey cover from adding up to nothing.
    const weight = vividness ** 2 + 0.001
    pixel.forEach((channel, c) => (sum[c] += channel * weight))
    totalWeight += weight
  }
  return sum.map((channel) => channel / totalWeight)
}

// Turns any colour into white with a tint of it, fit for a background.
function tone(colour) {
  const [r, g, b] = colour.map((channel) => Math.round((1 + (channel - 1) * TINT) * 255))
  return `rgb(${r}, ${g}, ${b})`
}

// A background colour that suits the cover at `url`, as a CSS colour string.
export async function getCoverColor(url) {
  if (!cache.has(url)) {
    const image = await loadImage(url)
    cache.set(url, tone(dominantColour(image)))
  }
  return cache.get(url)
}
