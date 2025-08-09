import { mock } from 'jest-mock-extended';
import z from 'zod';

import { CliParser } from '../cli-parser';

describe('parse', () => {
	it('should parse `argv` without flags schema', () => {
		const cliParser = new CliParser(mock());
		const result = cliParser.parse({ argv: ['node', 'script.js', 'arg1', 'arg2'] });
		expect(result).toEqual({ flags: {}, args: ['arg1', 'arg2'] });
	});

	it('should parse `argv` with flags schema', () => {
		const cliParser = new CliParser(mock());
		const flagsSchema = z.object({
			verbose: z.boolean().optional(),
			name: z.string().optional(),
		});

		const result = cliParser.parse({
			argv: ['node', 'script.js', '--verbose', '--name', 'test', 'arg1'],
			flagsSchema,
		});

		expect(result).toEqual({
			flags: { verbose: true, name: 'test' },
			args: ['arg1'],
		});
	});

	it('should ignore flags not defined in schema', () => {
		const cliParser = new CliParser(mock());
		const flagsSchema = z.object({
			name: z.string().optional(),
			// ignored is absent
		});

		const result = cliParser.parse({
			argv: ['node', 'script.js', '--name', 'test', '--ignored', 'value', 'arg1'],
			flagsSchema,
		});

		expect(result).toEqual({
			flags: {
				name: 'test',
				// ignored is absent
			},
			args: ['arg1'],
		});
	});

	it('should handle a numeric value for `--id` flag', () => {
		const cliParser = new CliParser(mock());
		const result = cliParser.parse({
			argv: ['node', 'script.js', '--id', '123', 'arg1'],
			flagsSchema: z.object({
				id: z.string(),
			}),
		});

		expect(result).toEqual({
			flags: { id: '123' },
			args: ['arg1'],
		});
	});

	it('should handle positional arguments', () => {
		const cliParser = new CliParser(mock());
		const result = cliParser.parse({
			argv: ['node', 'script.js', '123', 'true'],
		});

		expect(result.args).toEqual(['123', 'true']);
		expect(typeof result.args[0]).toBe('string');
		expect(typeof result.args[1]).toBe('string');
	});

	it('should handle required flags with aliases', () => {
		const cliParser = new CliParser(mock());
		const flagsSchema = z.object({
			name: z.string(),
		});

		// @ts-expect-error zod was monkey-patched to support aliases
		flagsSchema.shape.name._def._alias = 'n';

		const result = cliParser.parse({
			argv: ['node', 'script.js', '-n', 'test', 'arg1'],
			flagsSchema,
		});

		expect(result).toEqual({
			flags: { name: 'test' },
			args: ['arg1'],
		});
	});

	it('should handle optional flags with aliases', () => {
		const cliParser = new CliParser(mock());
		const flagsSchema = z.object({
			name: z.optional(z.string()),
		});

		// @ts-expect-error zod was monkey-patched to support aliases
		flagsSchema.shape.name._def.innerType._def._alias = 'n';

		const result = cliParser.parse({
			argv: ['node', 'script.js', '-n', 'test', 'arg1'],
			flagsSchema,
		});

		expect(result).toEqual({
			flags: { name: 'test' },
			args: ['arg1'],
		});
	});

	it('should handle empty flags without schema', () => {
		const cliParser = new CliParser(mock());
		const result = cliParser.parse({
			argv: ['node', 'script.js'],
		});

		expect(result).toEqual({
			flags: {},
			args: [],
		});
	});

	it('should handle complex flag combinations', () => {
		const cliParser = new CliParser(mock());
		const flagsSchema = z.object({
			verbose: z.boolean().optional(),
			count: z.number().optional(), // yargs-parser converts numeric strings to numbers
			enable: z.boolean().optional(),
		});

		const result = cliParser.parse({
			argv: ['node', 'script.js', '--verbose', '--count', '5', '--enable', '--', 'arg1', 'arg2'],
			flagsSchema,
		});

		expect(result).toEqual({
			flags: { verbose: true, count: 5, enable: true },
			args: ['arg1', 'arg2'],
		});
	});

	it('should handle missing alias when flag present', () => {
		const cliParser = new CliParser(mock());
		const flagsSchema = z.object({
			name: z.string().optional(),
		});

		// No alias defined - should still work with full flag name
		const result = cliParser.parse({
			argv: ['node', 'script.js', '--name', 'test', 'arg1'],
			flagsSchema,
		});

		expect(result).toEqual({
			flags: { name: 'test' },
			args: ['arg1'],
		});
	});

	it('should handle alias with empty length', () => {
		const cliParser = new CliParser(mock());
		const flagsSchema = z.object({
			name: z.string().optional(),
		});

		// @ts-expect-error Testing edge case with empty alias
		flagsSchema.shape.name._def._alias = '';

		const result = cliParser.parse({
			argv: ['node', 'script.js', '--name', 'test', 'arg1'],
			flagsSchema,
		});

		expect(result).toEqual({
			flags: { name: 'test' },
			args: ['arg1'],
		});
	});

	it('should handle non-string arguments correctly', () => {
		const cliParser = new CliParser(mock());
		const result = cliParser.parse({
			argv: ['node', 'script.js', '42', 'true', 'false'],
		});

		expect(result.args).toEqual(['42', 'true', 'false']);
		expect(result.args.every((arg) => typeof arg === 'string')).toBe(true);
	});
});
