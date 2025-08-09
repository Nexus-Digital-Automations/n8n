<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from '@n8n/i18n';
import { useTelemetry } from '@/composables/useTelemetry';
import { useToast } from '@/composables/useToast';
import { useUIStore } from '@/stores/ui.store';
import { useCustomNodesStore } from '@/stores/customNodes.store';
import type { EventBus } from 'n8n-design-system';

const CUSTOM_NODE_UPLOAD_MODAL_KEY = 'customNodeUpload';

// Composables
const i18n = useI18n();
const telemetry = useTelemetry();
const toast = useToast();
const uiStore = useUIStore();
const customNodesStore = useCustomNodesStore();

// State
const isDragOver = ref(false);
const selectedFile = ref<File | null>(null);
const uploadProgress = ref(0);
const uploadError = ref('');
const validationResults = ref<any>(null);
const isUploading = ref(false);
const showAdvancedOptions = ref(false);

// Form data
const nodeMetadata = ref({
	name: '',
	description: '',
	category: '',
	tags: [] as string[],
	author: '',
	version: '1.0.0',
});

const uploadOptions = ref({
	skipValidation: false,
	autoValidate: true,
	autoDeploy: false,
	environment: 'development' as 'development' | 'production',
});

// Computed
const isModalOpen = computed(() => uiStore.isModalOpen(CUSTOM_NODE_UPLOAD_MODAL_KEY));

const canUpload = computed(() => {
	return (
		selectedFile.value &&
		nodeMetadata.value.name.trim() &&
		nodeMetadata.value.author.trim() &&
		!isUploading.value
	);
});

const fileInfo = computed(() => {
	if (!selectedFile.value) return null;

	return {
		name: selectedFile.value.name,
		size: formatFileSize(selectedFile.value.size),
		type: selectedFile.value.type || 'application/octet-stream',
	};
});

const acceptedFileTypes = '.zip,.tar.gz,.tgz,.js,.ts';

