import type { IConnections, NodeConnectionType } from '../interfaces';

const { hasOwnProperty } = Object.prototype;

export function mapConnectionsByDestination(connections: IConnections) {
	const returnConnection: IConnections = {};

	let connectionInfo;
	let maxIndex: number;
	for (const sourceNode in connections) {
		if (!hasOwnProperty.call(connections, sourceNode)) {
			continue;
		}

		for (const type of Object.keys(connections[sourceNode]) as NodeConnectionType[]) {
			if (!hasOwnProperty.call(connections[sourceNode], type)) {
				continue;
			}

			for (const inputIndex in connections[sourceNode][type]) {
				if (!hasOwnProperty.call(connections[sourceNode][type], inputIndex)) {
					continue;
				}

				for (connectionInfo of connections[sourceNode][type][inputIndex] ?? []) {
					if (!hasOwnProperty.call(returnConnection, connectionInfo.node)) {
						returnConnection[connectionInfo.node] = {};
					}
					if (!hasOwnProperty.call(returnConnection[connectionInfo.node], connectionInfo.type)) {
						returnConnection[connectionInfo.node][connectionInfo.type] = [];
					}

					maxIndex = returnConnection[connectionInfo.node][connectionInfo.type].length - 1;
					for (let j = maxIndex; j < connectionInfo.index; j++) {
						returnConnection[connectionInfo.node][connectionInfo.type].push([]);
					}

					returnConnection[connectionInfo.node][connectionInfo.type][connectionInfo.index]?.push({
						node: sourceNode,
						type,
						index: parseInt(inputIndex, 10),
					});
				}
			}
		}
	}

	return returnConnection;
}
