import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  ValidationPipe,
  Version,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, AuthResponseDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  ApiResponse,
  ResponseStatus,
} from '../../common/interfaces/api-response.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Version('2')
  @Post('register')
  async register(
    @Body(ValidationPipe) registerDto: RegisterDto,
  ): Promise<ApiResponse<any>> {
    const data: unknown = await this.authService.register(registerDto);
    return {
      status: ResponseStatus.SUCCESS,
      statusCode: HttpStatus.CREATED,
      message: 'User registered successfully',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Version('2')
  @Post('login')
  async login(
    @Body(ValidationPipe) loginDto: LoginDto,
  ): Promise<ApiResponse<any>> {
    const data: unknown = await this.authService.login(loginDto);
    return {
      status: ResponseStatus.SUCCESS,
      statusCode: HttpStatus.OK,
      message: 'Login successful',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Version('2')
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req): Promise<ApiResponse<any>> {
    const data: unknown = await this.authService.getProfile(req.user.userId);
    return {
      status: ResponseStatus.SUCCESS,
      statusCode: HttpStatus.OK,
      message: 'Profile retrieved successfully',
      data,
      timestamp: new Date().toISOString(),
    };
  }
}
