import { IsEmail, IsString, Length } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(2, 100)
  name!: string;

  @IsString()
  @Length(12, 200)
  password!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 200)
  password!: string;
}
