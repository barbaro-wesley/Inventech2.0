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

  // ─────────────────────────────────────────
  // RELATÓRIO DE EQUIPAMENTOS
  // ─────────────────────────────────────────
  async getEquipmentData(companyId: string, filters: { clientId?: string; status?: string; typeId?: string }) {
  return this.prisma.equipment.findMany({
    where: {
      companyId,
      deletedAt: null,
      ...(filters.clientId && { clientId: filters.clientId }),
      ...(filters.status && { status: filters.status as any }),
      ...(filters.typeId && { typeId: filters.typeId }),
    },
    select: {
      patrimonyNumber: true,
      serialNumber: true,
      name: true,
      brand: true,
      model: true,
      status: true,
      criticality: true,
      purchaseValue: true,
      purchaseDate: true,
      warrantyEnd: true,
      currentValue: true,
      voltage: true,
      observations: true,
      client: { select: { name: true } },
      location: { select: { name: true } },
      type: { select: { name: true } },
      subtype: { select: { name: true } },
      costCenter: { select: { name: true, code: true } },
    },
    orderBy: [{ client: { name: 'asc' } }, { name: 'asc' }],
  })
}

  async exportEquipmentExcel(companyId: string, filters: { clientId?: string; status?: string }): Promise < Buffer > {
  const ExcelJS = await import('exceljs')
    const [items, template] = await Promise.all([
    this.getEquipmentData(companyId, filters),
    this.companiesService.getReportTemplate(companyId),
  ])

    const workbook = new ExcelJS.default.Workbook()
    workbook.creator = template.companyName

    const sheet = workbook.addWorksheet('Inventário de Equipamentos', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  })

    const headerStyle: Partial<import('exceljs').Style> = {
  font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + template.primaryColor.replace('#', '') } },
  alignment: { horizontal: 'center', vertical: 'middle' },
}

sheet.columns = [
  { header: 'Patrimônio', key: 'patrimony', width: 14 },
  { header: 'Nº Série', key: 'serial', width: 16 },
  { header: 'Nome', key: 'name', width: 32 },
  { header: 'Marca / Modelo', key: 'brand', width: 22 },
  { header: 'Tipo', key: 'type', width: 18 },
  { header: 'Cliente', key: 'client', width: 22 },
  { header: 'Local', key: 'location', width: 20 },
  { header: 'Centro Custo', key: 'cc', width: 18 },
  { header: 'Status', key: 'status', width: 16 },
  { header: 'Criticidade', key: 'criticality', width: 12 },
  { header: 'Vlr. Compra', key: 'purchase', width: 14 },
  { header: 'Vlr. Atual', key: 'current', width: 14 },
  { header: 'Dt. Compra', key: 'purchaseDate', width: 12 },
  { header: 'Garantia até', key: 'warranty', width: 12 },
]

sheet.getRow(1).height = 28
sheet.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle))

const statusLabels: Record<string, string> = {
  ACTIVE: 'Ativo', INACTIVE: 'Inativo',
  UNDER_MAINTENANCE: 'Em manutenção', SCRAPPED: 'Descartado', BORROWED: 'Emprestado',
}
const critLabels: Record<string, string> = {
  LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica',
}
const fmt = (d: Date | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '-'
const fmtMoney = (v: any) => v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'

items.forEach((eq, idx) => {
  const row = sheet.addRow({
    patrimony: eq.patrimonyNumber ?? '-',
    serial: eq.serialNumber ?? '-',
    name: eq.name,
    brand: [eq.brand, eq.model].filter(Boolean).join(' / ') || '-',
    type: [eq.type?.name, eq.subtype?.name].filter(Boolean).join(' › ') || '-',
    client: eq.client?.name ?? '-',
    location: eq.location?.name ?? '-',
    cc: eq.costCenter ? `${eq.costCenter.code ? eq.costCenter.code + ' — ' : ''}${eq.costCenter.name}` : '-',
    status: statusLabels[eq.status] ?? eq.status,
    criticality: critLabels[eq.criticality] ?? eq.criticality,
    purchase: fmtMoney(eq.purchaseValue),
    current: fmtMoney(eq.currentValue),
    purchaseDate: fmt(eq.purchaseDate),
    warranty: fmt(eq.warrantyEnd),
  })

  if (idx % 2 === 0) {
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + template.secondaryColor.replace('#', '') } }
    })
  }
  row.height = 18

  // Criticidade colorida
  const critCell = row.getCell(10)
  const critColors: Record<string, string> = {
    'Crítica': 'FFDC2626', 'Alta': 'FFD97706', 'Média': 'FF2563EB', 'Baixa': 'FF16A34A',
  }
  const c = critColors[critCell.value as string]
  if (c) critCell.font = { bold: true, color: { argb: c } }

  // Equipamentos em manutenção ou descartados em vermelho
  if (['Em manutenção', 'Descartado'].includes(row.getCell(9).value as string)) {
    row.getCell(9).font = { bold: true, color: { argb: 'FFDC2626' } }
  }
})

