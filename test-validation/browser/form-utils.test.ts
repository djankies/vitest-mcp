import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FormUtils, DOMUtils } from './dom-utils';

/**
 * @vitest-environment jsdom
 */

describe('Form Utils - Browser Environment', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    DOMUtils.clearBody();
  });

  describe('FormUtils.createForm', () => {
    it('should create form with basic fields', () => {
      const fields = [
        { name: 'username', type: 'text' },
        { name: 'email', type: 'email' },
        { name: 'password', type: 'password' }
      ];

      const form = FormUtils.createForm(fields);
      expect(form.tagName).toBe('FORM');
      expect(form.children.length).toBe(3);

      // Check each field
      const inputs = form.querySelectorAll('input');
      expect(inputs.length).toBe(3);
      expect(inputs[0].name).toBe('username');
      expect(inputs[0].type).toBe('text');
      expect(inputs[1].name).toBe('email');
      expect(inputs[1].type).toBe('email');
      expect(inputs[2].name).toBe('password');
      expect(inputs[2].type).toBe('password');
    });

    it('should create form with required fields', () => {
      const fields = [
        { name: 'username', type: 'text', required: true },
        { name: 'email', type: 'email', required: true },
        { name: 'phone', type: 'tel', required: false }
      ];

      const form = FormUtils.createForm(fields);
      const inputs = form.querySelectorAll('input');

      expect(inputs[0].required).toBe(true);
      expect(inputs[1].required).toBe(true);
      expect(inputs[2].required).toBe(false);
    });

    it('should create labels for each field', () => {
      const fields = [
        { name: 'firstName', type: 'text' },
        { name: 'lastName', type: 'text' }
      ];

      const form = FormUtils.createForm(fields);
      const labels = form.querySelectorAll('label');

      expect(labels.length).toBe(2);
      expect(labels[0].textContent).toBe('firstName');
      expect(labels[1].textContent).toBe('lastName');
    });
  });

  describe('FormUtils.getFormData', () => {
    it('should extract form data correctly', () => {
      const fields = [
        { name: 'username', type: 'text' },
        { name: 'email', type: 'email' },
        { name: 'age', type: 'number' }
      ];

      const form = FormUtils.createForm(fields);
      DOMUtils.appendToBody(form);

      // Set values
      const inputs = form.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
      inputs[0].value = 'johndoe';
      inputs[1].value = 'john@example.com';
      inputs[2].value = '25';

      const formData = FormUtils.getFormData(form);

      expect(formData).toEqual({
        username: 'johndoe',
        email: 'john@example.com',
        age: '25'
      });
    });

    it('should handle empty form data', () => {
      const fields = [
        { name: 'optional1', type: 'text' },
        { name: 'optional2', type: 'text' }
      ];

      const form = FormUtils.createForm(fields);
      const formData = FormUtils.getFormData(form);

      expect(formData).toEqual({
        optional1: '',
        optional2: ''
      });
    });

    it('should handle complex form with different input types', () => {
      const form = document.createElement('form');
      
      // Text input
      const textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.name = 'textField';
      textInput.value = 'text value';
      form.appendChild(textInput);

      // Checkbox
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'checkboxField';
      checkbox.checked = true;
      checkbox.value = 'checked';
      form.appendChild(checkbox);

      // Radio button
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'radioField';
      radio.value = 'option1';
      radio.checked = true;
      form.appendChild(radio);

      const formData = FormUtils.getFormData(form);

      expect(formData.textField).toBe('text value');
      expect(formData.checkboxField).toBe('checked');
      expect(formData.radioField).toBe('option1');
    });
  });

  describe('FormUtils.validateForm', () => {
    it('should validate form with all required fields filled', () => {
      const fields = [
        { name: 'username', type: 'text', required: true },
        { name: 'email', type: 'email', required: true }
      ];

      const form = FormUtils.createForm(fields);
      const inputs = form.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
      
      // Fill required fields
      inputs[0].value = 'testuser';
      inputs[1].value = 'test@example.com';

      const isValid = FormUtils.validateForm(form);
      expect(isValid).toBe(true);
    });

    it('should fail validation with empty required fields', () => {
      const fields = [
        { name: 'username', type: 'text', required: true },
        { name: 'email', type: 'email', required: true }
      ];

      const form = FormUtils.createForm(fields);
      // Don't fill the fields

      const isValid = FormUtils.validateForm(form);
      expect(isValid).toBe(false);
    });

    it('should validate email format', () => {
      const form = document.createElement('form');
      const emailInput = document.createElement('input');
      emailInput.type = 'email';
      emailInput.name = 'email';
      emailInput.required = true;
      form.appendChild(emailInput);

      // Valid email
      emailInput.value = 'valid@example.com';
      expect(FormUtils.validateForm(form)).toBe(true);

      // Invalid email
      emailInput.value = 'invalid-email';
      expect(FormUtils.validateForm(form)).toBe(false);
    });

    it('should handle mixed validation scenarios', () => {
      const form = document.createElement('form');
      
      // Required text field
      const requiredText = document.createElement('input');
      requiredText.type = 'text';
      requiredText.name = 'required';
      requiredText.required = true;
      form.appendChild(requiredText);

      // Optional email field
      const optionalEmail = document.createElement('input');
      optionalEmail.type = 'email';
      optionalEmail.name = 'optional';
      optionalEmail.required = false;
      form.appendChild(optionalEmail);

      // Valid: required filled, optional empty
      requiredText.value = 'filled';
      optionalEmail.value = '';
      expect(FormUtils.validateForm(form)).toBe(true);

      // Valid: both filled correctly
      requiredText.value = 'filled';
      optionalEmail.value = 'valid@example.com';
      expect(FormUtils.validateForm(form)).toBe(true);

      // Invalid: required empty
      requiredText.value = '';
      optionalEmail.value = 'valid@example.com';
      expect(FormUtils.validateForm(form)).toBe(false);

      // Invalid: required filled, optional invalid
      requiredText.value = 'filled';
      optionalEmail.value = 'invalid-email';
      expect(FormUtils.validateForm(form)).toBe(false);
    });
  });

  describe('Form interaction scenarios', () => {
    it('should handle form submission', () => {
      const fields = [
        { name: 'username', type: 'text', required: true },
        { name: 'message', type: 'text' }
      ];

      const form = FormUtils.createForm(fields);
      DOMUtils.appendToBody(form);

      // Add submit button
      const submitButton = document.createElement('button');
      submitButton.type = 'submit';
      submitButton.textContent = 'Submit';
      form.appendChild(submitButton);

      // Fill form
      const inputs = form.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
      inputs[0].value = 'testuser';
      inputs[1].value = 'Hello world';

      // Test form submission prevention
      let submitPrevented = false;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        submitPrevented = true;
      });

      submitButton.click();
      expect(submitPrevented).toBe(true);
    });

    it('should handle dynamic form field addition', () => {
      const form = document.createElement('form');
      DOMUtils.appendToBody(form);

      expect(form.children.length).toBe(0);

      // Dynamically add fields
      const input1 = document.createElement('input');
      input1.name = 'dynamic1';
      input1.value = 'value1';
      form.appendChild(input1);

      const input2 = document.createElement('input');
      input2.name = 'dynamic2';
      input2.value = 'value2';
      form.appendChild(input2);

      expect(form.children.length).toBe(2);

      const formData = FormUtils.getFormData(form);
      expect(formData).toEqual({
        dynamic1: 'value1',
        dynamic2: 'value2'
      });
    });
  });
});
