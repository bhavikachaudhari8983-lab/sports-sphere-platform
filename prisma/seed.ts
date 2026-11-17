/* Seeds FICTIONAL demo data. Run with `npm run db:reset`. */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { SPORTS, weightClasses } from "./sports-catalog";
import { ERP_STUDENTS, type ErpRecord } from "../src/services/mock/data/erp-students";
import { DIGILOCKER_ACCOUNTS } from "../src/services/mock/data/digilocker-accounts";
import { ADMISSIONS_RECORDS, DEMO_PASSPORTS } from "../src/services/mock/data/international";
import { placeholderPortrait } from "../src/lib/placeholder-image";
import { samplePdf } from "../src/lib/placeholder-pdf";
import { saveFile, uploadRoot } from "../src/lib/storage";
import { indianIdentityKey, passportIdentityKey } from "../src/lib/identity";
import { buildMrzLine2 } from "../src/lib/mrz";
import { generateSportsId } from "../src/lib/qr";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import { normaliseName } from "../src/lib/utils";
import { UNIVERSITY_NAME } from "../src/lib/constants";
import { schoolCodeFor } from "../src/services/mock/erp";
import { finaliseResults, generateFixtures, recordResult, applyLiveTaps } from "../src/lib/competition";
import { issueForEvent } from "../src/lib/certificates";
import { sendAnnouncement } from "../src/lib/announcements";

const prisma = new PrismaClient();

export const DEMO_STAFF = [
  { email: "admin@sportssphere.example", name: "Asha Admin (demo)", role: "SUPER_ADMIN", password: "Admin@12345" },
  // Second admin: DOB corrections need two different admins (maker–checker).
  { email: "admin2@sportssphere.example", name: "Ravi Admin (demo)", role: "ADMIN", password: "Admin2@12345" },
  { email: "official@sportssphere.example", name: "Omar Official (demo)", role: "OFFICIAL", password: "Official@12345" },
  { email: "medical@sportssphere.example", name: "Dr. Mira Medical (demo)", role: "MEDICAL", password: "Medical@12345" },
  { email: "coach@sportssphere.example", name: "Coach Kiran (demo, Football)", role: "COACH", password: "Coach@12345", sport: "Football" },
] as const;

async function clearUploads() {
  const dir = uploadRoot();
  try {
    for (const f of await readdir(dir)) if (f !== ".gitkeep") await unlink(join(dir, f));
  } catch {
    /* folder may not exist yet */
  }
}

