import type { INodeProperties } from 'n8n-workflow';

export const itemOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'get',
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create an item',
			},
			{
				name: 'Deactivate',
				value: 'deactivate',
				action: 'Deactivate an item',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get an item',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many items',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update an item',
			},
		],
		displayOptions: {
			show: {
				resource: ['item'],
			},
		},
	},
];

export const itemFields: INodeProperties[] = [
	// ----------------------------------
	//         item: create
	// ----------------------------------
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		description: 'The name of the item to create',
		displayOptions: {
			show: {
				resource: ['item'],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Type',
		name: 'type',
		type: 'options',
		required: true,
		default: 'Inventory',
		options: [
			{
				name: 'Inventory',
				value: 'Inventory',
			},
			{
				name: 'Non Inventory',
				value: 'NonInventory',
			},
			{
				name: 'Service',
				value: 'Service',
			},
		],
		description: 'The type of the item',
		displayOptions: {
			show: {
				resource: ['item'],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Income Account ID',
		name: 'incomeAccountRef',
		type: 'string',
		required: true,
		default: '',
		description: 'The ID of the income account for this item',
		displayOptions: {
			show: {
				resource: ['item'],
				operation: ['create'],
			},
		},
	},

	// ----------------------------------
	//         item: update
	// ----------------------------------
	{
		displayName: 'Item ID',
		name: 'itemId',
		type: 'string',
		required: true,
		default: '',
		description: 'The ID of the item to update',
		displayOptions: {
			show: {
				resource: ['item'],
				operation: ['update'],
			},
		},
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['item'],
				operation: ['update'],
			},
		},
		options: [
			{
				displayName: 'Name',
				name: 'Name',
				type: 'string',
				default: '',
				description: 'The name of the item',
			},
			{
				displayName: 'Description',
				name: 'Description',
				type: 'string',
				default: '',
				description: 'The description of the item',
			},
			{
				displayName: 'Unit Price',
				name: 'UnitPrice',
				type: 'number',
				default: 0,
				description: 'The unit price of the item',
			},
			{
				displayName: 'Active',
				name: 'Active',
				type: 'boolean',
				default: true,
				description: 'Whether the item is active',
			},
		],
	},

	// ----------------------------------
	//         item: deactivate
	// ----------------------------------
	{
		displayName: 'Item ID',
		name: 'itemId',
		type: 'string',
		required: true,
		default: '',
		description: 'The ID of the item to deactivate',
		displayOptions: {
			show: {
				resource: ['item'],
				operation: ['deactivate'],
			},
		},
	},

	// ----------------------------------
	//         item: get
	// ----------------------------------
	{
		displayName: 'Item ID',
		name: 'itemId',
		type: 'string',
		required: true,
		default: '',
		description: 'The ID of the item to retrieve',
		displayOptions: {
			show: {
				resource: ['item'],
				operation: ['get'],
			},
		},
	},

	// ----------------------------------
	//         item: getAll
	// ----------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['item'],
				operation: ['getAll'],
			},
		},
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		description: 'Max number of results to return',
		typeOptions: {
			minValue: 1,
			maxValue: 1000,
		},
		displayOptions: {
			show: {
				resource: ['item'],
				operation: ['getAll'],
				returnAll: [false],
			},
		},
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		options: [
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				default: '',
				placeholder: "WHERE Metadata.LastUpdatedTime > '2021-01-01'",
				description:
					'The condition for selecting items. See the <a href="https://developer.intuit.com/app/developer/qbo/docs/develop/explore-the-quickbooks-online-api/data-queries">guide</a> for supported syntax.',
			},
		],
		displayOptions: {
			show: {
				resource: ['item'],
				operation: ['getAll'],
			},
		},
	},
];
