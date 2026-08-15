import type { MunicipalityProfile } from './data/municipalities'
import type { GeocodeQuality } from './lib/geocodePrecision'
import type { TransitStop } from './lib/geo'
import type { ZoneAssessment } from './lib/hazardZones'
import type { InvariantIssue } from './lib/invariants'
import type { LegalGateResult } from './lib/legalGate'
import type { RainContext } from './lib/rainContext'
import type { HazardLevel } from './lib/risk'
import type { VectorHazardAssessment } from './lib/vectorHazard'
import type { LocationEvalLevel } from './lib/dataQualityGate'

export type Candidate = {
  id: string
  name: string
  address: string
  purchaseManYen: number
  lat: number
  lon: number
  geocode: GeocodeQuality
  /** property / reference / overview / blocked */
  locationEvalLevel: LocationEvalLevel
  legal: LegalGateResult
  elevationM: number | null
  elevationHsrc: string | null
  hazardLevel: HazardLevel
  zones: ZoneAssessment
  vectorHazards: VectorHazardAssessment
  /** Current Conditions（保有リスク評価からは分離） */
  rain: RainContext | null
  municipality: MunicipalityProfile
  invariantIssues: InvariantIssue[]
  stations: TransitStop[]
  buses: TransitStop[]
  transitFetchFailed: boolean
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
