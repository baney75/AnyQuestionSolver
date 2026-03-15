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
      src: string = '';
    } as any;

    // Intercept src set
    Object.defineProperty(globalThis.Image.prototype, 'src', {
      configurable: true,
      set: function(val) {
        this._src = val;
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 10);
      },
      get: function() {
        return this._src;
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
    let revokedUrl: string | undefined;
    globalThis.URL = {
      createObjectURL: () => 'blob:test',
      revokeObjectURL: (url: string) => { revokedUrl = url; }
    } as any;

    const file = new File([''], 'test.jpg');
    const result = await resizeImage(file);
    assert.strictEqual(result, 'mockedbase64');
    assert.strictEqual(revokedUrl, 'blob:test', 'Object URL should be revoked after use');
  });

  test('canvas context failure', async () => {
    let revokedUrl: string | undefined;
    globalThis.URL = {
      createObjectURL: () => 'blob:test',
      revokeObjectURL: (url: string) => { revokedUrl = url; }
    } as any;

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
    assert.strictEqual(revokedUrl, 'blob:test', 'Object URL should be revoked after use');
  });

  test('image load failure', async () => {
    let revokedUrl: string | undefined;
    globalThis.URL = {
      createObjectURL: () => 'blob:test',
      revokeObjectURL: (url: string) => { revokedUrl = url; }
    } as any;

    // Override Image.src setter to trigger onerror instead of onload
    Object.defineProperty(globalThis.Image.prototype, 'src', {
      configurable: true,
      set: function(val) {
        this._src = val;
        setTimeout(() => {
          if (this.onerror) this.onerror();
        }, 10);
      },
      get: function() {
        return this._src;
      }
    });

    const file = new File([''], 'test.jpg');
    try {
      await resizeImage(file);
      assert.fail('Should have thrown an error');
    } catch (e: any) {
      assert.strictEqual(e.message, 'Failed to load image');
    }
    assert.strictEqual(revokedUrl, 'blob:test', 'Object URL should be revoked after use');
  });

  test('scaling logic', async () => {
    let resultingCanvasWidth: number = 0; let resultingCanvasHeight: number = 0;
    // Override createElement to capture the canvas dimensions
    const originalCreateElement = globalThis.document.createElement;
    globalThis.document.createElement = (tag: string) => {
      const element = originalCreateElement(tag);
      if (tag === 'canvas') {
        const originalToDataURL = (element as any).toDataURL;
        (element as any).toDataURL = function(type: string, quality: number) {
          resultingCanvasWidth = this.width;
          resultingCanvasHeight = this.height;
          return originalToDataURL.call(this, type, quality);
        };
      }
      return element;
    };

    // Make Image mock return large dimensions
    globalThis.Image = class Image {
      onload: any;
      width: number = 2560;
      height: number = 1440;
      _src: string = '';
      set src(val: string) {
        this._src = val;
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 10);
      }
      get src() { return this._src; }
    } as any;

    const file = new File([''], 'large_test.jpg');
    const result = await resizeImage(file);

    assert.strictEqual(result, 'mockedbase64');
    assert.strictEqual(resultingCanvasWidth, 1920, 'Width should be scaled to max dimension 1920');
    assert.strictEqual(resultingCanvasHeight, 1080, 'Height should be scaled proportionally (1440 * 1920 / 2560 = 1080)');
  });
});
