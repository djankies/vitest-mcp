import { describe, it, expect, beforeEach } from 'vitest';
import { DOMUtils, BrowserUtils } from './dom-utils';

/**
 * @vitest-environment jsdom
 */

describe('Failing Browser Tests - Browser Environment', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  describe('Intentional DOM failures', () => {
    it('should pass - DOM element creation', () => {
      const div = DOMUtils.createElement('div');
      expect(div.tagName).toBe('DIV');
    });

    it('should fail - incorrect element type assertion', () => {
      const div = DOMUtils.createElement('div');
      // This will fail intentionally
      expect(div.tagName).toBe('SPAN');
    });

    it('should fail - wrong attribute value', () => {
      const element = DOMUtils.createElement('input', { type: 'text', id: 'test-input' });
      // This will fail intentionally
      expect(element.id).toBe('wrong-id');
    });
  });

  describe('Intentional browser API failures', () => {
    it('should pass - localStorage basic operation', () => {
      BrowserUtils.setLocalStorage('key', 'value');
      expect(BrowserUtils.getLocalStorage('key')).toBe('value');
    });

    it('should fail - incorrect localStorage value', () => {
      BrowserUtils.setLocalStorage('testKey', 'actualValue');
      // This will fail intentionally
      expect(BrowserUtils.getLocalStorage('testKey')).toBe('wrongValue');
    });

    it('should fail - wrong window dimensions', () => {
      // Set window size
      BrowserUtils.triggerResize(800, 600);
      const size = BrowserUtils.getWindowSize();
      
      // This will fail intentionally
      expect(size.width).toBe(1024);
      expect(size.height).toBe(768);
    });
  });

  describe('Intentional event handling failures', () => {
    it('should pass - button click event', () => {
      let clicked = false;
      const button = DOMUtils.createButton('Test', () => { clicked = true; });
      button.click();
      expect(clicked).toBe(true);
    });

    it('should fail - event not triggered', () => {
      let eventTriggered = false;
      const button = DOMUtils.createButton('Test', () => { eventTriggered = true; });
      
      // Don't click the button, but expect it to be triggered
      expect(eventTriggered).toBe(true); // This will fail
    });

    it('should fail - wrong event count', () => {
      let clickCount = 0;
      const button = DOMUtils.createButton('Multi Click', () => { clickCount++; });
      
      button.click();
      button.click();
      
      // Expect wrong count - this will fail
      expect(clickCount).toBe(5);
    });
  });

  describe('Async browser test failures', () => {
    it('should pass - async DOM operation', async () => {
      const promise = new Promise<HTMLElement>((resolve) => {
        setTimeout(() => {
          const element = DOMUtils.createElement('div', { id: 'async-element' });
          resolve(element);
        }, 10);
      });

      const element = await promise;
      expect(element.id).toBe('async-element');
    });

    it('should fail - async timeout expectation', async () => {
      const promise = new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve('completed');
        }, 50);
      });

      const result = await promise;
      // This will fail intentionally
      expect(result).toBe('failed');
    });
  });
});
