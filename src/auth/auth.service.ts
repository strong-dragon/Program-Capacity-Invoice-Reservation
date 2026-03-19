import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';

// Mock users for demo purposes
// In production, this would be a proper user service with hashed passwords
const MOCK_USERS = [
  { id: '1', username: 'admin', password: 'admin' },
  { id: '2', username: 'user', password: 'user' },
];

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  login(loginDto: LoginDto): { access_token: string } {
    const user = MOCK_USERS.find(
      (u) =>
        u.username === loginDto.username && u.password === loginDto.password,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, username: user.username };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
