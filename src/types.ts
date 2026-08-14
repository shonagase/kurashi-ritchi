import type { MunicipalityProfile } from './data/municipalities'
import type { HazardLevel } from './lib/risk'

export type Candidate = {
  id: string
  name: string
  address: string
  purchaseManYen: number
  lat: number
  lon: number
  elevationM: number | null
  hazardLevel: HazardLevel
  municipality: MunicipalityProfile
  stationName: string | null
  stationWalkMin: number | null
  busName: string | null
  busWalkMin: number | null
  createdAt: number
}

export type SortKey =
  | 'lossImpact'
  | 'stationWalk'
  | 'hazard'
  | 'aging'
  | 'purchase'
