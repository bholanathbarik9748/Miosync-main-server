import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './user.entity';
import { LoginDto, RegisterDto, AuthResponseDto } from './dto/auth.dto';

interface UserRow {
  id: number;
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { email, password, firstName, lastName } = registerDto;

    // Check if user already exists using raw SQL
    const existingUser: UserRow[] = await this.userRepository.query(
      'SELECT id, email FROM "user" WHERE email = $1',
      [email],
    );

    if (existingUser.length > 0) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user using raw SQL
    const insertResult: UserRow[] = await this.userRepository.query(
      'INSERT INTO "user" (email, password, "firstName", "lastName", "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING id, email, "firstName", "lastName"',
      [email, hashedPassword, firstName, lastName, true],
    );

    const savedUser: UserRow = insertResult[0];

    // Generate JWT token
    const payload = { email: savedUser.email, sub: savedUser.id };
    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      user: {
        id: savedUser.id,
        email: savedUser.email,
        firstName: savedUser.firstName,
        lastName: savedUser.lastName,
      },
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    // Find user using raw SQL
    const users: UserRow[] = await this.userRepository.query(
      'SELECT id, email, password, "firstName", "lastName" FROM "user" WHERE email = $1',
      [email],
    );

    if (users.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user: UserRow = users[0];
    const isPasswordValid = await bcrypt.compare(password, user.password!);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { email: user.email, sub: user.id };
    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  async validateUser(email: string, password: string): Promise<any> {
    // Find user using raw SQL
    const users: UserRow[] = await this.userRepository.query(
      'SELECT id, email, password, "firstName", "lastName", "isActive", "createdAt", "updatedAt" FROM "user" WHERE email = $1',
      [email],
    );

    if (users.length === 0) {
      return null;
    }

    const user: UserRow = users[0];
    const isPasswordValid = await bcrypt.compare(password, user.password!);

    if (isPasswordValid) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...result } = user;
      return result;
    }

    return null;
  }

  async getProfile(userId: number): Promise<any> {
    // Get user profile using raw SQL
    const users: UserRow[] = await this.userRepository.query(
      'SELECT id, email, "firstName", "lastName", "isActive", "createdAt", "updatedAt" FROM "user" WHERE id = $1',
      [userId],
    );

    if (users.length === 0) {
      throw new UnauthorizedException('User not found');
    }

    return users[0];
  }
}
