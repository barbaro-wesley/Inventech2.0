import {
    Injectable,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface'
import { CreateCommentDto, UpdateCommentDto } from './dto/comment.dto'

const CLIENT_ROLES: UserRole[] = [
    UserRole.CLIENT_ADMIN,
    UserRole.CLIENT_USER,
    UserRole.CLIENT_VIEWER,
]

const MANAGER_ROLES: UserRole[] = [
    UserRole.SUPER_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.COMPANY_MANAGER,
]

@Injectable()
export class CommentsService {
    constructor(private prisma: PrismaService) { }

    async create(
        serviceOrderId: string,
        dto: CreateCommentDto,
        clientId: string,
        companyId: string,
        currentUser: AuthenticatedUser,
    ) {
        // Verifica que a OS pertence ao tenant
        const os = await this.prisma.serviceOrder.findFirst({
            where: { id: serviceOrderId, clientId, companyId, deletedAt: null },
            select: { id: true },
        })
        if (!os) throw new NotFoundException('Ordem de serviço não encontrada')

        // Usuários de cliente não podem criar comentários internos
        const isInternal = CLIENT_ROLES.includes(currentUser.role)
            ? false
            : (dto.isInternal ?? false)

        return this.prisma.serviceOrderComment.create({
            data: {
                serviceOrderId,
                authorId: currentUser.sub,
                content: dto.content,
                isInternal,
            },
            select: {
                id: true,
                content: true,
                isInternal: true,
                createdAt: true,
                author: { select: { id: true, name: true, role: true } },
            },
        })
    }

    async update(
        commentId: string,
        dto: UpdateCommentDto,
        currentUser: AuthenticatedUser,
    ) {
        const comment = await this.prisma.serviceOrderComment.findUnique({
            where: { id: commentId },
            select: { id: true, authorId: true },
        })
        if (!comment) throw new NotFoundException('Comentário não encontrado')

        // Só o autor pode editar
        if (comment.authorId !== currentUser.sub) {
            throw new ForbiddenException('Você não pode editar este comentário')
        }

        return this.prisma.serviceOrderComment.update({
            where: { id: commentId },
            data: { content: dto.content },
            select: {
                id: true,
                content: true,
                isInternal: true,
                updatedAt: true,
                author: { select: { id: true, name: true } },
            },
        })
    }

    async remove(commentId: string, currentUser: AuthenticatedUser) {
        const comment = await this.prisma.serviceOrderComment.findUnique({
            where: { id: commentId },
            select: { id: true, authorId: true },
        })
        if (!comment) throw new NotFoundException('Comentário não encontrado')

        // Autor ou gestores podem remover
        const canDelete =
            comment.authorId === currentUser.sub ||
            MANAGER_ROLES.includes(currentUser.role)

        if (!canDelete) throw new ForbiddenException('Você não pode remover este comentário')

        await this.prisma.serviceOrderComment.delete({ where: { id: commentId } })

        return { message: 'Comentário removido com sucesso' }
    }
}