import { defineStore } from 'pinia';
import { useRootStore } from '@n8n/stores/useRootStore';
import { STORES } from '@n8n/stores';
import { computed, ref } from 'vue';
import type { IRestApiContext } from '@/Interface';

// Custom Node Types
export interface CustomNodeSummary {
	id: string;
	name: string;
	version: string;
	status: 'uploaded' | 'validating' | 'validated' | 'failed' | 'deployed';
	description: string;
	author: string;
	category: string;
	tags: string[];
	nodeTypes: string[];
	createdAt: string;
	updatedAt: string;
	deployedAt?: string;
	isActive: boolean;
}

export interface CustomNodeDetails extends CustomNodeSummary {
	validationResults: {
		syntax: boolean;
		dependencies: boolean;
		security: boolean;
		tests: boolean;
		warnings: string[];
		errors: string[];
	};
	metadata: {
		nodeTypes: string[];
		author: string;
		license: string;
		fileSize: string;
		dependencies: string[];
	};
	deploymentInfo?: {
		deployedVersion: string;
		deploymentStatus: 'deploying' | 'deployed' | 'failed';
		lastDeployment: string;
		rollbackAvailable: boolean;
	};
	files: Array<{
		name: string;
		size: number;
		type: string;
		path: string;
	}>;
	dependencies: Array<{
		name: string;
		version: string;
		resolved: boolean;
	}>;
	testResults?: {
		passed: number;
		failed: number;
		coverage?: number;
	};
}

export interface ListCustomNodesResponse {
	nodes: CustomNodeSummary[];
	total: number;
	limit: number;
	offset: number;
	filters: {
		categories: string[];
		authors: string[];
		tags: string[];
		statuses: string[];
	};
}

export interface DeploymentResult {
	deploymentId: string;
	status: 'queued' | 'deploying' | 'deployed' | 'failed';
	message: string;
	logs?: string[];
	errors?: string[];
}

export interface RuntimeStatus {
	nodeId: string;
	deploymentStatus: string;
	runtime: {
		isLoaded: boolean;
		version: string;
		loadedAt?: string;
		instances: number;
		memory?: {
			used: string;
			peak: string;
		};
		performance?: {
			executionCount: number;
			averageExecutionTime: number;
			errorRate: number;
		};
	};
	health: {
		status: 'healthy' | 'degraded' | 'unhealthy';
		lastCheck: string;
		issues: string[];
	};
}

// API Functions
const customNodesApi = {
	// List custom nodes
	async getCustomNodes(
		context: IRestApiContext,
		params?: {
			status?: string;
			category?: string;
			search?: string;
			tags?: string;
			limit?: number;
			offset?: number;
			sortBy?: string;
			sortOrder?: string;
		},
	): Promise<ListCustomNodesResponse> {
		const queryParams = new URLSearchParams();
		if (params) {
			Object.entries(params).forEach(([key, value]) => {
				if (value !== undefined && value !== null) {
					queryParams.append(key, String(value));
				}
			});
		}

		const response = await context
			.restApi()
			.makeRestApiRequest('GET', `/custom-nodes?${queryParams.toString()}`);
		return response;
	},

	// Get custom node details
	async getCustomNode(context: IRestApiContext, nodeId: string): Promise<CustomNodeDetails> {
		const response = await context.restApi().makeRestApiRequest('GET', `/custom-nodes/${nodeId}`);
		return response;
	},

	// Create/upload custom node
	async createCustomNode(context: IRestApiContext, formData: FormData): Promise<CustomNodeSummary> {
		const response = await context.restApi().makeRestApiRequest('POST', '/custom-nodes', formData);
		return response;
	},

	// Update custom node
	async updateCustomNode(
		context: IRestApiContext,
		nodeId: string,
		formData: FormData,
	): Promise<CustomNodeSummary> {
		const response = await context
			.restApi()
			.makeRestApiRequest('PATCH', `/custom-nodes/${nodeId}`, formData);
		return response;
	},

	// Delete custom node
	async deleteCustomNode(
		context: IRestApiContext,
		nodeId: string,
		options?: { force?: boolean; cleanup?: boolean },
	): Promise<{ success: boolean }> {
		const queryParams = new URLSearchParams();
		if (options?.force) queryParams.append('force', 'true');
		if (options?.cleanup) queryParams.append('cleanup', 'true');

		const response = await context
			.restApi()
			.makeRestApiRequest('DELETE', `/custom-nodes/${nodeId}?${queryParams.toString()}`);
		return response;
	},

	// Validate custom node
	async validateCustomNode(context: IRestApiContext, nodeId: string): Promise<any> {
		const response = await context
			.restApi()
			.makeRestApiRequest('POST', `/custom-nodes/${nodeId}/validate`);
		return response;
	},

	// Deploy custom node
	async deployCustomNode(
		context: IRestApiContext,
		nodeId: string,
		options?: {
			environment?: 'staging' | 'production';
			force?: boolean;
			skipValidation?: boolean;
		},
	): Promise<DeploymentResult> {
		const response = await context
			.restApi()
			.makeRestApiRequest('POST', `/custom-nodes/${nodeId}/deploy`, options || {});
		return response;
	},

	// Undeploy custom node
	async undeployCustomNode(
		context: IRestApiContext,
		nodeId: string,
		options?: { environment?: string; force?: boolean },
	): Promise<DeploymentResult> {
		const queryParams = new URLSearchParams();
		if (options?.environment) queryParams.append('environment', options.environment);
		if (options?.force) queryParams.append('force', 'true');

		const response = await context
			.restApi()
			.makeRestApiRequest('DELETE', `/custom-nodes/${nodeId}/deploy?${queryParams.toString()}`);
		return response;
	},

	// Get runtime status
	async getRuntimeStatus(context: IRestApiContext, nodeId: string): Promise<RuntimeStatus> {
		const response = await context
			.restApi()
			.makeRestApiRequest('GET', `/custom-nodes/${nodeId}/runtime-status`);
		return response;
	},

	// Hot reload node
	async hotReloadNode(
		context: IRestApiContext,
		nodeId: string,
	): Promise<{ success: boolean; message: string }> {
		const response = await context
			.restApi()
			.makeRestApiRequest('POST', `/custom-nodes/${nodeId}/hot-reload`);
		return response;
	},

	// Get deployment statistics
	async getStatistics(context: IRestApiContext): Promise<{
		total: number;
		byStatus: Record<string, number>;
		byCategory: Record<string, number>;
		active: number;
	}> {
		const response = await context
			.restApi()
			.makeRestApiRequest('GET', '/custom-nodes/statistics/summary');
		return response;
	},
};

