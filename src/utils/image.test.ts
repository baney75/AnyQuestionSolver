import { test, describe, mock, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resizeImage } from './image.ts';

describe('resizeImage', () => {
  const originalImage = global.Image;
  const originalDocument = global.document;
  const originalURL = global.URL;

  beforeEach(() => {
    global.URL = {
      createObjectURL: mock.fn(() => 'blob:http://localhost/mock-blob'),
      revokeObjectURL: mock.fn(),
    } as any;
  });

  afterEach(() => {
    global.Image = originalImage;
    global.document = originalDocument;
    global.URL = originalURL;
    mock.restoreAll();
  });

  function setupMocks({
    imgWidth,
    imgHeight,
    succeed = true,
    hasContext = true,
  }: {
    imgWidth: number;
    imgHeight: number;
    succeed?: boolean;
    hasContext?: boolean;
  }) {
    const drawImageMock = mock.fn();
    const toDataURLMock = mock.fn(() => 'data:image/jpeg;base64,mockBase64DataUrl');

    const canvasMock = {
      width: 0,
      height: 0,
      getContext: mock.fn((type: string) => {
        if (type === '2d' && hasContext) {
          return {
            drawImage: drawImageMock,
          };
        }
        return null;
      }),
      toDataURL: toDataURLMock,
    };

    global.document = {
      createElement: mock.fn((tag: string) => {
        if (tag === 'canvas') return canvasMock;
        return {};
      }),
    } as any;

    global.Image = class {
      width = imgWidth;
      height = imgHeight;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      #src = '';

      set src(val: string) {
        this.#src = val;
        setTimeout(() => {
          if (succeed) {
            this.onload && this.onload();
          } else {
            this.onerror && this.onerror();
          }
        }, 0);
      }

      get src() {
        return this.#src;
      }
    } as any;

    return { canvasMock, drawImageMock, toDataURLMock };
  }

  test('should resize image when width exceeds max dimension (1920)', async () => {
    const { canvasMock, drawImageMock } = setupMocks({ imgWidth: 3840, imgHeight: 2160 });
    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });

    const result = await resizeImage(file);

    assert.strictEqual(result, 'mockBase64DataUrl');
    assert.strictEqual(canvasMock.width, 1920);
    // height = 2160 * (1920 / 3840) = 1080
    assert.strictEqual(canvasMock.height, 1080);

    // Check if drawImage was called with correct arguments
    const callArgs = drawImageMock.mock.calls[0].arguments;
    // drawImage(img, 0, 0, width, height)
    assert.strictEqual(callArgs[1], 0);
    assert.strictEqual(callArgs[2], 0);
    assert.strictEqual(callArgs[3], 1920);
    assert.strictEqual(callArgs[4], 1080);
  });

  test('should resize image when height exceeds max dimension (1920)', async () => {
    const { canvasMock, drawImageMock } = setupMocks({ imgWidth: 1080, imgHeight: 3840 });
    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });

    const result = await resizeImage(file);

    assert.strictEqual(result, 'mockBase64DataUrl');
    // width = 1080 * (1920 / 3840) = 540
    assert.strictEqual(canvasMock.width, 540);
    assert.strictEqual(canvasMock.height, 1920);

    const callArgs = drawImageMock.mock.calls[0].arguments;
    assert.strictEqual(callArgs[3], 540);
    assert.strictEqual(callArgs[4], 1920);
  });

  test('should not resize image if dimensions are below max dimension', async () => {
    const { canvasMock, drawImageMock } = setupMocks({ imgWidth: 800, imgHeight: 600 });
    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });

    const result = await resizeImage(file);

    assert.strictEqual(result, 'mockBase64DataUrl');
    assert.strictEqual(canvasMock.width, 800);
    assert.strictEqual(canvasMock.height, 600);

    const callArgs = drawImageMock.mock.calls[0].arguments;
    assert.strictEqual(callArgs[3], 800);
    assert.strictEqual(callArgs[4], 600);
  });

  test('should reject if canvas context is unavailable', async () => {
    setupMocks({ imgWidth: 800, imgHeight: 600, hasContext: false });
    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });

    await assert.rejects(
      async () => await resizeImage(file),
      /Failed to get canvas context/
    );
  });

  test('should reject if image fails to load', async () => {
    setupMocks({ imgWidth: 800, imgHeight: 600, succeed: false });
    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });

    await assert.rejects(
      async () => await resizeImage(file),
      /Failed to load image/
    );
  });
});