const totalRow = sheet.addRow([`${template.companyName} — Total: ${items.length} equipamento(s)`, ...Array(13).fill('')])
totalRow.font = { bold: true, italic: true }
totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + template.secondaryColor.replace('#', '') } }

sheet.autoFilter = { from: 'A1', to: 'N1' }
sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]

const buffer = await workbook.xlsx.writeBuffer()
return Buffer.from(buffer)
  }

  async exportEquipmentPdf(companyId: string, filters: { clientId?: string; status?: string }): Promise < Buffer > {
  const PDFDocument = (await import('pdfkit')).default
    const [items, template] = await Promise.all([
    this.getEquipmentData(companyId, filters),
    this.companiesService.getReportTemplate(companyId),
  ])

    return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 40, bottom: 40, left: 40, right: 40 } })
    const buffers: Buffer[] = []
    doc.on('data', (c: Buffer) => buffers.push(c))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    const W = doc.page.width - 80
    const blue = template.primaryColor
    const gray = '#6B7280'
    const dateStr = new Date().toLocaleDateString('pt-BR')

    const statusLabels: Record<string, string> = {
      ACTIVE: 'Ativo', INACTIVE: 'Inativo', UNDER_MAINTENANCE: 'Em manut.',
      SCRAPPED: 'Descartado', BORROWED: 'Emprestado',
    }
    const critLabels: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica' }
    const fmt = (d: Date | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '-'

    doc.rect(40, 40, W, 50).fill(blue)
    doc.fillColor('white').fontSize(16).font('Helvetica-Bold')
      .text(template.headerTitle || 'Inventário de Equipamentos', 55, 52)
    doc.fontSize(9).font('Helvetica')
      .text(`${template.companyName} — Gerado em: ${dateStr} — Total: ${items.length} equipamento(s)`, 55, 74)

    doc.moveDown(2)

    const cols = [
      { label: 'Patrimônio', w: 70 }, { label: 'Nome', w: 170 },
      { label: 'Marca/Modelo', w: 100 }, { label: 'Cliente', w: 100 },
      { label: 'Local', w: 90 }, { label: 'Status', w: 70 },
      { label: 'Criticidade', w: 65 }, { label: 'Garantia', w: 65 },
    ]

    let x = 40
    let y = doc.y

    doc.rect(40, y, W, 20).fill(template.secondaryColor)
    doc.fillColor(blue).fontSize(8).font('Helvetica-Bold')
    cols.forEach((col) => {
      doc.text(col.label, x + 3, y + 6, { width: col.w - 6, ellipsis: true })
      x += col.w
    })

    y += 20
    let rowIdx = 0

    items.forEach((eq) => {
      if (y > doc.page.height - 80) { doc.addPage(); y = 40; rowIdx = 0 }

      const rowH = 18
      doc.rect(40, y, W, rowH).fill(rowIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC').stroke('#E2E8F0')
      doc.fillColor('#1F2937').fontSize(7.5).font('Helvetica')
      x = 40

      const cells = [
        eq.patrimonyNumber ?? '-',
        eq.name,
        [eq.brand, eq.model].filter(Boolean).join(' ') || '-',
        eq.client?.name ?? '-',
        eq.location?.name ?? '-',
        statusLabels[eq.status] ?? '-',
        critLabels[eq.criticality] ?? '-',
        fmt(eq.warrantyEnd),
      ]

      cells.forEach((text, i) => {
        doc.text(String(text), x + 3, y + 5, { width: cols[i].w - 6, ellipsis: true, lineBreak: false })
        x += cols[i].w
      })

      y += rowH
      rowIdx++
    })

    doc.fillColor(gray).fontSize(8)
      .text([template.footerText].filter(Boolean).join(' — '), 40, y + 10)

    doc.end()
  })
}

  // ─────────────────────────────────────────
  // RELATÓRIO DE PREVENTIVAS
  // ─────────────────────────────────────────
  async getPreventiveData(companyId: string, filters: { clientId?: string; isActive?: boolean }) {
  return this.prisma.maintenanceSchedule.findMany({
    where: {
      companyId,
      ...(filters.clientId && { clientId: filters.clientId }),
      ...(filters.isActive !== undefined && { isActive: filters.isActive }),
    },
    select: {
      title: true,
      maintenanceType: true,
      recurrenceType: true,
      customIntervalDays: true,
      estimatedDurationMin: true,
      startDate: true,
      endDate: true,
      nextRunAt: true,
      lastRunAt: true,
      isActive: true,
      client: { select: { name: true } },
      equipment: { select: { name: true, brand: true, serialNumber: true, patrimonyNumber: true } },
      group: { select: { name: true } },
      _count: { select: { maintenances: true } },
    },
    orderBy: { nextRunAt: 'asc' },
  })
}

  async exportPreventiveExcel(companyId: string, filters: { clientId?: string; isActive?: boolean }): Promise < Buffer > {
  const ExcelJS = await import('exceljs')
    const [items, template] = await Promise.all([
    this.getPreventiveData(companyId, filters),
    this.companiesService.getReportTemplate(companyId),
  ])

    const workbook = new ExcelJS.default.Workbook()
    workbook.creator = template.companyName

    const sheet = workbook.addWorksheet('Manutenções Preventivas', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  })

    const headerStyle: Partial<import('exceljs').Style> = {
  font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + template.primaryColor.replace('#', '') } },
  alignment: { horizontal: 'center', vertical: 'middle' },
}

