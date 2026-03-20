import { Injectable, UnauthorizedException } from '@nestjs/common';
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
  private readonly users: User[] = [
    { id: '1', username: 'admin', password: 'admin' },
    { id: '2', username: 'user', password: 'user' },
  ].map((u) => ({
    id: u.id,
    username: u.username,
    passwordHash: bcrypt.hashSync(u.password, 10),
  }));

  constructor(private readonly jwtService: JwtService) {}

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
