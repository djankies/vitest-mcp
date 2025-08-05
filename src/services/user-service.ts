/**
 * User service with complex business logic for testing various coverage scenarios
 */

export interface User {
  id: string;
  name: string;
  email: string;
  age: number;
  isActive: boolean;
  role: 'admin' | 'user' | 'guest';
}

export interface UserCreateRequest {
  name: string;
  email: string;
  age: number;
  role?: 'admin' | 'user' | 'guest';
}

export class UserService {
  private users: Map<string, User> = new Map();
  private nextId = 1;

  createUser(request: UserCreateRequest): User {
    if (!request.name || request.name.trim().length === 0) {
      throw new Error('Name is required');
    }

    if (!this.isValidEmail(request.email)) {
      throw new Error('Invalid email format');
    }

    if (request.age < 0 || request.age > 150) {
      throw new Error('Age must be between 0 and 150');
    }

    if (this.findUserByEmail(request.email)) {
      throw new Error('User with this email already exists');
    }

    const user: User = {
      id: this.nextId.toString(),
      name: request.name.trim(),
      email: request.email.toLowerCase(),
      age: request.age,
      isActive: true,
      role: request.role || 'user'
    };

    this.users.set(user.id, user);
    this.nextId++;

    return user;
  }

  getUserById(id: string): User | null {
    return this.users.get(id) || null;
  }

  getUserByEmail(email: string): User | null {
    return this.findUserByEmail(email);
  }

  updateUser(id: string, updates: Partial<UserCreateRequest>): User {
    const user = this.users.get(id);
    if (!user) {
      throw new Error('User not found');
    }

    if (updates.name !== undefined) {
      if (!updates.name || updates.name.trim().length === 0) {
        throw new Error('Name cannot be empty');
      }
      user.name = updates.name.trim();
    }

    if (updates.email !== undefined) {
      if (!this.isValidEmail(updates.email)) {
        throw new Error('Invalid email format');
      }
      
      const existingUser = this.findUserByEmail(updates.email);
      if (existingUser && existingUser.id !== id) {
        throw new Error('Email already in use by another user');
      }
      
      user.email = updates.email.toLowerCase();
    }

    if (updates.age !== undefined) {
      if (updates.age < 0 || updates.age > 150) {
        throw new Error('Age must be between 0 and 150');
      }
      user.age = updates.age;
    }

    if (updates.role !== undefined) {
      user.role = updates.role;
    }

    return user;
  }

  deleteUser(id: string): boolean {
    return this.users.delete(id);
  }

  activateUser(id: string): void {
    const user = this.users.get(id);
    if (!user) {
      throw new Error('User not found');
    }
    user.isActive = true;
  }

  deactivateUser(id: string): void {
    const user = this.users.get(id);
    if (!user) {
      throw new Error('User not found');
    }
    user.isActive = false;
  }

  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  getActiveUsers(): User[] {
    return this.getAllUsers().filter(user => user.isActive);
  }

  getUsersByRole(role: User['role']): User[] {
    return this.getAllUsers().filter(user => user.role === role);
  }

  // This method will remain untested
  getUserStatistics(): { total: number; active: number; byRole: Record<string, number> } {
    const users = this.getAllUsers();
    const stats = {
      total: users.length,
      active: users.filter(u => u.isActive).length,
      byRole: {} as Record<string, number>
    };

    for (const user of users) {
      stats.byRole[user.role] = (stats.byRole[user.role] || 0) + 1;
    }

    return stats;
  }

  // Complex method with multiple branches - partially tested
  validateUserAccess(userId: string, resource: string, action: string): boolean {
    const user = this.users.get(userId);
    if (!user) {
      return false;
    }

    if (!user.isActive) {
      return false;
    }

    if (user.role === 'admin') {
      return true; // Admins can access everything
    }

    if (user.role === 'guest') {
      return action === 'read' && resource === 'public';
    }

    if (user.role === 'user') {
      if (resource === 'profile' && (action === 'read' || action === 'update')) {
        return true;
      }
      if (resource === 'public' && action === 'read') {
        return true;
      }
      // Other user permissions not implemented yet
      return false;
    }

    return false;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private findUserByEmail(email: string): User | null {
    for (const user of this.users.values()) {
      if (user.email === email.toLowerCase()) {
        return user;
      }
    }
    return null;
  }
}
