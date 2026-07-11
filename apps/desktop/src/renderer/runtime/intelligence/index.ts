export { RepositoryKnowledgeGraph } from "./RepositoryKnowledgeGraph"
export type { GraphNode, GraphEdge, GraphQuery, PathResult, GraphNodeType, GraphEdgeType } from "./RepositoryKnowledgeGraph"

export { EntryPointExplorer } from "./EntryPointExplorer"
export type { ExplorationResult, ExplorationPlan, ModuleMap } from "./EntryPointExplorer"

export { ImpactAnalyzer } from "./ImpactAnalyzer"
export { RiskScore } from "./ImpactAnalyzer"
export type { ImpactAnalysisReport, DirectDependency, Consumer, RelatedTest, RelatedRoute, DownstreamSymbol } from "./ImpactAnalyzer"

export { CrossFileReasoner } from "./CrossFileReasoner"
export type { SymbolUsage, RelatedTypesResult, SymbolTracePath, CrossFileAnalysis } from "./CrossFileReasoner"

export { ArchitectureAwareRanker } from "./ArchitectureAwareRanker"
export type { RankedFile } from "./ArchitectureAwareRanker"

export { VerificationGraph } from "./VerificationGraph"
export type { VerificationNode, VerificationPlan } from "./VerificationGraph"

export { ArchitecturePlanningStrategy } from "./ArchitecturePlanningStrategy"
export type { ArchitectureContext } from "./ArchitecturePlanningStrategy"

export { LiveGraphEngine, liveGraphEngine } from "./LiveGraphEngine"

export { ASTEnhancedGraph } from "./ASTEnhancedGraph"
export type { ASTEdge, ASTExtractionResult } from "./ASTEnhancedGraph"

export { TestIntelligence } from "./TestIntelligence"
export type { TestMappingResult, AffectedTestSelection } from "./TestIntelligence"
