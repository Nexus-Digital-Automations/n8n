import type { INodeProperties } from 'n8n-workflow';

export const purchaseOperations: INodeProperties[] = [
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
				action: 'Create a purchase',
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a purchase',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a purchase',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many purchases',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a purchase',
			},
		],
		displayOptions: {
			show: {
				resource: ['purchase'],
			},
		},
	},
];

export const purchaseFields: INodeProperties[] = [
	// ----------------------------------
	//         purchase: create
	// ----------------------------------
	{
		displayName: 'Payment Type',
		name: 'paymentType',
		type: 'options',
		required: true,
		default: 'Cash',
		options: [
			{
				name: 'Cash',
				value: 'Cash',
			},
			{
				name: 'Check',
				value: 'Check',
			},
			{
				name: 'Credit Card',
				value: 'CreditCard',
			},
		],
		description: 'The payment type for the purchase',
		displayOptions: {
			show: {
				resource: ['purchase'],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Account ID',
		name: 'accountRef',
		type: 'string',
		required: true,
		default: '',
		description: 'The ID of the account for this purchase',
		displayOptions: {
			show: {
				resource: ['purchase'],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Total Amount',
		name: 'totalAmt',
		type: 'number',
		required: true,
		default: 0,
		description: 'The total amount for the purchase',
		displayOptions: {
			show: {
				resource: ['purchase'],
				operation: ['create'],
			},
		},
	},

	// ----------------------------------
	//         purchase: update
	// ----------------------------------
	{
		displayName: 'Purchase ID',
		name: 'purchaseId',
		type: 'string',
		required: true,
		default: '',
		description: 'The ID of the purchase to update',
		displayOptions: {
			show: {
				resource: ['purchase'],
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
				resource: ['purchase'],
				operation: ['update'],
			},
		},
		options: [
			{
				displayName: 'Total Amount',
				name: 'TotalAmt',
				type: 'number',
				default: 0,
				description: 'The total amount for the purchase',
			},
			{
				displayName: 'Payment Type',
				name: 'PaymentType',
				type: 'options',
				default: 'Cash',
				options: [
					{
						name: 'Cash',
						value: 'Cash',
					},
					{
						name: 'Check',
						value: 'Check',
					},
					{
						name: 'Credit Card',
						value: 'CreditCard',
					},
				],
				description: 'The payment type for the purchase',
			},
		],
	},

	// ----------------------------------
	//         purchase: delete
	// ----------------------------------
	{
		displayName: 'Purchase ID',
		name: 'purchaseId',
		type: 'string',
		required: true,
		default: '',
		description: 'The ID of the purchase to delete',
		displayOptions: {
			show: {
				resource: ['purchase'],
				operation: ['delete'],
			},
		},
	},

	// ----------------------------------
	//         purchase: get
	// ----------------------------------
	{
		displayName: 'Purchase ID',
		name: 'purchaseId',
		type: 'string',
		required: true,
		default: '',
		description: 'The ID of the purchase to retrieve',
		displayOptions: {
			show: {
				resource: ['purchase'],
				operation: ['get'],
			},
		},
	},

	// ----------------------------------
	//         purchase: getAll
	// ----------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['purchase'],
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
				resource: ['purchase'],
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
					'The condition for selecting purchases. See the <a href="https://developer.intuit.com/app/developer/qbo/docs/develop/explore-the-quickbooks-online-api/data-queries">guide</a> for supported syntax.',
			},
		],
		displayOptions: {
			show: {
				resource: ['purchase'],
				operation: ['getAll'],
			},
		},
	},
];
