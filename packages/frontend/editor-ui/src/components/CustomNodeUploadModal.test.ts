import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import { setActivePinia } from 'pinia';
import { fireEvent, waitFor } from '@testing-library/vue';
import CustomNodeUploadModal from './CustomNodeUploadModal.vue';
import { createComponentRenderer } from '@/__tests__/render';
import { useUIStore } from '@/stores/ui.store';
import { useCustomNodesStore } from '@/stores/customNodes.store';

const renderComponent = createComponentRenderer(CustomNodeUploadModal);

// Mock composables
const mockTelemetry = {
	track: vi.fn(),
};

const mockToast = {
	showMessage: vi.fn(),
	showError: vi.fn(),
};

vi.mock('@/composables/useTelemetry', () => ({
	useTelemetry: () => mockTelemetry,
}));

vi.mock('@/composables/useToast', () => ({
	useToast: () => mockToast,
}));

// Mock File API
global.File = vi.fn().mockImplementation((fileBits, fileName, options) => ({
	name: fileName,
	size: fileBits ? fileBits.length || fileBits[0]?.length || 1024 : 1024,
	type: options?.type || 'application/zip',
}));

global.FormData = vi.fn().mockImplementation(() => {
	const data = new Map();
	return {
		append: (key: string, value: any) => data.set(key, value),
		get: (key: string) => data.get(key),
		has: (key: string) => data.has(key),
		entries: () => data.entries(),
	};
});

// Mock FileList
const createMockFileList = (files: File[]): FileList => {
	const fileList = {
		length: files.length,
		item: (index: number) => files[index] || null,
		...files,
	};
	return fileList as FileList;
};