sheet.columns = [
  { header: 'Título', key: 'title', width: 35 },
  { header: 'Cliente', key: 'client', width: 22 },
  { header: 'Equipamento', key: 'equipment', width: 28 },
  { header: 'Grupo', key: 'group', width: 16 },
  { header: 'Tipo', key: 'type', width: 14 },
  { header: 'Recorrência', key: 'recurrence', width: 14 },
  { header: 'Próxima execução', key: 'nextRun', width: 18 },
  { header: 'Última execução', key: 'lastRun', width: 18 },
  { header: 'Duração (min)', key: 'duration', width: 14 },
  { header: 'Execuções', key: 'count', width: 11 },
  { header: 'Status', key: 'status', width: 10 },
  { header: 'Início', key: 'start', width: 12 },
  { header: 'Fim', key: 'end', width: 12 },
]

sheet.getRow(1).height = 28
sheet.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle))

const recurrenceLabels: Record<string, string> = {
  DAILY: 'Diária', WEEKLY: 'Semanal', BIWEEKLY: 'Quinzenal', MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral', SEMIANNUAL: 'Semestral', ANNUAL: 'Anual', CUSTOM: 'Personalizada',
}
const typeLabels: Record<string, string> = {
  PREVENTIVE: 'Preventiva', CORRECTIVE: 'Corretiva', INITIAL_ACCEPTANCE: 'Aceitação',
  EXTERNAL_SERVICE: 'Ext.', TECHNOVIGILANCE: 'Tecnovig.', TRAINING: 'Treinamento',
}
const fmt = (d: Date | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '-'

const now = new Date()

items.forEach((s, idx) => {
  const isOverdue = s.isActive && s.nextRunAt < now
  const row = sheet.addRow({
    title: s.title,
    client: s.client?.name ?? '-',
    equipment: [s.equipment?.name, s.equipment?.brand].filter(Boolean).join(' — '),
    group: s.group?.name ?? '-',
    type: typeLabels[s.maintenanceType] ?? s.maintenanceType,
    recurrence: s.recurrenceType === 'CUSTOM'
      ? `A cada ${s.customIntervalDays} dia(s)`
      : recurrenceLabels[s.recurrenceType] ?? s.recurrenceType,
    nextRun: fmt(s.nextRunAt),
    lastRun: fmt(s.lastRunAt),
    duration: s.estimatedDurationMin ?? '-',
    count: s._count.maintenances,
    status: s.isActive ? 'Ativo' : 'Inativo',
    start: fmt(s.startDate),
    end: fmt(s.endDate),
  })

  if (idx % 2 === 0) {
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + template.secondaryColor.replace('#', '') } }
    })
  }
  row.height = 18

  // Próxima execução em vermelho se atrasada
  if (isOverdue) {
    row.getCell(7).font = { bold: true, color: { argb: 'FFDC2626' } }
  }
  // Status colorido
  row.getCell(11).font = {
    bold: true,
    color: { argb: s.isActive ? 'FF16A34A' : 'FF6B7280' },
  }
})

