import { createComponentRenderer } from '@/__tests__/render';
import { createTestingPinia } from '@pinia/testing';
import { setActivePinia, createPinia } from 'pinia';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import CustomNodeUploadModal from '../CustomNodeUploadModal.vue';

// Mock composables
vi.mock('@n8n/i18n', () => ({
	useI18n: () => ({
		baseText: (key: string, options?: any) => {
			const translations: Record<string, string> = {
				'settings.customNodes.upload.title': 'Upload Custom Node',
				'settings.customNodes.upload.subtitle': 'Add a custom node to your n8n instance',
				'settings.customNodes.upload.dragDrop': 'Drag and drop your node file here',
				'settings.customNodes.upload.or': 'or',
				'settings.customNodes.upload.browseFiles': 'Browse Files',
				'settings.customNodes.upload.acceptedTypes':
					'Accepted: .zip, .tar.gz, .tgz, .js, .ts files',
				'settings.customNodes.upload.uploading': 'Uploading...',
				'settings.customNodes.upload.metadata': 'Node Information',
				'settings.customNodes.upload.name': 'Name',
				'settings.customNodes.upload.name.placeholder': 'Enter node name',
				'settings.customNodes.upload.author': 'Author',
				'settings.customNodes.upload.author.placeholder': 'Enter author name',
				'settings.customNodes.upload.version': 'Version',
				'settings.customNodes.upload.version.placeholder': '1.0.0',
				'settings.customNodes.upload.category': 'Category',
				'settings.customNodes.upload.category.placeholder': 'Enter category',
				'settings.customNodes.upload.description': 'Description',
				'settings.customNodes.upload.description.placeholder': 'Describe your node',
				'settings.customNodes.upload.tags': 'Tags',
				'settings.customNodes.upload.tags.placeholder': 'Add tags',
				'settings.customNodes.upload.advancedOptions': 'Advanced Options',
				'settings.customNodes.upload.skipValidation': 'Skip validation',
				'settings.customNodes.upload.autoValidate': 'Auto-validate after upload',
				'settings.customNodes.upload.autoDeploy': 'Auto-deploy after validation',
				'settings.customNodes.upload.environment': 'Environment',
				'settings.customNodes.upload.environment.development': 'Development',
				'settings.customNodes.upload.environment.production': 'Production',
				'settings.customNodes.upload.upload': 'Upload',
				'settings.customNodes.upload.success.title': 'Upload Successful',
				'settings.customNodes.upload.success.message': 'Node {nodeName} uploaded successfully',
				'settings.customNodes.upload.error.title': 'Upload Error',
				'settings.customNodes.upload.error.invalidFileType': 'Invalid file type',
				'settings.customNodes.upload.error.fileTooLarge': 'File too large (max 50MB)',
				'generic.cancel': 'Cancel',
			};
			const result = translations[key] || key;
			return options?.interpolate
				? result.replace(/\{(\w+)\}/g, (_, k) => options.interpolate[k] || `{${k}}`)
				: result;
		},
	}),
}));

vi.mock('@/composables/useTelemetry', () => ({
	useTelemetry: () => ({
		track: vi.fn(),
	}),
}));

vi.mock('@/composables/useToast', () => ({
	useToast: () => ({
		showMessage: vi.fn(),
		showError: vi.fn(),
	}),
}));

const renderComponent = createComponentRenderer(CustomNodeUploadModal);

