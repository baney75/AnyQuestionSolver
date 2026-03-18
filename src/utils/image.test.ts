import { test, describe, expect, beforeEach, afterEach, mock } from 'bun:test';
import { resizeImage } from './image.ts';

describe('resizeImage', () => {
  const originalImage = global.Image;
  const originalDocument = global.document;
  const originalURL = global.URL;

  beforeEach(() => {
    global.URL = {
      createObjectURL: mock(() => 'blob:http://localhost/mock-blob'),
      revokeObjectURL: mock(() => {}),
    } as any;
  });

  afterEach(() => {
    global.Image = originalImage;
    global.document = originalDocument;
    global.URL = originalURL;
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
    const drawImageMock = mock(() => {});
    const toDataURLMock = mock(() => 'data:image/jpeg;base64,mockBase64DataUrl');

    const canvasMock = {
      width: 0,
      height: 0,
      getContext: (type: string) => {
        if (type === '2d' && hasContext) {
          return {
            drawImage: drawImageMock,
          };
        }
        return null;
      },
      toDataURL: toDataURLMock,
    };

    global.document = {
      createElement: (tag: string) => {
        if (tag === 'canvas') return canvasMock;
        return {};
      },
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

    expect(result).toBe('mockBase64DataUrl');
    expect(canvasMock.width).toBe(1920);
    expect(canvasMock.height).toBe(1080);
    expect(drawImageMock).toHaveBeenCalled();
  });

  test('should resize image when height exceeds max dimension (1920)', async () => {
    const { canvasMock, drawImageMock } = setupMocks({ imgWidth: 1080, imgHeight: 3840 });
    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });

    const result = await resizeImage(file);

    expect(result).toBe('mockBase64DataUrl');
    expect(canvasMock.width).toBe(540);
    expect(canvasMock.height).toBe(1920);
    expect(drawImageMock).toHaveBeenCalled();
  });

  test('should not resize image if dimensions are below max dimension', async () => {
    const { canvasMock, drawImageMock } = setupMocks({ imgWidth: 800, imgHeight: 600 });
    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });

    const result = await resizeImage(file);

    expect(result).toBe('mockBase64DataUrl');
    expect(canvasMock.width).toBe(800);
    expect(canvasMock.height).toBe(600);
    expect(drawImageMock).toHaveBeenCalled();
  });

  test('should reject if canvas context is unavailable', async () => {
    setupMocks({ imgWidth: 800, imgHeight: 600, hasContext: false });
    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });

    expect(resizeImage(file)).rejects.toThrow('Failed to get canvas context');
  });

  test('should reject if image fails to load', async () => {
    setupMocks({ imgWidth: 800, imgHeight: 600, succeed: false });
    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });

    expect(resizeImage(file)).rejects.toThrow('Failed to load image');
  });
});