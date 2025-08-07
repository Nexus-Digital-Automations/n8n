import { Container, type Constructable } from '@n8n/di';
import { mock } from 'jest-mock-extended';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mockInstance = <T>(serviceClass: Constructable<T>, data?: any) => {
	const instance = mock<T>(data);
	Container.set(serviceClass, instance as T);
	return instance;
};
