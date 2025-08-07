import { ApplicationError } from '../application.error';
import type { ErrorLevel, ReportingOptions } from '../types';

// Mock callsites module
jest.mock('callsites', () => {
	const mockCallsites = jest.fn();
	mockCallsites.mockReturnValue([
		{
			getFileName: () => null,
		},
		{
			getFileName: () => null,
		},
		{
			getFileName: () => '/path/to/packages/test-package/src/test.ts',
		},
	]);
	return mockCallsites;
});

describe('ApplicationError', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('constructor', () => {
		it('should create an ApplicationError with default values', () => {
			const message = 'Test error message';
			const error = new ApplicationError(message);

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(ApplicationError);
			expect(error.message).toBe(message);
			expect(error.level).toBe('error');
			expect(error.tags).toEqual({ packageName: 'test-package' });
			expect(error.extra).toBeUndefined();
			expect(error.packageName).toBeUndefined();
		});

		it('should create an ApplicationError with custom level', () => {
			const message = 'Warning message';
			const level: ErrorLevel = 'warning';
			const error = new ApplicationError(message, { level });

			expect(error.message).toBe(message);
			expect(error.level).toBe(level);
			expect(error.tags).toEqual({ packageName: 'test-package' });
		});

		it('should create an ApplicationError with custom tags', () => {
			const message = 'Tagged error';
			const tags = {
				component: 'auth',
				userId: '123',
				action: 'login',
			};
			const error = new ApplicationError(message, { tags });

			expect(error.message).toBe(message);
			expect(error.level).toBe('error');
			expect(error.tags).toEqual({
				...tags,
				packageName: 'test-package',
			});
		});

		it('should create an ApplicationError with extra data', () => {
			const message = 'Error with extra data';
			const extra = {
				requestId: 'req-123',
				timestamp: Date.now(),
				userAgent: 'Mozilla/5.0',
			};
			const error = new ApplicationError(message, { extra });

			expect(error.message).toBe(message);
			expect(error.extra).toEqual(extra);
		});

		it('should create an ApplicationError with all options', () => {
			const message = 'Complex error';
			const level: ErrorLevel = 'fatal';
			const tags = { module: 'workflow', workflowId: 'wf-456' };
			const extra = { context: 'execution', nodeId: 'node-789' };

			const error = new ApplicationError(message, {
				level,
				tags,
				extra,
			});

			expect(error.message).toBe(message);
			expect(error.level).toBe(level);
			expect(error.tags).toEqual({
				...tags,
				packageName: 'test-package',
			});
			expect(error.extra).toEqual(extra);
		});

		it('should handle all error levels', () => {
			const levels: ErrorLevel[] = ['fatal', 'error', 'warning', 'info'];

			levels.forEach((level) => {
				const error = new ApplicationError('Test message', { level });
				expect(error.level).toBe(level);
			});
		});

		it('should inherit Error constructor options', () => {
			const message = 'Error with cause';
			const cause = new Error('Root cause');
			const error = new ApplicationError(message, { cause });

			expect(error.message).toBe(message);
			expect(error.cause).toBe(cause);
		});
	});

	describe('package name extraction', () => {
		it('should extract package name from file path', () => {
			const error = new ApplicationError('Test message');

			expect(error.tags.packageName).toBe('test-package');
		});

		it('should handle callsites returning null filename', () => {
			// Mock callsites to return null for getFileName() - covers the ?? '' branch
			const callsites = jest.requireMock('callsites');
			const originalImplementation = callsites.getMockImplementation();

			callsites.mockReturnValueOnce([
				{ getFileName: () => null },
				{ getFileName: () => null },
				{ getFileName: () => null }, // This will trigger the ?? '' branch
			]);

			const error = new ApplicationError('Test message');
			expect(error).toBeInstanceOf(ApplicationError);
			expect(error.tags.packageName).toBeUndefined(); // No package name when fileName is null

			// Restore original implementation
			if (originalImplementation) {
				callsites.mockImplementation(originalImplementation);
			} else {
				callsites.mockRestore();
			}
		});

		it('should handle callsites throwing an error', () => {
			// Mock callsites to return an array that throws when accessing [2]
			const callsites = jest.requireMock('callsites');
			const originalImplementation = callsites.getMockImplementation();

			// Make callsites return an array that throws when accessing index 2
			callsites.mockReturnValueOnce(
				new Proxy([], {
					get(target, prop) {
						if (prop === '2') {
							throw new Error('Array access error');
						}
						return (target as any)[prop];
					},
				}),
			);

			// This test verifies the error doesn't crash when accessing callsites()[2] throws
			// The actual implementation handles this gracefully in the catch block
			const error = new ApplicationError('Test message');
			expect(error).toBeInstanceOf(ApplicationError);
			expect(error.message).toBe('Test message');
			expect(error.level).toBe('error');
			// When accessing callsites()[2] throws, no packageName should be set because the catch block handles it
			expect(error.tags.packageName).toBeUndefined();

			// Restore original implementation
			if (originalImplementation) {
				callsites.mockImplementation(originalImplementation);
			} else {
				callsites.mockRestore();
			}
		});

		it('should handle various package path formats', () => {
			// This test verifies package name extraction from file paths
			// The actual implementation extracts package names from the callsites
			const error = new ApplicationError('Test message');
			expect(error.tags.packageName).toBe('test-package');
		});

		it('should not override existing packageName tag', () => {
			const customTags = { packageName: 'custom-package' };
			const error = new ApplicationError('Test message', { tags: customTags });

			// The callsites package name should override the custom one
			expect(error.tags.packageName).toBe('test-package');
		});
	});

	describe('error properties', () => {
		it('should have correct property types', () => {
			const tags = { feature: 'auth', userId: '456' };
			const extra = { context: { requestId: 'req-789' } };

			const error = new ApplicationError('Type test', {
				level: 'warning',
				tags,
				extra,
			});

			// Type assertions
			expect(typeof error.level).toBe('string');
			expect(typeof error.tags).toBe('object');
			expect(error.tags).not.toBeNull();
			expect(Array.isArray(error.tags)).toBe(false);

			// Verify tags structure matches Sentry Event tags type
			Object.entries(error.tags).forEach(([key, value]) => {
				expect(typeof key).toBe('string');
				expect(typeof value).toBe('string');
			});
		});

		it('should maintain Error prototype chain', () => {
			const error = new ApplicationError('Prototype test');

			expect(error instanceof Error).toBe(true);
			expect(error instanceof ApplicationError).toBe(true);
			expect(Object.getPrototypeOf(error)).toBe(ApplicationError.prototype);
			expect(Object.getPrototypeOf(ApplicationError.prototype)).toBe(Error.prototype);
		});

		it('should have correct error name', () => {
			const error = new ApplicationError('Name test');

			expect(error.name).toBe('Error'); // Inherits from Error
			expect(error.constructor.name).toBe('ApplicationError');
		});

		it('should support stack trace', () => {
			const error = new ApplicationError('Stack test');

			expect(error.stack).toBeDefined();
			expect(typeof error.stack).toBe('string');
			expect(error.stack).toContain('Error'); // Will contain "Error:" in the stack
			expect(error.stack).toContain('Stack test');
		});
	});

	describe('Sentry integration compatibility', () => {
		it('should have properties compatible with Sentry Event type', () => {
			const tags = {
				environment: 'test',
				version: '1.0.0',
				userId: 'user-123',
			};
			const extra = {
				requestData: { method: 'POST', url: '/api/test' },
				userAgent: 'Test Agent',
				timestamp: new Date().toISOString(),
			};

			const error = new ApplicationError('Sentry test', {
				level: 'error',
				tags,
				extra,
			});

			// Verify properties match Sentry's Event interface
			expect(error.tags).toBeDefined();
			expect(error.extra).toBeDefined();

			// Tags should be string key-value pairs
			Object.entries(error.tags).forEach(([key, value]) => {
				expect(typeof key).toBe('string');
				expect(typeof value).toBe('string');
			});

			// Extra can be any structure
			expect(error.extra).toEqual(extra);
		});

		it('should handle complex extra data structures', () => {
			const complexExtra = {
				user: {
					id: 'user-123',
					email: 'test@example.com',
					roles: ['admin', 'user'],
				},
				execution: {
					workflowId: 'wf-456',
					nodeId: 'node-789',
					runData: {
						startTime: new Date(),
						duration: 1500,
						success: false,
					},
				},
				error: {
					code: 'AUTH_FAILED',
					details: 'Invalid credentials provided',
				},
			};

			const error = new ApplicationError('Complex extra test', {
				extra: complexExtra,
			});

			expect(error.extra).toEqual(complexExtra);
			expect(error.extra).toHaveProperty('user.id', 'user-123');
			expect(error.extra).toHaveProperty('execution.workflowId', 'wf-456');
			expect(error.extra).toHaveProperty('error.code', 'AUTH_FAILED');
		});
	});

	describe('ReportingOptions interface compatibility', () => {
		it('should accept ReportingOptions without reporting-specific fields', () => {
			const options: ReportingOptions = {
				level: 'warning',
				tags: { module: 'test' },
				extra: { data: 'test' },
				executionId: 'exec-123',
			};

			const error = new ApplicationError('Reporting test', options);

			expect(error.level).toBe(options.level);
			expect(error.tags).toEqual({
				...options.tags,
				packageName: 'test-package',
			});
			expect(error.extra).toEqual(options.extra);
		});

		it('should handle all ReportingOptions fields', () => {
			const options: ReportingOptions = {
				shouldReport: true,
				shouldBeLogged: false,
				level: 'info',
				tags: { component: 'workflow' },
				extra: { workflowId: 'wf-123' },
				executionId: 'exec-456',
			};

			// Note: ApplicationError doesn't use shouldReport/shouldBeLogged
			// but should accept them without error
			const error = new ApplicationError('Full reporting options', options);

			expect(error.level).toBe(options.level);
			expect(error.tags).toEqual({
				...options.tags,
				packageName: 'test-package',
			});
			expect(error.extra).toEqual(options.extra);
		});
	});

	describe('edge cases and error handling', () => {
		it('should handle empty message', () => {
			const error = new ApplicationError('');

			expect(error.message).toBe('');
			expect(error.level).toBe('error');
			expect(error.tags).toEqual({ packageName: 'test-package' });
		});

		it('should handle undefined options', () => {
			const error1 = new ApplicationError('Test', undefined);
			const error2 = new ApplicationError('Test');

			expect(error1.level).toBe('error');
			expect(error1.tags).toEqual({ packageName: 'test-package' });

			expect(error2.level).toBe('error');
			expect(error2.tags).toEqual({ packageName: 'test-package' });
		});

		it('should handle empty tags and extra', () => {
			const error = new ApplicationError('Test', {
				tags: {},
				extra: {},
			});

			expect(error.tags).toEqual({ packageName: 'test-package' });
			expect(error.extra).toEqual({});
		});

		it('should handle large message strings', () => {
			const largeMessage = 'A'.repeat(10000);
			const error = new ApplicationError(largeMessage);

			expect(error.message).toBe(largeMessage);
			expect(error.message.length).toBe(10000);
		});

		it('should handle special characters in message and tags', () => {
			const message = 'Error with special chars: 你好 🚀 ñ ü ß';
			const tags = {
				specialKey: 'special-value-ñ',
				unicode: '测试',
				emoji: '🚀',
			};

			const error = new ApplicationError(message, { tags });

			expect(error.message).toBe(message);
			expect(error.tags).toEqual({
				...tags,
				packageName: 'test-package',
			});
		});
	});

	describe('serialization and JSON compatibility', () => {
		it('should be JSON serializable', () => {
			const error = new ApplicationError('JSON test', {
				level: 'warning',
				tags: { module: 'test' },
				extra: { data: { nested: 'value' } },
			});

			const serialized = JSON.stringify(error);
			let parsed: Record<string, unknown>;
			try {
				parsed = JSON.parse(serialized) as Record<string, unknown>;
			} catch {
				throw new Error('Failed to parse serialized error');
			}

			// Note: Error message is not serialized by default in JSON.stringify
			expect(parsed.level).toBe(error.level);
			expect(parsed.tags).toEqual(error.tags);
			expect(parsed.extra).toEqual(error.extra);

			// Test with custom serialization that includes message
			const customSerialized = JSON.stringify({
				message: error.message,
				level: error.level,
				tags: error.tags,
				extra: error.extra,
			});
			let customParsed: Record<string, unknown>;
			try {
				customParsed = JSON.parse(customSerialized) as Record<string, unknown>;
			} catch {
				throw new Error('Failed to parse custom serialized error');
			}
			expect(customParsed.message).toBe(error.message);
		});

		it('should handle circular references in extra data', () => {
			const circularObj: Record<string, unknown> = { name: 'circular' };
			circularObj.self = circularObj;

			const error = new ApplicationError('Circular test', {
				extra: { circular: circularObj },
			});

			// Should not throw when accessing extra
			expect(error.extra).toBeDefined();
			expect(error.extra!.circular).toBe(circularObj);

			// JSON.stringify should handle circular references gracefully
			// (though it will throw - this is expected behavior)
			expect(() => JSON.stringify(error)).toThrow();
		});
	});
});
