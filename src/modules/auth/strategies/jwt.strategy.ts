import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

import { AuthTokenRevocationService } from '../auth-token-revocation.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { User } from '../../users/entities/user.entity';
import { AuthUserCacheService } from '../auth-user-cache.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly authTokenRevocationService: AuthTokenRevocationService,
    private readonly authUserCacheService: AuthUserCacheService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<User> {
    const accessToken = this.extractBearerToken(req);
    if (!accessToken) {
      throw new UnauthorizedException();
    }

    const isRevoked = await this.authTokenRevocationService.isTokenRevoked(accessToken);
    if (isRevoked) {
      throw new UnauthorizedException('Token revoked');
    }

    const user = await this.authUserCacheService.getUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  private extractBearerToken(req: Request): string | null {
    const authorization = req.headers.authorization;
    if (!authorization) {
      return null;
    }

    const [type, token] = authorization.split(' ');
    if (type !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }
}
