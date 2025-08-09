import { getConnection, Like } from 'typeorm';
import { User } from '@/databases/entities/User';
import { hash } from 'bcryptjs';

/**
 * Create a test user for integration tests
 */
export async function createMockUser(overrides?: Partial<User>): Promise<User> {
	const connection = getConnection();
	const userRepository = connection.getRepository(User);

	const defaultUser: Partial<User> = {
		id: 'test-user-id',
		email: 'test@n8n.io',
		firstName: 'Test',
		lastName: 'User',
		password: await hash('test-password', 10),
		role: 'owner',
		isActive: true,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};

	const user = userRepository.create(defaultUser);
	return await userRepository.save(user);
}

/**
 * Create multiple test users with different roles
 */
export async function createTestUsers(): Promise<{
	owner: User;
	admin: User;
	member: User;
}> {
	const [owner, admin, member] = await Promise.all([
		createMockUser({
			id: 'owner-user-id',
			email: 'owner@n8n.io',
			role: 'owner',
		}),
		createMockUser({
			id: 'admin-user-id',
			email: 'admin@n8n.io',
			role: 'admin',
		}),
		createMockUser({
			id: 'member-user-id',
			email: 'member@n8n.io',
			role: 'member',
		}),
	]);

	return { owner, admin, member };
}

/**
 * Clean up test users
 */
export async function cleanupTestUsers(): Promise<void> {
	const connection = getConnection();
	const userRepository = connection.getRepository(User);

	await userRepository.delete({
		email: Like('%@n8n.io'),
	});
}

/**
 * Create user credentials for API testing
 */
export interface TestUserCredentials {
	user: User;
	token: string;
}

/**
 * Create authenticated test user with JWT token
 */
export async function createAuthenticatedTestUser(
	overrides?: Partial<User>,
): Promise<TestUserCredentials> {
	const user = await createMockUser(overrides);

	// Generate a mock JWT token for testing
	const mockToken = `test-jwt-token-${user.id}`;

	return {
		user,
		token: mockToken,
	};
}

/**
 * Create request headers with authentication
 */
export function createAuthHeaders(token: string): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		'Content-Type': 'application/json',
	};
}

/**
 * Create request headers for file upload with authentication
 */
export function createMultipartAuthHeaders(token: string): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
	};
}
