/**
 * Extended Execution History Module
 *
 * Provides 30-day execution history with compression, archiving, and advanced search capabilities.
 *
 * Features:
 * - Extended 30-day retention (vs default 24 hours)
 * - Compression and archival for old executions
 * - Execution replay with modified inputs
 * - Advanced search and filtering
 * - Data export for external analysis
 */

export { ExtendedHistoryService } from './extended-history-service';
export type {
	ArchivalStatus,
	ExtendedHistoryConfig,
	ExecutionHistoryStats,
} from './extended-history-service';

export { HistoryArchiver } from './history-archiver';
export type { ArchiveConfig, ArchiveStats } from './history-archiver';

export { ExecutionReplay } from './execution-replay';
export type { ReplayOptions, ReplayResult } from './execution-replay';

export { HistorySearch } from './history-search';
export type { SearchCriteria, SearchResult, AggregatedStats } from './history-search';
