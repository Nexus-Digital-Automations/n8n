jest.mock('n8n-workflow', () => ({
	...jest.requireActual('n8n-workflow'),
	LoggerProxy: { init: jest.fn() },
}));

import type { GlobalConfig, InstanceSettingsConfig } from '@n8n/config';
import { mock, captor } from 'jest-mock-extended';
import { LoggerProxy } from 'n8n-workflow';
import winston from 'winston';

import { Logger } from '../logger';

describe('Logger', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('constructor', () => {
		const globalConfig = mock<GlobalConfig>({
			logging: {
				level: 'info',
				outputs: ['console'],
				scopes: [],
			},
		});

		test('if root, should initialize `LoggerProxy` with instance', () => {
			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>(), { isRoot: true });

			expect(LoggerProxy.init).toHaveBeenCalledWith(logger);
		});

		test('if scoped, should not initialize `LoggerProxy`', () => {
			new Logger(globalConfig, mock<InstanceSettingsConfig>(), { isRoot: false });

			expect(LoggerProxy.init).not.toHaveBeenCalled();
		});
	});

	describe('formats', () => {
		afterEach(() => {
			jest.resetAllMocks();
		});

		test('log text, if `config.logging.format` is set to `text`', () => {
			// ARRANGE
			const stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
			const globalConfig = mock<GlobalConfig>({
				logging: {
					format: 'text',
					level: 'info',
					outputs: ['console'],
					scopes: [],
				},
			});
			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());
			const testMessage = 'Test Message';
			const testMetadata = { test: 1 };

			// ACT
			logger.info(testMessage, testMetadata);

			// ASSERT
			expect(stdoutSpy).toHaveBeenCalledTimes(1);

			const output = stdoutSpy.mock.lastCall?.[0];
			if (typeof output !== 'string') {
				fail(`expected 'output' to be of type 'string', got ${typeof output}`);
			}

			expect(output).toEqual(`${testMessage}\n`);
		});

		test('log json, if `config.logging.format` is set to `json`', () => {
			// ARRANGE
			const stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
			const globalConfig = mock<GlobalConfig>({
				logging: {
					format: 'json',
					level: 'info',
					outputs: ['console'],
					scopes: [],
				},
			});
			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());
			const testMessage = 'Test Message';
			const testMetadata = { test: 1 };

			// ACT
			logger.info(testMessage, testMetadata);

			// ASSERT
			expect(stdoutSpy).toHaveBeenCalledTimes(1);
			const output = stdoutSpy.mock.lastCall?.[0];
			if (typeof output !== 'string') {
				fail(`expected 'output' to be of type 'string', got ${typeof output}`);
			}

			expect(() => JSON.parse(output)).not.toThrow();
			const parsedOutput = JSON.parse(output);

			expect(parsedOutput).toMatchObject({
				message: testMessage,
				level: 'info',
				metadata: {
					...testMetadata,
					timestamp: expect.any(String),
				},
			});
		});

		test('apply scope filters, if `config.logging.format` is set to `json`', () => {
			// ARRANGE
			const stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
			const globalConfig = mock<GlobalConfig>({
				logging: {
					format: 'json',
					level: 'info',
					outputs: ['console'],
					scopes: ['push'],
				},
			});
			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());
			const redisLogger = logger.scoped('redis');
			const pushLogger = logger.scoped('push');
			const testMessage = 'Test Message';
			const testMetadata = { test: 1 };

			// ACT
			redisLogger.info(testMessage, testMetadata);
			pushLogger.info(testMessage, testMetadata);

			// ASSERT
			expect(stdoutSpy).toHaveBeenCalledTimes(1);
		});

		test('log errors in metadata with stack trace, if `config.logging.format` is set to `json`', () => {
			// ARRANGE
			const stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
			const globalConfig = mock<GlobalConfig>({
				logging: {
					format: 'json',
					level: 'info',
					outputs: ['console'],
					scopes: [],
				},
			});
			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());
			const testMessage = 'Test Message';
			const parentError = new Error('Parent', { cause: 'just a string' });
			const testError = new Error('Test', { cause: parentError });
			const testMetadata = { error: testError };

			// ACT
			logger.info(testMessage, testMetadata);

			// ASSERT
			expect(stdoutSpy).toHaveBeenCalledTimes(1);
			const output = stdoutSpy.mock.lastCall?.[0];
			if (typeof output !== 'string') {
				fail(`expected 'output' to be of type 'string', got ${typeof output}`);
			}

			expect(() => JSON.parse(output)).not.toThrow();
			const parsedOutput = JSON.parse(output);

			expect(parsedOutput).toMatchObject({
				message: testMessage,
				metadata: {
					error: {
						name: testError.name,
						message: testError.message,
						stack: testError.stack,
						cause: {
							name: parentError.name,
							message: parentError.message,
							stack: parentError.stack,
							cause: parentError.cause,
						},
					},
				},
			});
		});

		test('do not recurse indefinitely when `cause` contains circular references', () => {
			// ARRANGE
			const stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
			const globalConfig = mock<GlobalConfig>({
				logging: {
					format: 'json',
					level: 'info',
					outputs: ['console'],
					scopes: [],
				},
			});
			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());
			const testMessage = 'Test Message';
			const parentError = new Error('Parent', { cause: 'just a string' });
			const childError = new Error('Test', { cause: parentError });
			parentError.cause = childError;
			const testMetadata = { error: childError };

			// ACT
			logger.info(testMessage, testMetadata);

			// ASSERT
			expect(stdoutSpy).toHaveBeenCalledTimes(1);
			const output = stdoutSpy.mock.lastCall?.[0];
			if (typeof output !== 'string') {
				fail(`expected 'output' to be of type 'string', got ${typeof output}`);
			}

			expect(() => JSON.parse(output)).not.toThrow();
			const parsedOutput = JSON.parse(output);

			expect(parsedOutput).toMatchObject({
				message: testMessage,
				metadata: {
					error: {
						name: childError.name,
						message: childError.message,
						stack: childError.stack,
						cause: {
							name: parentError.name,
							message: parentError.message,
							stack: parentError.stack,
						},
					},
				},
			});
		});
	});

	describe('transports', () => {
		afterEach(() => {
			jest.restoreAllMocks();
		});

		test('if `console` selected, should set console transport', () => {
			const globalConfig = mock<GlobalConfig>({
				logging: {
					level: 'info',
					outputs: ['console'],
					scopes: [],
				},
			});

			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());

			const { transports } = logger.getInternalLogger();

			expect(transports).toHaveLength(1);

			const [transport] = transports;

			expect(transport.constructor.name).toBe('Console');
		});

		describe('`file`', () => {
			test('should set file transport', () => {
				const globalConfig = mock<GlobalConfig>({
					logging: {
						level: 'info',
						outputs: ['file'],
						scopes: [],
						file: {
							fileSizeMax: 100,
							fileCountMax: 16,
							location: 'logs/n8n.log',
						},
					},
				});

				const logger = new Logger(
					globalConfig,
					mock<InstanceSettingsConfig>({ n8nFolder: '/tmp' }),
				);

				const { transports } = logger.getInternalLogger();

				expect(transports).toHaveLength(1);

				const [transport] = transports;

				expect(transport.constructor.name).toBe('File');
			});

			test('should accept absolute paths', () => {
				// ARRANGE
				const location = '/tmp/n8n.log';
				const globalConfig = mock<GlobalConfig>({
					logging: {
						level: 'info',
						outputs: ['file'],
						scopes: [],
						file: { fileSizeMax: 100, fileCountMax: 16, location },
					},
				});
				const OriginalFile = winston.transports.File;
				const FileSpy = jest.spyOn(winston.transports, 'File').mockImplementation((...args) => {
					return Reflect.construct(OriginalFile, args);
				});

				// ACT
				new Logger(globalConfig, mock<InstanceSettingsConfig>({ n8nFolder: '/tmp' }));

				// ASSERT
				const fileOptionsCaptor = captor<string>();

				expect(FileSpy).toHaveBeenCalledTimes(1);
				expect(FileSpy).toHaveBeenCalledWith(fileOptionsCaptor);
				expect(fileOptionsCaptor.value).toMatchObject({ filename: location });
			});

			test('should accept relative paths', () => {
				// ARRANGE
				const location = 'tmp/n8n.log';
				const n8nFolder = '/tmp/n8n';
				const globalConfig = mock<GlobalConfig>({
					logging: {
						level: 'info',
						outputs: ['file'],
						scopes: [],
						file: {
							fileSizeMax: 100,
							fileCountMax: 16,
							location,
						},
					},
				});
				const OriginalFile = winston.transports.File;
				const FileSpy = jest.spyOn(winston.transports, 'File').mockImplementation((...args) => {
					return Reflect.construct(OriginalFile, args);
				});

				// ACT
				new Logger(globalConfig, mock<InstanceSettingsConfig>({ n8nFolder }));

				// ASSERT
				const fileOptionsCaptor = captor<string>();

				expect(FileSpy).toHaveBeenCalledTimes(1);
				expect(FileSpy).toHaveBeenCalledWith(fileOptionsCaptor);
				expect(fileOptionsCaptor.value).toMatchObject({ filename: `${n8nFolder}/${location}` });
			});
		});
	});

	describe('levels', () => {
		test('if `error` selected, should enable `error` level', () => {
			const globalConfig = mock<GlobalConfig>({
				logging: {
					level: 'error',
					outputs: ['console'],
					scopes: [],
				},
			});

			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());

			const internalLogger = logger.getInternalLogger();

			expect(internalLogger.isErrorEnabled()).toBe(true);
			expect(internalLogger.isWarnEnabled()).toBe(false);
			expect(internalLogger.isInfoEnabled()).toBe(false);
			expect(internalLogger.isDebugEnabled()).toBe(false);
		});

		test('if `warn` selected, should enable `error` and `warn` levels', () => {
			const globalConfig = mock<GlobalConfig>({
				logging: {
					level: 'warn',
					outputs: ['console'],
					scopes: [],
				},
			});

			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());

			const internalLogger = logger.getInternalLogger();

			expect(internalLogger.isErrorEnabled()).toBe(true);
			expect(internalLogger.isWarnEnabled()).toBe(true);
			expect(internalLogger.isInfoEnabled()).toBe(false);
			expect(internalLogger.isDebugEnabled()).toBe(false);
		});

		test('if `info` selected, should enable `error`, `warn`, and `info` levels', () => {
			const globalConfig = mock<GlobalConfig>({
				logging: {
					level: 'info',
					outputs: ['console'],
					scopes: [],
				},
			});

			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());

			const internalLogger = logger.getInternalLogger();

			expect(internalLogger.isErrorEnabled()).toBe(true);
			expect(internalLogger.isWarnEnabled()).toBe(true);
			expect(internalLogger.isInfoEnabled()).toBe(true);
			expect(internalLogger.isDebugEnabled()).toBe(false);
		});

		test('if `debug` selected, should enable all levels', () => {
			const globalConfig = mock<GlobalConfig>({
				logging: {
					level: 'debug',
					outputs: ['console'],
					scopes: [],
				},
			});

			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());

			const internalLogger = logger.getInternalLogger();

			expect(internalLogger.isErrorEnabled()).toBe(true);
			expect(internalLogger.isWarnEnabled()).toBe(true);
			expect(internalLogger.isInfoEnabled()).toBe(true);
			expect(internalLogger.isDebugEnabled()).toBe(true);
		});

		test('if `silent` selected, should disable all levels', () => {
			const globalConfig = mock<GlobalConfig>({
				logging: {
					level: 'silent',
					outputs: ['console'],
					scopes: [],
				},
			});

			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());

			const internalLogger = logger.getInternalLogger();

			expect(internalLogger.isErrorEnabled()).toBe(false);
			expect(internalLogger.isWarnEnabled()).toBe(false);
			expect(internalLogger.isInfoEnabled()).toBe(false);
			expect(internalLogger.isDebugEnabled()).toBe(false);
			expect(internalLogger.silent).toBe(true);
		});
	});

	describe('error handling and edge cases', () => {
		afterEach(() => {
			jest.restoreAllMocks();
		});

		test('should handle debug dev console format', () => {
			const stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
			const globalConfig = mock<GlobalConfig>({
				logging: {
					level: 'debug',
					outputs: ['console'],
					scopes: [],
				},
			});

			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());

			// This tests the debugDevConsoleFormat() method
			logger.debug('test debug message', { testData: 'value' });

			expect(stdoutSpy).toHaveBeenCalled();
		});

		test('should handle debug prod console format in production', () => {
			const originalEnv = process.env.NODE_ENV;
			process.env.NODE_ENV = 'production';

			const stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
			const globalConfig = mock<GlobalConfig>({
				logging: {
					level: 'debug',
					outputs: ['console'],
					scopes: [],
				},
			});

			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());

			// This tests the debugProdConsoleFormat() method
			logger.debug('test debug message', { testData: 'value' });

			expect(stdoutSpy).toHaveBeenCalled();

			process.env.NODE_ENV = originalEnv;
		});

		test('should handle devTsFormat timestamp formatting', () => {
			const globalConfig = mock<GlobalConfig>({
				logging: {
					level: 'debug',
					outputs: ['console'],
					scopes: [],
				},
			});

			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());
			const stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);

			// This tests the devTsFormat() method through debug logging
			logger.debug('timestamp test');

			expect(stdoutSpy).toHaveBeenCalled();
		});

		test('should handle toPrintable metadata formatting', () => {
			const stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
			const globalConfig = mock<GlobalConfig>({
				logging: {
					level: 'info',
					outputs: ['console'],
					scopes: [],
				},
			});

			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());

			// Test with complex metadata to trigger toPrintable method
			logger.info('test message', {
				complexObject: { nested: { deep: 'value' } },
				array: [1, 2, 3],
				string: 'test',
			});

			expect(stdoutSpy).toHaveBeenCalled();
		});

		test('should handle toPrintable with empty metadata', () => {
			const stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
			const globalConfig = mock<GlobalConfig>({
				logging: {
					level: 'info',
					outputs: ['console'],
					scopes: [],
				},
			});

			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());

			// Test with empty object to trigger empty metadata path
			logger.info('test message', {});

			expect(stdoutSpy).toHaveBeenCalled();
		});

		test('should handle convenience methods: error, warn, info, debug', () => {
			const stdoutSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
			const globalConfig = mock<GlobalConfig>({
				logging: {
					level: 'debug',
					outputs: ['console'],
					scopes: [],
				},
			});

			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());

			// Test all convenience methods
			logger.error('error message', { errorData: 'value' });
			logger.warn('warn message', { warnData: 'value' });
			logger.info('info message', { infoData: 'value' });
			logger.debug('debug message', { debugData: 'value' });

			expect(stdoutSpy).toHaveBeenCalledTimes(4);
		});

		test('should handle file transport with file size and count limits', () => {
			const globalConfig = mock<GlobalConfig>({
				logging: {
					level: 'info',
					outputs: ['file'],
					scopes: [],
					file: {
						fileSizeMax: 50, // MB
						fileCountMax: 10,
						location: '/tmp/test.log',
					},
				},
			});

			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());

			const { transports } = logger.getInternalLogger();
			expect(transports).toHaveLength(1);

			const [transport] = transports;
			expect(transport.constructor.name).toBe('File');
		});

		test('should handle getInternalLogger method for testing', () => {
			const globalConfig = mock<GlobalConfig>({
				logging: {
					level: 'info',
					outputs: ['console'],
					scopes: [],
				},
			});

			const logger = new Logger(globalConfig, mock<InstanceSettingsConfig>());

			// Test the getInternalLogger method
			const internalLogger = logger.getInternalLogger();
			expect(internalLogger).toBeDefined();
			expect(typeof internalLogger.log).toBe('function');
		});
	});
});
