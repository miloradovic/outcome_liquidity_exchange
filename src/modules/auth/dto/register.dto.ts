import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'Password (8-100 characters)',
    example: 'SecurePassword123',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;

  @ApiProperty({
    description: 'Username (3-50 characters)',
    example: 'john_doe',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username!: string;
}
