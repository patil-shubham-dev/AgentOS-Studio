export { MemoryArchitecture } from "./MemoryArchitecture"

export type {
  MemoryEntry,
  MemoryType,
  MemoryScope,
  MemoryCategory,
  MemoryStatus,
  MemoryQuery,
  MemoryCandidate,
  MemoryStats,
  MemoryConfig,
  ExtractionTrigger,
} from "./types"
export { createMemoryEntry, DEFAULT_MEMORY_CONFIG } from "./types"

export { StorageEngine } from "./StorageEngine"
export { ScoringEngine } from "./ScoringEngine"
export type { ScoredCandidate } from "./ScoringEngine"

export { DeduplicationEngine } from "./DeduplicationEngine"
export type { DedupResult } from "./DeduplicationEngine"

export { ConsolidationEngine } from "./ConsolidationEngine"
export type { ConsolidationReport } from "./ConsolidationEngine"
export { shouldConsolidate } from "./ConsolidationEngine"

export { ExtractionEngine } from "./ExtractionEngine"
export type { ExtractionResult } from "./ExtractionEngine"

export { RetrievalEngine } from "./RetrievalEngine"
export type { RetrievalResult } from "./RetrievalEngine"