async function addDoc(studentId: string, type: string, source: string, data: Uint8Array, mime: string, name: string, at?: Date) {
  const storageKey = await saveFile(data, mime);
  return prisma.document.create({
    data: { studentId, type, source, storageKey, originalName: name, mimeType: mime, size: data.length, createdAt: at },
  });
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

async function main() {
  console.log("Clearing database and uploads…");
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.announcement.deleteMany(),
    prisma.certificate.deleteMany(),
    prisma.placing.deleteMany(),
    prisma.scoreEvent.deleteMany(),
    prisma.matchOfficial.deleteMany(),
    prisma.match.deleteMany(),
    prisma.court.deleteMany(),
    prisma.venue.deleteMany(),
    prisma.teamMember.deleteMany(),
    prisma.team.deleteMany(),
    prisma.reviewLock.deleteMany(),
    prisma.dobCorrection.deleteMany(),
    prisma.ageConcern.deleteMany(),
    prisma.eventChangeRequest.deleteMany(),
    prisma.weighIn.deleteMany(),
    prisma.measurement.deleteMany(),
    prisma.registration.deleteMany(),
    prisma.verificationCheck.deleteMany(),
    prisma.document.deleteMany(),
    prisma.deletionRequest.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.student.deleteMany(),
    prisma.college.deleteMany(),
    prisma.school.deleteMany(),
    prisma.campus.deleteMany(),
    prisma.staffUser.deleteMany(),
    prisma.weightCategory.deleteMany(),
    prisma.event.deleteMany(),
    prisma.tournament.deleteMany(),
    prisma.sport.deleteMany(),
    prisma.ageCategory.deleteMany(),
    prisma.otpChallenge.deleteMany(),
    prisma.setting.deleteMany(),
  ]);
  await clearUploads();

  // Settings
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) await prisma.setting.create({ data: { key, value: String(value) } });

  // Campus → schools. Codes match what the (mock) ERP returns for each course.
  const campus = await prisma.campus.create({ data: { name: "Main Campus (fictional)", code: "MAIN" } });
  const SCHOOLS: Array<[string, string]> = [
    ["ENG", "School of Engineering"], ["CSE", "School of Computer Science"], ["MGT", "School of Management"], ["DES", "School of Design"],
    ["LAW", "School of Law"], ["LA", "School of Liberal Arts"], ["PHA", "School of Pharmacy"], ["SCI", "School of Science"],
  ];
  for (const [code, name] of SCHOOLS) await prisma.school.create({ data: { campusId: campus.id, code, name } });

  // Age categories
  await prisma.ageCategory.createMany({
    data: [
      { name: "U-19", maxAge: 19, sortOrder: 1 },
      { name: "U-21", maxAge: 21, sortOrder: 2 },
      { name: "U-23", maxAge: 23, sortOrder: 3 },
      { name: "Open", maxAge: null, sortOrder: 4 },
    ],
  });

  // Sports, events, weight categories
  for (const s of SPORTS) {
    const sport = await prisma.sport.create({
      data: {
        name: s.name,
        slug: s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        isTeam: !!s.isTeam,
        isWeightCategory: !!s.weight,
        positions: s.positions ?? null,
      },
    });
    for (const e of s.events) {
      const ageCategoryId = e.age ? (await prisma.ageCategory.findUniqueOrThrow({ where: { name: e.age } })).id : null;
      await prisma.event.create({ data: { sportId: sport.id, name: e.name, gender: e.gender, eventDate: e.date, venue: e.venue, minEntries: e.min ?? null, maxEntries: e.max ?? null, ageCategoryId } });
    }
    if (s.weight) {
      for (const g of ["MALE", "FEMALE"] as const) {
        for (const wc of weightClasses(s.weight[g], !!s.weight.heavyOpen)) {
          await prisma.weightCategory.create({ data: { sportId: sport.id, gender: g, ...wc } });
        }
      }
    }
  }
  const sports = await prisma.sport.findMany({ include: { events: true, weightCategories: true } });
  const sportByName = (n: string) => {
    const s = sports.find((x) => x.name === n);
    if (!s) throw new Error(`sport ${n}`);
    return s;
  };
  const eventOf = (sport: string, gender: "MALE" | "FEMALE" | "MIXED", contains?: string) => {
    const e = sportByName(sport).events.find((ev) => ev.gender === gender && (!contains || ev.name.includes(contains)));
    if (!e) throw new Error(`event ${sport} ${gender} ${contains}`);
    return e;
  };
  const weightCat = (sport: string, gender: "MALE" | "FEMALE", name: string) => {
    const w = sportByName(sport).weightCategories.find((x) => x.gender === gender && x.name === name);
    if (!w) throw new Error(`weight ${sport} ${name}`);
    return w;
  };

  // Staff
  // Tournaments (fictional demo set-up). Every event belongs to one; registration is open for the current one.
  const day = 86_400_000;
  const current = await prisma.tournament.create({
    data: {
      name: DEFAULT_SETTINGS.meetName, slug: "sports-sphere-inter-university-games-2026", season: "2026-27",
      startDate: "2026-12-01", endDate: "2026-12-10",
      registrationOpensAt: new Date(Date.now() - 30 * day), registrationClosesAt: new Date(Date.now() + 60 * day), status: "ACTIVE",
    },
  });
  await prisma.event.updateMany({ where: { tournamentId: null }, data: { tournamentId: current.id } });
  await prisma.tournament.create({
    data: { name: "Hoop It Up 2027 (demo)", slug: "hoop-it-up-2027-demo", season: "2027-28", startDate: "2027-08-27", endDate: "2027-08-30", registrationOpensAt: new Date("2027-07-01T09:00:00+05:30"), registrationClosesAt: new Date("2027-08-15T23:59:00+05:30"), status: "DRAFT" },
  });

  const staff: Record<string, string> = {};
  for (const s of DEMO_STAFF) {
    const u = await prisma.staffUser.create({
      data: {
        email: s.email,
        name: s.name,
        role: s.role,
        passwordHash: await bcrypt.hash(s.password, 10),
        sportId: "sport" in s ? sportByName(s.sport).id : null,
      },
    });
    staff[s.role] ??= u.id;
    staff[s.email] = u.id;
  }
  staff.ADMIN = staff["admin@sportssphere.example"]; // seeded admin actions are by Asha (the super admin)

  // Colleges
  const trustedCollege = await prisma.college.create({
    data: { name: "Deccan Plateau College of Arts & Science (fictional)", normalizedName: normaliseName("Deccan Plateau College of Arts & Science (fictional)"), officeEmail: "sports@dpcas.example", trusted: true, confirmedById: staff.ADMIN, confirmedAt: daysAgo(40) },
  });
  const pendingCollege = await prisma.college.create({
    data: { name: "Western Ghats Institute of Technology (fictional)", normalizedName: normaliseName("Western Ghats Institute of Technology (fictional)"), officeEmail: "sports.office@wgit.example", trusted: false },
  });

  const erp = (prn: string): ErpRecord => {
    const r = ERP_STUDENTS.find((x) => x.prn === prn);
    if (!r) throw new Error(prn);
    return r;
  };
  const dl = (aadhaar: string) => {
    const a = DIGILOCKER_ACCOUNTS.find((x) => x.aadhaar === aadhaar);
    if (!a) throw new Error(aadhaar);
    return a;
  };

  type SeedOpts = {
    status: string;
    statusReason?: string;
    erpPrn?: string;
    aadhaar?: string;
    college?: { id: string; officeEmail: string };
    regs: Array<{ eventId: string; weightCategoryId?: string }>;
    position?: string;
    measurement?: { h: number; w: number };
    approved?: boolean;
    minorConsent?: boolean;
    conditions?: string;
    checks?: Array<{ type: string; passed: boolean; expected?: string; actual?: string; details?: string }>;
    submittedDaysAgo: number;
    wizardStep?: number;
  };

  async function seedIndian(o: SeedOpts) {
    const acct = dl(o.aadhaar ?? erp(o.erpPrn!).demoAadhaar);
    const e = o.erpPrn ? erp(o.erpPrn) : null;
    const isDraft = o.status === "DRAFT";
    const submittedAt = isDraft ? null : daysAgo(o.submittedDaysAgo);
    const sportsId = o.approved ? generateSportsId() : null;
    const student = await prisma.student.create({
      data: {
        status: o.status,
        statusReason: o.statusReason ?? null,
        studentType: e ? "OUR_INDIAN" : "OUTSIDE_INDIAN",
        isOurUniversity: !!e,
        identityKey: indianIdentityKey(acct.aadhaar.slice(-4), acct.name, acct.dob),
        fullName: acct.name,
        dob: acct.dob,
        dobSource: "DIGILOCKER",
        dobLocked: true,
        identityVerifiedAt: daysAgo(o.submittedDaysAgo + 1),
        gender: acct.gender,
        aadhaarLast4: acct.aadhaar.slice(-4),
        mobile: e?.phone ?? acct.mobile,
        mobileVerified: true,
        emailVerified: !!e,
        email: e?.email ?? `${acct.name.split(" ")[0].toLowerCase()}@mail.example`,
        address: isDraft ? null : acct.address,
        bloodGroup: isDraft ? null : ["O+", "B+", "A+", "AB+", "O-"][acct.name.length % 5],
        emergencyName: isDraft ? null : "Parent (fictional)",
        emergencyPhone: isDraft ? null : "+917000099999",
        prn: e?.prn ?? null,
        universityName: e ? UNIVERSITY_NAME : o.college ? (await prisma.college.findUniqueOrThrow({ where: { id: o.college.id } })).name : null,
        collegeId: o.college?.id ?? null,
        collegeOfficeEmail: o.college?.officeEmail ?? null,
        course: e?.course ?? "B.A. (fictional)",
        year: e?.year ?? 2,
        playingPosition: o.position ?? null,
        medicalConditions: o.conditions ?? null,
        declarationAccepted: !isDraft,
        privacyAccepted: !isDraft,
        wizardStep: o.wizardStep ?? 6,
        submittedAt,
        verifiedAt: o.measurement && o.status !== "PENDING" ? daysAgo(o.submittedDaysAgo - 1) : null,
        verifiedById: o.measurement && o.status !== "PENDING" ? staff.OFFICIAL : null,
        approvedAt: o.approved ? daysAgo(Math.max(0, o.submittedDaysAgo - 2)) : null,
        approvedById: o.approved ? staff.ADMIN : null,
        sportsId,
        createdAt: daysAgo(o.submittedDaysAgo + 1),
      },
    });
    const at = daysAgo(o.submittedDaysAgo + 1);
    await addDoc(student.id, "REFERENCE_PHOTO", "DIGILOCKER", placeholderPortrait(acct.aadhaar, "official"), "image/png", "digilocker-photo.png", at);
    await addDoc(student.id, "SELFIE", "CAMERA", placeholderPortrait(acct.aadhaar, "selfie"), "image/png", "selfie.png", at);
    await addDoc(student.id, "CLASS10", "DIGILOCKER", await samplePdf("Class X Certificate (DigiLocker mock)", [`Name: ${acct.name}`, `Date of birth: ${acct.dob}`, `Board: ${acct.class10.board}`, `Roll no: ${acct.class10.rollNo}`, `Year: ${acct.class10.year}`]), "application/pdf", "class10.pdf", at);
    if (!isDraft) {
      await addDoc(student.id, "PHOTO", "UPLOAD", placeholderPortrait(acct.aadhaar, "official"), "image/png", "passport-photo.png", at);
      await addDoc(student.id, "MEDICAL_CERT", "UPLOAD", await samplePdf("Medical Fitness Certificate", [`Patient: ${acct.name}`, "Fit to participate in competitive sport.", "Issued by: Demo Clinic (fictional)"]), "application/pdf", "medical-fitness.pdf", at);
    }
    if (o.college) {
      await addDoc(student.id, "COLLEGE_ID", "UPLOAD", await samplePdf("College ID Card", [`Name: ${acct.name}`, "Valid till: 2027"]), "application/pdf", "college-id.pdf", at);
      await addDoc(student.id, "BONAFIDE", "UPLOAD", await samplePdf("Bonafide Certificate", [`This is to certify that ${acct.name}`, "is a bonafide student of this college (fictional)."]), "application/pdf", "bonafide.pdf", at);
    }
    if (o.minorConsent) {
      await addDoc(student.id, "GUARDIAN_CONSENT", "UPLOAD", await samplePdf("Parent / Guardian Consent", [`I consent to ${acct.name} participating.`, "Signed: Guardian (fictional)"]), "application/pdf", "guardian-consent.pdf", at);
    }
    for (const r of o.regs) await prisma.registration.create({ data: { studentId: student.id, eventId: r.eventId, weightCategoryId: r.weightCategoryId ?? null } });
    if (o.measurement) {
      await prisma.measurement.create({ data: { studentId: student.id, heightCm: o.measurement.h, weightKg: o.measurement.w, measuredById: staff.OFFICIAL, createdAt: daysAgo(o.submittedDaysAgo - 1) } });
    }
    const checks = o.checks ?? (e ? [
      { type: "ERP_NAME_MATCH", passed: true, expected: e.name, actual: acct.name },
      { type: "ERP_DOB_MATCH", passed: true, expected: e.dob, actual: acct.dob },
    ] : []);
    for (const c of [...checks, { type: "DUPLICATE", passed: true, details: "No other profile with this identity" }]) {
      await prisma.verificationCheck.create({ data: { studentId: student.id, ...c, createdAt: at } });
    }
    await prisma.auditLog.create({ data: { actorType: "STUDENT", actorId: student.id, actorName: acct.name, actorRole: "STUDENT", action: "IDENTITY_VERIFIED", studentId: student.id, summary: "Identity verified via DigiLocker (mock)", createdAt: at } });
    if (!isDraft) await prisma.auditLog.create({ data: { actorType: "STUDENT", actorId: student.id, actorName: acct.name, actorRole: "STUDENT", action: "REGISTRATION_SUBMITTED", studentId: student.id, summary: `Registration submitted → ${o.status === "FLAGGED" ? "FLAGGED" : "PENDING"}`, createdAt: submittedAt ?? undefined } });
    if (o.measurement) await prisma.auditLog.create({ data: { actorType: "STAFF", actorId: staff.OFFICIAL, actorName: "Omar Official (demo)", actorRole: "OFFICIAL", action: "MEASUREMENT_RECORDED", studentId: student.id, summary: `Height ${o.measurement.h} cm, weight ${o.measurement.w} kg recorded`, createdAt: daysAgo(o.submittedDaysAgo - 1) } });
    if (o.approved) {
      await prisma.auditLog.create({ data: { actorType: "STAFF", actorId: staff.ADMIN, actorName: "Asha Admin (demo)", actorRole: "ADMIN", action: "STATUS_CHANGED", studentId: student.id, summary: "Status VERIFIED → APPROVED", createdAt: daysAgo(Math.max(0, o.submittedDaysAgo - 2)) } });
      await prisma.auditLog.create({ data: { actorType: "STAFF", actorId: staff.ADMIN, actorName: "Asha Admin (demo)", actorRole: "ADMIN", action: "QR_ISSUED", studentId: student.id, summary: `QR Sports ID ${sportsId} issued`, createdAt: daysAgo(Math.max(0, o.submittedDaysAgo - 2)) } });
    }
    return student;
  }

  console.log("Seeding students…");
  // 1. Approved student with QR
  const aarav = await seedIndian({ erpPrn: "SS23CS001", status: "APPROVED", approved: true, regs: [{ eventId: eventOf("Football", "MALE").id }, { eventId: eventOf("Athletics", "MALE", "100 m").id }], position: "Forward", measurement: { h: 176, w: 68.4 }, submittedDaysAgo: 12 });
  // 2. DOB mismatch (flagged)
  const rohanErp = erp("SS23ME002");
  const rohan = await seedIndian({
    erpPrn: "SS23ME002", status: "FLAGGED", submittedDaysAgo: 5,
    statusReason: "Date of birth from DigiLocker (14 May 2001) does not match the university record (14 May 2003). Please visit the sports office with your original documents.",
    regs: [{ eventId: eventOf("Cricket", "MALE").id }], position: "Bowler",
    checks: [
      { type: "ERP_NAME_MATCH", passed: true, expected: rohanErp.name, actual: rohanErp.name },
      { type: "ERP_DOB_MATCH", passed: false, expected: rohanErp.dob, actual: "2001-05-14", details: "DigiLocker DOB differs from ERP by 2 years" },
    ],
  });
  // 3. Name mismatch (flagged)
  const snehaErp = erp("SS24BC003");
  await seedIndian({
    erpPrn: "SS24BC003", status: "FLAGGED", submittedDaysAgo: 4,
    statusReason: "Name on DigiLocker (Sneha Ramesh Jadhav) does not match the university record (Sneha Patil).",
    regs: [{ eventId: eventOf("Kho-Kho", "FEMALE").id }], position: "Chaser",
    checks: [
      { type: "ERP_NAME_MATCH", passed: false, expected: snehaErp.name, actual: "Sneha Ramesh Jadhav", details: "Names do not match" },
      { type: "ERP_DOB_MATCH", passed: true, expected: snehaErp.dob, actual: snehaErp.dob },
    ],
  });
  // 4. Under-18 (pending, guardian consent uploaded)
  await seedIndian({ erpPrn: "SS26BA004", status: "PENDING", minorConsent: true, submittedDaysAgo: 2, regs: [{ eventId: eventOf("Badminton", "FEMALE", "Singles").id }] });
  // Others for a realistic dashboard
  const goalie = await seedIndian({ erpPrn: "SS22CE008", status: "APPROVED", approved: true, regs: [{ eventId: eventOf("Football", "MALE").id }], position: "Goalkeeper", measurement: { h: 183, w: 79.1 }, submittedDaysAgo: 15 });
  await seedIndian({ erpPrn: "SS23BB009", status: "VERIFIED", regs: [{ eventId: eventOf("Basketball", "FEMALE").id }], position: "Point guard", measurement: { h: 168, w: 58.2 }, submittedDaysAgo: 6 });
  await seedIndian({ erpPrn: "SS24CS010", status: "PENDING", regs: [{ eventId: eventOf("Wrestling", "MALE").id, weightCategoryId: weightCat("Wrestling", "MALE", "−74 kg").id }], submittedDaysAgo: 3, conditions: "Mild asthma — carries inhaler (fictional)" });
  const shuttler = await seedIndian({ erpPrn: "SS22LW011", status: "APPROVED", approved: true, regs: [{ eventId: eventOf("Badminton", "FEMALE", "Singles").id }, { eventId: eventOf("Badminton", "MIXED").id }], measurement: { h: 162, w: 54 }, submittedDaysAgo: 10 });
  await seedIndian({ erpPrn: "SS25AR012", status: "REJECTED", statusReason: "Medical fitness certificate is older than 6 months. Please register again with a current certificate.", regs: [{ eventId: eventOf("Swimming", "MALE", "50 m").id }], submittedDaysAgo: 8 });
  await seedIndian({ erpPrn: "SS23PH013", status: "DRAFT", regs: [], submittedDaysAgo: 1, wizardStep: 3 });

  // 5. Outside student awaiting college confirmation
  await seedIndian({ aadhaar: "000020000001", status: "PENDING", college: { id: pendingCollege.id, officeEmail: pendingCollege.officeEmail! }, regs: [{ eventId: eventOf("Kabaddi", "MALE").id }], position: "Raider", submittedDaysAgo: 2 });
  // Outside student, trusted college, approved, with a weigh-in
  const ritika = await seedIndian({ aadhaar: "000020000004", status: "APPROVED", approved: true, college: { id: trustedCollege.id, officeEmail: trustedCollege.officeEmail! }, regs: [{ eventId: eventOf("Judo", "FEMALE").id, weightCategoryId: weightCat("Judo", "FEMALE", "−57 kg").id }], measurement: { h: 160, w: 56.3 }, submittedDaysAgo: 9 });
  const judoW = eventOf("Judo", "FEMALE");
  await prisma.weighIn.create({ data: { studentId: ritika.id, eventId: judoW.id, weightKg: 56.6, withinCategory: true, categoryName: "−57 kg", recordedById: staff.OFFICIAL, createdAt: daysAgo(1) } });
  await prisma.auditLog.create({ data: { actorType: "STAFF", actorId: staff.OFFICIAL, actorName: "Omar Official (demo)", actorRole: "OFFICIAL", action: "WEIGH_IN_RECORDED", studentId: ritika.id, summary: "Weigh-in 56.6 kg for Judo — Women (−57 kg): within category", createdAt: daysAgo(1) } });

  // 6. International (ours) awaiting passport desk check
  const pp = DEMO_PASSPORTS[0];
  const adm = ADMISSIONS_RECORDS[0];
  const sujan = await prisma.student.create({
    data: {
      status: "PENDING", studentType: "INTERNATIONAL", isOurUniversity: true,
      identityKey: passportIdentityKey(pp.nationality, pp.passportNumber),
      fullName: adm.name, dob: pp.dob, dobSource: "PASSPORT", dobLocked: true, identityVerifiedAt: daysAgo(3), gender: pp.gender,
      mobile: "+917000030001", email: adm.email, emailVerified: true, address: "International Hostel, Block B (fictional)", bloodGroup: "B+",
      emergencyName: "Guardian (fictional)", emergencyPhone: "+9779800000000",
      universityName: UNIVERSITY_NAME, prn: "SS24INT01", course: adm.program, year: 2,
      passportNumber: pp.passportNumber, nationality: pp.nationality, passportExpiry: pp.expiry, mrzValid: true,
      declarationAccepted: true, privacyAccepted: true, wizardStep: 6, submittedAt: daysAgo(2), createdAt: daysAgo(3), playingPosition: "Midfielder",
    },
  });
  await addDoc(sujan.id, "PASSPORT", "UPLOAD", await samplePdf("Passport — photo page (fictional)", [`Surname: ${pp.surname}`, `Given names: ${pp.givenNames}`, `Passport no: ${pp.passportNumber}`, `MRZ: ${buildMrzLine2(pp)}`]), "application/pdf", "passport.pdf");
  await addDoc(sujan.id, "VISA", "UPLOAD", await samplePdf("Student Visa (fictional)", [`Holder: ${adm.name}`, "Type: Student"]), "application/pdf", "visa.pdf");
  await addDoc(sujan.id, "FRRO", "UPLOAD", await samplePdf("FRRO Residence Permit (fictional)", [`Holder: ${adm.name}`]), "application/pdf", "frro.pdf");
  await addDoc(sujan.id, "REFERENCE_PHOTO", "PASSPORT", placeholderPortrait(pp.passportNumber, "official"), "image/png", "passport-photo.png");
  await addDoc(sujan.id, "PHOTO", "UPLOAD", placeholderPortrait(pp.passportNumber, "official"), "image/png", "photo.png");
  await addDoc(sujan.id, "SELFIE", "CAMERA", placeholderPortrait(pp.passportNumber, "selfie"), "image/png", "selfie.png");
  await addDoc(sujan.id, "MEDICAL_CERT", "UPLOAD", await samplePdf("Medical Fitness Certificate", [`Patient: ${adm.name}`, "Fit to play."]), "application/pdf", "medical.pdf");
  await prisma.registration.create({ data: { studentId: sujan.id, eventId: eventOf("Football", "MALE").id } });
  await prisma.verificationCheck.createMany({
    data: [
      { studentId: sujan.id, type: "MRZ_CHECK", passed: true, details: "All check digits valid" },
      { studentId: sujan.id, type: "ADMISSIONS_DOB_MATCH", passed: true, expected: adm.dob, actual: pp.dob },
      { studentId: sujan.id, type: "ADMISSIONS_NAME_MATCH", passed: true, expected: adm.name, actual: adm.name },
      { studentId: sujan.id, type: "DUPLICATE", passed: true, details: "No other profile with this passport" },
    ],
  });

  // Oversight queue examples
  // a) DOB correction proposed by one admin, waiting for the second (log in as admin2 to approve).
  const fix = await prisma.dobCorrection.create({
    data: { studentId: rohan.id, fromDob: "2001-05-14", toDob: rohanErp.dob, reason: "Original birth certificate and Class 10 marksheet checked at the sports office; DigiLocker record has a known data-entry error (fictional).", requestedById: staff.ADMIN, requestedByName: "Asha Admin (demo)", createdAt: daysAgo(1) },
  });
  await prisma.auditLog.create({ data: { actorType: "STAFF", actorId: staff.ADMIN, actorName: "Asha Admin (demo)", actorRole: "ADMIN", action: "DOB_CHANGE_REQUESTED", studentId: rohan.id, entityType: "DobCorrection", entityId: fix.id, summary: `DOB correction proposed 2001-05-14 → ${rohanErp.dob}, awaiting a second admin.`, createdAt: daysAgo(1) } });
  // b) Age concern raised by the football coach about an approved player.
  const concern = await prisma.ageConcern.create({
    data: { studentId: goalie.id, reason: "Same goalkeeper played in the senior district league five seasons ago; looks older than the registered age (fictional).", raisedById: staff.COACH, raisedByName: "Coach Kiran (demo, Football)", raisedByRole: "COACH", createdAt: daysAgo(1) },
  });
  await prisma.auditLog.create({ data: { actorType: "STAFF", actorId: staff.COACH, actorName: "Coach Kiran (demo, Football)", actorRole: "COACH", action: "AGE_CONCERN_RAISED", studentId: goalie.id, entityType: "AgeConcern", entityId: concern.id, summary: "Age concern raised by Coach Kiran (coach)", createdAt: daysAgo(1) } });
  // c) Student asking to swap an event.
  const swap = await prisma.eventChangeRequest.create({
    data: { studentId: shuttler.id, fromEventId: eventOf("Badminton", "MIXED").id, toEventId: eventOf("Table Tennis", "FEMALE").id, reason: "My mixed doubles partner withdrew (fictional).", createdAt: daysAgo(0.5) },
  });
  await prisma.auditLog.create({ data: { actorType: "STUDENT", actorId: shuttler.id, actorName: shuttler.fullName, actorRole: "STUDENT", action: "EVENT_CHANGE_REQUESTED", studentId: shuttler.id, entityType: "EventChangeRequest", entityId: swap.id, summary: "Asked to move from Mixed doubles to Singles — Women (Table Tennis)", createdAt: daysAgo(0.5) } });

  // Link host-university students to their ERP school.
  for (const st of await prisma.student.findMany({ where: { isOurUniversity: true, course: { not: null } }, select: { id: true, course: true } })) {
    const school = await prisma.school.findUnique({ where: { code: schoolCodeFor(st.course ?? "") } });
    if (school) await prisma.student.update({ where: { id: st.id }, data: { schoolId: school.id } });
  }

  // ---------- Demo competition ----------
  console.log("Seeding demo competition…");
  const FIRST_M = ["Arjun", "Kabir", "Vihaan", "Ishaan", "Reyansh", "Atharv", "Dhruv", "Yash", "Aryan", "Omkar", "Tanmay", "Siddhesh", "Pranav", "Rudra", "Advait", "Neel", "Harsh", "Mihir", "Soham", "Varun", "Karan", "Nikhil", "Manav", "Ritesh", "Shaurya", "Parth", "Sarthak", "Jay", "Aniket", "Rohit", "Vedant", "Kunal"];
  const FIRST_F = ["Ananya", "Diya", "Isha", "Meera", "Saanvi", "Tara", "Riya", "Kiara", "Navya", "Aditi"];
  const LAST = ["Joshi", "Kale", "Pawar", "Shinde", "Bhosale", "Gokhale", "Apte", "Nair", "Rao", "Menon", "Chavan", "Mehta", "Sawant", "Kamat", "Desai", "Ghosh"];
  const schoolsByCode = new Map((await prisma.school.findMany()).map((sc) => [sc.code, sc]));
  let demoN = 0;
  const athlete = async (gender: "MALE" | "FEMALE", schoolCode: string, eventIds: string[], position?: string) => {
    const i = demoN++;
    const name = `${(gender === "MALE" ? FIRST_M : FIRST_F)[i % (gender === "MALE" ? FIRST_M.length : FIRST_F.length)]} ${LAST[(i * 7) % LAST.length]}`;
    const dob = `${2003 + (i % 4)}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`;
    const sc = schoolsByCode.get(schoolCode);
    const st = await prisma.student.create({
      data: {
        status: "APPROVED", studentType: "OUR_INDIAN", isOurUniversity: true, fullName: `${name} (demo)`, dob, dobSource: "DIGILOCKER", dobLocked: true, gender,
        identityKey: `demo-${i}`, aadhaarLast4: String(1000 + i), mobile: `+9170000${String(40000 + i)}`, mobileVerified: true,
        universityName: UNIVERSITY_NAME, schoolId: sc?.id ?? null, prn: `SSDEMO${String(i).padStart(3, "0")}`, course: sc?.name ?? null, year: 1 + (i % 4),
        playingPosition: position ?? null, declarationAccepted: true, privacyAccepted: true, wizardStep: 6,
        submittedAt: daysAgo(10), verifiedAt: daysAgo(8), approvedAt: daysAgo(7), approvedById: staff.ADMIN, sportsId: generateSportsId(),
      },
    });
    for (const eventId of eventIds) await prisma.registration.create({ data: { studentId: st.id, eventId } });
    return st;
  };
  const admin = { type: "STAFF" as const, id: staff.ADMIN, name: "Asha Admin (demo)", role: "SUPER_ADMIN" as const };
  const official = { type: "STAFF" as const, id: staff.OFFICIAL, name: "Omar Official (demo)", role: "OFFICIAL" as const };

  // a) Football men: 4 school squads, league, half played, one match live.
  const football = eventOf("Football", "MALE");
  await prisma.event.update({ where: { id: football.id }, data: { format: "LEAGUE", periods: 2, periodMinutes: 20, rosterMin: 7, rosterMax: 14 } });
  const POS = ["Goalkeeper", "Defender", "Defender", "Midfielder", "Midfielder", "Forward", "Forward"];
  const squads: Array<[string, string, string]> = [["CSE", "Computer Science FC", "CSE"], ["ENG", "Engineering United", "ENG"], ["MGT", "Management XI", "MGT"], ["LAW", "Law Strikers", "LAW"]];
  for (const [code, teamName, short] of squads) {
    const team = await prisma.team.create({ data: { eventId: football.id, name: teamName, shortName: short, schoolId: schoolsByCode.get(code)?.id ?? null } });
    const players = [];
    for (let k = 0; k < 7; k++) players.push(await athlete("MALE", code, [football.id], POS[k]));
    for (const pl of players) await prisma.teamMember.create({ data: { teamId: team.id, studentId: pl.id } });
    await prisma.team.update({ where: { id: team.id }, data: { captainId: players[3].id, lockedAt: daysAgo(2) } });
  }
  await generateFixtures(football.id, admin, null);
  const fm = await prisma.match.findMany({ where: { eventId: football.id }, orderBy: [{ round: "asc" }, { slot: "asc" }] });
  const scores: Array<[number, number]> = [[2, 1], [0, 0], [3, 2], [1, 1]];
  for (let k = 0; k < 4; k++) await recordResult(fm[k].id, { homeScore: scores[k][0], awayScore: scores[k][1] }, official, null);
  await applyLiveTaps(fm[4].id, [{ clientId: "seed-tap-1", side: "HOME", delta: 1, at: new Date(Date.now() - 600000).toISOString() }, { clientId: "seed-tap-2", side: "AWAY", delta: 1, at: new Date(Date.now() - 300000).toISOString() }, { clientId: "seed-tap-3", side: "HOME", delta: 1, at: new Date().toISOString() }], official);

  // b) Badminton women's singles: knockout, finished, certificates issued.
  const badminton = eventOf("Badminton", "FEMALE", "Singles");
  await prisma.event.update({ where: { id: badminton.id }, data: { format: "KNOCKOUT", shootout: false } });
  for (const code of ["DES", "PHA", "SCI", "LA"]) await athlete("FEMALE", code, [badminton.id]);
  await generateFixtures(badminton.id, admin, null);
  for (const m of await prisma.match.findMany({ where: { eventId: badminton.id, bye: false }, orderBy: { round: "asc" } })) {
    const fresh = await prisma.match.findUniqueOrThrow({ where: { id: m.id } });
    if ((fresh.homeTeamId || fresh.homeStudentId) && (fresh.awayTeamId || fresh.awayStudentId)) await recordResult(m.id, { homeScore: 2, awayScore: 1 }, official, null);
  }
  // Later rounds only get both players after earlier results; play whatever is now ready.
  for (let pass = 0; pass < 3; pass++) {
    for (const m of await prisma.match.findMany({ where: { eventId: badminton.id, bye: false, status: "SCHEDULED" }, orderBy: { round: "asc" } })) {
      if ((m.homeStudentId) && (m.awayStudentId)) await recordResult(m.id, { homeScore: 2, awayScore: 0 }, official, null);
    }
  }
  const { suggestPlacings } = await import("../src/lib/competition");
  await finaliseResults(badminton.id, (await suggestPlacings(badminton.id)).placings, admin, null);
  await issueForEvent(badminton.id, admin, null);

  // c) Athletics 100 m men: ranked results with times, finalised, certificates issued.
  const sprint = eventOf("Athletics", "MALE", "100 m");
  await prisma.event.update({ where: { id: sprint.id }, data: { format: "RACE" } });
  const runners = [aarav];
  for (const code of ["ENG", "MGT", "SCI", "LAW", "DES"]) runners.push(await athlete("MALE", code, [sprint.id]));
  const times = ["11.08 s", "11.21 s", "11.35 s", "11.52 s", "11.60 s", "11.94 s"];
  await finaliseResults(sprint.id, runners.map((r, k) => ({ division: null, position: k + 1, teamId: null, studentId: r.id, mark: times[k] })), admin, null);
  await issueForEvent(sprint.id, admin, null);

  // d) Announcements
  // Venues & courts (fictional). Matches of the same round go on different courts, so nothing clashes.
  const ground = await prisma.venue.create({ data: { name: "Main Campus Sports Complex (demo)", address: "Main Campus (fictional)" } });
  const courtIds: Record<string, string[]> = {
    football: [(await prisma.court.create({ data: { venueId: ground.id, name: "Football Ground A" } })).id, (await prisma.court.create({ data: { venueId: ground.id, name: "Football Ground B" } })).id],
    badminton: [(await prisma.court.create({ data: { venueId: ground.id, name: "Badminton Court 1" } })).id, (await prisma.court.create({ data: { venueId: ground.id, name: "Badminton Court 2" } })).id],
  };
  await prisma.court.create({ data: { venueId: ground.id, name: "Athletics Track" } });
  for (const [evId, key] of [[football.id, "football"], [badminton.id, "badminton"]] as const) {
    for (const m of await prisma.match.findMany({ where: { eventId: evId, bye: false } })) {
      await prisma.match.update({ where: { id: m.id }, data: { courtId: courtIds[key][(m.slot - 1) % courtIds[key].length] } });
    }
  }
  // The demo official scores the football matches still to be played (including the live one).
  for (const m of await prisma.match.findMany({ where: { eventId: football.id, bye: false, status: { in: ["SCHEDULED", "LIVE"] } } })) {
    await prisma.matchOfficial.create({ data: { matchId: m.id, staffId: staff.OFFICIAL, duty: "SCOREKEEPER", assignedById: staff.ADMIN } });
  }

  await sendAnnouncement({ title: "Opening ceremony on 3 Dec, 8:30 am", body: "All approved athletes: report to the Main Ground by 8:15 am with your QR Sports ID.", audience: "ATHLETES", eventId: null, channels: ["SMS"] }, admin, null);
  await sendAnnouncement({ title: "Football: matchday 3 kicks off at 11 am", body: "Captains, submit your starting seven to the desk 30 minutes before kick-off.", audience: "EVENT", eventId: football.id, channels: ["WHATSAPP"] }, admin, null);
  await sendAnnouncement({ title: "Officials briefing", body: "Scoring app walkthrough at 8 am in the Seminar Hall. Bring a charged phone.", audience: "OFFICIALS", eventId: null, channels: [] }, admin, null);

  // Duplicate attempt (blocked) — appears in the audit log
  await prisma.auditLog.create({
    data: { actorType: "SYSTEM", actorName: "System", action: "DUPLICATE_BLOCKED", studentId: aarav.id, summary: "Blocked duplicate registration attempt: DigiLocker identity already belongs to an existing profile (Aarav Kulkarni). Attempt came from mobile ******0777.", createdAt: daysAgo(3) },
  });
  // Staff logins
  for (const s of DEMO_STAFF) {
    await prisma.auditLog.create({ data: { actorType: "STAFF", actorId: staff[s.email], actorName: s.name, actorRole: s.role, action: "LOGIN", summary: "Signed in", createdAt: daysAgo(1) } });
  }

  const count = await prisma.student.count();
  console.log(`\n✔ Seeded ${count} student profiles, ${sports.length} sports, ${DEMO_STAFF.length} staff users.`);
  console.log("\nDemo staff logins (fictional):");
  for (const s of DEMO_STAFF) console.log(`  ${s.role.padEnd(9)} ${s.email.padEnd(32)} ${s.password}`);
  console.log(`\nApproved student with QR: Aarav Kulkarni (PRN SS23CS001, mobile ${erp("SS23CS001").phone})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
