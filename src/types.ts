import type { MunicipalityProfile } from './data/municipalities'
import type { TransitStop } from './lib/geo'
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
  /** 徒歩30分圏内の駅（近い順） */
  stations: TransitStop[]
  /** 徒歩30分圏内のバス停（近い順） */
  buses: TransitStop[]
  transitFetchFailed: boolean
  /** 比較表用: 最寄り */
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
