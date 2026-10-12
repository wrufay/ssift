import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import {
  CASE,
  DISC_HOME_X,
  DISC_OUT_X,
  createCaseAssets,
  createJewelCase,
} from './jewelCase'

// How many cases are visible in the stack at once.
const VISIBLE_CASES = 3

// The part of the scene the camera must always fit, in centimetres, and where
// its middle is. Wider than the stack: it includes the fan and the slid-out disc.
const VIEW = { width: 23, height: 19, centerX: 0.6, centerY: 0.8 }
const FIELD_OF_VIEW = 30

// How quickly things ease towards where they should be. Higher is snappier.
const EASE = 10
// The most a case leans towards the pointer, in radians, and how far it lifts.
const MAX_TILT = 0.16
const HOVER_LIFT = 0.5

// A flipped case swings out to the left of the stack and back in one smooth
// arc, changing depth while it is clear of the others. How long that takes,
// in seconds, and how far out it swings.
const FLIGHT_DURATION = 0.7
const FLIGHT_SWING = -17
// The part of the flight, from 0 to 1, during which the case changes depth.
const DEPTH_CHANGE = { start: 0.3, end: 0.7 }

// Where a case rests when it is `position` places from the front (0 = front):
// each one back sits up and to the left, further away and a little rotated.
function stackPose(position) {
  const depth = Math.min(position, VISIBLE_CASES - 1)
  return { x: depth * -1.1, y: depth * 0.65, z: depth * -1.3, tiltX: 0, tiltY: 0, roll: depth * 0.07 }
}

/*
 * Draws the stack of albums into `container` with three.js. It knows nothing
 * about React: the component tells it which album is at the front and where
 * the pointer is, and it handles the drawing and the motion.
 */
