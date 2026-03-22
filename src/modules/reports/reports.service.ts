import { Injectable } from '@nestjs/common'
import { ServiceOrderStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { CompaniesService } from '../companies/companies.service'

// Tipos de filtro para os relatórios

export interface ReportTemplate {
  companyName: string
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
  headerTitle: string
  footerText: string
  email: string
  phone: string
}

export interface ReportFilters {
  clientId?: string
  groupId?: string
  technicianId?: string
  status?: ServiceOrderStatus
  dateFrom?: string
  dateTo?: string
}

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private companiesService: CompaniesService,
  ) { }

  // ─────────────────────────────────────────
  // Busca dados das OS para os relatórios
  // ─────────────────────────────────────────
  async getServiceOrdersData(companyId: string, filters: ReportFilters) {
    const where: any = {
      companyId,
      deletedAt: null,
      ...(filters.clientId && { clientId: filters.clientId }),
      ...(filters.groupId && { groupId: filters.groupId }),
      ...(filters.status && { status: filters.status }),
      ...((filters.dateFrom || filters.dateTo) && {
        createdAt: {
          ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
          ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
        },
      }),
      ...(filters.technicianId && {
        technicians: { some: { technicianId: filters.technicianId } },
      }),
    }

    return this.prisma.serviceOrder.findMany({
      where,
      select: {
        number: true,
        title: true,
        maintenanceType: true,
        status: true,
        priority: true,
        resolution: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        approvedAt: true,
        client: { select: { name: true } },
        equipment: { select: { name: true, brand: true, model: true, serialNumber: true } },
        group: { select: { name: true } },
        requester: { select: { name: true } },
        technicians: {
          where: { releasedAt: null },
          select: { role: true, technician: { select: { name: true } } },
        },
      },
      orderBy: { number: 'asc' },
    })
  }

  // ─────────────────────────────────────────
  // Gera Excel (XLSX) das OS
  // ─────────────────────────────────────────
  async exportServiceOrdersExcel(companyId: string, filters: ReportFilters): Promise<Buffer> {
    const ExcelJS = await import('exceljs')
    const [orders, template] = await Promise.all([
      this.getServiceOrdersData(companyId, filters),
      this.companiesService.getReportTemplate(companyId),
    ])

    const workbook = new ExcelJS.default.Workbook()
    workbook.creator = template.companyName || 'Sistema de Manutenção'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Ordens de Serviço', {
      pageSetup: { paperSize: 9, orientation: 'landscape' },
    })

    // ── Cabeçalho com estilo ──
    const headerStyle: Partial<import('exceljs').Style> = {
      font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + template.primaryColor.replace('#', '') } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: {
        bottom: { style: 'thin', color: { argb: 'FF93C5FD' } },
      },
    }

    const columns = [
      { header: 'Nº OS', key: 'number', width: 8 },
      { header: 'Título', key: 'title', width: 35 },
      { header: 'Cliente', key: 'client', width: 25 },
      { header: 'Equipamento', key: 'equipment', width: 28 },
      { header: 'Tipo', key: 'type', width: 18 },
      { header: 'Grupo', key: 'group', width: 15 },
      { header: 'Status', key: 'status', width: 18 },
      { header: 'Prioridade', key: 'priority', width: 12 },
      { header: 'Técnico(s)', key: 'technicians', width: 25 },
      { header: 'Solicitante', key: 'requester', width: 20 },
      { header: 'Criada em', key: 'createdAt', width: 16 },
      { header: 'Iniciada em', key: 'startedAt', width: 16 },
      { header: 'Concluída em', key: 'completedAt', width: 16 },
      { header: 'Tempo (h)', key: 'hours', width: 11 },
      { header: 'Resolução', key: 'resolution', width: 40 },
    ]

    sheet.columns = columns
    sheet.getRow(1).height = 28

    // Aplica estilo no cabeçalho
    sheet.getRow(1).eachCell((cell) => {
      Object.assign(cell, headerStyle)
    })

    const statusLabels: Record<string, string> = {
      OPEN: 'Aberta',
      AWAITING_PICKUP: 'Aguard. técnico',
      IN_PROGRESS: 'Em andamento',
      COMPLETED: 'Concluída',
      COMPLETED_APPROVED: 'Aprovada',
      COMPLETED_REJECTED: 'Reprovada',
      CANCELLED: 'Cancelada',
    }

    const typeLabels: Record<string, string> = {
      PREVENTIVE: 'Preventiva',
      CORRECTIVE: 'Corretiva',
      INITIAL_ACCEPTANCE: 'Aceitação inicial',
      EXTERNAL_SERVICE: 'Serviço externo',
      TECHNOVIGILANCE: 'Tecnovigilância',
      TRAINING: 'Treinamento',
      IMPROPER_USE: 'Uso inadequado',
      DEACTIVATION: 'Desativação',
    }

    const priorityLabels: Record<string, string> = {
      LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', URGENT: 'Urgente',
    }

    const fmt = (d: Date | null) => d
      ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : '-'

    const calcHours = (start: Date | null, end: Date | null) => {
      if (!start || !end) return '-'
      const h = (new Date(end).getTime() - new Date(start).getTime()) / 3600000
      return h.toFixed(1)
    }

    // ── Dados ──
    orders.forEach((os, idx) => {
      const row = sheet.addRow({
        number: os.number,
        title: os.title,
        client: os.client?.name ?? '-',
        equipment: [os.equipment?.name, os.equipment?.brand, os.equipment?.model]
          .filter(Boolean).join(' — '),
        type: typeLabels[os.maintenanceType] ?? os.maintenanceType,
        group: os.group?.name ?? '-',
        status: statusLabels[os.status] ?? os.status,
        priority: priorityLabels[os.priority] ?? os.priority,
        technicians: os.technicians.map((t) =>
          `${t.technician.name}${t.role === 'LEAD' ? ' (L)' : ''}`
        ).join(', ') || '-',
        requester: os.requester?.name ?? '-',
        createdAt: fmt(os.createdAt),
        startedAt: fmt(os.startedAt),
        completedAt: fmt(os.completedAt),
        hours: calcHours(os.startedAt, os.completedAt),
        resolution: os.resolution ?? '-',
      })

      // Zebra striping
      if (idx % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } }
        })
      }

      row.height = 18

      // Cor por status na coluna status (col 7)
      const statusCell = row.getCell(7)
      const statusColors: Record<string, string> = {
        'Aprovada': 'FF16A34A',
        'Concluída': 'FF2563EB',
        'Em andamento': 'FFD97706',
        'Aguard. técnico': 'FF9333EA',
        'Reprovada': 'FFDC2626',
        'Cancelada': 'FF6B7280',
        'Aberta': 'FF374151',
      }
      const color = statusColors[statusCell.value as string]
      if (color) {
        statusCell.font = { bold: true, color: { argb: color } }
      }
    })

    // ── Linha de total ──
    const totalRow = sheet.addRow([
      `${template.companyName} — Total: ${orders.length} OS`, '', '', '', '', '', '', '', '', '', '', '', '', '', '',
    ])
    totalRow.font = { bold: true, italic: true }
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + template.secondaryColor.replace('#', '') } }

    // ── Auto-filtro e freeze ──
    sheet.autoFilter = { from: 'A1', to: 'O1' }
    sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]

    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer)
  }

  // ─────────────────────────────────────────
  // Gera PDF das OS usando HTML → puppeteer-like (sem deps pesadas)
  // Usamos uma abordagem leve com html-pdf ou PDFKit
  // ─────────────────────────────────────────
  async exportServiceOrdersPdf(companyId: string, filters: ReportFilters): Promise<Buffer> {
    const PDFDocument = (await import('pdfkit')).default
    const [orders, template] = await Promise.all([
      this.getServiceOrdersData(companyId, filters),
      this.companiesService.getReportTemplate(companyId),
    ])

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
      })

      const buffers: Buffer[] = []
      doc.on('data', (chunk: Buffer) => buffers.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(buffers)))
      doc.on('error', reject)

      const W = doc.page.width - 80
      const blue = template.primaryColor
      const lightBlue = template.secondaryColor
      const gray = '#6B7280'
      const dateStr = new Date().toLocaleDateString('pt-BR')

      const statusLabels: Record<string, string> = {
        OPEN: 'Aberta', AWAITING_PICKUP: 'Ag. técnico', IN_PROGRESS: 'Em andamento',
        COMPLETED: 'Concluída', COMPLETED_APPROVED: 'Aprovada',
        COMPLETED_REJECTED: 'Reprovada', CANCELLED: 'Cancelada',
      }

      const typeLabels: Record<string, string> = {
        PREVENTIVE: 'Preventiva', CORRECTIVE: 'Corretiva',
        INITIAL_ACCEPTANCE: 'Aceitação', EXTERNAL_SERVICE: 'Ext.',
        TECHNOVIGILANCE: 'Tecnovig.', TRAINING: 'Treinamento',
        IMPROPER_USE: 'Uso inad.', DEACTIVATION: 'Desativação',
      }

      const fmt = (d: Date | null) => d
        ? new Date(d).toLocaleDateString('pt-BR')
        : '-'

      // ── Cabeçalho ──
      doc.rect(40, 40, W, 50).fill(blue)
      doc.fillColor('white').fontSize(16).font('Helvetica-Bold')
        .text(template.headerTitle || 'Relatório de Ordens de Serviço', 55, 52)
      doc.fontSize(9).font('Helvetica')
        .text(`${template.companyName} — Gerado em: ${dateStr} — Total: ${orders.length} OS`, 55, 74)

      doc.moveDown(2)

      // ── Colunas da tabela ──
      const cols = [
        { label: 'Nº', w: 35 },
        { label: 'Título', w: 160 },
        { label: 'Cliente', w: 100 },
        { label: 'Tipo', w: 70 },
        { label: 'Status', w: 75 },
        { label: 'Técnico', w: 100 },
        { label: 'Criada', w: 65 },
        { label: 'Concluída', w: 65 },
      ]

      let x = 40
      let y = doc.y

      // Cabeçalho da tabela
      doc.rect(40, y, W, 20).fill(lightBlue)
      doc.fillColor(blue).fontSize(8).font('Helvetica-Bold')
      cols.forEach((col) => {
        doc.text(col.label, x + 3, y + 6, { width: col.w - 6, ellipsis: true })
        x += col.w
      })

      y += 20
      let rowIdx = 0

      orders.forEach((os) => {
        if (y > doc.page.height - 80) {
          doc.addPage()
          y = 40
          rowIdx = 0
        }

        const rowH = 18
        const bgColor = rowIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
        doc.rect(40, y, W, rowH).fill(bgColor).stroke('#E2E8F0')

        doc.fillColor('#1F2937').fontSize(7.5).font('Helvetica')
        x = 40

        const cells = [
          String(os.number),
          os.title,
          os.client?.name ?? '-',
          typeLabels[os.maintenanceType] ?? '-',
          statusLabels[os.status] ?? '-',
          os.technicians[0]?.technician.name ?? '-',
          fmt(os.createdAt),
          fmt(os.completedAt),
        ]

        cells.forEach((text, i) => {
          doc.text(text, x + 3, y + 5, {
            width: cols[i].w - 6,
            ellipsis: true,
            lineBreak: false,
          })
          x += cols[i].w
        })

        y += rowH
        rowIdx++
      })

      // ── Rodapé ──
      doc.fillColor(gray).fontSize(8)
        .text(
          [
            template.footerText,
            filters.dateFrom || filters.dateTo
              ? `Período: ${[filters.dateFrom, filters.dateTo].filter(Boolean).join(' a ')}`
              : null,
          ].filter(Boolean).join(' — '),
          40, y + 10,
        )

      doc.end()
    })
  }
}