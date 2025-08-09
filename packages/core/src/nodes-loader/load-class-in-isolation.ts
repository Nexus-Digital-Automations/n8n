import { inTest } from '@n8n/backend-common';
import { createContext, Script } from 'vm';

const context = createContext({ require });
export const loadClassInIsolation = async <T>(filePath: string, className: string): Promise<T> => {
	if (process.platform === 'win32') {
		filePath = filePath.replace(/\\/g, '/');
	}

	// Note: Skip the isolation because it breaks nock mocks in tests
	if (inTest) {
		const module: Record<string, new () => T> = (await import(filePath)) as Record<
			string,
			new () => T
		>;
		const ClassConstructor = module[className];
		if (typeof ClassConstructor !== 'function') {
			throw new Error(`Class ${className} not found in ${filePath}`);
		}
		return new ClassConstructor();
	} else {
		const script = new Script(`new (require('${filePath}').${className})()`);
		return script.runInContext(context) as T;
	}
};
