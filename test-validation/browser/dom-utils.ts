// DOM utility functions for browser environment testing
export class DOMUtils {
  static createElement(tag: string, attributes: Record<string, string> = {}): HTMLElement {
    const element = document.createElement(tag);
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    return element;
  }

  static createButton(text: string, onClick?: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.className = 'test-button';
    if (onClick) {
      button.addEventListener('click', onClick);
    }
    return button;
  }

  static createInput(type: string = 'text', placeholder?: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = type;
    if (placeholder) {
      input.placeholder = placeholder;
    }
    return input;
  }

  static appendToBody(element: HTMLElement): void {
    document.body.appendChild(element);
  }

  static removeFromBody(element: HTMLElement): void {
    if (element.parentNode === document.body) {
      document.body.removeChild(element);
    }
  }

  static clearBody(): void {
    document.body.innerHTML = '';
  }

  static queryByTestId(testId: string): HTMLElement | null {
    return document.querySelector(`[data-testid="${testId}"]`);
  }

  static getAllByClass(className: string): NodeListOf<Element> {
    return document.querySelectorAll(`.${className}`);
  }
}

// Browser API utilities
export class BrowserUtils {
  static getWindowSize(): { width: number; height: number } {
    return {
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  static getCurrentUrl(): string {
    return window.location.href;
  }

  static setLocalStorage(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  static getLocalStorage(key: string): string | null {
    return localStorage.getItem(key);
  }

  static clearLocalStorage(): void {
    localStorage.clear();
  }

  static triggerResize(width: number, height: number): void {
    // Simulate window resize
    Object.defineProperty(window, 'innerWidth', { value: width, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: height, writable: true });
    window.dispatchEvent(new Event('resize'));
  }
}

// Form utilities
export class FormUtils {
  static createForm(fields: Array<{ name: string; type: string; required?: boolean }>): HTMLFormElement {
    const form = document.createElement('form');
    
    fields.forEach(field => {
      const input = document.createElement('input');
      input.name = field.name;
      input.type = field.type;
      if (field.required) {
        input.required = true;
      }
      
      const label = document.createElement('label');
      label.textContent = field.name;
      label.appendChild(input);
      
      form.appendChild(label);
    });
    
    return form;
  }

  static getFormData(form: HTMLFormElement): Record<string, string> {
    const formData = new FormData(form);
    const data: Record<string, string> = {};
    
    formData.forEach((value, key) => {
      data[key] = value.toString();
    });
    
    return data;
  }

  static validateForm(form: HTMLFormElement): boolean {
    return form.checkValidity();
  }
}

// Untested browser utility for coverage testing
export class UntestedBrowserUtils {
  static createComplexElement(): HTMLElement {
    const div = document.createElement('div');
    div.innerHTML = '<span>Untested complex element</span>';
    return div;
  }
}
