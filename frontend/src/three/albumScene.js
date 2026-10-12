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
const VIEW = { width: 23, height: 19, centerX: 0.6, centerY: 0.4 }
const FIELD_OF_VIEW = 30

// How quickly things ease towards where they should be. Higher is snappier.
const EASE = 10
// The same for the background colour, which changes more slowly.
const BACKGROUND_EASE = 3
// The most a case leans towards the pointer, in radians, and how far it lifts.
const MAX_TILT = 0.16
const HOVER_LIFT = 0.5

/*
 * A flip is choreographed so that no two cases are ever in the same place,
 * which would make one show through the other. As fractions of the flight:
 *
 *   0    to OUT_BY      the flipped case slides out to the left of the stack
 *   HOLD                the rest of the stack waits this long, then shifts along
 *   DEPTH.start to end  the flipped case, now clear of the others, changes depth
 *   BACK_FROM to 1      it slides back in, to the slot the others have opened up
 */
const FLIGHT_DURATION = 0.75
const FLIGHT_SWING = -18
const FLIGHT = { outBy: 0.4, hold: 0.25, depth: { start: 0.3, end: 0.7 }, backFrom: 0.6 }

// How far apart, front to back, neighbouring cases in the stack sit.
const DEPTH_STEP = 1.3

// Where a case rests when it is `position` places from the front (0 = front):
// each one back sits up and to the left, further away and a little rotated.
function stackPose(position) {
  const depth = Math.min(position, VISIBLE_CASES - 1)
  // Cases past the visible ones all wait in one spot, tucked directly behind
  // the last visible case. It has to be a spot of its own: two cases in the
  // same place would show through each other.
  const tuckedAway = position >= VISIBLE_CASES ? DEPTH_STEP : 0
  return {
    x: depth * -1.1,
    y: depth * 0.65,
    z: depth * -DEPTH_STEP - tuckedAway,
    tiltX: 0,
    tiltY: 0,
    roll: depth * 0.07,
  }
}

/*
 * Draws the stack of albums into `container` with three.js. It knows nothing
 * about React: the component tells it which album is at the front and where
 * the pointer is, and it handles the drawing and the motion.
 */
export function createAlbumScene(container, albums, { background, reducedMotion, onBackground }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  // Painted the page colour so the canvas disappears into the page. It cannot
  // simply be see-through: the clear plastic needs a background to refract.
  scene.background = new THREE.Color(background)
  // The colour the background is fading towards.
  const backgroundTarget = scene.background.clone()

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
    // `hold` is the place a case keeps for a moment while a flipped one gets clear.
    return { ...parts, coverMaterial, position: i, flight: null, hold: null }
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

  // The place in the stack a case is acting on: its old one while it is held.
  const placeInStack = (item, now) =>
    item.hold !== null && now < item.hold.until ? item.hold.position : item.position

  // Where a flying case is at this moment of its swing.
  const flightPose = ({ start, from, to }, now) => {
    const { smoothstep, lerp } = THREE.MathUtils
    const progress = (now - start) / FLIGHT_DURATION
    // Each part is smoothed, so the case never starts or stops abruptly.
    const travel = smoothstep(progress, 0, 1)
    const out = smoothstep(progress, 0, FLIGHT.outBy) * (1 - smoothstep(progress, FLIGHT.backFrom, 1))
    const depth = smoothstep(progress, FLIGHT.depth.start, FLIGHT.depth.end)
    return {
      x: lerp(from.x, to.x, travel) + out * FLIGHT_SWING,
      y: lerp(from.y, to.y, travel),
      z: lerp(from.z, to.z, depth),
      tiltX: lerp(from.tiltX, to.tiltX, travel),
      tiltY: lerp(from.tiltY, to.tiltY, travel),
      roll: lerp(from.roll, to.roll, travel),
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

  // Where a resting case should be heading right now. A hovered case lifts
  // towards the pointer, but not mid-flip, when the lift could push it into a
  // case passing in front.
  const targetPose = (item, now, flipping) => {
    const pose = stackPose(placeInStack(item, now))
    if (item === hovered && !flipping) {
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
    // Set whenever the case being updated is not yet where it should be.
    let settling = false
    const approach = (current, target) => {
      if (Math.abs(target - current) < 0.0005) return target
      moving = true
      settling = true
      return current + (target - current) * ease
    }

    const flipping = cases.some((item) => isFlying(item, now))

    cases.forEach((item) => {
      settling = false
      const flying = isFlying(item, now)
      const placeNow = placeInStack(item, now)
      // Keep drawing while a case is held, so the frame it lets go is not missed.
      if (placeNow !== item.position) moving = true
      if (flying) {
        // A flying case follows its arc exactly; everything else eases into place.
        place(item, flightPose(item.flight, now))
        moving = true
      } else {
        const pose = targetPose(item, now, flipping)
        const { position, rotation } = item.group
        position.x = approach(position.x, pose.x)
        position.y = approach(position.y, pose.y)
        position.z = approach(position.z, pose.z)
        rotation.x = approach(rotation.x, pose.tiltX)
        rotation.y = approach(rotation.y, pose.tiltY)
        rotation.z = approach(rotation.z, pose.roll)
      }
      // A case on its way to the tucked-away spot stays in view until it gets there.
      item.group.visible = placeNow < VISIBLE_CASES || flying || settling

      // Only the front case shows its disc, once it has landed.
      const discOut = placeNow === 0 && !flying
      item.disc.position.x = approach(item.disc.position.x, discOut ? DISC_OUT_X : DISC_HOME_X)
    })

    // Fade the background towards its target, telling the page each new colour.
    if (!scene.background.equals(backgroundTarget)) {
      const fade = reducedMotion ? 1 : 1 - Math.exp(-BACKGROUND_EASE * elapsed)
      scene.background.lerp(backgroundTarget, fade)
      // Close enough to call it done, or it would creep towards the target forever.
      const { r, g, b } = scene.background
      const gap = Math.abs(r - backgroundTarget.r) + Math.abs(g - backgroundTarget.g) + Math.abs(b - backgroundTarget.b)
      if (gap < 0.0005) scene.background.copy(backgroundTarget)
      onBackground(`#${scene.background.getHexString()}`)
      moving = true
    }

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
        const before = placeInStack(item, now)
        item.position = (i - index + total) % total
        if (item.position === before) return

        // A case already in the air just lands somewhere new.
        if (isFlying(item, now)) {
          item.flight.to = stackPose(item.position)
          return
        }

        // The case swapping between the front and the back goes round the
        // outside of the stack instead of passing through the others.
        const toBack = direction === 'next' && item.position === total - 1
        const toFront = direction === 'prev' && item.position === 0
        if (reducedMotion || total < 2 || direction === null) return

        // Everything else stays put until the flipped case is out of the way.
        if (!(toBack || toFront)) {
          item.hold = { until: now + FLIGHT_DURATION * FLIGHT.hold, position: before }
          return
        }

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

    // Starts fading the background to a new colour.
    setBackground(color) {
      backgroundTarget.set(color)
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
