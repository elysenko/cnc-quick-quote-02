import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Choose a password of at least 8 characters.' })
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
