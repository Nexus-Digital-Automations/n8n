import type { BinaryData } from '../types';

export type MetadataResponseHeaders = Record<string, string> & {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'content-length'?: string;
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'content-type'?: string;
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'x-amz-meta-filename'?: string;
	etag?: string;
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'last-modified'?: string;
} & BinaryData.PreWriteMetadata;
