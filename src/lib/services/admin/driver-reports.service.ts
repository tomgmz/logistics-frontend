import authApi, { initCsrf } from '../../api/auth.api'
import type { DriverReport, IncidentType, ReportStatus } from '@/app/types/driver-report.types'

/**
 * The staff side of the driver Reports module (Company Administrator,
 * Operations Manager, and the Fleet Manager — who is served vehicle-related
 * reports only, by the server). Reads are gated by the `reports` module's can_view,
 * acknowledging/resolving by can_edit, and each write takes the report's
 * record lock on the server.
 */

const BASE = '/admin/driver-reports'

export async function fetchDriverReports(status?: ReportStatus | null): Promise<DriverReport[]> {
  const { data } = await authApi.get<{ data: DriverReport[] }>(BASE, {
    params: status ? { status } : undefined,
  })
  return data?.data ?? []
}

export async function fetchDriverReport(reportId: string): Promise<DriverReport> {
  const { data } = await authApi.get<{ data: DriverReport }>(`${BASE}/${reportId}`)
  return data.data
}

export async function setDriverReportStatus(
  reportId: string,
  status: Exclude<ReportStatus, 'reported'>,
  resolutionNote?: string | null,
): Promise<DriverReport> {
  await initCsrf()
  const { data } = await authApi.patch<{ data: DriverReport }>(`${BASE}/${reportId}/status`, {
    status,
    resolution_note: resolutionNote?.trim() || null,
  })
  return data.data
}

/**
 * Name what an "Unspecified Emergency" was. Company Administrator / Operations
 * Manager only; refused (409) once a report has a type. Classifying it as a
 * breakdown or accident brings it into the fleet manager's view.
 */
export async function classifyDriverReport(reportId: string, incidentType: IncidentType): Promise<DriverReport> {
  await initCsrf()
  const { data } = await authApi.patch<{ data: DriverReport }>(`${BASE}/${reportId}/classify`, {
    incident_type: incidentType,
  })
  return data.data
}
