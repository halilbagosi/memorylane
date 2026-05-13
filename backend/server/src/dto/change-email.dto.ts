import { IsEmail, IsString } from 'class-validator';

export class ChangeEmailDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  newEmail: string;

  @IsString()
  currentPassword: string;
}