const overdueCount = items.filter((s) => s.isActive && s.nextRunAt < now).length

const totalRow = sheet.addRow([
  `${template.companyName} — Total: ${items.length} | Atrasadas: ${overdueCount}`,
  ...Array(12).fill(''),
])
totalRow.font = { bold: true, italic: true }
totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + template.secondaryColor.replace('#', '') } }
if (overdueCount > 0) totalRow.getCell(1).font = { bold: true, color: { argb: 'FFDC2626' } }

sheet.autoFilter = { from: 'A1', to: 'M1' }
sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]

const buffer = await workbook.xlsx.writeBuffer()
return Buffer.from(buffer)
  }

  async exportPreventivePdf(companyId: string, filters: { clientId?: string; isActive?: boolean }): Promise < Buffer > {
  const PDFDocument = (await import('pdfkit')).default
    const [items, template] = await Promise.all([
    this.getPreventiveData(companyId, filters),
    this.companiesService.getReportTemplate(companyId),
  ])

    return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 40, bottom: 40, left: 40, right: 40 } })
    const buffers: Buffer[] = []
    doc.on('data', (c: Buffer) => buffers.push(c))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    const W = doc.page.width - 80
    const blue = template.primaryColor
    const gray = '#6B7280'
    const dateStr = new Date().toLocaleDateString('pt-BR')
    const now = new Date()
    const overdueCount = items.filter((s) => s.isActive && s.nextRunAt < now).length

    const recurrenceLabels: Record<string, string> = {
      DAILY: 'Diária', WEEKLY: 'Semanal', BIWEEKLY: 'Quinzenal', MONTHLY: 'Mensal',
      QUARTERLY: 'Trimestral', SEMIANNUAL: 'Semestral', ANNUAL: 'Anual', CUSTOM: 'Custom',
    }
    const fmt = (d: Date | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '-'

    doc.rect(40, 40, W, 50).fill(blue)
    doc.fillColor('white').fontSize(16).font('Helvetica-Bold')
      .text(template.headerTitle || 'Manutenções Preventivas', 55, 52)
    doc.fontSize(9).font('Helvetica')
      .text(`${template.companyName} — ${dateStr} — Total: ${items.length} | Atrasadas: ${overdueCount}`, 55, 74)

    doc.moveDown(2)

    const cols = [
      { label: 'Título', w: 180 }, { label: 'Cliente', w: 100 },
      { label: 'Equipamento', w: 130 }, { label: 'Recorrência', w: 80 },
      { label: 'Próxima exec.', w: 80 }, { label: 'Última exec.', w: 80 },
      { label: 'Status', w: 80 },
    ]

    let x = 40
    let y = doc.y

    doc.rect(40, y, W, 20).fill(template.secondaryColor)
    doc.fillColor(blue).fontSize(8).font('Helvetica-Bold')
    cols.forEach((col) => {
      doc.text(col.label, x + 3, y + 6, { width: col.w - 6, ellipsis: true })
      x += col.w
    })

    y += 20
    let rowIdx = 0

    items.forEach((s) => {
      if (y > doc.page.height - 80) { doc.addPage(); y = 40; rowIdx = 0 }

      const rowH = 18
      const isOverdue = s.isActive && s.nextRunAt < now
      doc.rect(40, y, W, rowH).fill(rowIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC').stroke('#E2E8F0')
      doc.fillColor(isOverdue ? '#DC2626' : '#1F2937').fontSize(7.5).font(isOverdue ? 'Helvetica-Bold' : 'Helvetica')
      x = 40

      const cells = [
        s.title,
        s.client?.name ?? '-',
        s.equipment?.name ?? '-',
        recurrenceLabels[s.recurrenceType] ?? s.recurrenceType,
        fmt(s.nextRunAt),
        fmt(s.lastRunAt),
        s.isActive ? 'Ativo' : 'Inativo',
      ]

      cells.forEach((text, i) => {
        doc.text(String(text), x + 3, y + 5, { width: cols[i].w - 6, ellipsis: true, lineBreak: false })
        x += cols[i].w
      })

      y += rowH
      rowIdx++
    })

    doc.fillColor(gray).fontSize(8)
      .text([template.footerText, overdueCount > 0 ? `⚠️ ${overdueCount} preventiva(s) atrasada(s)` : ''].filter(Boolean).join(' — '), 40, y + 10)

    doc.end()
  })
}
}