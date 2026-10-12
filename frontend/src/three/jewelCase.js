import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// A real jewel case, in centimetres. One unit in the scene is one centimetre.
export const CASE = { width: 14.2, height: 12.5, depth: 1 }

const BOOKLET_SIZE = 12
// The booklet sits against the right wall, leaving the hinge strip clear on the left.
const BOOKLET_X = CASE.width / 2 - 0.25 - BOOKLET_SIZE / 2
const HINGE_X = -CASE.width / 2 + 0.85
const RIDGE_COUNT = 30

const DISC_RADIUS = 6
// Where the disc rests inside the case, and how far it slides out of the front one.
export const DISC_HOME_X = BOOKLET_X
export const DISC_OUT_X = BOOKLET_X + 4.2

// Geometries and materials that every case shares, so they are only built once.
export function createCaseAssets() {
  const geometries = {
    shell: new RoundedBoxGeometry(CASE.width, CASE.height, CASE.depth, 4, 0.15),
    tray: new THREE.BoxGeometry(CASE.width - 0.3, CASE.height - 0.3, 0.45),
    booklet: new THREE.PlaneGeometry(BOOKLET_SIZE, BOOKLET_SIZE),
    gloss: new THREE.PlaneGeometry(CASE.width - 0.3, CASE.height - 0.3),
    ridge: new THREE.BoxGeometry(1.1, 0.13, 0.05),
    seam: new THREE.BoxGeometry(0.05, CASE.height - 0.4, 0.02),
    disc: new THREE.RingGeometry(0.75, DISC_RADIUS, 96),
    hub: new THREE.RingGeometry(0.75, 2, 64),
  }

  const materials = {
    // Clear polystyrene: light passes through it and bends a little.
    plastic: new THREE.MeshPhysicalMaterial({
      transmission: 1,
      thickness: 0.05,
      ior: 1.5,
      roughness: 0,
    }),
    // The shine of the lid on its own: black adds nothing when blended
    // additively, so only the reflections and highlights end up on screen.
    gloss: new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      // A little rough, so reflections spread into a soft sheen instead of a glare.
      roughness: 0.3,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    // The same plastic, moulded rough, for the ridges on the hinge.
    frosted: new THREE.MeshPhysicalMaterial({
      transmission: 1,
      thickness: 0.1,
      ior: 1.5,
      roughness: 0.4,
    }),
    tray: new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.45 }),
    seam: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }),
    // Iridescence is what gives the playing side of a CD its rainbow.
    disc: new THREE.MeshPhysicalMaterial({
      color: 0xdfe3ea,
      // A little glow of its own, so the disc reads as silver in the dim room.
      emissive: 0x8a93a6,
      emissiveIntensity: 0.35,
      metalness: 1,
      roughness: 0.22,
      iridescence: 1,
      iridescenceIOR: 1.8,
      iridescenceThicknessRange: [100, 400],
      side: THREE.DoubleSide,
    }),
    hub: new THREE.MeshStandardMaterial({ color: 0xf2f3f5, metalness: 0.2, roughness: 0.3 }),
  }

  const dispose = () => {
    Object.values(geometries).forEach((geometry) => geometry.dispose())
    Object.values(materials).forEach((material) => material.dispose())
  }

  return { geometries, materials, dispose }
}

// Builds one case around a cover texture. Returns the parts the scene animates.
export function createJewelCase({ geometries, materials }, coverMaterial) {
  const group = new THREE.Group()
  const front = CASE.depth / 2

  const shell = new THREE.Mesh(geometries.shell, materials.plastic)

  const tray = new THREE.Mesh(geometries.tray, materials.tray)
  tray.position.z = -0.2

  // Anything seen through the plastic comes out slightly soft, so the cover
  // is drawn on the face of the case and the lid's shine is laid over it.
  const booklet = new THREE.Mesh(geometries.booklet, coverMaterial)
  booklet.position.set(BOOKLET_X, 0, front + 0.005)
  const gloss = new THREE.Mesh(geometries.gloss, materials.gloss)
  gloss.position.z = front + 0.01

  // The disc lies inside the case, in front of the tray.
  const disc = new THREE.Group()
  disc.add(new THREE.Mesh(geometries.disc, materials.disc))
  const hub = new THREE.Mesh(geometries.hub, materials.hub)
  hub.position.z = 0.005
  disc.add(hub)
  disc.position.set(DISC_HOME_X, 0, 0.1)

  // The hinge: a column of ridges on the lid, and the seam where the lid ends.
  const ridgeSpan = CASE.height - 1.2
  for (let i = 0; i < RIDGE_COUNT; i++) {
    const ridge = new THREE.Mesh(geometries.ridge, materials.frosted)
    const y = -ridgeSpan / 2 + (ridgeSpan * i) / (RIDGE_COUNT - 1)
    ridge.position.set(HINGE_X, y, front + 0.02)
    group.add(ridge)
  }
  const seam = new THREE.Mesh(geometries.seam, materials.seam)
  seam.position.set(HINGE_X + 0.75, 0, front + 0.015)

  group.add(shell, tray, booklet, gloss, disc, seam)
  return { group, shell, disc }
}
