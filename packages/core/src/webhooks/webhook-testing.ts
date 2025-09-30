import type { Logger } from 'n8n-workflow';
import { ApplicationError, deepCopy } from 'n8n-workflow';

import type { SignatureVerifier } from './signature-verifier';
import type { IWebhookQueueEvent } from './webhook-queue';

/**
 * Webhook Test Configuration
 */
export interface IWebhookTestConfig {
	url: string;
	method: string;
	headers?: Record<string, string>;
	body?: unknown;
	queryParams?: Record<string, string>;
	timeout?: number;
	followRedirects?: boolean;
	validateSsl?: boolean;
}

/**
 * Webhook Test Result
 */
export interface IWebhookTestResult {
	success: boolean;
	statusCode?: number;
	headers?: Record<string, string | string[]>;
	body?: unknown;
	responseTimeMs: number;
	error?: string;
	redirects?: string[];
}

/**
 * Webhook Replay Configuration
 */
export interface IWebhookReplayConfig {
	eventId: string;
	modifyPayload?: (event: IWebhookQueueEvent) => IWebhookQueueEvent;
	modifyHeaders?: (headers: Record<string, string | string[]>) => Record<string, string | string[]>;
}

/**
 * Webhook Inspector Data
 */
export interface IWebhookInspectorData {
	eventId: string;
	workflowId: string;
	timestamp: Date;
	method: string;
	path: string;
	headers: Record<string, string | string[]>;
	body: unknown;
	queryParams: Record<string, string | string[]>;
	signature?: string;
	signatureValid?: boolean;
	processingResult?: unknown;
}

/**
 * Webhook Mock Configuration
 */
export interface IWebhookMockConfig {
	path: string;
	method: string;
	responseStatus?: number;
	responseBody?: unknown;
	responseHeaders?: Record<string, string>;
	responseDelay?: number;
}

/**
 * Webhook Testing and Debugging Tools
 * Provides utilities for testing, debugging, and inspecting webhooks
 */
export class WebhookTesting {
	private readonly logger: Logger;
	private inspectorData: Map<string, IWebhookInspectorData> = new Map();
	private maxInspectorDataSize = 100;

	constructor(logger: Logger) {
		this.logger = logger;

		this.logger.info('WebhookTesting initialized', {
			function: 'constructor',
		});
	}

