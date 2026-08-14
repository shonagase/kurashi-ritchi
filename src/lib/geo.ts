import { inferGeocodePrecision, type GeocodeQuality } from './geocodePrecision'
import { haversineMeters, walkMinutesFromMeters } from './risk'

export type GeoPoint = {
  lat: number
  lon: number
  label: string
  geocode: GeocodeQuality
}

export type TransitStop = {
  name: string
  meters: number
  walkMin: number
  kind: 'station' | 'bus'
}

export type TransitResult = {
  stations: TransitStop[]
  buses: TransitStop[]
  /** Overpass等への問い合わせ自体が失敗したか */
  fetchFailed: boolean
}

/** 徒歩30分 ≈ 2400m（分速80m想定） */
export const WALK_30MIN_METERS = 30 * 80

type GsiAddressHit = {
  geometry: { coordinates: [number, number] }
  properties: { title: string }
}

export async function searchAddress(query: string): Promise<GeoPoint | null> {
  const q = query.trim()
  if (!q) return null

  try {
    const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`
    const res = await fetch(url)
    if (res.ok) {
      const data = (await res.json()) as GsiAddressHit[]
      if (data?.length) {
        const [lon, lat] = data[0].geometry.coordinates
        const label = data[0].properties.title || q
        return {
          lat,
          lon,
          label,
          geocode: inferGeocodePrecision({ query: q, resultLabel: label, source: 'gsi' }),
        }
      }
    }
  } catch {
    // CORS等で失敗しうる
  }

  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&q=` +
      encodeURIComponent(q)
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    })
    if (res.ok) {
      const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
      if (data?.length) {
        const label = data[0].display_name
        return {
          lat: Number(data[0].lat),
          lon: Number(data[0].lon),
          label,
          geocode: inferGeocodePrecision({ query: q, resultLabel: label, source: 'nominatim' }),
        }
      }
    }
  } catch {
    // ignore
  }

  return null
}

export async function fetchElevation(
  lat: number,
  lon: number,
): Promise<{ elevationM: number; hsrc: string | null } | null> {
  try {
    const url =
      `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php` +
      `?lon=${lon}&lat=${lat}&outtype=JSON`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as { elevation?: number | string; hsrc?: string }
    const elev = Number(data.elevation)
    if (!Number.isFinite(elev)) return null
    return {
      elevationM: elev,
      hsrc: data.hsrc ? String(data.hsrc) : null,
    }
  } catch {
    return null
  }
}

type OverpassElement = {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function elementLatLon(el: OverpassElement): { lat: number; lon: number } | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lon: el.lon }
  if (el.center?.lat != null && el.center?.lon != null) {
    return { lat: el.center.lat, lon: el.center.lon }
  }
  return null
}

function isStation(tags: Record<string, string> | undefined): boolean {
  if (!tags) return false
  if (tags.railway === 'station' || tags.railway === 'halt' || tags.railway === 'tram_stop') return true
  if (tags.station === 'subway' || tags.station === 'train') return true
  if (tags.public_transport === 'station' && (tags.railway || tags.train === 'yes' || tags.subway === 'yes')) {
    return true
  }
  return false
}

function isBus(tags: Record<string, string> | undefined): boolean {
  if (!tags) return false
  if (tags.highway === 'bus_stop') return true
  if (tags.amenity === 'bus_station') return true
  if (tags.public_transport === 'platform' && (tags.bus === 'yes' || tags.highway === 'bus_stop')) return true
  if (tags.public_transport === 'stop_position' && tags.bus === 'yes') return true
  return false
}

function collectStops(
  elements: OverpassElement[],
  originLat: number,
  originLon: number,
  kind: 'station' | 'bus',
  maxMeters: number,
): TransitStop[] {
  const byName = new Map<string, TransitStop>()

  for (const el of elements) {
    const tags = el.tags
    if (kind === 'station' ? !isStation(tags) : !isBus(tags)) continue
    const pos = elementLatLon(el)
    if (!pos) continue
    const meters = Math.round(haversineMeters(originLat, originLon, pos.lat, pos.lon))
    if (meters > maxMeters) continue
    const name = tags?.name || tags?.['name:ja'] || tags?.ref || `${kind === 'station' ? '駅' : 'バス停'}(名称不明)`
    const walkMin = walkMinutesFromMeters(meters)
    const prev = byName.get(name)
    if (!prev || meters < prev.meters) {
      byName.set(name, { name, meters, walkMin, kind })
    }
  }

  return [...byName.values()].sort((a, b) => a.walkMin - b.walkMin || a.meters - b.meters)
}

async function queryOverpass(endpoint: string, query: string): Promise<OverpassElement[] | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45000)
  try {
    // POST
    let res = await fetch(endpoint, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      signal: controller.signal,
    })
    if (!res.ok) {
      // GET fallback
      res = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
    }
    if (!res.ok) return null
    const data = (await res.json()) as { elements?: OverpassElement[] }
    return data.elements ?? []
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 徒歩30分圏内の駅・バス停をすべて取得する。
 * OpenStreetMap / Overpass API を利用。
 */
export async function fetchNearbyTransit(
  lat: number,
  lon: number,
  maxWalkMin = 30,
): Promise<TransitResult> {
  const radius = maxWalkMin * 80
  const query = `
[out:json][timeout:45];
(
  nwr["railway"="station"](around:${radius},${lat},${lon});
  nwr["railway"="halt"](around:${radius},${lat},${lon});
  nwr["railway"="tram_stop"](around:${radius},${lat},${lon});
  nwr["station"="subway"](around:${radius},${lat},${lon});
  nwr["public_transport"="station"](around:${radius},${lat},${lon});
  nwr["highway"="bus_stop"](around:${radius},${lat},${lon});
  nwr["amenity"="bus_station"](around:${radius},${lat},${lon});
  nwr["public_transport"="platform"]["bus"="yes"](around:${radius},${lat},${lon});
  nwr["public_transport"="stop_position"]["bus"="yes"](around:${radius},${lat},${lon});
);
out center tags;
`.trim()

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter',
  ]

  for (const endpoint of endpoints) {
    const elements = await queryOverpass(endpoint, query)
    if (!elements) continue
    return {
      stations: collectStops(elements, lat, lon, 'station', radius),
      buses: collectStops(elements, lat, lon, 'bus', radius),
      fetchFailed: false,
    }
  }

  return { stations: [], buses: [], fetchFailed: true }
}

export function officialHazardMapUrl(lat: number, lon: number): string {
  return `https://disaportal.gsi.go.jp/maps/?center=${lon},${lat}&zoom=15`
}
