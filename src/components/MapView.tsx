import { MapContainer, TileLayer, Marker, useMapEvents, CircleMarker, useMap } from 'react-leaflet'
import { useEffect } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Candidate } from '../types'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

type Props = {
  center: [number, number]
  candidates: Candidate[]
  selectedId: string | null
  pickMode: boolean
  onPick: (lat: number, lon: number) => void
  onSelect: (id: string) => void
}

function PickHandler({ enabled, onPick }: { enabled: boolean; onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      if (!enabled) return
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom())
  }, [center, map])
  return null
}

export function MapView({ center, candidates, selectedId, pickMode, onPick, onSelect }: Props) {
  return (
    <div className={`map-shell ${pickMode ? 'pick-mode' : ''}`}>
      <MapContainer center={center} zoom={12} scrollWheelZoom className="map-canvas">
        <TileLayer
          attribution='&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
          url="https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"
        />
        <Recenter center={center} />
        <PickHandler enabled={pickMode} onPick={onPick} />
        {candidates.map((c) => (
          <Marker
            key={c.id}
            position={[c.lat, c.lon]}
            eventHandlers={{ click: () => onSelect(c.id) }}
          />
        ))}
        {selectedId &&
          candidates
            .filter((c) => c.id === selectedId)
            .map((c) => (
              <CircleMarker
                key={`sel-${c.id}`}
                center={[c.lat, c.lon]}
                radius={18}
                pathOptions={{ color: '#2f5d50', fillColor: '#7eb89a', fillOpacity: 0.25 }}
              />
            ))}
      </MapContainer>
      {pickMode && <p className="map-hint">地図をクリックして候補地点を追加</p>}
    </div>
  )
}