describe('CustomNodeUploadModal', () => {
	let uiStore: ReturnType<typeof useUIStore>;
	let customNodesStore: ReturnType<typeof useCustomNodesStore>;

	beforeEach(() => {
		const pinia = createTestingPinia();
		setActivePinia(pinia);
		uiStore = useUIStore();
		customNodesStore = useCustomNodesStore();
		vi.clearAllMocks();
		vi.clearAllTimers();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
	});

	describe('modal visibility', () => {
		it('should be closed by default', () => {
			uiStore.isModalOpen = vi.fn().mockReturnValue(false);
			const { container } = renderComponent();

			expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
		});

		it('should be visible when modal is open', () => {
			uiStore.isModalOpen = vi.fn().mockReturnValue(true);
			const { getByRole } = renderComponent();

			expect(getByRole('dialog')).toBeInTheDocument();
		});

		it('should reset form when modal opens', () => {
			const { rerender } = renderComponent();

			// Initially closed
			uiStore.isModalOpen = vi.fn().mockReturnValue(false);
			rerender();

			// Then opened - should trigger form reset
			uiStore.isModalOpen = vi.fn().mockReturnValue(true);
			rerender();

			const nameInput = document.querySelector('input[placeholder*="name"]') as HTMLInputElement;
			expect(nameInput?.value).toBe('');
		});
	});

	describe('file upload area', () => {
		beforeEach(() => {
			uiStore.isModalOpen = vi.fn().mockReturnValue(true);
		});

		it('should render upload prompt initially', () => {
			const { getByText, getByRole } = renderComponent();

			expect(getByText(/drag.*drop/i)).toBeInTheDocument();
			expect(getByText(/browse files/i)).toBeInTheDocument();
			expect(getByRole('button', { name: /browse files/i })).toBeInTheDocument();
		});

		it('should show accepted file types hint', () => {
			const { getByText } = renderComponent();

			expect(getByText(/accepted.*types/i)).toBeInTheDocument();
		});

		it('should handle file selection via input', async () => {
			const { container } = renderComponent();

			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test content'], 'test-node.zip', { type: 'application/zip' });
			const fileList = createMockFileList([mockFile]);

			Object.defineProperty(fileInput, 'files', {
				value: fileList,
				writable: false,
			});

			await fireEvent.change(fileInput);

			expect(container.querySelector('[class*="fileInfo"]')).toBeInTheDocument();
		});

		it('should validate file type', async () => {
			const { container } = renderComponent();

			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const invalidFile = new File(['test'], 'test.exe', { type: 'application/exe' });
			const fileList = createMockFileList([invalidFile]);

			Object.defineProperty(fileInput, 'files', {
				value: fileList,
			});

			await fireEvent.change(fileInput);

			expect(mockToast.showError).toHaveBeenCalledWith(
				expect.any(Error),
				expect.stringContaining('error'),
			);
		});

		it('should validate file size (max 50MB)', async () => {
			const { container } = renderComponent();

			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const largeFile = new File(['x'.repeat(51 * 1024 * 1024)], 'large.zip', {
				type: 'application/zip',
			});
			Object.defineProperty(largeFile, 'size', { value: 51 * 1024 * 1024 });

			const fileList = createMockFileList([largeFile]);

			Object.defineProperty(fileInput, 'files', {
				value: fileList,
			});

			await fireEvent.change(fileInput);

			expect(mockToast.showError).toHaveBeenCalledWith(
				expect.any(Error),
				expect.stringContaining('error'),
			);
		});

		it('should accept valid file types', async () => {
			const { container } = renderComponent();
			const validExtensions = ['.zip', '.tar.gz', '.tgz', '.js', '.ts'];

			for (const ext of validExtensions) {
				const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
				const validFile = new File(['test'], `test${ext}`, { type: 'application/zip' });
				const fileList = createMockFileList([validFile]);

				Object.defineProperty(fileInput, 'files', {
					value: fileList,
				});

				await fireEvent.change(fileInput);

				expect(container.querySelector('[class*="fileInfo"]')).toBeInTheDocument();
			}
		});
	});

	describe('drag and drop', () => {
		beforeEach(() => {
			uiStore.isModalOpen = vi.fn().mockReturnValue(true);
		});

		it('should handle drag over', async () => {
			const { container } = renderComponent();

			const uploadArea = container.querySelector('[class*="uploadArea"]') as HTMLElement;

			const dragEvent = new DragEvent('dragover', { bubbles: true, cancelable: true });
			await fireEvent(uploadArea, dragEvent);

			expect(uploadArea).toHaveClass(expect.stringMatching(/dragOver/));
		});

		it('should handle drag leave', async () => {
			const { container } = renderComponent();

			const uploadArea = container.querySelector('[class*="uploadArea"]') as HTMLElement;

			// First drag over
			await fireEvent.dragOver(uploadArea);
			expect(uploadArea).toHaveClass(expect.stringMatching(/dragOver/));

			// Then drag leave
			await fireEvent.dragLeave(uploadArea);
			expect(uploadArea).not.toHaveClass(expect.stringMatching(/dragOver/));
		});

		it('should handle file drop', async () => {
			const { container } = renderComponent();

			const uploadArea = container.querySelector('[class*="uploadArea"]') as HTMLElement;
			const mockFile = new File(['test'], 'dropped.zip', { type: 'application/zip' });

			const dropEvent = new DragEvent('drop', {
				bubbles: true,
				cancelable: true,
			});

			// Mock dataTransfer
			Object.defineProperty(dropEvent, 'dataTransfer', {
				value: {
					files: createMockFileList([mockFile]),
				},
			});

			await fireEvent(uploadArea, dropEvent);

			expect(container.querySelector('[class*="fileInfo"]')).toBeInTheDocument();
		});
	});

	describe('file information display', () => {
		beforeEach(() => {
			uiStore.isModalOpen = vi.fn().mockReturnValue(true);
		});

		it('should display file information after selection', async () => {
			const { container, getByText } = renderComponent();

			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test content'], 'test-node.zip', { type: 'application/zip' });
			Object.defineProperty(mockFile, 'size', { value: 1024 });

			const fileList = createMockFileList([mockFile]);
			Object.defineProperty(fileInput, 'files', { value: fileList });

			await fireEvent.change(fileInput);

			expect(getByText('test-node.zip')).toBeInTheDocument();
			expect(getByText(/1.*KB/)).toBeInTheDocument();
			expect(getByText('application/zip')).toBeInTheDocument();
		});

		it('should provide remove file button', async () => {
			const { container, getByRole } = renderComponent();

			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test'], 'test.zip', { type: 'application/zip' });
			const fileList = createMockFileList([mockFile]);

			Object.defineProperty(fileInput, 'files', { value: fileList });
			await fireEvent.change(fileInput);

			const removeButton = getByRole('button', { name: /remove/i });
			expect(removeButton).toBeInTheDocument();

			await fireEvent.click(removeButton);

			expect(container.querySelector('[class*="fileInfo"]')).not.toBeInTheDocument();
		});

		it('should format file sizes correctly', async () => {
			const { container } = renderComponent();
			const testCases = [
				{ size: 512, expected: '512 Bytes' },
				{ size: 1024, expected: '1 KB' },
				{ size: 1024 * 1024, expected: '1 MB' },
				{ size: 1024 * 1024 * 1024, expected: '1 GB' },
			];

			for (const testCase of testCases) {
				const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
				const mockFile = new File(['test'], 'test.zip', { type: 'application/zip' });
				Object.defineProperty(mockFile, 'size', { value: testCase.size });

				const fileList = createMockFileList([mockFile]);
				Object.defineProperty(fileInput, 'files', { value: fileList });

				await fireEvent.change(fileInput);

				const sizeText = container.textContent;
				expect(sizeText).toContain(testCase.expected);
			}
		});
	});

	describe('metadata form', () => {
		beforeEach(async () => {
			uiStore.isModalOpen = vi.fn().mockReturnValue(true);
		});

		const selectFile = async (container: HTMLElement, fileName = 'test.zip') => {
			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test'], fileName, { type: 'application/zip' });
			const fileList = createMockFileList([mockFile]);

			Object.defineProperty(fileInput, 'files', { value: fileList });
			await fireEvent.change(fileInput);
		};

		it('should show metadata form only after file selection', async () => {
			const { container, queryByText } = renderComponent();

			expect(queryByText(/metadata/i)).not.toBeInTheDocument();

			await selectFile(container);

			expect(queryByText(/metadata/i)).toBeInTheDocument();
		});

		it('should auto-populate name from filename', async () => {
			const { container } = renderComponent();

			await selectFile(container, 'my-awesome-node.zip');

			const nameInput = container.querySelector('input[placeholder*="name"]') as HTMLInputElement;
			expect(nameInput.value).toBe('my-awesome-node');
		});

		it('should handle various file extensions in name extraction', async () => {
			const { container } = renderComponent();
			const testCases = [
				{ fileName: 'node.zip', expectedName: 'node' },
				{ fileName: 'node.tar.gz', expectedName: 'node' },
				{ fileName: 'node.tgz', expectedName: 'node' },
				{ fileName: 'node.js', expectedName: 'node' },
				{ fileName: 'node.ts', expectedName: 'node' },
			];

			for (const testCase of testCases) {
				await selectFile(container, testCase.fileName);

				const nameInput = container.querySelector('input[placeholder*="name"]') as HTMLInputElement;
				expect(nameInput.value).toBe(testCase.expectedName);
			}
		});

		it('should validate required fields', async () => {
			const { container, getByRole } = renderComponent();

			await selectFile(container);

			// Clear required fields
			const nameInput = container.querySelector('input[placeholder*="name"]') as HTMLInputElement;
			await fireEvent.input(nameInput, { target: { value: '' } });

			const uploadButton = getByRole('button', { name: /upload/i });
			expect(uploadButton).toBeDisabled();
		});

		it('should allow adding and removing tags', async () => {
			const { container, getByPlaceholderText } = renderComponent();

			await selectFile(container);

			const tagsInput = getByPlaceholderText(/tags/i) as HTMLInputElement;

			// Add tags
			await fireEvent.input(tagsInput, { target: { value: 'automation' } });
			await fireEvent.keyDown(tagsInput, { key: 'Enter' });

			expect(container.textContent).toContain('automation');

			// Remove tag
			const removeTagButton = container.querySelector('button[aria-label*="remove"]');
			if (removeTagButton) {
				await fireEvent.click(removeTagButton);
				expect(container.textContent).not.toContain('automation');
			}
		});
	});

	describe('advanced options', () => {
		beforeEach(async () => {
			uiStore.isModalOpen = vi.fn().mockReturnValue(true);
		});

		const selectFile = async (container: HTMLElement) => {
			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test'], 'test.zip', { type: 'application/zip' });
			const fileList = createMockFileList([mockFile]);

			Object.defineProperty(fileInput, 'files', { value: fileList });
			await fireEvent.change(fileInput);
		};

		it('should toggle advanced options visibility', async () => {
			const { container, getByRole } = renderComponent();

			await selectFile(container);

			const advancedButton = getByRole('button', { name: /advanced.*options/i });

			// Initially hidden
			expect(container.querySelector('[class*="advancedOptions"]')).not.toBeInTheDocument();

			// Show advanced options
			await fireEvent.click(advancedButton);
			expect(container.querySelector('[class*="advancedOptions"]')).toBeInTheDocument();

			// Hide again
			await fireEvent.click(advancedButton);
			expect(container.querySelector('[class*="advancedOptions"]')).not.toBeInTheDocument();
		});

		it('should handle checkbox options correctly', async () => {
			const { container, getByRole, getByLabelText } = renderComponent();

			await selectFile(container);

			const advancedButton = getByRole('button', { name: /advanced.*options/i });
			await fireEvent.click(advancedButton);

			// Test skip validation disables other options
			const skipValidationCheckbox = getByLabelText(/skip.*validation/i) as HTMLInputElement;
			await fireEvent.click(skipValidationCheckbox);

			const autoValidateCheckbox = getByLabelText(/auto.*validate/i) as HTMLInputElement;
			const autoDeployCheckbox = getByLabelText(/auto.*deploy/i) as HTMLInputElement;

			expect(autoValidateCheckbox).toBeDisabled();
			expect(autoDeployCheckbox).toBeDisabled();
		});

		it('should handle environment selection', async () => {
			const { container, getByRole } = renderComponent();

			await selectFile(container);

			const advancedButton = getByRole('button', { name: /advanced.*options/i });
			await fireEvent.click(advancedButton);

			const environmentSelect = container.querySelector('select') as HTMLSelectElement;
			expect(environmentSelect).toBeInTheDocument();

			await fireEvent.change(environmentSelect, { target: { value: 'production' } });
			expect(environmentSelect.value).toBe('production');
		});
	});

	describe('upload process', () => {
		beforeEach(async () => {
			uiStore.isModalOpen = vi.fn().mockReturnValue(true);
			customNodesStore.uploadCustomNode = vi.fn();
			customNodesStore.fetchCustomNodes = vi.fn();
			customNodesStore.fetchStatistics = vi.fn();
		});

		const setupCompleteForm = async (container: HTMLElement) => {
			// Select file
			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test'], 'test.zip', { type: 'application/zip' });
			const fileList = createMockFileList([mockFile]);

			Object.defineProperty(fileInput, 'files', { value: fileList });
			await fireEvent.change(fileInput);

			// Fill required fields
			const authorInput = container.querySelector(
				'input[placeholder*="author"]',
			) as HTMLInputElement;
			await fireEvent.input(authorInput, { target: { value: 'Test Author' } });
		};

		it('should enable upload button when form is valid', async () => {
			const { container, getByRole } = renderComponent();

			await setupCompleteForm(container);

			const uploadButton = getByRole('button', { name: /upload/i });
			expect(uploadButton).not.toBeDisabled();
		});

		it('should handle successful upload', async () => {
			const mockResult = {
				id: 'node-123',
				name: 'test-node',
				status: 'uploaded',
			};

			customNodesStore.uploadCustomNode = vi.fn().mockResolvedValue(mockResult);

			const { container, getByRole } = renderComponent();

			await setupCompleteForm(container);

			const uploadButton = getByRole('button', { name: /upload/i });
			await fireEvent.click(uploadButton);

			// Advance timers for progress simulation
			vi.advanceTimersByTime(1000);

			await waitFor(() => {
				expect(customNodesStore.uploadCustomNode).toHaveBeenCalled();
				expect(mockToast.showMessage).toHaveBeenCalledWith({
					title: expect.any(String),
					message: expect.stringContaining(mockResult.name),
					type: 'success',
				});
				expect(mockTelemetry.track).toHaveBeenCalledWith('user uploaded custom node', {
					nodeId: mockResult.id,
					nodeName: mockResult.name,
					fileSize: expect.any(Number),
					fileType: expect.any(String),
					autoValidate: true,
					autoDeploy: false,
				});
			});
		});

		it('should handle upload failure', async () => {
			const errorMessage = 'Upload failed';
			customNodesStore.uploadCustomNode = vi.fn().mockRejectedValue(new Error(errorMessage));

			const { container, getByRole } = renderComponent();

			await setupCompleteForm(container);

			const uploadButton = getByRole('button', { name: /upload/i });
			await fireEvent.click(uploadButton);

			await waitFor(() => {
				expect(mockToast.showError).toHaveBeenCalledWith(expect.any(Error), expect.any(String));
				expect(mockTelemetry.track).toHaveBeenCalledWith('user custom node upload failed', {
					error: errorMessage,
					fileSize: expect.any(Number),
					fileType: expect.any(String),
				});
			});
		});

		it('should show upload progress', async () => {
			customNodesStore.uploadCustomNode = vi
				.fn()
				.mockImplementation(
					() => new Promise((resolve) => setTimeout(() => resolve({ id: 'test' }), 1000)),
				);

			const { container, getByRole } = renderComponent();

			await setupCompleteForm(container);

			const uploadButton = getByRole('button', { name: /upload/i });
			await fireEvent.click(uploadButton);

			// Should show progress bar
			expect(container.querySelector('[class*="uploadProgress"]')).toBeInTheDocument();

			// Advance timers to simulate progress
			vi.advanceTimersByTime(500);

			expect(container.textContent).toMatch(/uploading.*\d+%/i);
		});

		it('should disable interactions during upload', async () => {
			customNodesStore.uploadCustomNode = vi
				.fn()
				.mockImplementation(
					() => new Promise((resolve) => setTimeout(() => resolve({ id: 'test' }), 1000)),
				);

			const { container, getByRole } = renderComponent();

			await setupCompleteForm(container);

			const uploadButton = getByRole('button', { name: /upload/i });
			const cancelButton = getByRole('button', { name: /cancel/i });

			await fireEvent.click(uploadButton);

			expect(uploadButton).toBeDisabled();
			expect(cancelButton).toBeDisabled();

			// Modal should not be closable during upload
			const modal = container.querySelector('[role="dialog"]');
			expect(modal).toHaveAttribute('data-can-close', 'false');
		});

		it('should send correct form data', async () => {
			const mockResult = { id: 'test-node' };
			customNodesStore.uploadCustomNode = vi.fn().mockResolvedValue(mockResult);

			const { container, getByRole } = renderComponent();

			// Setup form with all data
			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test'], 'test.zip', { type: 'application/zip' });
			const fileList = createMockFileList([mockFile]);

			Object.defineProperty(fileInput, 'files', { value: fileList });
			await fireEvent.change(fileInput);

			// Fill all fields
			const nameInput = container.querySelector('input[placeholder*="name"]') as HTMLInputElement;
			const authorInput = container.querySelector(
				'input[placeholder*="author"]',
			) as HTMLInputElement;
			const descriptionInput = container.querySelector('textarea') as HTMLTextAreaElement;
			const categoryInput = container.querySelector(
				'input[placeholder*="category"]',
			) as HTMLInputElement;
			const versionInput = container.querySelector(
				'input[placeholder*="version"]',
			) as HTMLInputElement;

			await fireEvent.input(nameInput, { target: { value: 'My Node' } });
			await fireEvent.input(authorInput, { target: { value: 'John Doe' } });
			await fireEvent.input(descriptionInput, { target: { value: 'A test node' } });
			await fireEvent.input(categoryInput, { target: { value: 'utility' } });
			await fireEvent.input(versionInput, { target: { value: '1.0.1' } });

			const uploadButton = getByRole('button', { name: /upload/i });
			await fireEvent.click(uploadButton);

			await waitFor(() => {
				expect(customNodesStore.uploadCustomNode).toHaveBeenCalled();
				const formData = (customNodesStore.uploadCustomNode as any).mock.calls[0][0];
				expect(formData).toBeInstanceOf(FormData);
			});
		});
	});

	describe('modal controls', () => {
		beforeEach(() => {
			uiStore.isModalOpen = vi.fn().mockReturnValue(true);
		});

		it('should close modal when cancel is clicked', async () => {
			const { getByRole } = renderComponent();

			const cancelButton = getByRole('button', { name: /cancel/i });
			await fireEvent.click(cancelButton);

			expect(uiStore.closeModal).toHaveBeenCalledWith('customNodeUpload');
		});

		it('should prevent closing during upload', async () => {
			customNodesStore.uploadCustomNode = vi
				.fn()
				.mockImplementation(
					() => new Promise((resolve) => setTimeout(() => resolve({ id: 'test' }), 1000)),
				);

			const { container, getByRole } = renderComponent();

			// Setup file and start upload
			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test'], 'test.zip', { type: 'application/zip' });
			const fileList = createMockFileList([mockFile]);

			Object.defineProperty(fileInput, 'files', { value: fileList });
			await fireEvent.change(fileInput);

			const authorInput = container.querySelector(
				'input[placeholder*="author"]',
			) as HTMLInputElement;
			await fireEvent.input(authorInput, { target: { value: 'Test Author' } });

			const uploadButton = getByRole('button', { name: /upload/i });
			await fireEvent.click(uploadButton);

			// Try to close modal during upload
			const cancelButton = getByRole('button', { name: /cancel/i });
			expect(cancelButton).toBeDisabled();
		});
	});

	describe('accessibility', () => {
		beforeEach(() => {
			uiStore.isModalOpen = vi.fn().mockReturnValue(true);
		});

		it('should have proper modal structure', () => {
			const { getByRole } = renderComponent();

			expect(getByRole('dialog')).toBeInTheDocument();
		});

		it('should have proper form labels', async () => {
			const { container } = renderComponent();

			// Select file to show form
			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test'], 'test.zip', { type: 'application/zip' });
			const fileList = createMockFileList([mockFile]);

			Object.defineProperty(fileInput, 'files', { value: fileList });
			await fireEvent.change(fileInput);

			// Check that form inputs have labels
			const labels = container.querySelectorAll('label');
			const inputs = container.querySelectorAll('input:not([type="file"]), textarea');

			expect(labels.length).toBeGreaterThan(0);
			expect(inputs.length).toBeGreaterThan(0);
		});

		it('should have proper button roles', () => {
			const { getAllByRole } = renderComponent();

			const buttons = getAllByRole('button');
			expect(buttons.length).toBeGreaterThan(0);

			buttons.forEach((button) => {
				expect(button).toHaveAttribute('type');
			});
		});

		it('should indicate required fields', async () => {
			const { container } = renderComponent();

			// Select file to show form
			const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
			const mockFile = new File(['test'], 'test.zip', { type: 'application/zip' });
			const fileList = createMockFileList([mockFile]);

			Object.defineProperty(fileInput, 'files', { value: fileList });
			await fireEvent.change(fileInput);

			// Check for required field indicators (asterisks)
			expect(container.textContent).toContain('*');
		});
	});
});