// Methods
const formatFileSize = (bytes: number): string => {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const handleFileSelect = (files: FileList | null) => {
	if (!files || files.length === 0) return;

	const file = files[0];

	// Validate file type
	const validExtensions = ['.zip', '.tar.gz', '.tgz', '.js', '.ts'];
	const isValidType = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

	if (!isValidType) {
		toast.showError(
			new Error(i18n.baseText('settings.customNodes.upload.error.invalidFileType')),
			i18n.baseText('settings.customNodes.upload.error.title'),
		);
		return;
	}

	// Validate file size (max 50MB)
	const maxSize = 50 * 1024 * 1024;
	if (file.size > maxSize) {
		toast.showError(
			new Error(i18n.baseText('settings.customNodes.upload.error.fileTooLarge')),
			i18n.baseText('settings.customNodes.upload.error.title'),
		);
		return;
	}

	selectedFile.value = file;

	// Auto-populate name from filename if empty
	if (!nodeMetadata.value.name.trim()) {
		const nameWithoutExt = file.name.replace(/\.(zip|tar\.gz|tgz|js|ts)$/i, '');
		nodeMetadata.value.name = nameWithoutExt;
	}

	uploadError.value = '';
	validationResults.value = null;
};

const handleDragOver = (event: DragEvent) => {
	event.preventDefault();
	isDragOver.value = true;
};

const handleDragLeave = (event: DragEvent) => {
	event.preventDefault();
	isDragOver.value = false;
};

const handleDrop = (event: DragEvent) => {
	event.preventDefault();
	isDragOver.value = false;
	handleFileSelect(event.dataTransfer?.files || null);
};

const removeFile = () => {
	selectedFile.value = null;
	uploadProgress.value = 0;
	uploadError.value = '';
	validationResults.value = null;
};

const addTag = (tag: string) => {
	const trimmedTag = tag.trim();
	if (trimmedTag && !nodeMetadata.value.tags.includes(trimmedTag)) {
		nodeMetadata.value.tags.push(trimmedTag);
	}
};

const removeTag = (tagToRemove: string) => {
	nodeMetadata.value.tags = nodeMetadata.value.tags.filter((tag) => tag !== tagToRemove);
};

const resetForm = () => {
	selectedFile.value = null;
	uploadProgress.value = 0;
	uploadError.value = '';
	validationResults.value = null;
	isUploading.value = false;
	nodeMetadata.value = {
		name: '',
		description: '',
		category: '',
		tags: [],
		author: '',
		version: '1.0.0',
	};
	uploadOptions.value = {
		skipValidation: false,
		autoValidate: true,
		autoDeploy: false,
		environment: 'development',
	};
};

const uploadCustomNode = async () => {
	if (!selectedFile.value || !canUpload.value) return;

	isUploading.value = true;
	uploadProgress.value = 0;
	uploadError.value = '';

	try {
		const formData = new FormData();
		formData.append('file', selectedFile.value);
		formData.append('name', nodeMetadata.value.name);
		formData.append('description', nodeMetadata.value.description);
		formData.append('category', nodeMetadata.value.category);
		formData.append('author', nodeMetadata.value.author);
		formData.append('version', nodeMetadata.value.version);
		formData.append('tags', JSON.stringify(nodeMetadata.value.tags));
		formData.append('skipValidation', String(uploadOptions.value.skipValidation));
		formData.append('autoValidate', String(uploadOptions.value.autoValidate));
		formData.append('autoDeploy', String(uploadOptions.value.autoDeploy));
		formData.append('environment', uploadOptions.value.environment);

		// Simulate upload progress
		const progressInterval = setInterval(() => {
			if (uploadProgress.value < 90) {
				uploadProgress.value += Math.random() * 10;
			}
		}, 200);

		const result = await customNodesStore.uploadCustomNode(formData);

		clearInterval(progressInterval);
		uploadProgress.value = 100;

		toast.showMessage({
			title: i18n.baseText('settings.customNodes.upload.success.title'),
			message: i18n.baseText('settings.customNodes.upload.success.message', {
				interpolate: { nodeName: result.name },
			}),
			type: 'success',
		});

		telemetry.track('user uploaded custom node', {
			nodeId: result.id,
			nodeName: result.name,
			fileSize: selectedFile.value.size,
			fileType: selectedFile.value.type,
			autoValidate: uploadOptions.value.autoValidate,
			autoDeploy: uploadOptions.value.autoDeploy,
		});

		// Close modal and refresh data
		uiStore.closeModal(CUSTOM_NODE_UPLOAD_MODAL_KEY);
		await customNodesStore.fetchCustomNodes();
		await customNodesStore.fetchStatistics();
	} catch (error) {
		uploadError.value = error instanceof Error ? error.message : 'Upload failed';
		toast.showError(error, i18n.baseText('settings.customNodes.upload.error.title'));

		telemetry.track('user custom node upload failed', {
			error: uploadError.value,
			fileSize: selectedFile.value.size,
			fileType: selectedFile.value.type,
		});
	} finally {
		isUploading.value = false;
	}
};

const closeModal = () => {
	if (!isUploading.value) {
		uiStore.closeModal(CUSTOM_NODE_UPLOAD_MODAL_KEY);
	}
};

// Watchers
watch(isModalOpen, (isOpen) => {
	if (isOpen) {
		resetForm();
	}
});
</script>

<template>
	<n8n-modal
		:name="CUSTOM_NODE_UPLOAD_MODAL_KEY"
		:title="i18n.baseText('settings.customNodes.upload.title')"
		:subtitle="i18n.baseText('settings.customNodes.upload.subtitle')"
		width="600px"
		height="auto"
		:loading="isUploading"
		:can-close="!isUploading"
		@close="closeModal"
	>
		<template #content>
			<div :class="$style.uploadModal">
				<!-- File Upload Area -->
				<div
					:class="[
						$style.uploadArea,
						{
							[$style.dragOver]: isDragOver,
							[$style.hasFile]: selectedFile,
							[$style.error]: uploadError,
						},
					]"
					@dragover="handleDragOver"
					@dragleave="handleDragLeave"
					@drop="handleDrop"
				>
					<div v-if="!selectedFile" :class="$style.uploadPrompt">
						<n8n-icon icon="cloud-upload" size="xlarge" :class="$style.uploadIcon" />
						<h3>{{ i18n.baseText('settings.customNodes.upload.dragDrop') }}</h3>
						<p>{{ i18n.baseText('settings.customNodes.upload.or') }}</p>
						<n8n-button
							type="primary"
							size="large"
							:label="i18n.baseText('settings.customNodes.upload.browseFiles')"
							@click="$refs.fileInput.click()"
						/>
						<p :class="$style.uploadHint">
							{{ i18n.baseText('settings.customNodes.upload.acceptedTypes') }}
						</p>
					</div>

					<div v-else :class="$style.fileInfo">
						<div :class="$style.fileDetails">
							<n8n-icon icon="file-archive" size="large" />
							<div>
								<h4>{{ fileInfo.name }}</h4>
								<p>{{ fileInfo.size }} • {{ fileInfo.type }}</p>
							</div>
						</div>
						<n8n-button type="tertiary" size="small" icon="trash" @click="removeFile" />
					</div>

					<input
						ref="fileInput"
						type="file"
						:class="$style.hiddenInput"
						:accept="acceptedFileTypes"
						@change="handleFileSelect($event.target.files)"
					/>
				</div>

				<!-- Upload Progress -->
				<div v-if="isUploading" :class="$style.uploadProgress">
					<n8n-progress-bar :value="uploadProgress" :max="100" size="medium" />
					<p>
						{{ i18n.baseText('settings.customNodes.upload.uploading') }}
						{{ Math.round(uploadProgress) }}%
					</p>
				</div>

				<!-- Upload Error -->
				<div v-if="uploadError" :class="$style.uploadError">
					<n8n-notice type="error">
						{{ uploadError }}
					</n8n-notice>
				</div>

				<!-- Node Metadata Form -->
				<div v-if="selectedFile" :class="$style.metadataForm">
					<h3>{{ i18n.baseText('settings.customNodes.upload.metadata') }}</h3>

					<div :class="$style.formGrid">
						<div :class="$style.formGroup">
							<label>{{ i18n.baseText('settings.customNodes.upload.name') }} *</label>
							<n8n-input
								v-model="nodeMetadata.name"
								:placeholder="i18n.baseText('settings.customNodes.upload.name.placeholder')"
								required
							/>
						</div>

						<div :class="$style.formGroup">
							<label>{{ i18n.baseText('settings.customNodes.upload.author') }} *</label>
							<n8n-input
								v-model="nodeMetadata.author"
								:placeholder="i18n.baseText('settings.customNodes.upload.author.placeholder')"
								required
							/>
						</div>

						<div :class="$style.formGroup">
							<label>{{ i18n.baseText('settings.customNodes.upload.version') }}</label>
							<n8n-input
								v-model="nodeMetadata.version"
								:placeholder="i18n.baseText('settings.customNodes.upload.version.placeholder')"
							/>
						</div>

						<div :class="$style.formGroup">
							<label>{{ i18n.baseText('settings.customNodes.upload.category') }}</label>
							<n8n-input
								v-model="nodeMetadata.category"
								:placeholder="i18n.baseText('settings.customNodes.upload.category.placeholder')"
							/>
						</div>
					</div>

					<div :class="$style.formGroup">
						<label>{{ i18n.baseText('settings.customNodes.upload.description') }}</label>
						<n8n-input
							v-model="nodeMetadata.description"
							type="textarea"
							:placeholder="i18n.baseText('settings.customNodes.upload.description.placeholder')"
							rows="3"
						/>
					</div>

					<div :class="$style.formGroup">
						<label>{{ i18n.baseText('settings.customNodes.upload.tags') }}</label>
						<n8n-input-tags
							v-model="nodeMetadata.tags"
							:placeholder="i18n.baseText('settings.customNodes.upload.tags.placeholder')"
							@add="addTag"
							@remove="removeTag"
						/>
					</div>

					<!-- Advanced Options -->
					<div :class="$style.advancedSection">
						<n8n-button
							type="tertiary"
							:icon="showAdvancedOptions ? 'chevron-up' : 'chevron-down'"
							:label="i18n.baseText('settings.customNodes.upload.advancedOptions')"
							@click="showAdvancedOptions = !showAdvancedOptions"
						/>

						<div v-if="showAdvancedOptions" :class="$style.advancedOptions">
							<div :class="$style.checkboxGroup">
								<n8n-checkbox
									v-model="uploadOptions.skipValidation"
									:label="i18n.baseText('settings.customNodes.upload.skipValidation')"
								/>
								<n8n-checkbox
									v-model="uploadOptions.autoValidate"
									:label="i18n.baseText('settings.customNodes.upload.autoValidate')"
									:disabled="uploadOptions.skipValidation"
								/>
								<n8n-checkbox
									v-model="uploadOptions.autoDeploy"
									:label="i18n.baseText('settings.customNodes.upload.autoDeploy')"
									:disabled="uploadOptions.skipValidation"
								/>
							</div>

							<div :class="$style.formGroup">
								<label>{{ i18n.baseText('settings.customNodes.upload.environment') }}</label>
								<n8n-select v-model="uploadOptions.environment">
									<n8n-option
										value="development"
										:label="i18n.baseText('settings.customNodes.upload.environment.development')"
									/>
									<n8n-option
										value="production"
										:label="i18n.baseText('settings.customNodes.upload.environment.production')"
									/>
								</n8n-select>
							</div>
						</div>
					</div>
				</div>
			</div>
		</template>

		<template #footer>
			<div :class="$style.modalFooter">
				<n8n-button
					type="secondary"
					:label="i18n.baseText('generic.cancel')"
					:disabled="isUploading"
					@click="closeModal"
				/>
				<n8n-button
					type="primary"
					:label="i18n.baseText('settings.customNodes.upload.upload')"
					:disabled="!canUpload"
					:loading="isUploading"
					@click="uploadCustomNode"
				/>
			</div>
		</template>
	</n8n-modal>
