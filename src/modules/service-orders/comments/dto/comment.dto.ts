import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class CreateCommentDto {
    @IsString()
    content: string

    @IsOptional()
    @IsBoolean()
    isInternal?: boolean = false  // true = só visível pela empresa
}

export class UpdateCommentDto {
    @IsString()
    content: string
}