	/**
	 * Test a webhook endpoint
	 */
	async testWebhook(config: IWebhookTestConfig): Promise<IWebhookTestResult> {
		const startTime = Date.now();
		this.logger.info('Function started', {
			function: 'testWebhook',
			url: config.url,
			method: config.method,
		});

		try {
			const timeout = config.timeout ?? 30000;
			const redirects: string[] = [];

			const fetchOptions: RequestInit = {
				method: config.method,
				headers: {
					'Content-Type': 'application/json',
					...config.headers,
				},
				body: config.body ? JSON.stringify(config.body) : undefined,
				redirect: config.followRedirects ? 'follow' : 'manual',
				signal: AbortSignal.timeout(timeout),
			};

			const response = await fetch(config.url, fetchOptions);

			// Collect redirect information
			if (response.redirected) {
				redirects.push(response.url);
			}

			// Parse response body
			let responseBody: unknown;
			const contentType = response.headers.get('content-type');

			if (contentType?.includes('application/json')) {
				responseBody = await response.json();
			} else {
				responseBody = await response.text();
			}

			const result: IWebhookTestResult = {
				success: response.ok,
				statusCode: response.status,
				headers: Object.fromEntries(response.headers.entries()),
				body: responseBody,
				responseTimeMs: Date.now() - startTime,
				redirects: redirects.length > 0 ? redirects : undefined,
			};

			this.logger.info('Function completed', {
				function: 'testWebhook',
				url: config.url,
				statusCode: response.status,
				duration: result.responseTimeMs,
			});

			return result;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'testWebhook',
				url: config.url,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});

			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				responseTimeMs: Date.now() - startTime,
			};
		}
	}

	/**
	 * Replay a webhook event
	 */
	async replayWebhook(
		event: IWebhookQueueEvent,
		config?: IWebhookReplayConfig,
	): Promise<IWebhookTestResult> {
		const startTime = Date.now();
		this.logger.info('Function started', {
			function: 'replayWebhook',
			eventId: event.id,
			workflowId: event.workflowId,
		});

		try {
			// Apply modifications if configured
			let modifiedEvent = event;
			if (config?.modifyPayload) {
				modifiedEvent = config.modifyPayload(event);
			}

			let headers = modifiedEvent.headers;
			if (config?.modifyHeaders) {
				headers = config.modifyHeaders(headers);
			}

			// Convert headers to string format for fetch
			const fetchHeaders: Record<string, string> = {};
			Object.entries(headers).forEach(([key, value]) => {
				fetchHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
			});

			// Construct test configuration
			const testConfig: IWebhookTestConfig = {
				url: modifiedEvent.webhookPath,
				method: modifiedEvent.method,
				headers: fetchHeaders,
				body: modifiedEvent.body,
			};

			const result = await this.testWebhook(testConfig);

			this.logger.info('Function completed', {
				function: 'replayWebhook',
				eventId: event.id,
				success: result.success,
				duration: Date.now() - startTime,
			});

			return result;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'replayWebhook',
				eventId: event.id,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});

			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				responseTimeMs: Date.now() - startTime,
			};
		}
	}

	/**
	 * Inspect a webhook event
	 */
	async inspectWebhook(
		event: IWebhookQueueEvent,
		signatureVerifier?: SignatureVerifier,
		processingResult?: unknown,
	): Promise<IWebhookInspectorData> {
		const startTime = Date.now();
		this.logger.info('Function started', {
			function: 'inspectWebhook',
			eventId: event.id,
			workflowId: event.workflowId,
		});

		try {
			// Extract signature from headers
			let signature: string | undefined;
			let signatureValid: boolean | undefined;

			if (signatureVerifier) {
				const signatureHeader = Object.entries(event.headers).find(([key]) =>
					key.toLowerCase().includes('signature'),
				);

				if (signatureHeader) {
					signature = Array.isArray(signatureHeader[1])
						? signatureHeader[1][0]
						: signatureHeader[1];

					const verificationResult = await signatureVerifier.verify(
						JSON.stringify(event.body),
						event.headers,
					);
					signatureValid = verificationResult.valid;
				}
			}

			const inspectorData: IWebhookInspectorData = {
				eventId: event.id,
				workflowId: event.workflowId,
				timestamp: event.timestamp,
				method: event.method,
				path: event.webhookPath,
				headers: event.headers,
				body: event.body,
				queryParams: event.queryParams,
				signature,
				signatureValid,
				processingResult,
			};

			// Store inspector data
			this.storeInspectorData(inspectorData);

			this.logger.info('Function completed', {
				function: 'inspectWebhook',
				eventId: event.id,
				duration: Date.now() - startTime,
			});

			return inspectorData;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'inspectWebhook',
				eventId: event.id,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to inspect webhook', { cause: error });
		}
	}

	/**
	 * Store inspector data with size limit
	 */
	private storeInspectorData(data: IWebhookInspectorData): void {
		// Implement FIFO when max size is reached
		if (this.inspectorData.size >= this.maxInspectorDataSize) {
			const firstKey = this.inspectorData.keys().next().value;
			this.inspectorData.delete(firstKey);
		}

		this.inspectorData.set(data.eventId, data);

		this.logger.debug('Inspector data stored', {
			function: 'storeInspectorData',
			eventId: data.eventId,
			totalStored: this.inspectorData.size,
		});
	}

	/**
	 * Get inspector data by event ID
	 */
	getInspectorData(eventId: string): IWebhookInspectorData | null {
		const data = this.inspectorData.get(eventId);

		this.logger.debug('Inspector data retrieved', {
			function: 'getInspectorData',
			eventId,
			found: !!data,
		});

		return data ?? null;
	}

	/**
	 * Get all inspector data
	 */
	getAllInspectorData(): IWebhookInspectorData[] {
		const data = Array.from(this.inspectorData.values());

		this.logger.debug('All inspector data retrieved', {
			function: 'getAllInspectorData',
			count: data.length,
		});

		return data;
	}

	/**
	 * Clear inspector data
	 */
	clearInspectorData(): void {
		this.logger.info('Clearing inspector data', { function: 'clearInspectorData' });
		this.inspectorData.clear();
	}

	/**
	 * Generate a curl command for a webhook event
	 */
	generateCurlCommand(event: IWebhookQueueEvent): string {
		const startTime = Date.now();
		this.logger.info('Function started', {
			function: 'generateCurlCommand',
			eventId: event.id,
		});

		try {
			const parts: string[] = ['curl', '-X', event.method];

			// Add headers
			Object.entries(event.headers).forEach(([key, value]) => {
				const headerValue = Array.isArray(value) ? value.join(', ') : value;
				parts.push('-H', `"${key}: ${headerValue}"`);
			});

			// Add body
			if (event.body) {
				const bodyString = JSON.stringify(event.body);
				parts.push('-d', `'${bodyString}'`);
			}

			// Add URL with query params
			let url = event.webhookPath;
			const queryString = new URLSearchParams(
				event.queryParams as Record<string, string>,
			).toString();
			if (queryString) {
				url += `?${queryString}`;
			}
			parts.push(`"${url}"`);

			const command = parts.join(' ');

			this.logger.info('Function completed', {
				function: 'generateCurlCommand',
				eventId: event.id,
				duration: Date.now() - startTime,
			});

			return command;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'generateCurlCommand',
				eventId: event.id,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to generate curl command', { cause: error });
		}
	}

	/**
	 * Generate a Postman collection for a webhook
	 */
	generatePostmanCollection(
		event: IWebhookQueueEvent,
		collectionName?: string,
	): Record<string, unknown> {
		const startTime = Date.now();
		this.logger.info('Function started', {
			function: 'generatePostmanCollection',
			eventId: event.id,
		});

		try {
			const collection = {
				info: {
					name: collectionName ?? `Webhook - ${event.workflowId}`,
					schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
				},
				item: [
					{
						name: event.webhookPath,
						request: {
							method: event.method,
							header: Object.entries(event.headers).map(([key, value]) => ({
								key,
								value: Array.isArray(value) ? value.join(', ') : value,
								type: 'text',
							})),
							body: event.body
								? {
										mode: 'raw',
										raw: JSON.stringify(event.body, null, 2),
										options: {
											raw: {
												language: 'json',
											},
										},
									}
								: undefined,
							url: {
								raw: event.webhookPath,
								query: Object.entries(event.queryParams).map(([key, value]) => ({
									key,
									value: Array.isArray(value) ? value.join(',') : value,
								})),
							},
						},
					},
				],
			};

			this.logger.info('Function completed', {
				function: 'generatePostmanCollection',
				eventId: event.id,
				duration: Date.now() - startTime,
			});

			return collection;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'generatePostmanCollection',
				eventId: event.id,
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to generate Postman collection', { cause: error });
		}
	}

	/**
	 * Validate webhook payload against JSON schema
	 */
	async validatePayload(
		payload: unknown,
		schema: Record<string, unknown>,
	): Promise<{ valid: boolean; errors?: unknown[] }> {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'validatePayload' });

		try {
			// Basic validation - can be extended with a JSON schema validator library
			if (!payload || typeof payload !== 'object') {
				return {
					valid: false,
					errors: [{ message: 'Payload must be an object' }],
				};
			}

			// In a real implementation, use a library like ajv for comprehensive JSON schema validation
			this.logger.info('Function completed', {
				function: 'validatePayload',
				duration: Date.now() - startTime,
			});

			return { valid: true };
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'validatePayload',
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to validate payload', { cause: error });
		}
	}

	/**
	 * Compare two webhook events
	 */
	compareEvents(
		event1: IWebhookQueueEvent,
		event2: IWebhookQueueEvent,
	): {
		identical: boolean;
		differences: Array<{ field: string; value1: unknown; value2: unknown }>;
	} {
		const startTime = Date.now();
		this.logger.info('Function started', {
			function: 'compareEvents',
			event1Id: event1.id,
			event2Id: event2.id,
		});

		try {
			const differences: Array<{ field: string; value1: unknown; value2: unknown }> = [];

			// Compare basic fields
			const fieldsToCompare: Array<keyof IWebhookQueueEvent> = [
				'workflowId',
				'webhookPath',
				'method',
			];

			fieldsToCompare.forEach((field) => {
				if (event1[field] !== event2[field]) {
					differences.push({
						field,
						value1: event1[field],
						value2: event2[field],
					});
				}
			});

			// Compare body
			if (JSON.stringify(event1.body) !== JSON.stringify(event2.body)) {
				differences.push({
					field: 'body',
					value1: event1.body,
					value2: event2.body,
				});
			}

			// Compare headers
			if (JSON.stringify(event1.headers) !== JSON.stringify(event2.headers)) {
				differences.push({
					field: 'headers',
					value1: event1.headers,
					value2: event2.headers,
				});
			}

			// Compare query params
			if (JSON.stringify(event1.queryParams) !== JSON.stringify(event2.queryParams)) {
				differences.push({
					field: 'queryParams',
					value1: event1.queryParams,
					value2: event2.queryParams,
				});
			}

			this.logger.info('Function completed', {
				function: 'compareEvents',
				identical: differences.length === 0,
				differencesCount: differences.length,
				duration: Date.now() - startTime,
			});

			return {
				identical: differences.length === 0,
				differences,
			};
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'compareEvents',
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to compare events', { cause: error });
		}
	}

	/**
	 * Generate webhook payload from template
	 */
	generatePayload(
		template: Record<string, unknown>,
		variables?: Record<string, unknown>,
	): Record<string, unknown> {
		const startTime = Date.now();
		this.logger.info('Function started', { function: 'generatePayload' });

		try {
			const payload = deepCopy(template);

			// Replace variables in the template
			if (variables) {
				this.replaceVariables(payload, variables);
			}

			this.logger.info('Function completed', {
				function: 'generatePayload',
				duration: Date.now() - startTime,
			});

			return payload;
		} catch (error) {
			this.logger.error('Function failed', {
				function: 'generatePayload',
				duration: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw new ApplicationError('Failed to generate payload', { cause: error });
		}
	}

	/**
	 * Replace variables in an object recursively
	 */
	private replaceVariables(obj: Record<string, unknown>, variables: Record<string, unknown>): void {
		Object.keys(obj).forEach((key) => {
			const value = obj[key];
			if (typeof value === 'string') {
				// Replace {{variable}} patterns
				obj[key] = value.replace(/\{\{(\w+)\}\}/g, (_: string, varName: string) => {
					return variables[varName] !== undefined ? String(variables[varName]) : `{{${varName}}}`;
				});
			} else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
				this.replaceVariables(value as Record<string, unknown>, variables);
			}
		});
	}
}
