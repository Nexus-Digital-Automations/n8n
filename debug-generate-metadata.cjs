#!/usr/bin/env node

console.log('Starting debug script...');
process.chdir('/Users/jeremyparker/Desktop/Claude Coding Projects/n8n-fork/packages/nodes-base');

const { LoggerProxy } = require('n8n-workflow');
const { PackageDirectoryLoader } = require('../core/dist/nodes-loader/package-directory-loader');
const { packageDir, writeJSON } = require('../core/bin/common');

console.log('packageDir:', packageDir);
LoggerProxy.init(console);

function findReferencedMethods(obj, refs = {}, latestName = '') {
	for (const key in obj) {
		if (key === 'name' && 'group' in obj) {
			latestName = obj[key];
		}

		if (typeof obj[key] === 'object') {
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
	console.log('Creating loader...');
	const loader = new PackageDirectoryLoader(packageDir);
	
	console.log('Loading all...');
	await loader.loadAll();
	console.log('LoadAll completed');

	console.log('Getting node types...');
	const loaderNodeTypes = Object.values(loader.nodeTypes);
	console.log('Found', loaderNodeTypes.length, 'node types');

	console.log('Processing definedMethods...');
	let count = 0;
	const definedMethods = loaderNodeTypes.reduce((acc, cur) => {
		count++;
		if (count % 50 === 0) {
			console.log(`Processing node ${count}/${loaderNodeTypes.length}: ${cur.type.description.name}`);
		}
		
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
	console.log('definedMethods completed');

	console.log('Creating nodeTypes array...');
	const nodeTypes = loaderNodeTypes
		.map(({ type }) => type)
		.flatMap((nodeType) =>
			loader.getVersionedNodeTypeAll(nodeType).map((item) => {
				const { __loadOptionsMethods, ...rest } = item.description;
				return rest;
			}),
		);
	console.log('nodeTypes array completed, length:', nodeTypes.length);

	console.log('Getting credentials...');
	const credentialTypes = Object.values(loader.credentialTypes).map(({ type }) => type);
	console.log('credentialTypes completed, length:', credentialTypes.length);
	
	console.log('Finding referenced methods...');
	const referencedMethods = findReferencedMethods(nodeTypes);
	console.log('referencedMethods completed');

	console.log('Writing JSON files...');
	await Promise.all([
		writeJSON('known/nodes.json', loader.known.nodes),
		writeJSON('known/credentials.json', loader.known.credentials),
		writeJSON('types/credentials.json', credentialTypes),
		writeJSON('types/nodes.json', nodeTypes),
		writeJSON('methods/defined.json', definedMethods),
		writeJSON('methods/referenced.json', referencedMethods),
	]);
	console.log('All JSON files written successfully!');
})().catch(err => {
	console.error('Error occurred:', err);
	process.exit(1);
});