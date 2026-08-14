import { haversineMeters, walkMinutesFromMeters } from './risk'

export type GeoPoint = { lat: number; lon: number; label: string }

export type TransitResult = {
  station: { name: string; meters: number; walkMin: number } | null
  busStop: { name: string; meters: number; walkMin: number } | null
}

type GsiAddressHit = {
  geometry: { coordinates: [number, number] }
  properties: { title: string }
}

export async function searchAddress(query: string): Promise<GeoPoint | null> {
  const q = query.trim()
  if (!q) return null

  // 国土地理院 住所検索
  try {
    const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`
    const res = await fetch(url)
    if (res.ok) {
      const data = (await res.json()) as GsiAddressHit[]
      if (data?.length) {
        const [lon, lat] = data[0].geometry.coordinates
        return { lat, lon, label: data[0].properties.title || q }
      }
    }
  } catch {
    // CORS等で失敗しうる
  }

  // フォールバック: Nominatim
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
        return {
          lat: Number(data[0].lat),
          lon: Number(data[0].lon),
          label: data[0].display_name,
        }
      }
    }
  } catch {
    // ignore
  }

  return null
}

export async function fetchElevation(lat: number, lon: number): Promise<number | null> {
  try {
    const url =
      `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php` +
      `?lon=${lon}&lat=${lat}&outtype=JSON`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as { elevation?: number | string }
    const elev = Number(data.elevation)
    return Number.isFinite(elev) ? elev : null
  } catch {
    return null
  }
}

type OverpassElement = {
  type: string
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
}

function nearestNamed(
  elements: OverpassElement[],
  lat: number,
  lon: number,
): { name: string; meters: number; walkMin: number } | null {
  let best: { name: string; meters: number; walkMin: number } | null = null
  for (const el of elements) {
    if (el.lat == null || el.lon == null) continue
    const name = el.tags?.name || el.tags?.['name:ja'] || '名称不明'
    const meters = haversineMeters(lat, lon, el.lat, el.lon)
    if (!best || meters < best.meters) {
      best = { name, meters: Math.round(meters), walkMin: walkMinutesFromMeters(meters) }
    }
  }
  return best
}

export async function fetchNearbyTransit(lat: number, lon: number): Promise<TransitResult> {
  const query = `
[out:json][timeout:25];
(
  node["railway"="station"](around:2500,${lat},${lon});
  node["railway"="halt"](around:2500,${lat},${lon});
  node["station"="subway"](around:2500,${lat},${lon});
  node["public_transport"="station"]["railway"](around:2500,${lat},${lon});
  node["highway"="bus_stop"](around:1000,${lat},${lon});
  node["public_transport"="platform"]["bus"="yes"](around:1000,${lat},${lon});
);
out body;
`.trim()

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ]

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      if (!res.ok) continue
      const data = (await res.json()) as { elements: OverpassElement[] }
      const stations = data.elements.filter(
        (e) =>
          e.tags?.railway === 'station' ||
          e.tags?.railway === 'halt' ||
          e.tags?.station === 'subway' ||
          (e.tags?.public_transport === 'station' && e.tags?.railway),
      )
      const buses = data.elements.filter(
        (e) =>
          e.tags?.highway === 'bus_stop' ||
          (e.tags?.public_transport === 'platform' && e.tags?.bus === 'yes'),
      )
      return {
        station: nearestNamed(stations, lat, lon),
        busStop: nearestNamed(buses, lat, lon),
      }
    } catch {
      // try next
    }
  }

  return { station: null, busStop: null }
}

export function officialHazardMapUrl(lat: number, lon: number): string {
  return `https://disaportal.gsi.go.jp/maps/?center=${lon},${lat}&zoom=15`
}
