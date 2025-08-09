import { z } from 'zod';

import { Config, Env } from '../decorators';

// Validation schema for autosave interval (in seconds)
const autosaveIntervalSchema = z.number().int().min(10).max(3600);

// Validation schema for max file age (in minutes)
const maxFileAgeSchema = z.number().int().min(1).max(10080); // 1 minute to 1 week

@Config
export class AutosaveConfig {
	/** Whether autosave functionality is enabled */
	@Env('N8N_AUTOSAVE_ENABLED')
	enabled: boolean = false;

	/** Autosave interval in seconds (default 30 seconds) */
	@Env('N8N_AUTOSAVE_INTERVAL', autosaveIntervalSchema)
	interval: number = 30;

	/** Maximum number of autosave files to keep per workflow */
	@Env('N8N_AUTOSAVE_MAX_FILES')
	maxFiles: number = 10;

	/** Maximum age of autosave files in minutes before cleanup (default 24 hours) */
	@Env('N8N_AUTOSAVE_MAX_FILE_AGE', maxFileAgeSchema)
	maxFileAge: number = 1440;

	/** Whether to show autosave visual indicators in the UI */
	@Env('N8N_AUTOSAVE_SHOW_INDICATORS')
	showIndicators: boolean = true;

	/** Whether to prevent autosave during manual save operations */
	@Env('N8N_AUTOSAVE_PREVENT_CONFLICTS')
	preventConflicts: boolean = true;

	/** Storage path for autosave files (relative to n8n data directory) */
	@Env('N8N_AUTOSAVE_PATH')
	storagePath: string = 'autosave';

	/** Whether to enable autosave on workflow load/startup */
	@Env('N8N_AUTOSAVE_AUTO_START')
	autoStart: boolean = true;

	/** Minimum time between autosave operations to prevent excessive saves (in milliseconds) */
	@Env('N8N_AUTOSAVE_DEBOUNCE_TIME')
	debounceTime: number = 5000;

	/** Whether to compress autosave files to save storage space */
	@Env('N8N_AUTOSAVE_COMPRESS')
	compress: boolean = false;
}
