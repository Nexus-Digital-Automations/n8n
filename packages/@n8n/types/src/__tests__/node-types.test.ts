/**
 * Tests for node type definitions
 */

import type {
	NodeExecutionStatus,
	NodeConnectionType,
	NodeParameterType,
	StringParameter,
	NumberParameter,
	BooleanParameter,
	OptionsParameter,
	CollectionParameter,
	NodeParameter,
	NodeExecutionData,
	NodeExecutionError,
	NodeInputData,
	NodeContext,
	NodeMetadata,
	ApiOperation,
	CredentialTest,
	VersionedNodeType,
	LoadOptionsResult,
	ResourceMappingField,
} from '../node-types';

describe('Node Types', () => {
	describe('Node Execution Status', () => {
		it('should have valid execution status values', () => {
			const statuses: NodeExecutionStatus[] = [
				'new',
				'running',
				'success',
				'error',
				'canceled',
				'waiting',
			];

			statuses.forEach((status) => {
				expect(typeof status).toBe('string');
			});
		});
	});

	describe('Node Connection Types', () => {
		it('should have valid connection types', () => {
			const connectionTypes: NodeConnectionType[] = [
				'main',
				'ai_languageModel',
				'ai_memory',
				'ai_tool',
				'ai_document',
				'ai_retriever',
				'ai_vectorStore',
			];

			connectionTypes.forEach((type) => {
				expect(typeof type).toBe('string');
			});
		});
	});

	describe('Node Parameter Types', () => {
		it('should have valid parameter types', () => {
			const parameterTypes: NodeParameterType[] = [
				'string',
				'number',
				'boolean',
				'collection',
				'fixedCollection',
				'options',
				'multiOptions',
				'json',
				'notice',
				'hidden',
				'resourceLocator',
				'resourceMapper',
				'filter',
				'assignmentCollection',
				'dateTime',
				'color',
				'credentials',
				'curlImport',
				'workflowTemplate',
				'code',
			];

			parameterTypes.forEach((type) => {
				expect(typeof type).toBe('string');
			});
		});
	});

	describe('String Parameter', () => {
		it('should create valid string parameter', () => {
			const stringParam: StringParameter = {
				displayName: 'Input Text',
				name: 'text',
				type: 'string',
				required: true,
				default: 'default value',
				typeOptions: {
					rows: 4,
					password: false,
					editor: 'code',
				},
			};

			expect(stringParam.type).toBe('string');
			expect(stringParam.displayName).toBe('Input Text');
			expect(stringParam.required).toBe(true);
			expect(stringParam.typeOptions?.rows).toBe(4);
		});
	});

	describe('Number Parameter', () => {
		it('should create valid number parameter', () => {
			const numberParam: NumberParameter = {
				displayName: 'Count',
				name: 'count',
				type: 'number',
				default: 0,
				typeOptions: {
					minValue: 0,
					maxValue: 100,
					numberStepSize: 1,
				},
			};

			expect(numberParam.type).toBe('number');
			expect(numberParam.default).toBe(0);
			expect(numberParam.typeOptions?.minValue).toBe(0);
		});
	});

	describe('Options Parameter', () => {
		it('should create valid options parameter', () => {
			const optionsParam: OptionsParameter = {
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				default: 'get',
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Get a record',
					},
					{
						name: 'Create',
						value: 'create',
						description: 'Create a record',
					},
				],
			};

			expect(optionsParam.type).toBe('options');
			expect(optionsParam.options).toHaveLength(2);
			expect(optionsParam.options[0].name).toBe('Get');
		});
	});

	describe('Collection Parameter', () => {
		it('should create valid collection parameter', () => {
			const collectionParam: CollectionParameter = {
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				options: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
					} as StringParameter,
				],
			};

			expect(collectionParam.type).toBe('collection');
			expect(collectionParam.options).toHaveLength(1);
		});
	});

	describe('Node Execution Data', () => {
		it('should create valid execution data', () => {
			const executionData: NodeExecutionData = {
				json: {
					id: 1,
					name: 'Test Item',
					active: true,
				},
				binary: {
					data: {
						data: 'base64encodeddata',
						mimeType: 'text/plain',
						fileName: 'test.txt',
					},
				},
				pairedItem: {
					item: 0,
					input: 0,
				},
			};

			expect(executionData.json.id).toBe(1);
			expect(executionData.binary?.data.mimeType).toBe('text/plain');
			expect(
				Array.isArray(executionData.pairedItem)
					? executionData.pairedItem[0].item
					: executionData.pairedItem?.item,
			).toBe(0);
		});
	});

	describe('Node Execution Error', () => {
		it('should create valid execution error', () => {
			const executionError: NodeExecutionError = {
				message: 'Something went wrong',
				name: 'ValidationError',
				stack: 'Error stack trace',
				context: {
					nodeId: 'node123',
					operation: 'create',
				},
				timestamp: Date.now(),
				node: {
					id: 'node123',
					name: 'Test Node',
					type: 'test',
				},
			};

			expect(executionError.message).toBe('Something went wrong');
			expect(executionError.node?.id).toBe('node123');
			expect(typeof executionError.timestamp).toBe('number');
		});
	});

	describe('Node Input Data', () => {
		it('should create valid input data', () => {
			const inputData: NodeInputData = {
				main: [
					[
						{
							json: { test: 'data' },
						},
					],
				],
				// eslint-disable-next-line @typescript-eslint/naming-convention
				ai_languageModel: [
					[
						{
							json: { model: 'gpt-4' },
						},
					],
				],
			};

			expect(inputData.main?.[0]).toHaveLength(1);
			expect(inputData.ai_languageModel?.[0][0].json.model).toBe('gpt-4');
		});
	});

	describe('Node Context', () => {
		it('should create valid node context', () => {
			const context: NodeContext = {
				node: {
					id: 'node123',
					name: 'Test Node',
					type: 'test',
					position: [100, 200],
					parameters: {
						operation: 'get',
					},
				},
				workflow: {
					id: 'workflow123',
					name: 'Test Workflow',
					active: true,
				},
				execution: {
					id: 'exec123',
					mode: 'manual',
					startedAt: new Date(),
					status: 'running',
				},
			};

			expect(context.node.id).toBe('node123');
			expect(context.workflow.active).toBe(true);
			expect(context.execution.mode).toBe('manual');
		});
	});

	describe('Node Metadata', () => {
		it('should create valid node metadata', () => {
			const metadata: NodeMetadata = {
				version: 1,
				description: 'Test node for validation',
				displayName: 'Test Node',
				name: 'testNode',
				group: ['test'],
				icon: 'fa:test',
				defaults: {
					name: 'Test Node',
					color: '#ff0000',
				},
				inputs: ['main'],
				outputs: ['main'],
				properties: [
					{
						displayName: 'Operation',
						name: 'operation',
						type: 'options',
						required: true,
						default: 'get',
						options: [{ name: 'Get', value: 'get' }],
					} as OptionsParameter,
				],
			};

			expect(metadata.name).toBe('testNode');
			expect(metadata.group).toContain('test');
			expect(metadata.properties).toHaveLength(1);
		});
	});

	describe('API Operation', () => {
		it('should create valid API operation', () => {
			const operation: ApiOperation = {
				operation: 'create',
				resource: 'user',
				description: 'Create a new user',
				requestMethod: 'POST',
				endpoint: '/api/users',
				parameters: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						required: true,
						default: '',
					} as StringParameter,
				],
				authentication: ['oauth2'],
			};

			expect(operation.operation).toBe('create');
			expect(operation.requestMethod).toBe('POST');
			expect(operation.parameters).toHaveLength(1);
		});
	});

	describe('Credential Test', () => {
		it('should create valid credential test', () => {
			const credTest: CredentialTest = {
				request: {
					baseURL: 'https://api.example.com',
					url: '/auth/test',
					method: 'GET',
					headers: {
						// eslint-disable-next-line @typescript-eslint/naming-convention
						Authorization: 'Bearer {{$credentials.token}}',
					},
				},
				rules: [
					{
						type: 'responseSuccessBody',
						properties: {
							key: 'success',
							value: true,
						},
					},
				],
			};

			expect(credTest.request.baseURL).toBe('https://api.example.com');
			expect(credTest.rules).toHaveLength(1);
		});
	});

	describe('Versioned Node Type', () => {
		it('should create valid versioned node type', () => {
			const versionedNode: VersionedNodeType = {
				description: {
					version: [1, 2],
					description: 'Test versioned node',
					displayName: 'Versioned Test Node',
					name: 'versionedTestNode',
					group: ['test'],
					defaults: {
						name: 'Versioned Test Node',
					},
					inputs: ['main'],
					outputs: ['main'],
					properties: [],
				},
				nodeVersions: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					1: {
						version: 1,
						displayName: 'Versioned Test Node v1',
						properties: [
							{
								displayName: 'Old Parameter',
								name: 'oldParam',
								type: 'string',
								default: '',
							} as StringParameter,
						],
					},
					// eslint-disable-next-line @typescript-eslint/naming-convention
					2: {
						version: 2,
						displayName: 'Versioned Test Node v2',
						properties: [
							{
								displayName: 'New Parameter',
								name: 'newParam',
								type: 'string',
								default: '',
							} as StringParameter,
						],
					},
				},
			};

			expect(Array.isArray(versionedNode.description.version)).toBe(true);
			expect(versionedNode.nodeVersions[1].version).toBe(1);
			expect(versionedNode.nodeVersions[2].version).toBe(2);
		});
	});

	describe('Load Options Result', () => {
		it('should create valid load options result', () => {
			const option: LoadOptionsResult = {
				name: 'Option 1',
				value: 'option1',
				description: 'First option',
			};

			expect(option.name).toBe('Option 1');
			expect(option.value).toBe('option1');
		});
	});

	describe('Resource Mapping Field', () => {
		it('should create valid resource mapping field', () => {
			const field: ResourceMappingField = {
				id: 'name',
				displayName: 'Name',
				required: true,
				defaultMatch: true,
				type: 'string',
				canBeUsedToMatch: true,
			};

			expect(field.id).toBe('name');
			expect(field.required).toBe(true);
			expect(field.type).toBe('string');
		});
	});

	describe('Type Unions', () => {
		it('should work with node parameter union type', () => {
			const parameters: NodeParameter[] = [
				{
					displayName: 'Text',
					name: 'text',
					type: 'string',
					default: '',
				} as StringParameter,
				{
					displayName: 'Count',
					name: 'count',
					type: 'number',
					default: 0,
				} as NumberParameter,
				{
					displayName: 'Active',
					name: 'active',
					type: 'boolean',
					default: false,
				} as BooleanParameter,
			];

			expect(parameters).toHaveLength(3);
			expect(parameters[0].type).toBe('string');
			expect(parameters[1].type).toBe('number');
			expect(parameters[2].type).toBe('boolean');
		});
	});
});