export const useCustomNodesStore = defineStore(STORES.CUSTOM_NODES || 'customNodes', () => {
	// State
	const customNodes = ref<Record<string, CustomNodeSummary>>({});
	const customNodeDetails = ref<Record<string, CustomNodeDetails>>({});
	const currentFilters = ref({
		status: 'all',
		category: '',
		search: '',
		tags: [] as string[],
		sortBy: 'createdAt',
		sortOrder: 'desc',
	});
	const pagination = ref({
		limit: 20,
		offset: 0,
		total: 0,
	});
	const loading = ref({
		list: false,
		details: false,
		upload: false,
		deploy: false,
		validate: false,
	});
	const availableFilters = ref({
		categories: [] as string[],
		authors: [] as string[],
		tags: [] as string[],
		statuses: [] as string[],
	});
	const statistics = ref({
		total: 0,
		byStatus: {} as Record<string, number>,
		byCategory: {} as Record<string, number>,
		active: 0,
	});

	// Stores
	const rootStore = useRootStore();

	// Computed
	const getCustomNodesList = computed(() => {
		return Object.values(customNodes.value).sort((a, b) => {
			const order = currentFilters.value.sortOrder === 'desc' ? -1 : 1;
			const field = currentFilters.value.sortBy as keyof CustomNodeSummary;

			if (a[field] < b[field]) return order;
			if (a[field] > b[field]) return -order;
			return 0;
		});
	});

	const getCustomNodeById = computed(() => (id: string) => {
		return customNodeDetails.value[id] || customNodes.value[id];
	});

	const getNodesByStatus = computed(() => (status: string) => {
		return getCustomNodesList.value.filter((node) => status === 'all' || node.status === status);
	});

	const getNodesByCategory = computed(() => (category: string) => {
		return getCustomNodesList.value.filter((node) => !category || node.category === category);
	});

	// Methods

	const setCustomNodes = (nodes: CustomNodeSummary[]) => {
		const nodeMap: Record<string, CustomNodeSummary> = {};
		nodes.forEach((node) => {
			nodeMap[node.id] = node;
		});
		customNodes.value = nodeMap;
	};

	const setCustomNodeDetails = (nodeId: string, details: CustomNodeDetails) => {
		customNodeDetails.value[nodeId] = details;
		// Update the summary in the list as well
		if (customNodes.value[nodeId]) {
			customNodes.value[nodeId] = { ...details };
		}
	};

	const fetchCustomNodes = async (params?: {
		status?: string;
		category?: string;
		search?: string;
		tags?: string;
		limit?: number;
		offset?: number;
		sortBy?: string;
		sortOrder?: string;
	}) => {
		loading.value.list = true;
		try {
			const response = await customNodesApi.getCustomNodes(rootStore.restApiContext, params);

			setCustomNodes(response.nodes);
			pagination.value = {
				limit: response.limit,
				offset: response.offset,
				total: response.total,
			};
			availableFilters.value = response.filters;

			return response;
		} finally {
			loading.value.list = false;
		}
	};

	const fetchCustomNodeDetails = async (nodeId: string) => {
		loading.value.details = true;
		try {
			const details = await customNodesApi.getCustomNode(rootStore.restApiContext, nodeId);
			setCustomNodeDetails(nodeId, details);
			return details;
		} finally {
			loading.value.details = false;
		}
	};

	const uploadCustomNode = async (formData: FormData) => {
		loading.value.upload = true;
		try {
			const newNode = await customNodesApi.createCustomNode(rootStore.restApiContext, formData);
			customNodes.value[newNode.id] = newNode;
			return newNode;
		} finally {
			loading.value.upload = false;
		}
	};

	const updateCustomNode = async (nodeId: string, formData: FormData) => {
		loading.value.upload = true;
		try {
			const updatedNode = await customNodesApi.updateCustomNode(
				rootStore.restApiContext,
				nodeId,
				formData,
			);
			customNodes.value[nodeId] = updatedNode;
			return updatedNode;
		} finally {
			loading.value.upload = false;
		}
	};

	const deleteCustomNode = async (
		nodeId: string,
		options?: { force?: boolean; cleanup?: boolean },
	) => {
		await customNodesApi.deleteCustomNode(rootStore.restApiContext, nodeId, options);
		const { [nodeId]: deletedNode, ...remainingNodes } = customNodes.value;
		customNodes.value = remainingNodes;

		// Also remove from details cache
		const { [nodeId]: deletedDetails, ...remainingDetails } = customNodeDetails.value;
		customNodeDetails.value = remainingDetails;
	};

	const validateCustomNode = async (nodeId: string) => {
		loading.value.validate = true;
		try {
			const result = await customNodesApi.validateCustomNode(rootStore.restApiContext, nodeId);
			// Update the node status
			if (customNodes.value[nodeId]) {
				customNodes.value[nodeId].status =
					result.syntax && result.security ? 'validated' : 'failed';
			}
			return result;
		} finally {
			loading.value.validate = false;
		}
	};

	const deployCustomNode = async (
		nodeId: string,
		options?: {
			environment?: 'staging' | 'production';
			force?: boolean;
			skipValidation?: boolean;
		},
	) => {
		loading.value.deploy = true;
		try {
			const result = await customNodesApi.deployCustomNode(
				rootStore.restApiContext,
				nodeId,
				options,
			);
			// Update node status
			if (customNodes.value[nodeId]) {
				customNodes.value[nodeId].status = 'deployed';
				customNodes.value[nodeId].deployedAt = new Date().toISOString();
			}
			return result;
		} finally {
			loading.value.deploy = false;
		}
	};

	const undeployCustomNode = async (
		nodeId: string,
		options?: { environment?: string; force?: boolean },
	) => {
		loading.value.deploy = true;
		try {
			const result = await customNodesApi.undeployCustomNode(
				rootStore.restApiContext,
				nodeId,
				options,
			);
			// Update node status
			if (customNodes.value[nodeId]) {
				customNodes.value[nodeId].status = 'validated';
				customNodes.value[nodeId].deployedAt = undefined;
			}
			return result;
		} finally {
			loading.value.deploy = false;
		}
	};

	const getRuntimeStatus = async (nodeId: string) => {
		return await customNodesApi.getRuntimeStatus(rootStore.restApiContext, nodeId);
	};

	const hotReloadNode = async (nodeId: string) => {
		return await customNodesApi.hotReloadNode(rootStore.restApiContext, nodeId);
	};

	const fetchStatistics = async () => {
		const stats = await customNodesApi.getStatistics(rootStore.restApiContext);
		statistics.value = stats;
		return stats;
	};

	const updateFilters = (newFilters: Partial<typeof currentFilters.value>) => {
		currentFilters.value = { ...currentFilters.value, ...newFilters };
	};

	const updatePagination = (newPagination: Partial<typeof pagination.value>) => {
		pagination.value = { ...pagination.value, ...newPagination };
	};

	const addCustomNode = (node: CustomNodeSummary) => {
		customNodes.value[node.id] = node;
	};

	const updateCustomNodeStatus = (nodeId: string, status: CustomNodeSummary['status']) => {
		if (customNodes.value[nodeId]) {
			customNodes.value[nodeId].status = status;
		}
	};

	return {
		// State
		customNodes,
		customNodeDetails,
		currentFilters,
		pagination,
		loading,
		availableFilters,
		statistics,

		// Computed
		getCustomNodesList,
		getCustomNodeById,
		getNodesByStatus,
		getNodesByCategory,

		// Methods
		fetchCustomNodes,
		fetchCustomNodeDetails,
		uploadCustomNode,
		updateCustomNode,
		deleteCustomNode,
		validateCustomNode,
		deployCustomNode,
		undeployCustomNode,
		getRuntimeStatus,
		hotReloadNode,
		fetchStatistics,
		updateFilters,
		updatePagination,
		addCustomNode,
		updateCustomNodeStatus,
	};
});
