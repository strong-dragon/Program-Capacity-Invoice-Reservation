import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(AuthService.name);
  private readonly users: User[] = [];

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.initializeDemoUsers();
  }

  private initializeDemoUsers(): void {
    const nodeEnv = this.configService.get<string>('nodeEnv') ?? 'development';

    if (nodeEnv === 'production') {
      this.logger.warn(
        'No demo users in production. Configure a proper user store.',
      );
      return;
    }

    const demoUsers = [
      { id: '1', username: 'admin', password: 'admin' },
      { id: '2', username: 'user', password: 'user' },
    ];

    for (const user of demoUsers) {
      const passwordHash = bcrypt.hashSync(user.password, 10);
      this.users.push({
        id: user.id,
        username: user.username,
        passwordHash,
      });
    }

    this.logger.log('Demo users initialized for development environment');
  }

  login(loginDto: LoginDto): { access_token: string } {
    const user = this.users.find((u) => u.username === loginDto.username);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = bcrypt.compareSync(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, username: user.username };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
