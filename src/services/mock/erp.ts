import type { ErpService, ErpStudent } from "../types";
import { ERP_STUDENTS } from "./data/erp-students";
import { placeholderPortrait } from "@/lib/placeholder-image";
import { simulateLatency } from "./latency";

export const mockErpService: ErpService = {
  async findStudentByPrn(prn) {
    await simulateLatency();
    const r = ERP_STUDENTS.find((s) => s.prn === prn.trim().toUpperCase());
    if (!r) return null;
    const student: ErpStudent = { prn: r.prn, name: r.name, dob: r.dob, gender: r.gender, phone: r.phone, email: r.email, course: r.course, year: r.year, schoolCode: schoolCodeFor(r.course) };
    return student;
  },
  async findStudentByEmail(email) {
    const r = ERP_STUDENTS.find((s) => s.email.toLowerCase() === email.trim().toLowerCase());
    return r ? this.findStudentByPrn(r.prn) : null;
  },
  async getStudentPhoto(prn) {
    const r = ERP_STUDENTS.find((s) => s.prn === prn.trim().toUpperCase());
    if (!r) return null;
    return { data: placeholderPortrait(r.demoAadhaar, "official"), mimeType: "image/png", fileName: "erp-photo.png" };
  },
};

/** The mock ERP derives the school from the course name; a real ERP returns it directly. */
export function schoolCodeFor(course: string): string {
  const c = course.toLowerCase();
  if (c.includes("computer")) return "CSE";
  if (c.includes("pharm")) return "PHA";
  if (c.includes("llb") || c.includes("law")) return "LAW";
  if (c.includes("arch") || c.includes("design")) return "DES";
  if (c.includes("bba") || c.includes("mba") || c.includes("commerce") || c.includes("b.com")) return "MGT";
  if (c.includes("b.tech") || c.includes("engineering")) return "ENG";
  if (c.includes("b.sc") || c.includes("science")) return "SCI";
  return "LA";
}
