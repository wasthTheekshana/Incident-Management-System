import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Request, Response } from 'express';
import { AuthUser } from '../common/auth.types';
import { AllowPasswordChangePending, CurrentUser, Public } from '../common/decorators';
import { SESSION_COOKIE } from '../common/session.guard';
import { Env } from '../config/env.validation';
import { AuthService } from './auth.service';

class LoginDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(1) @MaxLength(128) password: string;
}

class ChangePasswordDto {
  @IsString() @MaxLength(128) currentPassword: string;
  @IsString() @MaxLength(128) newPassword: string;
}

class ForgotPasswordDto {
  @IsEmail() @MaxLength(254) email: string;
}

class ResetPasswordDto {
  @IsString() @MinLength(32) @MaxLength(128) token: string;
  @IsString() @MaxLength(128) newPassword: string;
}

const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, expiresAt } = await this.auth.login(dto.email, dto.password, req.ip);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      expires: expiresAt,
      path: '/',
    });
    return { ok: true };
  }

  @AllowPasswordChangePending()
  @HttpCode(204)
  @Post('logout')
  async logout(@CurrentUser() user: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user, req.ip);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @AllowPasswordChangePending()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    const { sessionId, ...profile } = user;
    return profile;
  }

  @AllowPasswordChangePending()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(204)
  @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Req() req: Request) {
    return this.auth.changePassword(user, dto.currentPassword, dto.newPassword, req.ip);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(204)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.auth.requestReset(dto.email, req.ip);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(204)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(dto.token, dto.newPassword, req.ip);
  }
}
