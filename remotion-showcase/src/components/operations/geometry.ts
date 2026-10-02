import type { Orientation, Rect } from '../dashboard/geometry'

type OpsGeometry = {
  tablet: Rect
  manager: Rect
  orb: { x: number; y: number }
  orbSize: number
  tabletLook: { x: number; y: number }
  managerLook: { x: number; y: number }
  stockLook: { x: number; y: number }
}

/** Scene 5 split screen: store tablet on one side, the remote manager on the other. */
export const OPS_GEOMETRY: Record<Orientation, OpsGeometry> = {
  desktop: {
    tablet: { x: 116, y: 364, w: 768, h: 580 },
    manager: { x: 1004, y: 160, w: 800, h: 824 },
    orb: { x: 944, y: 640 },
    orbSize: 74,
    tabletLook: { x: 500, y: 700 },
    managerLook: { x: 1300, y: 330 },
    stockLook: { x: 1600, y: 700 },
  },
  vertical: {
    tablet: { x: 80, y: 500, w: 920, h: 420 },
    manager: { x: 80, y: 984, w: 920, h: 556 },
    orb: { x: 944, y: 952 },
    orbSize: 62,
    tabletLook: { x: 540, y: 700 },
    managerLook: { x: 330, y: 1200 },
    stockLook: { x: 780, y: 1250 },
  },
}

export const OPS_TIMING = {
  enter: 466,
  reminder: 476,
  geofence: 488,
  slide: [498, 520] as [number, number],
  pending: 520,
  success: 528,
  managerUpdate: 534,
  hours: 540,
  reviewApprove: 556,
  stockFocus: 568,
  exit: 594,
}
