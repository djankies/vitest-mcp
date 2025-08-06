import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DOMUtils, BrowserUtils, FormUtils } from './dom-utils';

// Configure vitest for browser environment
/**
 * @vitest-environment jsdom
 */

describe('DOM Utils - Browser Environment', () => {
  beforeEach(() => {
    // Clean up DOM before each test
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  afterEach(() => {
    // Clean up after each test
    DOMUtils.clearBody();
  });

  describe('DOMUtils.createElement', () => {
    it('should create basic HTML element', () => {
      const div = DOMUtils.createElement('div');
      expect(div.tagName).toBe('DIV');
      expect(div instanceof HTMLDivElement).toBe(true);
    });

    it('should create element with attributes', () => {
      const div = DOMUtils.createElement('div', { 
        id: 'test-div', 
        class: 'test-class',
        'data-testid': 'my-test-div'
      });
      
      expect(div.id).toBe('test-div');
      expect(div.className).toBe('test-class');
      expect(div.getAttribute('data-testid')).toBe('my-test-div');
    });

    it('should create different element types', () => {
      const span = DOMUtils.createElement('span');
      const p = DOMUtils.createElement('p');
      const h1 = DOMUtils.createElement('h1');
      
      expect(span.tagName).toBe('SPAN');
      expect(p.tagName).toBe('P');
      expect(h1.tagName).toBe('H1');
    });
  });

  describe('DOMUtils.createButton', () => {
    it('should create button with text', () => {
      const button = DOMUtils.createButton('Click me');
      expect(button.textContent).toBe('Click me');
      expect(button.className).toBe('test-button');
      expect(button instanceof HTMLButtonElement).toBe(true);
    });

    it('should create button with click handler', () => {
      const mockClick = vi.fn();
      const button = DOMUtils.createButton('Test Button', mockClick);
      
      button.click();
      expect(mockClick).toHaveBeenCalledOnce();
    });

    it('should handle multiple clicks', () => {
      const mockClick = vi.fn();
      const button = DOMUtils.createButton('Multi Click', mockClick);
      
      button.click();
      button.click();
      button.click();
      
      expect(mockClick).toHaveBeenCalledTimes(3);
    });
  });

  describe('DOMUtils.createInput', () => {
    it('should create text input by default', () => {
      const input = DOMUtils.createInput();
      expect(input.type).toBe('text');
      expect(input instanceof HTMLInputElement).toBe(true);
    });

    it('should create different input types', () => {
      const email = DOMUtils.createInput('email');
      const password = DOMUtils.createInput('password');
      const number = DOMUtils.createInput('number');
      
      expect(email.type).toBe('email');
      expect(password.type).toBe('password');
      expect(number.type).toBe('number');
    });

    it('should set placeholder text', () => {
      const input = DOMUtils.createInput('text', 'Enter your name');
      expect(input.placeholder).toBe('Enter your name');
    });
  });

  describe('DOM manipulation', () => {
    it('should append and remove elements from body', () => {
      const div = DOMUtils.createElement('div', { id: 'test-div' });
      
      // Initially not in DOM
      expect(document.getElementById('test-div')).toBeNull();
      
      // Append to body
      DOMUtils.appendToBody(div);
      expect(document.getElementById('test-div')).toBe(div);
      expect(document.body.children.length).toBe(1);
      
      // Remove from body
      DOMUtils.removeFromBody(div);
      expect(document.getElementById('test-div')).toBeNull();
      expect(document.body.children.length).toBe(0);
    });

    it('should clear entire body', () => {
      // Add multiple elements
      const div1 = DOMUtils.createElement('div');
      const div2 = DOMUtils.createElement('div');
      const span = DOMUtils.createElement('span');
      
      DOMUtils.appendToBody(div1);
      DOMUtils.appendToBody(div2);
      DOMUtils.appendToBody(span);
      
      expect(document.body.children.length).toBe(3);
      
      // Clear body
      DOMUtils.clearBody();
      expect(document.body.children.length).toBe(0);
      expect(document.body.innerHTML).toBe('');
    });
  });

  describe('DOM querying', () => {
    beforeEach(() => {
      // Set up test DOM structure
      const container = DOMUtils.createElement('div', { 'data-testid': 'container' });
      const button1 = DOMUtils.createButton('Button 1');
      const button2 = DOMUtils.createButton('Button 2');
      const input = DOMUtils.createElement('input', { 'data-testid': 'test-input' });
      
      container.appendChild(button1);
      container.appendChild(button2);
      container.appendChild(input);
      DOMUtils.appendToBody(container);
    });

    it('should query by test id', () => {
      const container = DOMUtils.queryByTestId('container');
      const input = DOMUtils.queryByTestId('test-input');
      
      expect(container).not.toBeNull();
      expect(input).not.toBeNull();
      expect(container?.tagName).toBe('DIV');
      expect(input?.tagName).toBe('INPUT');
    });

    it('should return null for non-existent test id', () => {
      const nonExistent = DOMUtils.queryByTestId('does-not-exist');
      expect(nonExistent).toBeNull();
    });

    it('should get all elements by class', () => {
      const buttons = DOMUtils.getAllByClass('test-button');
      expect(buttons.length).toBe(2);
      
      buttons.forEach(button => {
        expect(button.className).toBe('test-button');
      });
    });
  });
});
