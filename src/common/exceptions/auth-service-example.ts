// Example: Updated AuthService using the new exception system
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../modules/auth/user.entity';
import { LoginDto, RegisterDto } from '../../modules/auth/dto/auth.dto';
import { ExceptionFactory, DatabaseExceptionHandler } from './index';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto): Promise<any> {
    const { email, password, firstName, lastName, phoneNumber, userType } =
      registerDto;

    try {
      // Check if user already exists
      const existingUser = await this.userRepository.findOne({
        where: { email },
      });

      if (existingUser) {
        throw ExceptionFactory.emailAlreadyExists(email);
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create new user
      const user = this.userRepository.create({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phoneNumber,
        userType,
      });

      const savedUser = await this.userRepository.save(user);

      // Generate JWT token
      const payload = {
        sub: savedUser.id,
        email: savedUser.email,
        userType: savedUser.userType,
      };
      const token = this.jwtService.sign(payload);

      return {
        user: {
          id: savedUser.id,
          email: savedUser.email,
          firstName: savedUser.firstName,
          lastName: savedUser.lastName,
          userType: savedUser.userType,
          phoneNumber: savedUser.phoneNumber,
        },
        token,
      };
    } catch (error) {
      if (error instanceof QueryFailedError) {
        throw DatabaseExceptionHandler.handleQueryFailedError(error);
      }
      throw error;
    }
  }

  async login(loginDto: LoginDto): Promise<any> {
    const { email, password } = loginDto;

    try {
      // Find user by email
      const user = await this.userRepository.findOne({
        where: { email },
      });

      if (!user) {
        throw ExceptionFactory.invalidCredentials();
      }

      // Check if account is active
      if (!user.isActive) {
        throw ExceptionFactory.accountDisabled();
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw ExceptionFactory.invalidCredentials();
      }

      // Generate JWT token
      const payload = {
        sub: user.id,
        email: user.email,
        userType: user.userType,
      };
      const token = this.jwtService.sign(payload);

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          phoneNumber: user.phoneNumber,
        },
        token,
      };
    } catch (error) {
      if (error instanceof QueryFailedError) {
        throw DatabaseExceptionHandler.handleQueryFailedError(error);
      }
      throw error;
    }
  }

  async validateUser(userId: string): Promise<any> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw ExceptionFactory.userNotFound(userId);
      }

      if (!user.isActive) {
        throw ExceptionFactory.accountDisabled();
      }

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        phoneNumber: user.phoneNumber,
      };
    } catch (error) {
      if (error instanceof QueryFailedError) {
        throw DatabaseExceptionHandler.handleQueryFailedError(error);
      }
      throw error;
    }
  }

  async refreshToken(token: string): Promise<any> {
    try {
      const payload = this.jwtService.verify(token);

      // Generate new token
      const newPayload = {
        sub: payload.sub,
        email: payload.email,
        userType: payload.userType,
      };
      const newToken = this.jwtService.sign(newPayload);

      return { token: newToken };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw ExceptionFactory.tokenExpired();
      }
      if (error.name === 'JsonWebTokenError') {
        throw ExceptionFactory.tokenInvalid();
      }
      throw ExceptionFactory.unauthorized('Token validation failed', 'AUTH');
    }
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw ExceptionFactory.userNotFound(userId);
      }

      // Verify old password
      const isOldPasswordValid = await bcrypt.compare(
        oldPassword,
        user.password,
      );
      if (!isOldPasswordValid) {
        throw ExceptionFactory.unauthorized(
          'Current password is incorrect',
          'AUTH',
        );
      }

      // Validate new password
      if (newPassword.length < 8) {
        throw ExceptionFactory.invalidLength('password', 8);
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      await this.userRepository.update(userId, {
        password: hashedNewPassword,
      });
    } catch (error) {
      if (error instanceof QueryFailedError) {
        throw DatabaseExceptionHandler.handleQueryFailedError(error);
      }
      throw error;
    }
  }
}
