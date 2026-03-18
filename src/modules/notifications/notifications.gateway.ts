import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'

export interface WsNotificationPayload {
    event: string
    title: string
    body: string
    data?: Record<string, any>
}

@WebSocketGateway({
    cors: {
        origin: '*',
        credentials: true,
    },
    namespace: '/notifications',
})
export class NotificationsGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server

    private readonly logger = new Logger(NotificationsGateway.name)

    // Mapa de userId → socketId(s) — um usuário pode ter múltiplas abas abertas
    private userSockets = new Map<string, Set<string>>()

    constructor(
        private jwtService: JwtService,
        private configService: ConfigService,
    ) { }

    afterInit() {
        this.logger.log('WebSocket Gateway inicializado — namespace: /notifications')
    }

    // ─────────────────────────────────────────
    // Conexão — autentica o socket via token JWT
    // ─────────────────────────────────────────
    async handleConnection(client: Socket) {
        try {
            // Extrai token do cookie ou do header
            const token =
                client.handshake.auth?.token ||
                client.handshake.headers?.authorization?.replace('Bearer ', '')

            if (!token) {
                this.logger.warn(`Socket desconectado — sem token: ${client.id}`)
                client.disconnect()
                return
            }

            const payload = this.jwtService.verify(token, {
                secret: this.configService.get<string>('app.jwtAccessSecret'),
            })

            // Salva o userId no socket para uso posterior
            client.data.userId = payload.sub
            client.data.companyId = payload.companyId
            client.data.role = payload.role

            // Entra nas rooms de company e usuário
            client.join(`company:${payload.companyId}`)
            client.join(`user:${payload.sub}`)

            // Registra o socket do usuário
            if (!this.userSockets.has(payload.sub)) {
                this.userSockets.set(payload.sub, new Set())
            }
            this.userSockets.get(payload.sub)!.add(client.id)

            this.logger.log(
                `Socket conectado: ${client.id} | User: ${payload.sub} | Role: ${payload.role}`,
            )
        } catch (error) {
            this.logger.warn(`Conexão recusada — token inválido: ${client.id}`)
            client.disconnect()
        }
    }

    handleDisconnect(client: Socket) {
        const userId = client.data?.userId
        if (userId) {
            const sockets = this.userSockets.get(userId)
            if (sockets) {
                sockets.delete(client.id)
                if (sockets.size === 0) this.userSockets.delete(userId)
            }
        }
        this.logger.log(`Socket desconectado: ${client.id}`)
    }

    // ─────────────────────────────────────────
    // Cliente entra em uma room de OS específica
    // Para receber atualizações em tempo real da OS
    // ─────────────────────────────────────────
    @SubscribeMessage('join:os')
    handleJoinOs(
        @MessageBody() data: { serviceOrderId: string },
        @ConnectedSocket() client: Socket,
    ) {
        client.join(`os:${data.serviceOrderId}`)
        this.logger.debug(`Socket ${client.id} entrou na room: os:${data.serviceOrderId}`)
        return { joined: `os:${data.serviceOrderId}` }
    }

    @SubscribeMessage('leave:os')
    handleLeaveOs(
        @MessageBody() data: { serviceOrderId: string },
        @ConnectedSocket() client: Socket,
    ) {
        client.leave(`os:${data.serviceOrderId}`)
        return { left: `os:${data.serviceOrderId}` }
    }

    // ─────────────────────────────────────────
    // Métodos para enviar notificações
    // Chamados pelo NotificationsService
    // ─────────────────────────────────────────

    // Envia para um usuário específico (todas as abas abertas)
    sendToUser(userId: string, payload: WsNotificationPayload) {
        this.server.to(`user:${userId}`).emit('notification', payload)
        this.logger.debug(`WS → user:${userId} | ${payload.event}`)
    }

    // Envia para todos os sockets de uma empresa
    sendToCompany(companyId: string, payload: WsNotificationPayload) {
        this.server.to(`company:${companyId}`).emit('notification', payload)
        this.logger.debug(`WS → company:${companyId} | ${payload.event}`)
    }

    // Envia atualização de status de uma OS — para todos que estão na room da OS
    sendOsUpdate(serviceOrderId: string, payload: WsNotificationPayload) {
        this.server.to(`os:${serviceOrderId}`).emit('os:updated', payload)
        this.logger.debug(`WS → os:${serviceOrderId} | ${payload.event}`)
    }

    // Notifica painel que uma nova OS está disponível para assumir
    sendPanelUpdate(companyId: string, payload: WsNotificationPayload) {
        this.server.to(`company:${companyId}`).emit('panel:updated', payload)
        this.logger.debug(`WS → panel company:${companyId} | ${payload.event}`)
    }

    // Retorna quantos usuários conectados por empresa
    getConnectedCount(companyId: string): number {
        const room = this.server.sockets.adapter.rooms.get(`company:${companyId}`)
        return room?.size ?? 0
    }
}