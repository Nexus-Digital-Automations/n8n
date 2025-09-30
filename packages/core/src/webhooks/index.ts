/**
 * Webhooks Module
 * Provides comprehensive webhook management with queue, retry, dead-letter handling, and security
 */

// Webhook Queue
export {
	WebhookQueue,
	type IWebhookQueueEvent,
	type IWebhookQueueConfig,
	type IWebhookQueueDatabaseAdapter,
} from './webhook-queue';

// Webhook Processor
export {
	WebhookProcessor,
	type IWebhookProcessingResult,
	type IWebhookProcessingContext,
	type IWebhookProcessorConfig,
	type IWebhookMetrics,
	type IRateLimiterConfig,
} from './webhook-processor';

// Dead Letter Queue
export {
	DeadLetterQueue,
	type IDeadLetterEvent,
	type IDeadLetterQueueConfig,
	type IDeadLetterStats,
	type IDeadLetterQueueDatabaseAdapter,
} from './dead-letter-queue';

// Signature Verifier
export {
	SignatureVerifier,
	SignatureVerifierFactory,
	type SignatureAlgorithm,
	type ISignatureVerificationConfig,
	type ISignatureVerificationResult,
} from './signature-verifier';

// Webhook Testing
export {
	WebhookTesting,
	type IWebhookTestConfig,
	type IWebhookTestResult,
	type IWebhookReplayConfig,
	type IWebhookInspectorData,
	type IWebhookMockConfig,
} from './webhook-testing';