</template>

<style lang="scss" module>
.uploadModal {
	padding: var(--spacing-s);
}

.uploadArea {
	border: 2px dashed var(--color-foreground-light);
	border-radius: var(--border-radius-large);
	padding: var(--spacing-xl);
	text-align: center;
	transition: all 0.2s ease;
	margin-bottom: var(--spacing-m);

	&.dragOver {
		border-color: var(--color-primary);
		background-color: var(--color-primary-tint-3);
	}

	&.hasFile {
		border-style: solid;
		border-color: var(--color-success);
		background-color: var(--color-success-tint-3);
	}

	&.error {
		border-color: var(--color-danger);
		background-color: var(--color-danger-tint-3);
	}
}

.uploadPrompt {
	h3 {
		margin: var(--spacing-s) 0 var(--spacing-xs) 0;
		color: var(--color-text-dark);
	}

	p {
		margin: var(--spacing-xs) 0;
		color: var(--color-text-base);
	}
}

.uploadIcon {
	color: var(--color-text-light);
	margin-bottom: var(--spacing-s);
}

.uploadHint {
	font-size: var(--font-size-xs);
	color: var(--color-text-light);
	margin-top: var(--spacing-m);
}

.fileInfo {
	display: flex;
	justify-content: space-between;
	align-items: center;
	text-align: left;
}

