import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserUtils } from './dom-utils';

/**
 * @vitest-environment jsdom
 */

describe('Browser APIs - Browser Environment', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    
    // Reset window properties
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Window APIs', () => {
    it('should get window size', () => {
      const size = BrowserUtils.getWindowSize();
      expect(size.width).toBe(1024);
      expect(size.height).toBe(768);
    });

    it('should handle window resize', () => {
      // Initial size
      let size = BrowserUtils.getWindowSize();
      expect(size.width).toBe(1024);
      expect(size.height).toBe(768);

      // Trigger resize
      BrowserUtils.triggerResize(800, 600);
      
      size = BrowserUtils.getWindowSize();
      expect(size.width).toBe(800);
      expect(size.height).toBe(600);
    });

    it('should handle multiple resize events', () => {
      const resizeHandler = vi.fn();
      window.addEventListener('resize', resizeHandler);

      BrowserUtils.triggerResize(1200, 900);
      BrowserUtils.triggerResize(600, 400);
      BrowserUtils.triggerResize(1920, 1080);

      expect(resizeHandler).toHaveBeenCalledTimes(3);
      
      const finalSize = BrowserUtils.getWindowSize();
      expect(finalSize.width).toBe(1920);
      expect(finalSize.height).toBe(1080);

      window.removeEventListener('resize', resizeHandler);
    });
  });

  describe('Location APIs', () => {
    it('should get current URL', () => {
      // jsdom sets a default URL
      const url = BrowserUtils.getCurrentUrl();
      expect(url).toBe('http://localhost:3000/');
    });

    it('should handle URL changes', () => {
      // Mock location change
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://example.com/test'
        },
        writable: true
      });

      const url = BrowserUtils.getCurrentUrl();
      expect(url).toBe('https://example.com/test');
    });
  });

  describe('LocalStorage APIs', () => {
    it('should set and get localStorage values', () => {
      BrowserUtils.setLocalStorage('testKey', 'testValue');
      const value = BrowserUtils.getLocalStorage('testKey');
      expect(value).toBe('testValue');
    });

    it('should return null for non-existent keys', () => {
      const value = BrowserUtils.getLocalStorage('nonExistentKey');
      expect(value).toBeNull();
    });

    it('should handle multiple localStorage operations', () => {
      BrowserUtils.setLocalStorage('key1', 'value1');
      BrowserUtils.setLocalStorage('key2', 'value2');
      BrowserUtils.setLocalStorage('key3', 'value3');

      expect(BrowserUtils.getLocalStorage('key1')).toBe('value1');
      expect(BrowserUtils.getLocalStorage('key2')).toBe('value2');
      expect(BrowserUtils.getLocalStorage('key3')).toBe('value3');
    });

    it('should clear all localStorage', () => {
      BrowserUtils.setLocalStorage('key1', 'value1');
      BrowserUtils.setLocalStorage('key2', 'value2');
      
      // Verify items exist
      expect(BrowserUtils.getLocalStorage('key1')).toBe('value1');
      expect(BrowserUtils.getLocalStorage('key2')).toBe('value2');
      
      // Clear storage
      BrowserUtils.clearLocalStorage();
      
      // Verify items are gone
      expect(BrowserUtils.getLocalStorage('key1')).toBeNull();
      expect(BrowserUtils.getLocalStorage('key2')).toBeNull();
    });

    it('should handle localStorage with JSON data', () => {
      const testObject = { name: 'John', age: 30, active: true };
      const jsonString = JSON.stringify(testObject);
      
      BrowserUtils.setLocalStorage('userObject', jsonString);
      const retrieved = BrowserUtils.getLocalStorage('userObject');
      
      expect(retrieved).toBe(jsonString);
      
      const parsedObject = JSON.parse(retrieved!);
      expect(parsedObject).toEqual(testObject);
    });
  });

  describe('Event handling', () => {
    it('should handle custom events', () => {
      const eventHandler = vi.fn();
      const customEvent = new CustomEvent('testEvent', { 
        detail: { message: 'Hello World' } 
      });

      document.addEventListener('testEvent', eventHandler);
      document.dispatchEvent(customEvent);

      expect(eventHandler).toHaveBeenCalledOnce();
      expect(eventHandler).toHaveBeenCalledWith(customEvent);

      document.removeEventListener('testEvent', eventHandler);
    });

    it('should handle keyboard events', () => {
      const keyHandler = vi.fn();
      document.addEventListener('keydown', keyHandler);

      const keyEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13
      });

      document.dispatchEvent(keyEvent);

      expect(keyHandler).toHaveBeenCalledOnce();
      expect(keyHandler).toHaveBeenCalledWith(keyEvent);

      document.removeEventListener('keydown', keyHandler);
    });

    it('should handle mouse events', () => {
      const clickHandler = vi.fn();
      const button = document.createElement('button');
      button.addEventListener('click', clickHandler);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 200
      });

      button.dispatchEvent(clickEvent);

      expect(clickHandler).toHaveBeenCalledOnce();
      expect(clickHandler).toHaveBeenCalledWith(clickEvent);
    });
  });
});
