import { describe, it, expect, beforeEach } from 'vitest';
import { UserService, User, UserCreateRequest } from './user-service';

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
  });

  describe('createUser', () => {
    it('should create a user with valid data', () => {
      const request: UserCreateRequest = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      };

      const user = userService.createUser(request);

      expect(user.id).toBe('1');
      expect(user.name).toBe('John Doe');
      expect(user.email).toBe('john@example.com');
      expect(user.age).toBe(30);
      expect(user.isActive).toBe(true);
      expect(user.role).toBe('user');
    });

    it('should create a user with specified role', () => {
      const request: UserCreateRequest = {
        name: 'Admin User',
        email: 'admin@example.com',
        age: 35,
        role: 'admin'
      };

      const user = userService.createUser(request);
      expect(user.role).toBe('admin');
    });

    it('should throw error for empty name', () => {
      const request: UserCreateRequest = {
        name: '',
        email: 'test@example.com',
        age: 25
      };

      expect(() => userService.createUser(request)).toThrow('Name is required');
    });

    it('should throw error for invalid email', () => {
      const request: UserCreateRequest = {
        name: 'Test User',
        email: 'invalid-email',
        age: 25
      };

      expect(() => userService.createUser(request)).toThrow('Invalid email format');
    });

    it('should throw error for invalid age', () => {
      const request: UserCreateRequest = {
        name: 'Test User',
        email: 'test@example.com',
        age: -5
      };

      expect(() => userService.createUser(request)).toThrow('Age must be between 0 and 150');
    });

    it('should throw error for duplicate email', () => {
      const request: UserCreateRequest = {
        name: 'First User',
        email: 'duplicate@example.com',
        age: 25
      };

      userService.createUser(request);

      const duplicateRequest: UserCreateRequest = {
        name: 'Second User',
        email: 'duplicate@example.com',
        age: 30
      };

      expect(() => userService.createUser(duplicateRequest)).toThrow('User with this email already exists');
    });
  });

  describe('getUserById', () => {
    it('should return user when found', () => {
      const request: UserCreateRequest = {
        name: 'Test User',
        email: 'test@example.com',
        age: 25
      };

      const createdUser = userService.createUser(request);
      const foundUser = userService.getUserById(createdUser.id);

      expect(foundUser).toEqual(createdUser);
    });

    it('should return null when user not found', () => {
      const foundUser = userService.getUserById('nonexistent');
      expect(foundUser).toBeNull();
    });
  });

  describe('updateUser', () => {
    let userId: string;

    beforeEach(() => {
      const request: UserCreateRequest = {
        name: 'Original User',
        email: 'original@example.com',
        age: 25
      };
      const user = userService.createUser(request);
      userId = user.id;
    });

    it('should update user name', () => {
      const updatedUser = userService.updateUser(userId, { name: 'Updated Name' });
      expect(updatedUser.name).toBe('Updated Name');
    });

    it('should update user email', () => {
      const updatedUser = userService.updateUser(userId, { email: 'updated@example.com' });
      expect(updatedUser.email).toBe('updated@example.com');
    });

    it('should throw error when updating to existing email', () => {
      // Create another user
      userService.createUser({
        name: 'Another User',
        email: 'another@example.com',
        age: 30
      });

      expect(() => {
        userService.updateUser(userId, { email: 'another@example.com' });
      }).toThrow('Email already in use by another user');
    });

    it('should throw error for non-existent user', () => {
      expect(() => {
        userService.updateUser('nonexistent', { name: 'New Name' });
      }).toThrow('User not found');
    });
  });

  describe('user activation/deactivation', () => {
    let userId: string;

    beforeEach(() => {
      const user = userService.createUser({
        name: 'Test User',
        email: 'test@example.com',
        age: 25
      });
      userId = user.id;
    });

    it('should deactivate user', () => {
      userService.deactivateUser(userId);
      const user = userService.getUserById(userId);
      expect(user?.isActive).toBe(false);
    });

    it('should activate user', () => {
      userService.deactivateUser(userId);
      userService.activateUser(userId);
      const user = userService.getUserById(userId);
      expect(user?.isActive).toBe(true);
    });
  });

  describe('user filtering', () => {
    beforeEach(() => {
      userService.createUser({ name: 'Active User', email: 'active@example.com', age: 25 });
      userService.createUser({ name: 'Admin User', email: 'admin@example.com', age: 35, role: 'admin' });
      
      const inactiveUser = userService.createUser({ 
        name: 'Inactive User', 
        email: 'inactive@example.com', 
        age: 30 
      });
      userService.deactivateUser(inactiveUser.id);
    });

    it('should return all users', () => {
      const users = userService.getAllUsers();
      expect(users).toHaveLength(3);
    });

    it('should return only active users', () => {
      const activeUsers = userService.getActiveUsers();
      expect(activeUsers).toHaveLength(2);
      expect(activeUsers.every(user => user.isActive)).toBe(true);
    });

    it('should return users by role', () => {
      const adminUsers = userService.getUsersByRole('admin');
      expect(adminUsers).toHaveLength(1);
      expect(adminUsers[0].role).toBe('admin');
    });
  });

  describe('validateUserAccess', () => {
    let adminId: string;
    let userId: string;
    let guestId: string;

    beforeEach(() => {
      const admin = userService.createUser({
        name: 'Admin',
        email: 'admin@example.com',
        age: 30,
        role: 'admin'
      });
      adminId = admin.id;

      const user = userService.createUser({
        name: 'User',
        email: 'user@example.com',
        age: 25,
        role: 'user'
      });
      userId = user.id;

      const guest = userService.createUser({
        name: 'Guest',
        email: 'guest@example.com',
        age: 20,
        role: 'guest'
      });
      guestId = guest.id;
    });

    it('should allow admin access to everything', () => {
      expect(userService.validateUserAccess(adminId, 'any-resource', 'any-action')).toBe(true);
    });

    it('should allow guest read access to public resources', () => {
      expect(userService.validateUserAccess(guestId, 'public', 'read')).toBe(true);
    });

    it('should deny guest write access', () => {
      expect(userService.validateUserAccess(guestId, 'public', 'write')).toBe(false);
    });

    it('should allow user profile access', () => {
      expect(userService.validateUserAccess(userId, 'profile', 'read')).toBe(true);
      expect(userService.validateUserAccess(userId, 'profile', 'update')).toBe(true);
    });

    it('should deny access for non-existent user', () => {
      expect(userService.validateUserAccess('nonexistent', 'any', 'any')).toBe(false);
    });
  });

  // Note: getUserStatistics method is intentionally not tested to create coverage gaps
  // Note: Some edge cases in validateUserAccess are not tested to create partial coverage
});
