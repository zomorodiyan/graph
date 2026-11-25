import { StructureItem } from '../api/localClient'
import { BODY_MUSCLES, BODY_VIEWBOX } from '../data/bodyFront'

// Body-part tags (see pages/graph/BodyPanel.tsx and components/BodyFigure.tsx):
// a tag naming a part of the body puts its item on the body view — an
// anatomical figure (data/bodyFront.ts) with the page's tagged items laid
// over it as cards, one per part. Ordinary tags in storage ("#knees",
// "#lower-back"), only recognized by name here.
//
// A part is a few of the figure's muscle groups, listed top to bottom —
// the order the panel lays the cards out in. A tag names a part by its id
// or through the aliases below: muscle names, singulars, everyday words.
// The figure shows the front, so back parts land on their front
// counterpart (back → chest & back, lower back → core, glutes → hips).
export interface BodyPart {
  id: string
  label: string
  muscles: string[]
}

const part = (id: string, label: string, muscles: string[]): BodyPart => ({ id, label, muscles })

export const FULL_BODY = 'full-body'

export const BODY_PARTS: BodyPart[] = [
  part('head', 'Head', ['head', 'hair']),
  part('neck', 'Neck', ['neck']),
  part('shoulders', 'Shoulders', ['deltoids', 'trapezius']),
  part('chest', 'Chest & back', ['chest']),
  part('arms', 'Arms', ['biceps', 'triceps', 'forearm']),
  part('hands', 'Hands', ['hands']),
  part('core', 'Core', ['abs', 'obliques']),
  part('hips', 'Hips & glutes', ['adductors']),
  part('legs', 'Legs', ['quadriceps', 'knees']),
  part('calves', 'Calves & shins', ['calves', 'tibialis', 'ankles']),
  part('feet', 'Feet', ['feet']),
  // Whole-body items: every muscle, one card in the middle of the body.
  part(FULL_BODY, 'Full body', Object.keys(BODY_MUSCLES)),
]

const PART_BY_ID = new Map(BODY_PARTS.map(p => [p.id, p]))

// Matched case-insensitively, with "_" read as "-" ("lower_back").
const ALIASES: Record<string, string> = {
  face: 'head', skull: 'head', brain: 'head', scalp: 'head', hair: 'head', headache: 'head', migraine: 'head',
  eye: 'head', eyes: 'head', ear: 'head', ears: 'head', nose: 'head', mouth: 'head', teeth: 'head', tooth: 'head',
  jaw: 'head', lips: 'head', sinus: 'head', sinuses: 'head',
  throat: 'neck', cervical: 'neck',
  shoulder: 'shoulders', delts: 'shoulders', delt: 'shoulders', deltoids: 'shoulders', 'rotator-cuff': 'shoulders',
  traps: 'shoulders', trap: 'shoulders', trapezius: 'shoulders',
  torso: 'chest', pecs: 'chest', pec: 'chest', pectorals: 'chest', breast: 'chest', heart: 'chest', lungs: 'chest',
  lung: 'chest', ribs: 'chest', sternum: 'chest',
  back: 'chest', 'upper-back': 'chest', upperback: 'chest', 'mid-back': 'chest', midback: 'chest', lats: 'chest',
  lat: 'chest', latissimus: 'chest', rhomboids: 'chest', 'shoulder-blades': 'chest', scapula: 'chest', thoracic: 'chest',
  spine: 'chest',
  arm: 'arms', biceps: 'arms', bicep: 'arms', triceps: 'arms', tricep: 'arms', elbow: 'arms', elbows: 'arms',
  forearm: 'arms', forearms: 'arms', grip: 'arms',
  hand: 'hands', wrist: 'hands', wrists: 'hands', finger: 'hands', fingers: 'hands', thumb: 'hands', palm: 'hands',
  abs: 'core', ab: 'core', abdominals: 'core', abdomen: 'core', stomach: 'core', belly: 'core', gut: 'core',
  digestion: 'core', obliques: 'core', oblique: 'core', waist: 'core', sides: 'core',
  'lower-back': 'core', lowerback: 'core', 'low-back': 'core', lowback: 'core', lumbar: 'core', erectors: 'core',
  hip: 'hips', pelvis: 'hips', groin: 'hips', 'hip-flexors': 'hips', hipflexors: 'hips', adductors: 'hips',
  glutes: 'hips', glute: 'hips', butt: 'hips', buttocks: 'hips', gluteus: 'hips',
  leg: 'legs', thigh: 'legs', thighs: 'legs', quads: 'legs', quad: 'legs', quadriceps: 'legs',
  hamstrings: 'legs', hamstring: 'legs', hams: 'legs', knee: 'legs', knees: 'legs',
  calf: 'calves', shin: 'calves', shins: 'calves', tibia: 'calves', tibialis: 'calves', ankle: 'calves', ankles: 'calves',
  foot: 'feet', toe: 'feet', toes: 'feet', heel: 'feet', heels: 'feet', arch: 'feet', sole: 'feet',
  fullbody: FULL_BODY, 'whole-body': FULL_BODY, wholebody: FULL_BODY, body: FULL_BODY,
}

export function bodyPartOf(tag: string): BodyPart | null {
  const key = tag.toLowerCase().replace(/_/g, '-')
  const id = PART_BY_ID.has(key) ? key : ALIASES[key]
  return id ? PART_BY_ID.get(id) ?? null : null
}

export function isBodyTag(tag: string): boolean {
  return bodyPartOf(tag) !== null
}

// The distinct parts an item's tags name.
export function bodyPartsOf(item: StructureItem): BodyPart[] {
  const out: BodyPart[] = []
  for (const tag of item.tags ?? []) {
    const p = bodyPartOf(tag)
    if (p && !out.includes(p)) out.push(p)
  }
  return out
}

// For the agent docs: the names worth tagging with.
export function bodyPartNames(): string {
  return 'head, neck, shoulders, chest, back, arms, hands, core, abs, lower-back, hips, glutes, legs, quads, hamstrings, knees, calves, shins, feet, full-body'
}

// The standing figure turned a quarter turn to lie on its back, head to
// the left (see BodyFigure): where a point of it lands.
export function toLying(x: number, y: number): [number, number] {
  const [vx, vy, vw] = BODY_VIEWBOX
  return [y - vy, vx + vw - x]
}

// Where a part sits on the figure, in the figure's own units: the middle
// of its muscles — of the copy on the viewer's right for paired ones — so
// a card or label can point at it. Standing coordinates are the data's
// (offset by BODY_VIEWBOX's origin); lying ones start at 0,0.
export function partAnchor(part: BodyPart, lying: boolean): [number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const slug of part.muscles) {
    const m = BODY_MUSCLES[slug]
    if (!m) continue
    const b = m.right ?? m.box
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3])
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  return lying ? toLying(cx, cy) : [cx, cy]
}
