import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { resizeImage } from './image.ts';

describe('resizeImage', () => {
  let originalFile: any;
  let originalURL: any;
  let originalImage: any;
  let originalDocument: any;

  beforeEach(() => {
    // Save originals
    originalFile = globalThis.File;
    originalURL = globalThis.URL;
    originalImage = globalThis.Image;
    originalDocument = globalThis.document;

    // Setup minimal mocks for DOM objects
    globalThis.File = class File {
      name: string;
      constructor(bits: any[], name: string) {
        this.name = name;
      }
    } as any;

    globalThis.URL = {
      createObjectURL: () => 'blob:test',
      revokeObjectURL: () => {}
    } as any;

    globalThis.Image = class Image {
      onload: any;
      onerror: any;
      width: number = 100;
      height: number = 100;
    } as any;

    // Intercept src set
    Object.defineProperty(globalThis.Image.prototype, 'src', {
      configurable: true,
      set: function(val) {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 10);
      }
    });

    globalThis.document = {
      createElement: (tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => ({ drawImage: () => {} }),
            toDataURL: () => 'data:image/jpeg;base64,mockedbase64'
          };
        }
        return {};
      }
    } as any;
  });

  afterEach(() => {
    // Restore originals
    globalThis.File = originalFile;
    globalThis.URL = originalURL;
    globalThis.Image = originalImage;
    globalThis.document = originalDocument;
  });

  test('happy path', async () => {
    const file = new File([''], 'test.jpg');
    const result = await resizeImage(file);
    assert.strictEqual(result, 'mockedbase64');
  });

  test('canvas context failure', async () => {
    // Override getContext to return null for this specific test
    const originalCreateElement = globalThis.document.createElement;
    globalThis.document.createElement = (tag: string) => {
      const element = originalCreateElement(tag);
      if (tag === 'canvas') {
        if ("getContext" in element) { (element as any).getContext = () => null; }
      }
      return element;
    };

    const file = new File([''], 'test.jpg');
    try {
      await resizeImage(file);
      assert.fail('Should have thrown an error');
    } catch (e: any) {
      assert.strictEqual(e.message, 'Failed to get canvas context');
    }
  });

  test('image load failure', async () => {
    // Override Image.src setter to trigger onerror instead of onload
    Object.defineProperty(globalThis.Image.prototype, 'src', {
      configurable: true,
      set: function(val) {
        setTimeout(() => {
          if (this.onerror) this.onerror();
        }, 10);
      }
    });

    const file = new File([''], 'test.jpg');
    try {
      await resizeImage(file);
      assert.fail('Should have thrown an error');
    } catch (e: any) {
      assert.strictEqual(e.message, 'Failed to load image');
    }
  });
});
