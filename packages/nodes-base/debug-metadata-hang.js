#!/usr/bin/env node

console.log('Testing full metadata generation...');
const { PackageDirectoryLoader } = require('../core/dist/nodes-loader/package-directory-loader');
const loader = new PackageDirectoryLoader(process.cwd());

function findReferencedMethods(obj, refs = {}, latestName = '') {
	for (const key in obj) {
		if (key === 'name' && 'group' in obj) {
			latestName = obj[key];
		}

		if (typeof obj[key] === 'object' && obj[key] !== null) {
			findReferencedMethods(obj[key], refs, latestName);
		}

		if (key === 'loadOptionsMethod') {
			refs[latestName] = refs[latestName]
				? [...new Set([...refs[latestName], obj[key]])]
				: [obj[key]];
		}
	}

	return refs;
}

(async () => {
	console.log('Loading all...');
	const start1 = Date.now();
	await loader.loadAll();
	console.log(`loadAll completed in ${Date.now() - start1}ms`);

	console.log('Getting node types...');
	const start2 = Date.now();
	const loaderNodeTypes = Object.values(loader.nodeTypes);
	console.log(`Got ${loaderNodeTypes.length} node types in ${Date.now() - start2}ms`);

	console.log('Processing definedMethods...');
	const start3 = Date.now();
	const definedMethods = loaderNodeTypes.reduce((acc, cur) => {
		loader.getVersionedNodeTypeAll(cur.type).forEach((type) => {
			const methods = type.description?.__loadOptionsMethods;

			if (!methods) return;

			const { name } = type.description;

			if (acc[name]) {
				acc[name] = [...new Set([...acc[name], ...methods])];
				return;
			}

			acc[name] = methods;
		});

		return acc;
	}, {});
	console.log(`definedMethods completed in ${Date.now() - start3}ms`);

	console.log('Creating nodeTypes array...');
	const start4 = Date.now();
	const nodeTypes = loaderNodeTypes
		.map(({ type }) => type)
		.flatMap((nodeType) =>
			loader.getVersionedNodeTypeAll(nodeType).map((item) => {
				const { __loadOptionsMethods, ...rest } = item.description;
				return rest;
			}),
		);
	console.log(`nodeTypes array created in ${Date.now() - start4}ms, length: ${nodeTypes.length}`);

	console.log('Finding referenced methods - this is likely where it hangs...');
	const start5 = Date.now();

	// Test with a smaller subset first
	const smallNodeTypes = nodeTypes.slice(0, 10);
	console.log(`Testing with first 10 nodeTypes...`);
	const smallReferencedMethods = findReferencedMethods(smallNodeTypes);
	console.log(`Small test completed in ${Date.now() - start5}ms`);

	// Now try with full set
	console.log('Testing with all nodeTypes...');
	const start6 = Date.now();
	const referencedMethods = findReferencedMethods(nodeTypes);
	console.log(`referencedMethods completed in ${Date.now() - start6}ms`);

	console.log('Script completed successfully!');
})().catch((err) => {
	console.error('Error:', err);
	process.exit(1);
});
