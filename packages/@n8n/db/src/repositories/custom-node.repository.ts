import { Service } from '@n8n/di';
import { DataSource, In, Repository } from '@n8n/typeorm';

import { CustomNode, type CustomNodeStatus } from '../entities/custom-node.entity';

export interface CustomNodeFilterOptions {
	status?: CustomNodeStatus | CustomNodeStatus[];
	category?: string;
	authorId?: string;
	search?: string;
	tags?: string[];
	isActive?: boolean;
}

export interface CustomNodeListOptions extends CustomNodeFilterOptions {
	limit?: number;
	offset?: number;
	sortBy?: 'name' | 'createdAt' | 'version' | 'status';
	sortOrder?: 'ASC' | 'DESC';
}

@Service()
export class CustomNodeRepository extends Repository<CustomNode> {
	constructor(dataSource: DataSource) {
		super(CustomNode, dataSource.createEntityManager());
	}

	async findByNameAndVersion(name: string, version: string): Promise<CustomNode | null> {
		return await this.findOne({
			where: { name, version, isActive: true },
		});
	}

	async findByAuthor(authorId: string): Promise<CustomNode[]> {
		return await this.find({
			where: { authorId, isActive: true },
			order: { createdAt: 'DESC' },
		});
	}

	async findByStatus(status: CustomNodeStatus): Promise<CustomNode[]> {
		return await this.find({
			where: { status, isActive: true },
			order: { createdAt: 'DESC' },
		});
	}

	async findWithFilters(options: CustomNodeListOptions): Promise<{
		nodes: CustomNode[];
		total: number;
	}> {
		const queryBuilder = this.createQueryBuilder('customNode')
			.leftJoinAndSelect('customNode.author', 'author')
			.where('customNode.isActive = :isActive', { isActive: true });

		// Apply filters
		if (options.status) {
			if (Array.isArray(options.status)) {
				queryBuilder.andWhere('customNode.status IN (:...statuses)', { statuses: options.status });
			} else {
				queryBuilder.andWhere('customNode.status = :status', { status: options.status });
			}
		}

		if (options.category) {
			queryBuilder.andWhere('customNode.category = :category', { category: options.category });
		}

		if (options.authorId) {
			queryBuilder.andWhere('customNode.authorId = :authorId', { authorId: options.authorId });
		}

		if (options.search) {
			queryBuilder.andWhere(
				'(customNode.name ILIKE :search OR customNode.description ILIKE :search)',
				{ search: `%${options.search}%` },
			);
		}

		if (options.tags && options.tags.length > 0) {
			queryBuilder.andWhere('customNode.tags && :tags', { tags: options.tags });
		}

		// Get total count before pagination
		const total = await queryBuilder.getCount();

		// Apply sorting
		const sortBy = options.sortBy || 'createdAt';
		const sortOrder = options.sortOrder || 'DESC';
		queryBuilder.orderBy(`customNode.${sortBy}`, sortOrder);

		// Apply pagination
		if (options.limit) {
			queryBuilder.limit(options.limit);
		}
		if (options.offset) {
			queryBuilder.offset(options.offset);
		}

		const nodes = await queryBuilder.getMany();

		return { nodes, total };
	}

	async findValidatedNodes(): Promise<CustomNode[]> {
		return await this.find({
			where: {
				status: In(['validated', 'deployed']),
				isActive: true,
			},
			order: { createdAt: 'DESC' },
		});
	}

	async findDeployedNodes(): Promise<CustomNode[]> {
		return await this.find({
			where: {
				status: 'deployed',
				isActive: true,
			},
			order: { deployedAt: 'DESC' },
		});
	}

	async softDelete(id: string): Promise<void> {
		await this.update(id, {
			isActive: false,
		});
	}

	async updateStatus(
		id: string,
		status: CustomNodeStatus,
		additionalData?: Partial<CustomNode>,
	): Promise<void> {
		const updateData: Partial<CustomNode> = { status, ...additionalData };

		if (status === 'validated') {
			updateData.validatedAt = new Date();
		} else if (status === 'deployed') {
			updateData.deployedAt = new Date();
		}

		await this.update(id, updateData);
	}

	async findByIds(ids: string[]): Promise<CustomNode[]> {
		if (ids.length === 0) return [];

		return await this.find({
			where: {
				id: In(ids),
				isActive: true,
			},
		});
	}

	async getStatsByAuthor(authorId: string): Promise<{
		total: number;
		deployed: number;
		validated: number;
		failed: number;
	}> {
		const stats = await this.createQueryBuilder('customNode')
			.select('customNode.status', 'status')
			.addSelect('COUNT(*)', 'count')
			.where('customNode.authorId = :authorId', { authorId })
			.andWhere('customNode.isActive = :isActive', { isActive: true })
			.groupBy('customNode.status')
			.getRawMany();

		const result = {
			total: 0,
			deployed: 0,
			validated: 0,
			failed: 0,
		};

		stats.forEach((stat) => {
			const count = parseInt(stat.count, 10);
			result.total += count;

			switch (stat.status) {
				case 'deployed':
					result.deployed = count;
					break;
				case 'validated':
					result.validated = count;
					break;
				case 'failed':
					result.failed = count;
					break;
			}
		});

		return result;
	}

	async getAvailableCategories(): Promise<string[]> {
		const categories = await this.createQueryBuilder('customNode')
			.select('DISTINCT customNode.category', 'category')
			.where('customNode.category IS NOT NULL')
			.andWhere('customNode.isActive = :isActive', { isActive: true })
			.getRawMany();

		return categories.map((c) => c.category).filter(Boolean);
	}

	async getAvailableTags(): Promise<string[]> {
		const result = await this.createQueryBuilder('customNode')
			.select('unnest(customNode.tags)', 'tag')
			.where('customNode.tags IS NOT NULL')
			.andWhere('customNode.isActive = :isActive', { isActive: true })
			.getRawMany();

		return [...new Set(result.map((r) => r.tag).filter(Boolean))];
	}
}
