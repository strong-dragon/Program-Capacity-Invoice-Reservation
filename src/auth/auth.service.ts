import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';

interface User {
  id: string;
  username: string;
  passwordHash: string;
}

@Injectable()
export class AuthService {
  private readonly users: User[];

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    const envUsers = configService.get<string>('auth.users');
    if (envUsers) {
      try {
        const parsed = JSON.parse(envUsers) as Array<{
          id: string;
          username: string;
          passwordHash: string;
        }>;
        this.users = parsed.map((u) => {
          if (!u.id || !u.username || !u.passwordHash) {
            throw new Error(
              'Each user must have id, username, and passwordHash',
            );
          }
          return {
            id: u.id,
            username: u.username,
            passwordHash: u.passwordHash,
          };
        });
      } catch (e) {
        throw new Error(`Invalid AUTH_USERS format: ${(e as Error).message}`);
      }
    } else if (configService.get<string>('nodeEnv') !== 'production') {
      this.users = [
        { id: '1', username: 'admin', password: 'admin' },
        { id: '2', username: 'user', password: 'user' },
      ].map((u) => ({
        id: u.id,
        username: u.username,
        passwordHash: bcrypt.hashSync(u.password, 10),
      }));
    } else {
      throw new Error('AUTH_USERS must be configured in production');
    }
  }

  login(loginDto: LoginDto): { access_token: string } {
    const user = this.users.find((u) => u.username === loginDto.username);

    if (!user || !bcrypt.compareSync(loginDto.password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      access_token: this.jwtService.sign({
        sub: user.id,
        username: user.username,
      }),
    };
  }
}