export function createAlbumScene(container, albums, { background, reducedMotion }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  // Painted the page colour so the canvas disappears into the page. It cannot
  // simply be see-through: the clear plastic needs a background to refract.
  scene.background = new THREE.Color(background)

  // A soft studio room for the plastic and the disc to reflect.
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04)
  scene.environment = environment.texture
  // Turned down so the room's lamps glint on a tilted lid without whiting it out.
  scene.environmentIntensity = 0.2

  // A small light that follows the pointer, for a highlight that moves across the lid.
  const pointerLight = new THREE.PointLight(0xffffff, 0, 0, 2)
  scene.add(pointerLight)

  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 1, 200)

  const assets = createCaseAssets()
  const textureLoader = new THREE.TextureLoader()
  const total = albums.length

  // True whenever something changed that the next frame has to draw.
  let dirty = true

  const cases = albums.map((album, i) => {
    // The cover is drawn unlit so its colours match the original artwork.
    const coverMaterial = new THREE.MeshBasicMaterial({ color: 0xd9dbe0 })
    textureLoader.load(album.cover, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
      coverMaterial.map = texture
      coverMaterial.color.set(0xffffff)
      coverMaterial.needsUpdate = true
      dirty = true
    })

    const parts = createJewelCase(assets, coverMaterial)
    parts.shell.userData.caseIndex = i
    scene.add(parts.group)
    // `flight` describes the swing of a flipped case round the stack, while it lasts.
    return { ...parts, coverMaterial, position: i, flight: null }
  })

  const place = (item, pose) => {
    item.group.position.set(pose.x, pose.y, pose.z)
    item.group.rotation.set(pose.tiltX, pose.tiltY, pose.roll)
  }
  cases.forEach((item) => place(item, stackPose(item.position)))

  // The case under the pointer, and where on it the pointer is (-1 to 1 each way).
  let hovered = null
  const hoverPoint = new THREE.Vector2()
  const raycaster = new THREE.Raycaster()
  // Where the pointer is on the canvas (-1 to 1 each way), or null when it is away.
  let pointer = null

  const isFlying = (item, now) =>
    item.flight !== null && now < item.flight.start + FLIGHT_DURATION

  // Where a flying case is at this moment of its swing.
  const flightPose = ({ start, from, to }, now) => {
    const { smoothstep, lerp } = THREE.MathUtils
    // Smoothed so the case starts and lands gently instead of at full speed.
    const progress = smoothstep((now - start) / FLIGHT_DURATION, 0, 1)
    const depthProgress = smoothstep(progress, DEPTH_CHANGE.start, DEPTH_CHANGE.end)
    return {
      // Out and back: the sine is 0 at both ends and 1 in the middle.
      x: lerp(from.x, to.x, progress) + Math.sin(progress * Math.PI) * FLIGHT_SWING,
      y: lerp(from.y, to.y, progress),
      z: lerp(from.z, to.z, depthProgress),
      tiltX: lerp(from.tiltX, to.tiltX, progress),
      tiltY: lerp(from.tiltY, to.tiltY, progress),
      roll: lerp(from.roll, to.roll, progress),
    }
  }

  // Works out which case is under the pointer. Returns whether there is one.
  const updateHover = (now) => {
    raycaster.setFromCamera(pointer, camera)
    const shells = cases
      .filter((item) => item.group.visible && !isFlying(item, now))
      .map((item) => item.shell)
    const [hit] = raycaster.intersectObjects(shells, false)

    hovered = hit && !reducedMotion ? cases[hit.object.userData.caseIndex] : null
    if (hovered) {
      const local = hovered.group.worldToLocal(hit.point.clone())
      hoverPoint.set(local.x / (CASE.width / 2), local.y / (CASE.height / 2))
    }
    return Boolean(hit)
  }

  // Where a resting case should be heading right now.
  const targetPose = (item) => {
    const pose = stackPose(item.position)
    if (item === hovered) {
      pose.tiltX = -hoverPoint.y * MAX_TILT
      pose.tiltY = hoverPoint.x * MAX_TILT
      pose.z += HOVER_LIFT
    }
    return pose
  }

  let lastTime = null
  let wasMoving = false
  let frame = requestAnimationFrame(function tick(time) {
    frame = requestAnimationFrame(tick)
    const now = time / 1000
    // Capped so a background tab coming back does not jump.
    const elapsed = lastTime === null ? 0 : Math.min(now - lastTime, 0.05)
    lastTime = now
    // With reduced motion everything snaps straight to its place.
    const ease = reducedMotion ? 1 : 1 - Math.exp(-EASE * elapsed)

    // While the stack is moving, a different case can slide under a still pointer.
    if (pointer && wasMoving) updateHover(now)

    let moving = false
    const approach = (current, target) => {
      if (Math.abs(target - current) < 0.0005) return target
      moving = true
      return current + (target - current) * ease
    }

    cases.forEach((item) => {
      const flying = isFlying(item, now)
      if (flying) {
        // A flying case follows its arc exactly; everything else eases into place.
        place(item, flightPose(item.flight, now))
        moving = true
      } else {
        const pose = targetPose(item)
        const { position, rotation } = item.group
        position.x = approach(position.x, pose.x)
        position.y = approach(position.y, pose.y)
        position.z = approach(position.z, pose.z)
        rotation.x = approach(rotation.x, pose.tiltX)
        rotation.y = approach(rotation.y, pose.tiltY)
        rotation.z = approach(rotation.z, pose.roll)
      }
      item.group.visible = item.position < VISIBLE_CASES || flying

      // Only the front case shows its disc, once it has landed.
      const discOut = item.position === 0 && !flying
      item.disc.position.x = approach(item.disc.position.x, discOut ? DISC_OUT_X : DISC_HOME_X)
    })

    if (moving || dirty) {
      renderer.render(scene, camera)
      dirty = false
    }
    wasMoving = moving
  })

  // Keeps the canvas the size of its container, and pulls the camera back far
  // enough that the whole view fits whichever way the container is tight.
  const resize = () => {
    const { clientWidth: width, clientHeight: height } = container
    if (width === 0 || height === 0) return
    renderer.setSize(width, height)

    const aspect = width / height
    const halfHeight = Math.max(VIEW.height / 2, VIEW.width / 2 / aspect)
    const distance = halfHeight / Math.tan(THREE.MathUtils.degToRad(FIELD_OF_VIEW / 2))
    camera.aspect = aspect
    camera.position.set(VIEW.centerX, VIEW.centerY, distance)
    camera.updateProjectionMatrix()
    dirty = true
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)
  resize()

  return {
    // Puts album `index` at the front. `direction` is 'next', 'prev' or null.
    setFront(index, direction) {
      const now = performance.now() / 1000

      cases.forEach((item, i) => {
        const before = item.position
        item.position = (i - index + total) % total
        if (item.position === before) return

        // A case already in the air just lands somewhere new.
        if (isFlying(item, now)) {
          item.flight.to = stackPose(item.position)
          return
        }

        // A case coming out of hiding starts from just behind the stack.
        if (before >= VISIBLE_CASES && item.position < VISIBLE_CASES) {
          const back = stackPose(VISIBLE_CASES - 1)
          place(item, { ...back, z: back.z - 1.5 })
        }

        // The case swapping between the front and the back goes round the
        // outside of the stack instead of passing through the others.
        const toBack = direction === 'next' && item.position === total - 1
        const toFront = direction === 'prev' && item.position === 0
        if (reducedMotion || total < 2 || !(toBack || toFront)) return

        // It sets off from wherever it is now, lean and all.
        const { position, rotation } = item.group
        item.flight = {
          start: now,
          from: {
            x: position.x,
            y: position.y,
            z: position.z,
            tiltX: rotation.x,
            tiltY: rotation.y,
            roll: rotation.z,
          },
          to: stackPose(item.position),
        }
      })
      dirty = true
    },

    // Tells the scene where the pointer is. Returns whether it is over a case.
    setPointer(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      const isOver = updateHover(performance.now() / 1000)

      // Hold the light a little in front of the stack, under the pointer.
      const { origin, direction } = raycaster.ray
      const reach = (4 - origin.z) / direction.z
      pointerLight.position.copy(origin).addScaledVector(direction, reach)
      pointerLight.intensity = 3

      dirty = true
      return isOver
    },

    // Repaints the canvas background, for when the page switches theme.
    setBackground(color) {
      scene.background.set(color)
      dirty = true
    },

    clearPointer() {
      pointer = null
      hovered = null
      pointerLight.intensity = 0
      dirty = true
    },

    dispose() {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      cases.forEach((item) => {
        item.coverMaterial.map?.dispose()
        item.coverMaterial.dispose()
      })
      assets.dispose()
      environment.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
