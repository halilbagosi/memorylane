import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsBoolean,
  Matches,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class SignupDto {
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  surname: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  @Matches(/^[a-zA-Z0-9._%+-]+@epoka\.edu\.al$/, {
    message: 'Registration is restricted to @epoka.edu.al email addresses only',
  })
  email: string;

  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'Password must contain 1 uppercase, 1 lowercase, and 1 number/special character',
  })
  password: string;

  @IsBoolean()
  isPrimary: boolean;

  @IsOptional()
  @IsString()
  inviteCode?: string;
}