.fileDetails {
	display: flex;
	align-items: center;
	gap: var(--spacing-s);

	h4 {
		margin: 0;
		font-size: var(--font-size-m);
		color: var(--color-text-dark);
	}

	p {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--color-text-light);
	}
}

.hiddenInput {
	display: none;
}

.uploadProgress {
	margin-bottom: var(--spacing-m);

	p {
		text-align: center;
		margin-top: var(--spacing-xs);
		font-size: var(--font-size-s);
		color: var(--color-text-base);
	}
}

.uploadError {
	margin-bottom: var(--spacing-m);
}

.metadataForm {
	h3 {
		margin-bottom: var(--spacing-m);
		color: var(--color-text-dark);
	}
}

.formGrid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: var(--spacing-m);
	margin-bottom: var(--spacing-m);
}

.formGroup {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-2xs);

	label {
		font-size: var(--font-size-s);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-base);
	}

	&:has(textarea) {
		grid-column: 1 / -1;
	}
}

.advancedSection {
	margin-top: var(--spacing-l);
	padding-top: var(--spacing-m);
	border-top: 1px solid var(--color-foreground-light);
}

.advancedOptions {
	margin-top: var(--spacing-m);
	padding: var(--spacing-m);
	background: var(--color-background-light);
	border-radius: var(--border-radius-base);
}

.checkboxGroup {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-s);
	margin-bottom: var(--spacing-m);
}

.modalFooter {
	display: flex;
	justify-content: flex-end;
	gap: var(--spacing-s);
}
</style>