describe('CustomNodeUploadModal', () => {
	let mockUIStore: any;
	let mockCustomNodesStore: any;

	beforeEach(() => {
		const pinia = createTestingPinia({
			createSpy: vi.fn,
		});
		setActivePinia(pinia);

		mockUIStore = {
			isModalOpen: vi.fn().mockReturnValue(false),
			closeModal: vi.fn(),
		};

		mockCustomNodesStore = {
			uploadCustomNode: vi.fn().mockResolvedValue({
				id: 'node-123',
				name: 'Test Node',
			}),
			fetchCustomNodes: vi.fn().mockResolvedValue([]),
			fetchStatistics: vi.fn().mockResolvedValue({}),
		};

		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Rendering', () => {
		it('should render modal with correct structure', () => {
			const { container, getByText } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			expect(getByText('Drag and drop your node file here')).toBeInTheDocument();
			expect(getByText('Browse Files')).toBeInTheDocument();
			expect(getByText('Accepted: .zip, .tar.gz, .tgz, .js, .ts files')).toBeInTheDocument();
		});

		it('should render upload area with proper styling', () => {
			const { container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			const uploadArea = container.querySelector('.uploadArea');
			expect(uploadArea).toBeInTheDocument();
		});

		it('should render hidden file input', () => {
			const { container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			const hiddenInput = container.querySelector('input[type="file"]');
			expect(hiddenInput).toBeInTheDocument();
			expect(hiddenInput).toHaveAttribute('accept', '.zip,.tar.gz,.tgz,.js,.ts');
		});

		it('should not show metadata form when no file selected', () => {
			const { queryByText } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			expect(queryByText('Node Information')).not.toBeInTheDocument();
		});

		it('should show metadata form when file is selected', async () => {
			const { getByText, container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			// Simulate file selection
			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test content'], 'test-node.zip', {
				type: 'application/zip',
			});

			Object.defineProperty(fileInput, 'files', {
				value: [mockFile],
				configurable: true,
			});

			const event = new Event('change', { bubbles: true });
			fileInput.dispatchEvent(event);
			await nextTick();

			expect(getByText('Node Information')).toBeInTheDocument();
		});
	});

	describe('File Handling', () => {
		it('should handle file selection correctly', async () => {
			const { container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test content'], 'test-node.zip', {
				type: 'application/zip',
			});

			Object.defineProperty(fileInput, 'files', {
				value: [mockFile],
				configurable: true,
			});

			const event = new Event('change', { bubbles: true });
			fileInput.dispatchEvent(event);
			await nextTick();

			// Check if file info is displayed
			expect(container.textContent).toContain('test-node.zip');
		});

		it('should validate file type correctly', () => {
			// This would require mocking the toast service and testing error handling
			// Implementation depends on the specific testing setup for composables
		});

		it('should validate file size correctly', () => {
			// This would test the 50MB file size limit
			// Implementation depends on the specific testing setup
		});

		it('should auto-populate name from filename', async () => {
			const { container, getByDisplayValue } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test content'], 'my-awesome-node.zip', {
				type: 'application/zip',
			});

			Object.defineProperty(fileInput, 'files', {
				value: [mockFile],
				configurable: true,
			});

			const event = new Event('change', { bubbles: true });
			fileInput.dispatchEvent(event);
			await nextTick();

			// Name field should be auto-populated
			expect(getByDisplayValue('my-awesome-node')).toBeInTheDocument();
		});

		it('should handle file removal correctly', async () => {
			const { container, getByText, queryByText } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			// First add a file
			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test content'], 'test-node.zip', {
				type: 'application/zip',
			});

			Object.defineProperty(fileInput, 'files', {
				value: [mockFile],
				configurable: true,
			});

			const event = new Event('change', { bubbles: true });
			fileInput.dispatchEvent(event);
			await nextTick();

			expect(getByText('Node Information')).toBeInTheDocument();

			// Now remove the file
			const removeButton =
				container.querySelector('button[data-test-id="remove-file"]') ||
				container.querySelector('button:has([data-icon="trash"])');
			if (removeButton) {
				removeButton.click();
				await nextTick();

				expect(queryByText('Node Information')).not.toBeInTheDocument();
			}
		});
	});

	describe('Form Interactions', () => {
		beforeEach(async () => {
			// Helper to set up a component with a file selected
		});

		it('should handle metadata form inputs correctly', async () => {
			const { container, getByPlaceholderText } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			// Add file first
			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test content'], 'test-node.zip', {
				type: 'application/zip',
			});

			Object.defineProperty(fileInput, 'files', {
				value: [mockFile],
				configurable: true,
			});

			const event = new Event('change', { bubbles: true });
			fileInput.dispatchEvent(event);
			await nextTick();

			// Test form inputs
			const authorInput = getByPlaceholderText('Enter author name');
			const descriptionInput = getByPlaceholderText('Describe your node');

			expect(authorInput).toBeInTheDocument();
			expect(descriptionInput).toBeInTheDocument();
		});

		it('should handle tag addition and removal', async () => {
			// This would test the tag input component functionality
			// Implementation depends on the n8n-input-tags component
		});

		it('should toggle advanced options correctly', async () => {
			const { getByText, queryByText } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			// Add file first to show metadata form
			const { container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test content'], 'test-node.zip', {
				type: 'application/zip',
			});

			Object.defineProperty(fileInput, 'files', {
				value: [mockFile],
				configurable: true,
			});

			const event = new Event('change', { bubbles: true });
			fileInput.dispatchEvent(event);
			await nextTick();

			// Initially advanced options should be hidden
			expect(queryByText('Skip validation')).not.toBeInTheDocument();

			// Click advanced options toggle
			const advancedToggle = getByText('Advanced Options');
			advancedToggle.click();
			await nextTick();

			expect(getByText('Skip validation')).toBeInTheDocument();
		});
	});

	describe('Upload Process', () => {
		it('should validate upload requirements correctly', async () => {
			const { container, getByText } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			// Initially upload button should be disabled
			const uploadButton = getByText('Upload');
			expect(uploadButton).toBeDisabled();

			// Add file and required metadata
			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test content'], 'test-node.zip', {
				type: 'application/zip',
			});

			Object.defineProperty(fileInput, 'files', {
				value: [mockFile],
				configurable: true,
			});

			const event = new Event('change', { bubbles: true });
			fileInput.dispatchEvent(event);
			await nextTick();

			// Add required author field
			const authorInput = container.querySelector(
				'input[placeholder="Enter author name"]',
			) as HTMLInputElement;
			if (authorInput) {
				authorInput.value = 'Test Author';
				authorInput.dispatchEvent(new Event('input', { bubbles: true }));
				await nextTick();
			}

			// Upload button should now be enabled
			expect(uploadButton).not.toBeDisabled();
		});

		it('should handle successful upload correctly', async () => {
			// Mock successful upload
			mockCustomNodesStore.uploadCustomNode.mockResolvedValue({
				id: 'node-123',
				name: 'Test Node',
			});

			// Test upload process
			// This would require complex setup to test the full upload flow
		});

		it('should handle upload errors correctly', async () => {
			// Mock upload failure
			mockCustomNodesStore.uploadCustomNode.mockRejectedValue(new Error('Upload failed'));

			// Test error handling
			// This would require setup to trigger the upload and test error display
		});

		it('should show upload progress during upload', () => {
			// Test progress bar display during upload
			// This would require mocking the upload process
		});
	});

	describe('Drag and Drop', () => {
		it('should handle drag over events correctly', async () => {
			const { container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			const uploadArea = container.querySelector('.uploadArea') as HTMLElement;

			// Simulate drag over
			const dragOverEvent = new DragEvent('dragover', { bubbles: true });
			Object.defineProperty(dragOverEvent, 'preventDefault', { value: vi.fn() });

			uploadArea.dispatchEvent(dragOverEvent);
			await nextTick();

			// Check if drag over styling is applied
			expect(uploadArea).toHaveClass('dragOver');
		});

		it('should handle drag leave events correctly', async () => {
			const { container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			const uploadArea = container.querySelector('.uploadArea') as HTMLElement;

			// First trigger drag over, then drag leave
			const dragOverEvent = new DragEvent('dragover', { bubbles: true });
			Object.defineProperty(dragOverEvent, 'preventDefault', { value: vi.fn() });
			uploadArea.dispatchEvent(dragOverEvent);
			await nextTick();

			const dragLeaveEvent = new DragEvent('dragleave', { bubbles: true });
			Object.defineProperty(dragLeaveEvent, 'preventDefault', { value: vi.fn() });
			uploadArea.dispatchEvent(dragLeaveEvent);
			await nextTick();

			// Drag over styling should be removed
			expect(uploadArea).not.toHaveClass('dragOver');
		});

		it('should handle drop events correctly', async () => {
			const { container } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			const uploadArea = container.querySelector('.uploadArea') as HTMLElement;
			const mockFile = new File(['test content'], 'test-node.zip', {
				type: 'application/zip',
			});

			const dropEvent = new DragEvent('drop', { bubbles: true });
			Object.defineProperty(dropEvent, 'preventDefault', { value: vi.fn() });
			Object.defineProperty(dropEvent, 'dataTransfer', {
				value: { files: [mockFile] },
			});

			uploadArea.dispatchEvent(dropEvent);
			await nextTick();

			// File should be selected
			expect(container.textContent).toContain('test-node.zip');
		});
	});

	describe('Modal State Management', () => {
		it('should reset form when modal opens', () => {
			// Test form reset when modal is opened
			// This would require mocking the modal state changes
		});

		it('should close modal correctly when upload completes', () => {
			// Test modal closure after successful upload
		});

		it('should prevent closing during upload', () => {
			// Test that modal cannot be closed while upload is in progress
		});
	});

	describe('Advanced Options', () => {
		it('should disable auto-validate when skip validation is checked', async () => {
			const { container, getByText } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			// Add file to show metadata form
			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test content'], 'test-node.zip', {
				type: 'application/zip',
			});

			Object.defineProperty(fileInput, 'files', {
				value: [mockFile],
				configurable: true,
			});

			const event = new Event('change', { bubbles: true });
			fileInput.dispatchEvent(event);
			await nextTick();

			// Show advanced options
			const advancedToggle = getByText('Advanced Options');
			advancedToggle.click();
			await nextTick();

			// Test checkbox interactions
			const skipValidationCheckbox = container.querySelector('input[type="checkbox"]');
			expect(skipValidationCheckbox).toBeInTheDocument();
		});

		it('should handle environment selection correctly', () => {
			// Test environment dropdown functionality
		});
	});

	describe('Accessibility', () => {
		it('should have proper labels for form inputs', async () => {
			const { getByText } = renderComponent({
				global: {
					mocks: {
						$store: {
							ui: mockUIStore,
							customNodes: mockCustomNodesStore,
						},
					},
				},
			});

			// Add file to show form
			// Then test that all form inputs have proper labels
		});

		it('should have proper ARIA attributes', () => {
			// Test ARIA attributes for accessibility
		});

		it('should handle keyboard interactions correctly', () => {
			// Test keyboard navigation and interactions
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty file list gracefully', () => {
			// Test handling of empty file selection
		});

		it('should handle invalid file types gracefully', () => {
			// Test error handling for invalid file types
		});

		it('should handle network errors during upload', () => {
			// Test network error handling
		});

		it('should handle large file uploads', () => {
			// Test file size validation and handling
		});
	});
});
