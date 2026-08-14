/** [lon, lat] */
export type LngLat = [number, number]

export type Ring = LngLat[]

export type Polygon = {
  /** 外環。閉じている必要あり（先頭=末尾でも可） */
  outer: Ring
  holes?: Ring[]
}

function ringClosed(ring: Ring): Ring {
  if (ring.length < 3) return ring
  const [fx, fy] = ring[0]
  const [lx, ly] = ring[ring.length - 1]
  if (fx === lx && fy === ly) return ring
  return [...ring, ring[0]]
}

/** レイキャスティング（lon/lat 平面近似。小区域の判定用） */
export function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  const r = ringClosed(ring)
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]
    const [xj, yj] = r[j]
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function pointInPolygon(lon: number, lat: number, polygon: Polygon): boolean {
  if (!pointInRing(lon, lat, polygon.outer)) return false
  for (const hole of polygon.holes ?? []) {
    if (pointInRing(lon, lat, hole)) return false
  }
  return true
}

export type GeoJsonPolygonGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

export function pointInGeoJsonGeometry(
  lon: number,
  lat: number,
  geometry: GeoJsonPolygonGeometry,
): boolean {
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates
    return pointInPolygon(lon, lat, {
      outer: outer as Ring,
      holes: holes as Ring[],
    })
  }
  return geometry.coordinates.some((poly) => {
    const [outer, ...holes] = poly
    return pointInPolygon(lon, lat, {
      outer: outer as Ring,
      holes: holes as Ring[],
    })
  })
}

/** 中心点＋東西南北オフセット(m)で簡易矩形ポリゴンを作る（概形マッチ用） */
export function approxBoxPolygon(
  lat: number,
  lon: number,
  halfEastM: number,
  halfNorthM: number,
): Polygon {
  const dLat = halfNorthM / 111_320
  const cos = Math.cos((lat * Math.PI) / 180)
  const dLon = halfEastM / (111_320 * Math.max(0.2, cos))
  return {
    outer: [
      [lon - dLon, lat - dLat],
      [lon + dLon, lat - dLat],
      [lon + dLon, lat + dLat],
      [lon - dLon, lat + dLat],
      [lon - dLon, lat - dLat],
    ],
  }
}
