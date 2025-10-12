import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { User } from '../../modules/auth/user.entity';

interface JwtUser {
  userId: string;
  email: string;
  userType: string;
}

interface UserRow {
  id: string;
  email: string;
  userType: string;
  isActive: boolean;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: JwtUser }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    if (!user.userId) {
      throw new UnauthorizedException('User ID not found in token');
    }

    const users: UserRow[] = await this.userRepository.query(
      'SELECT id, email, "userType", "isActive" FROM "users" WHERE id = $1',
      [user.userId],
    );

    if (users.length === 0) {
      throw new UnauthorizedException('User not found in database');
    }

    const existingUser: UserRow = users[0];

    if (!existingUser.isActive) {
      throw new ForbiddenException('User account is inactive');
    }

    if (!user.email) {
      throw new ForbiddenException('User role not defined');
    }

    if (!roles.includes(existingUser.userType)) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${roles.join(', ')}. Your role: ${existingUser.userType}`,
      );
    }

    return true;
  }
}
