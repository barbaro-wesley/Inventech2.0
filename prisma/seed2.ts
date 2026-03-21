import { PrismaClient, UserRole, UserStatus, EquipmentStatus, EquipmentCriticality, MaintenanceType, ServiceOrderStatus, ServiceOrderPriority, ServiceOrderTechnicianRole, RecurrenceType } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

// ─────────────────────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────────────────────────────────────
const hash = (password: string) => bcrypt.hash(password, 10)
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
    console.log('🌱 Iniciando seed...\n')

    // ─────────────────────────────────────────────────────────────────────────
    // 1. PLATFORM
    // ─────────────────────────────────────────────────────────────────────────
    console.log('📦 Criando Platform...')
    const platform = await prisma.platform.upsert({
        where: { id: '00000000-0000-0000-0000-000000000001' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'SaaS Manutenção',
        },
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 2. SUPER ADMIN
    // ─────────────────────────────────────────────────────────────────────────
    console.log('👑 Criando Super Admin...')
    await prisma.user.upsert({
        where: { email: 'super@manutencao.app' },
        update: {},
        create: {
            name: 'Super Admin',
            email: 'super@manutencao.app',
            passwordHash: await hash('Super@123'),
            role: UserRole.SUPER_ADMIN,
            status: UserStatus.ACTIVE,
        },
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 3. COMPANY — Aria Engenharia
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🏢 Criando Company — Aria Engenharia...')
    const company = await prisma.company.upsert({
        where: { slug: 'aria-engenharia' },
        update: {},
        create: {
            platformId: platform.id,
            name: 'Aria Engenharia',
            slug: 'aria-engenharia',
            document: '12.345.678/0001-90',
            email: 'contato@ariaengenharia.com',
            phone: '(51) 3333-4444',
            status: 'ACTIVE',
        },
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 4. USUÁRIOS DA EMPRESA
    // ─────────────────────────────────────────────────────────────────────────
    console.log('👥 Criando usuários da empresa...')

    const companyAdmin = await prisma.user.upsert({
        where: { email: 'admin@ariaengenharia.com' },
        update: {},
        create: {
            name: 'Carlos Silva',
            email: 'admin@ariaengenharia.com',
            passwordHash: await hash('Admin@123'),
            role: UserRole.COMPANY_ADMIN,
            status: UserStatus.ACTIVE,
            phone: '(51) 99999-0001',
            companyId: company.id,
        },
    })

    const manager = await prisma.user.upsert({
        where: { email: 'gerente@ariaengenharia.com' },
        update: {},
        create: {
            name: 'Ana Rodrigues',
            email: 'gerente@ariaengenharia.com',
            passwordHash: await hash('Gerente@123'),
            role: UserRole.COMPANY_MANAGER,
            status: UserStatus.ACTIVE,
            phone: '(51) 99999-0002',
            companyId: company.id,
        },
    })

    const tecnico1 = await prisma.user.upsert({
        where: { email: 'joao.tecnico@ariaengenharia.com' },
        update: {},
        create: {
            name: 'João Pereira',
            email: 'joao.tecnico@ariaengenharia.com',
            passwordHash: await hash('Tecnico@123'),
            role: UserRole.TECHNICIAN,
            status: UserStatus.ACTIVE,
            phone: '(51) 99999-0003',
            companyId: company.id,
        },
    })

    const tecnico2 = await prisma.user.upsert({
        where: { email: 'maria.tecnica@ariaengenharia.com' },
        update: {},
        create: {
            name: 'Maria Santos',
            email: 'maria.tecnica@ariaengenharia.com',
            passwordHash: await hash('Tecnico@123'),
            role: UserRole.TECHNICIAN,
            status: UserStatus.ACTIVE,
            phone: '(51) 99999-0004',
            companyId: company.id,
        },
    })

    const tecnico3 = await prisma.user.upsert({
        where: { email: 'pedro.tecnico@ariaengenharia.com' },
        update: {},
        create: {
            name: 'Pedro Oliveira',
            email: 'pedro.tecnico@ariaengenharia.com',
            passwordHash: await hash('Tecnico@123'),
            role: UserRole.TECHNICIAN,
            status: UserStatus.ACTIVE,
            phone: '(51) 99999-0005',
            companyId: company.id,
        },
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 5. GRUPOS DE MANUTENÇÃO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🏷️  Criando grupos de manutenção...')

    const grupoEletrica = await prisma.maintenanceGroup.upsert({
        where: { companyId_name: { companyId: company.id, name: 'Elétrica' } },
        update: {},
        create: {
            companyId: company.id,
            name: 'Elétrica',
            description: 'Manutenção de sistemas elétricos e painéis',
            color: '#F59E0B',
            isActive: true,
        },
    })

    const grupoHidraulica = await prisma.maintenanceGroup.upsert({
        where: { companyId_name: { companyId: company.id, name: 'Hidráulica' } },
        update: {},
        create: {
            companyId: company.id,
            name: 'Hidráulica',
            description: 'Tubulações, bombas e sistemas hidráulicos',
            color: '#3B82F6',
            isActive: true,
        },
    })

    const grupoPredial = await prisma.maintenanceGroup.upsert({
        where: { companyId_name: { companyId: company.id, name: 'Predial' } },
        update: {},
        create: {
            companyId: company.id,
            name: 'Predial',
            description: 'Estruturas, alvenaria e acabamentos',
            color: '#10B981',
            isActive: true,
        },
    })

    // Vincular técnicos aos grupos
    console.log('🔗 Vinculando técnicos aos grupos...')

    const technicianGroupLinks = [
        { userId: tecnico1.id, groupId: grupoEletrica.id },
        { userId: tecnico1.id, groupId: grupoPredial.id },
        { userId: tecnico2.id, groupId: grupoHidraulica.id },
        { userId: tecnico2.id, groupId: grupoEletrica.id },
        { userId: tecnico3.id, groupId: grupoPredial.id },
        { userId: tecnico3.id, groupId: grupoHidraulica.id },
    ]

    for (const link of technicianGroupLinks) {
        await prisma.technicianGroup.upsert({
            where: { userId_groupId: link },
            update: {},
            create: { ...link, isActive: true },
        })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. CLIENTES
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🏥 Criando clientes...')

    const clienteHospital = await prisma.client.upsert({
        where: { id: '00000000-0000-0000-0000-000000000010' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000010',
            companyId: company.id,
            name: 'Hospital São Lucas',
            document: '98.765.432/0001-11',
            email: 'manutencao@saolucas.com.br',
            phone: '(51) 3333-5555',
            address: {
                street: 'Av. Ipiranga',
                number: '6690',
                neighborhood: 'Jardim Botânico',
                city: 'Porto Alegre',
                state: 'RS',
                zipCode: '90610-000',
            },
            status: 'ACTIVE',
        },
    })

    const clienteEscola = await prisma.client.upsert({
        where: { id: '00000000-0000-0000-0000-000000000011' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000011',
            companyId: company.id,
            name: 'Colégio Estadual Júlio de Castilhos',
            document: '87.654.321/0001-22',
            email: 'direcao@juliodecastilhos.edu.br',
            phone: '(51) 3333-6666',
            address: {
                street: 'Rua Duque de Caxias',
                number: '1056',
                neighborhood: 'Centro Histórico',
                city: 'Porto Alegre',
                state: 'RS',
                zipCode: '90010-283',
            },
            status: 'ACTIVE',
        },
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 7. USUÁRIOS DOS CLIENTES
    // ─────────────────────────────────────────────────────────────────────────
    console.log('👤 Criando usuários dos clientes...')

    const clientAdmin = await prisma.user.upsert({
        where: { email: 'admin@saolucas.com.br' },
        update: {},
        create: {
            name: 'Roberto Mendes',
            email: 'admin@saolucas.com.br',
            passwordHash: await hash('Cliente@123'),
            role: UserRole.CLIENT_ADMIN,
            status: UserStatus.ACTIVE,
            phone: '(51) 99999-0010',
            companyId: company.id,
            clientId: clienteHospital.id,
        },
    })

    const clientUser = await prisma.user.upsert({
        where: { email: 'solicitante@saolucas.com.br' },
        update: {},
        create: {
            name: 'Fernanda Lima',
            email: 'solicitante@saolucas.com.br',
            passwordHash: await hash('Cliente@123'),
            role: UserRole.CLIENT_USER,
            status: UserStatus.ACTIVE,
            phone: '(51) 99999-0011',
            companyId: company.id,
            clientId: clienteHospital.id,
        },
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 8. CENTROS DE CUSTO E LOCALIZAÇÕES
    // ─────────────────────────────────────────────────────────────────────────
    console.log('📍 Criando centros de custo e localizações...')

    const ccManutencao = await prisma.costCenter.upsert({
        where: { clientId_code: { clientId: clienteHospital.id, code: 'CC-001' } },
        update: {},
        create: {
            companyId: company.id,
            clientId: clienteHospital.id,
            name: 'Manutenção Geral',
            code: 'CC-001',
            description: 'Centro de custo para manutenções prediais',
            isActive: true,
        },
    })

    const ccTI = await prisma.costCenter.upsert({
        where: { clientId_code: { clientId: clienteHospital.id, code: 'CC-002' } },
        update: {},
        create: {
            companyId: company.id,
            clientId: clienteHospital.id,
            name: 'Tecnologia da Informação',
            code: 'CC-002',
            isActive: true,
        },
    })

    const locUTI = await prisma.location.upsert({
        where: { id: '00000000-0000-0000-0000-000000000020' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000020',
            companyId: company.id,
            clientId: clienteHospital.id,
            name: 'UTI Adulto — 2º andar',
            description: 'Unidade de Terapia Intensiva',
            isActive: true,
        },
    })

    const locCME = await prisma.location.upsert({
        where: { id: '00000000-0000-0000-0000-000000000021' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000021',
            companyId: company.id,
            clientId: clienteHospital.id,
            name: 'CME — Subsolo',
            description: 'Central de Material e Esterilização',
            isActive: true,
        },
    })

    const locEmergencia = await prisma.location.upsert({
        where: { id: '00000000-0000-0000-0000-000000000022' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000022',
            companyId: company.id,
            clientId: clienteHospital.id,
            name: 'Emergência — Térreo',
            description: 'Pronto-atendimento e triagem',
            isActive: true,
        },
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 9. TIPOS DE EQUIPAMENTO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('⚙️  Criando tipos de equipamento...')

    const tipoHospitalar = await prisma.equipmentType.upsert({
        where: { id: '00000000-0000-0000-0000-000000000030' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000030',
            companyId: company.id,
            name: 'Equipamento Hospitalar',
            description: 'Equipamentos médicos e hospitalares',
            isActive: true,
        },
    })

    const tipoInfra = await prisma.equipmentType.upsert({
        where: { id: '00000000-0000-0000-0000-000000000031' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000031',
            companyId: company.id,
            name: 'Infraestrutura',
            description: 'Equipamentos de infraestrutura predial',
            isActive: true,
        },
    })

    const subtipoMonitor = await prisma.equipmentSubtype.upsert({
        where: { id: '00000000-0000-0000-0000-000000000032' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000032',
            typeId: tipoHospitalar.id,
            companyId: company.id,
            name: 'Monitor Multiparâmetros',
            isActive: true,
        },
    })

    const subtipoAC = await prisma.equipmentSubtype.upsert({
        where: { id: '00000000-0000-0000-0000-000000000033' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000033',
            typeId: tipoInfra.id,
            companyId: company.id,
            name: 'Ar Condicionado',
            isActive: true,
        },
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 10. EQUIPAMENTOS
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🖥️  Criando equipamentos...')

    const equipMonitor1 = await prisma.equipment.upsert({
        where: { id: '00000000-0000-0000-0000-000000000040' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000040',
            companyId: company.id,
            clientId: clienteHospital.id,
            typeId: tipoHospitalar.id,
            subtypeId: subtipoMonitor.id,
            locationId: locUTI.id,
            currentLocationId: locUTI.id,
            costCenterId: ccManutencao.id,
            name: 'Monitor Multiparâmetros UTI-01',
            brand: 'Philips',
            model: 'IntelliVue MX700',
            serialNumber: 'SN-2024-0001',
            patrimonyNumber: 'PAT-001',
            purchaseValue: 45000.00,
            purchaseDate: new Date('2022-03-15'),
            warrantyStart: new Date('2022-03-15'),
            warrantyEnd: new Date('2025-03-15'),
            status: EquipmentStatus.ACTIVE,
            criticality: EquipmentCriticality.CRITICAL,
            voltage: '127V',
            observations: 'Equipamento crítico — manutenção preventiva trimestral obrigatória',
        },
    })

    const equipMonitor2 = await prisma.equipment.upsert({
        where: { id: '00000000-0000-0000-0000-000000000041' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000041',
            companyId: company.id,
            clientId: clienteHospital.id,
            typeId: tipoHospitalar.id,
            subtypeId: subtipoMonitor.id,
            locationId: locEmergencia.id,
            currentLocationId: locEmergencia.id,
            costCenterId: ccManutencao.id,
            name: 'Monitor Multiparâmetros EMG-01',
            brand: 'Mindray',
            model: 'BeneView T5',
            serialNumber: 'SN-2023-0042',
            patrimonyNumber: 'PAT-002',
            purchaseValue: 28000.00,
            purchaseDate: new Date('2023-01-10'),
            status: EquipmentStatus.ACTIVE,
            criticality: EquipmentCriticality.HIGH,
            voltage: '127V',
        },
    })

    const equipAC = await prisma.equipment.upsert({
        where: { id: '00000000-0000-0000-0000-000000000042' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000042',
            companyId: company.id,
            clientId: clienteHospital.id,
            typeId: tipoInfra.id,
            subtypeId: subtipoAC.id,
            locationId: locUTI.id,
            currentLocationId: locUTI.id,
            costCenterId: ccManutencao.id,
            name: 'Ar Condicionado UTI — Split 36.000 BTU',
            brand: 'Daikin',
            model: 'FVQ36AV4A',
            serialNumber: 'SN-AC-2021-007',
            patrimonyNumber: 'PAT-003',
            purchaseValue: 12500.00,
            purchaseDate: new Date('2021-06-20'),
            status: EquipmentStatus.UNDER_MAINTENANCE,
            criticality: EquipmentCriticality.HIGH,
            btus: 36000,
            voltage: '220V',
        },
    })

    const equipBomba = await prisma.equipment.upsert({
        where: { id: '00000000-0000-0000-0000-000000000043' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000043',
            companyId: company.id,
            clientId: clienteHospital.id,
            typeId: tipoInfra.id,
            locationId: locCME.id,
            currentLocationId: locCME.id,
            costCenterId: ccManutencao.id,
            name: 'Bomba d\'água — CME',
            brand: 'Grundfos',
            model: 'CM10-3',
            serialNumber: 'SN-BM-2020-003',
            patrimonyNumber: 'PAT-004',
            purchaseValue: 3200.00,
            purchaseDate: new Date('2020-08-01'),
            status: EquipmentStatus.ACTIVE,
            criticality: EquipmentCriticality.MEDIUM,
            power: '2.2 kW',
            voltage: '220V',
        },
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 11. AGENDAMENTOS DE PREVENTIVA
    // ─────────────────────────────────────────────────────────────────────────
    console.log('📅 Criando agendamentos de preventiva...')

    await prisma.maintenanceSchedule.upsert({
        where: { id: '00000000-0000-0000-0000-000000000050' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000050',
            companyId: company.id,
            clientId: clienteHospital.id,
            equipmentId: equipMonitor1.id,
            groupId: grupoEletrica.id,
            assignedTechnicianId: tecnico1.id,
            title: 'Manutenção preventiva trimestral — Monitor UTI-01',
            description: 'Limpeza, calibração e verificação de alarmes',
            maintenanceType: MaintenanceType.PREVENTIVE,
            recurrenceType: RecurrenceType.QUARTERLY,
            estimatedDurationMin: 120,
            startDate: new Date('2024-01-15'),
            nextRunAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // próxima semana
            isActive: true,
        },
    })

    await prisma.maintenanceSchedule.upsert({
        where: { id: '00000000-0000-0000-0000-000000000051' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000051',
            companyId: company.id,
            clientId: clienteHospital.id,
            equipmentId: equipAC.id,
            groupId: grupoEletrica.id,
            title: 'Preventiva semestral — AC UTI',
            description: 'Limpeza de filtros, verificação de gás e drenos',
            maintenanceType: MaintenanceType.PREVENTIVE,
            recurrenceType: RecurrenceType.SEMIANNUAL,
            estimatedDurationMin: 180,
            startDate: new Date('2024-03-01'),
            nextRunAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // próximo mês
            isActive: true,
        },
    })

    // ─────────────────────────────────────────────────────────────────────────
    // 12. ORDENS DE SERVIÇO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('📋 Criando ordens de serviço...')

    // OS 1 — Concluída e aprovada (histórico)
    const os1 = await prisma.serviceOrder.upsert({
        where: { companyId_number: { companyId: company.id, number: 1 } },
        update: {},
        create: {
            companyId: company.id,
            clientId: clienteHospital.id,
            equipmentId: equipMonitor2.id,
            groupId: grupoEletrica.id,
            requesterId: clientUser.id,
            approvedById: clientAdmin.id,
            number: 1,
            title: 'Substituição de sensor de SpO2',
            description: 'Sensor de oximetria com leituras inconsistentes. Necessária substituição.',
            maintenanceType: MaintenanceType.CORRECTIVE,
            status: ServiceOrderStatus.COMPLETED_APPROVED,
            priority: ServiceOrderPriority.HIGH,
            resolution: 'Sensor de SpO2 substituído. Equipamento testado e calibrado. Leituras normalizadas.',
            isAvailable: false,
            alertAfterHours: 2,
            startedAt: new Date('2026-03-10T08:00:00Z'),
            completedAt: new Date('2026-03-10T10:30:00Z'),
            approvedAt: new Date('2026-03-10T14:00:00Z'),
        },
    })

    await prisma.serviceOrderTechnician.upsert({
        where: { serviceOrderId_technicianId: { serviceOrderId: os1.id, technicianId: tecnico1.id } },
        update: {},
        create: {
            serviceOrderId: os1.id,
            technicianId: tecnico1.id,
            role: ServiceOrderTechnicianRole.LEAD,
            assumedAt: new Date('2026-03-10T08:00:00Z'),
        },
    })

    await prisma.serviceOrderStatusHistory.createMany({
        skipDuplicates: true,
        data: [
            { serviceOrderId: os1.id, toStatus: 'OPEN', changedById: clientUser.id },
            { serviceOrderId: os1.id, fromStatus: 'OPEN', toStatus: 'IN_PROGRESS', changedById: tecnico1.id },
            { serviceOrderId: os1.id, fromStatus: 'IN_PROGRESS', toStatus: 'COMPLETED', changedById: tecnico1.id },
            { serviceOrderId: os1.id, fromStatus: 'COMPLETED', toStatus: 'COMPLETED_APPROVED', changedById: clientAdmin.id },
        ],
    })

    // OS 2 — Em andamento com 2 técnicos
    const os2 = await prisma.serviceOrder.upsert({
        where: { companyId_number: { companyId: company.id, number: 2 } },
        update: {},
        create: {
            companyId: company.id,
            clientId: clienteHospital.id,
            equipmentId: equipAC.id,
            groupId: grupoEletrica.id,
            requesterId: clientAdmin.id,
            number: 2,
            title: 'Ar condicionado UTI não resfria adequadamente',
            description: 'AC da UTI operando com temperatura 5°C acima do setpoint. Suspeita de falta de gás refrigerante.',
            maintenanceType: MaintenanceType.CORRECTIVE,
            status: ServiceOrderStatus.IN_PROGRESS,
            priority: ServiceOrderPriority.URGENT,
            isAvailable: false,
            alertAfterHours: 1,
            startedAt: new Date(),
        },
    })

    await prisma.serviceOrderTechnician.upsert({
        where: { serviceOrderId_technicianId: { serviceOrderId: os2.id, technicianId: tecnico1.id } },
        update: {},
        create: {
            serviceOrderId: os2.id,
            technicianId: tecnico1.id,
            role: ServiceOrderTechnicianRole.LEAD,
            assumedAt: new Date(),
        },
    })

    await prisma.serviceOrderTechnician.upsert({
        where: { serviceOrderId_technicianId: { serviceOrderId: os2.id, technicianId: tecnico2.id } },
        update: {},
        create: {
            serviceOrderId: os2.id,
            technicianId: tecnico2.id,
            role: ServiceOrderTechnicianRole.ASSISTANT,
        },
    })

    await prisma.serviceOrderComment.create({
        data: {
            serviceOrderId: os2.id,
            authorId: tecnico1.id,
            content: 'Verificamos nível de gás R410A — abaixo do mínimo. Aguardando material para recarga.',
            isInternal: false,
        },
    }).catch(() => null)

    // OS 3 — No painel (AWAITING_PICKUP)
    const os3 = await prisma.serviceOrder.upsert({
        where: { companyId_number: { companyId: company.id, number: 3 } },
        update: {},
        create: {
            companyId: company.id,
            clientId: clienteHospital.id,
            equipmentId: equipBomba.id,
            groupId: grupoHidraulica.id,
            requesterId: clientUser.id,
            number: 3,
            title: 'Ruído anormal na bomba d\'água',
            description: 'Bomba do CME apresentando ruído metálico intermitente. Possível desgaste no rolamento.',
            maintenanceType: MaintenanceType.CORRECTIVE,
            status: ServiceOrderStatus.AWAITING_PICKUP,
            priority: ServiceOrderPriority.MEDIUM,
            isAvailable: true,
            alertAfterHours: 4,
        },
    })

    // OS 4 — Aberta com técnico designado
    const os4 = await prisma.serviceOrder.upsert({
        where: { companyId_number: { companyId: company.id, number: 4 } },
        update: {},
        create: {
            companyId: company.id,
            clientId: clienteHospital.id,
            equipmentId: equipMonitor1.id,
            groupId: grupoEletrica.id,
            requesterId: clientAdmin.id,
            number: 4,
            title: 'Revisão preventiva trimestral — Monitor UTI-01',
            description: 'Manutenção preventiva programada conforme cronograma. Limpeza, calibração e verificação de alarmes.',
            maintenanceType: MaintenanceType.PREVENTIVE,
            status: ServiceOrderStatus.OPEN,
            priority: ServiceOrderPriority.MEDIUM,
            isAvailable: false,
            scheduledFor: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 dias
            alertAfterHours: 8,
        },
    })

    await prisma.serviceOrderTechnician.upsert({
        where: { serviceOrderId_technicianId: { serviceOrderId: os4.id, technicianId: tecnico1.id } },
        update: {},
        create: {
            serviceOrderId: os4.id,
            technicianId: tecnico1.id,
            role: ServiceOrderTechnicianRole.LEAD,
        },
    })

    // Tasks da OS 4 (kanban)
    await prisma.serviceOrderTask.createMany({
        skipDuplicates: true,
        data: [
            { serviceOrderId: os4.id, title: 'Desligar equipamento e desconectar cabos', status: 'TODO', position: 0 },
            { serviceOrderId: os4.id, title: 'Limpeza interna com ar comprimido', status: 'TODO', position: 1 },
            { serviceOrderId: os4.id, title: 'Verificar e calibrar sensores', status: 'TODO', position: 2 },
            { serviceOrderId: os4.id, title: 'Testar alarmes e notificações', status: 'TODO', position: 3 },
            { serviceOrderId: os4.id, title: 'Documentar resultado e assinar laudo', status: 'TODO', position: 4 },
        ],
    })

    // ─────────────────────────────────────────────────────────────────────────
    // RESUMO FINAL
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n✅ Seed concluído com sucesso!\n')
    console.log('━'.repeat(55))
    console.log('📌 CREDENCIAIS DE ACESSO\n')
    console.log('👑 Super Admin')
    console.log('   Email:  super@manutencao.app')
    console.log('   Senha:  Super@123\n')
    console.log('🏢 Company Admin (Aria Engenharia)')
    console.log('   Email:  admin@ariaengenharia.com')
    console.log('   Senha:  Admin@123\n')
    console.log('📊 Gerente')
    console.log('   Email:  gerente@ariaengenharia.com')
    console.log('   Senha:  Gerente@123\n')
    console.log('🔧 Técnicos')
    console.log('   Email:  joao.tecnico@ariaengenharia.com')
    console.log('   Email:  maria.tecnica@ariaengenharia.com')
    console.log('   Email:  pedro.tecnico@ariaengenharia.com')
    console.log('   Senha:  Tecnico@123\n')
    console.log('🏥 Cliente Admin (Hospital São Lucas)')
    console.log('   Email:  admin@saolucas.com.br')
    console.log('   Senha:  Cliente@123\n')
    console.log('👤 Cliente User')
    console.log('   Email:  solicitante@saolucas.com.br')
    console.log('   Senha:  Cliente@123\n')
    console.log('━'.repeat(55))
    console.log('📋 DADOS CRIADOS\n')
    console.log('   1 Platform    |  1 Company    |  2 Clients')
    console.log('   8 Users       |  3 Grupos     |  4 Equipamentos')
    console.log('   2 Schedules   |  4 OS         |  5 Tasks')
    console.log('━'.repeat(55))
}

main()
    .catch((e) => {
        console.error('❌ Erro no seed:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })