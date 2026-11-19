import type { ApiClient } from "./client";

export function createHrApi(client: ApiClient) {
  const post = (name: string, body: Record<string, unknown> = {}) => client.callMethod(`aimatichr.hr_mobile.api.${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    getContext: () => post("get_context"),
    getLeaveSummary: () => post("get_leave_summary"),
    getPayslips: () => post("get_payslips"),
    getDirectory: (query = "") => post("get_directory", { query }),
    getTeam: () => post("get_team"),
    getRequests: () => post("get_requests"),
    getApprovals: () => post("get_approvals"),
    getRecentCheckins: () => post("get_recent_checkins"),
    getAttendanceCalendar: (month: string) => post("get_attendance_calendar", { month }),
    getCheckinLocation: () => post("get_checkin_location"),
    getFormOptions: () => post("get_form_options"),
    requestCheckinChallenge: () => post("request_checkin_challenge"),
    submitAttendance: (body: Record<string, unknown>) => post("submit_attendance", body),
    createLeaveApplication: (body: Record<string, unknown>) => post("create_leave_application", body),
    createAttendanceRequest: (body: Record<string, unknown>) => post("create_attendance_request", body),
    getFacePolicy: () => post("get_face_policy"),
    enrollFace: (body: Record<string, unknown>) => post("enroll_face", body),
    revokeFace: (body: Record<string, unknown>) => post("revoke_face", body),
  };
}
