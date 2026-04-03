import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class SignupDto {
  @IsNotEmpty()
  @IsString()
  //removes spaces written in name
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @IsNotEmpty()
  @IsString()
  //removes spaces written in surname
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  surname: string;

  //email validation example@gmail.com, example@epoka.edu.al
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  //strong password (8+ chars, 1 Upper, 1 Lower, 1 Number/Symbol)
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'Password must contain uppercase, lowercase, and a number or symbol',
  })
  password: string;
}