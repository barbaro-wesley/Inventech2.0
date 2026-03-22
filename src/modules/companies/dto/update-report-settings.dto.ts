import { IsOptional, IsString, IsHexColor } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class UpdateReportSettingsDto {
    @ApiPropertyOptional({ example: '#1E40AF', description: 'Cor primária (cabeçalho)' })
    @IsOptional() @IsHexColor()
    reportPrimaryColor?: string

    @ApiPropertyOptional({ example: '#DBEAFE', description: 'Cor secundária (linhas alternadas)' })
    @IsOptional() @IsHexColor()
    reportSecondaryColor?: string

    @ApiPropertyOptional({ example: 'Relatório Técnico — Aria Engenharia' })
    @IsOptional() @IsString()
    reportHeaderTitle?: string

    @ApiPropertyOptional({ example: 'Documento confidencial — uso interno' })
    @IsOptional() @IsString()
    reportFooterText?: string
}