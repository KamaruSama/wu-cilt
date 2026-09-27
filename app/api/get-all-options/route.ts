import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { getStudyHours } from '@/lib/get-study-hours';
import { withApiLogging } from '@/lib/api-logger';
import { cookieHeader, mergeSetCookies, parseCookieHeader } from '@/lib/cookie-jar';
import { getCiltSession, updateCiltSession } from '@/lib/cilt-session';
import { logError, logWarn } from '@/lib/logger';
import { isSameOriginRequest } from '@/lib/request-guard';

type StudyHoursCheck = {
  status: 'verified' | 'mismatch' | 'unverified' | 'fallback';
  registrarHours: number;
  ciltHours: number | null;
  verified: boolean;
  // CILT accepts 0 through its input endpoint but does not advance to the
  // teacher/question flow. Keep the Registrar value visible, while offering
  // a working CILT value for the user to review before submission.
  requiresUserChoice?: boolean;
  recommendedHours?: number;
  breakdown?: {
    creditInfo: string;
    credits: number;
    lectureHours: number;
    practiceHours: number;
    selfStudyHours: number;
    degreeLevel: string;
    groupNumber: string;
  };
};

function parseTeacherTypeLinks(html: string) {
  const links = new Set<string>();
  const pattern = /location\.href\s*=\s*['"]([^'"]*\/stdapp\/select-teacher-type\?[^'"]+)['"]/gi;
  for (const match of html.matchAll(pattern)) links.add(match[1]);
  return [...links];
}

function parseQuestionInputs(html: string) {
  const inputs: Array<{ score: number; teacherId: string; checked: boolean }> = [];
  const pattern = /<input\b[^>]*?onclick\s*=\s*["']selectOpt\(\s*(\d+)\s*,\s*(\d+)\s*\)["'][^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    inputs.push({
      score: Number(match[1]),
      teacherId: match[2],
      checked: /\bchecked(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/i.test(match[0]),
    });
  }
  return inputs;
}

function isQuestionPage(html: string) {
  return /sendOut\(\)/.test(html) && /getOfficer\(\s*\d+\s*\)/.test(html);
}

async function handlePost(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json({ success: false, error: 'Origin ของคำขอไม่ถูกต้อง' }, { status: 403 });
    }
    const { courseIndex, courseCode, groupNumber, semester, degreeLevel } = await request.json();
    const session = await getCiltSession(request);

    if (!session || !Number.isInteger(courseIndex) || courseIndex < 0) {
      return NextResponse.json({ success: false, error: 'Session หมดอายุหรือข้อมูลรายวิชาไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่' }, { status: 401 });
    }

    let studyHours = 6;
    let studyHoursOptions = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      label: i === 9 ? '9+ ชม.' : `${i} ชม.`
    }));
    let studyHoursCheck: StudyHoursCheck = {
      status: 'fallback',
      registrarHours: studyHours,
      ciltHours: null,
      verified: false,
    };

    if (courseCode && courseCode.trim()) {
      try {
        const studyHoursData = await getStudyHours(courseCode, semester || '', groupNumber || '', degreeLevel || '');
        if (studyHoursData.multipleDegrees && studyHoursData.degreeOptions) {
          return NextResponse.json({
            success: true, multipleDegrees: true, degreeOptions: studyHoursData.degreeOptions,
            courseCode, groupNumber, semester
          });
        }
        // Zero is a valid Registrar value (e.g. 3 (0-24-0): S = 0 hours).
        // Check for null explicitly so a real zero is not replaced by the default.
        if (studyHoursData.success && studyHoursData.found && studyHoursData.studyHours !== null) {
          studyHours = studyHoursData.studyHours;
          studyHoursCheck = {
            status: 'unverified',
            registrarHours: studyHours,
            ciltHours: null,
            verified: false,
            breakdown: studyHoursData.breakdown,
          };
        }
      } catch (error) {
        logError('get-all-options.study-hours.failed', error);
      }
    }

    // Live CILT verification: a self-study value of 0 returns to the course
    // form after validation and never exposes a teacher type. Do not silently
    // alter the Registrar fact; present it in the UI and prefill the CILT
    // recommendation so the user can keep it or select another usable value.
    if (studyHours === 0) {
      studyHours = 6;
      studyHoursOptions = Array.from({ length: 9 }, (_, index) => ({
        id: index + 1,
        label: index === 8 ? '9+ ชม.' : `${index + 1} ชม.`,
      }));
      studyHoursCheck = {
        ...studyHoursCheck,
        registrarHours: 0,
        requiresUserChoice: true,
        recommendedHours: 6,
      };
    }

    const allCookies = parseCookieHeader(session.cookies);
    const getCookieHeader = () => cookieHeader(allCookies);
    const updateCookies = (setCookieHeaders: string[]) => mergeSetCookies(allCookies, setCookieHeaders);

    async function followRedirects(url: string, maxRedirects = 5) {
      let currentUrl = url;
      let lastResponse: Response | null = null;
      for (let i = 0; i < maxRedirects; i++) {
        const res = await fetch(currentUrl, {
          method: 'GET',
          headers: { 'Cookie': getCookieHeader(), 'User-Agent': 'Mozilla/5.0' },
          redirect: 'manual',
        });
        lastResponse = res;
        updateCookies(res.headers.getSetCookie());
        if (res.status === 200) return { response: res, url: currentUrl };
        if ([301, 302, 307].includes(res.status)) {
          const loc = res.headers.get('location');
          if (!loc) break;
          const nextUrl = new URL(loc, 'https://ciltapp.wu.ac.th');
          if (nextUrl.hostname !== 'ciltapp.wu.ac.th' || !['http:', 'https:'].includes(nextUrl.protocol)) throw new Error('CILT redirected to an untrusted origin');
          nextUrl.protocol = 'https:';
          currentUrl = nextUrl.toString();
        } else break;
      }
      return { response: lastResponse!, url: currentUrl };
    }

    // Step 1: Select course
    console.log('🎯 Step 1: Selecting course...');
    const { response: courseResponse } = await followRedirects(`https://ciltapp.wu.ac.th/stdapp/select-course?key=${courseIndex}`);
    const formHtml = await courseResponse.text();
    const $form = cheerio.load(formHtml);

    if (formHtml.includes('ไม่พบผู้สอน')) {
      return NextResponse.json({ success: false, error: 'no_instructor', message: 'ไม่พบผู้สอนสำหรับวิชานี้' }, { status: 400 });
    }

    const parseRadio = (html: string, name: string) => {
      const value = $form(`input[type="radio"][name="${name}"]:checked`).attr('value');
      return value ? parseInt(value, 10) : null;
    };

    const existingFormData = {
      attendance: parseRadio(formHtml, 'rg1'),
      listening: parseRadio(formHtml, 'rg3'),
      speaking: parseRadio(formHtml, 'rg4'),
      englishUsage: parseRadio(formHtml, 'rg5'),
      platform: $form('input[type="checkbox"][id^="plt"]:checked').map((_, element) => {
        const match = ($form(element).attr('id') || '').match(/^plt(\d+)$/);
        return match ? parseInt(match[1], 10) : null;
      }).get().filter((value): value is number => value !== null),
      suggestion: (formHtml.match(/value="([^"]*)"[^>]*onchange="chkRegiserType\(6/i) || formHtml.match(/onchange="chkRegiserType\(6[^>]*value="([^"]*)"/i) || ['', ''])[1],
    };

    // Step 2: Fill basic info
    console.log('🎯 Step 2: Filling defaults...');
    const defaults = [
      { k: 1, v: existingFormData.attendance || 6 },
      { k: 2, v: studyHours },
      { k: 3, v: existingFormData.listening || 11 },
      { k: 4, v: existingFormData.speaking || 15 },
      { k: 5, v: existingFormData.englishUsage || 19 },
      { k: 6, v: existingFormData.suggestion || '-' },
    ];

    for (const { k, v } of defaults) {
      await fetch(`https://ciltapp.wu.ac.th/stdapp/select-register-type?key=${k}&param=${encodeURIComponent(String(v))}`, {
        headers: { 'Cookie': getCookieHeader(), 'User-Agent': 'Mozilla/5.0' }
      });
    }

    // Read the form back from CILT and verify that the exact value (including 0)
    // reached the upstream field before exposing the options to the user.
    const { response: checkRes } = await followRedirects('https://ciltapp.wu.ac.th/stdapp/render-course-info');
    const checkHtml = await checkRes.text();
    const checkForm = cheerio.load(checkHtml);
    const ciltStudyHoursText = checkForm('input[name="typingValue"]').first().attr('value')?.trim() || '';
    const ciltStudyHours = /^\d+$/.test(ciltStudyHoursText) ? Number(ciltStudyHoursText) : null;
    studyHoursCheck.ciltHours = ciltStudyHours;
    studyHoursCheck.verified = ciltStudyHours === studyHours;
    studyHoursCheck.status = ciltStudyHours === null
      ? 'unverified'
      : studyHoursCheck.verified ? 'verified' : 'mismatch';
    if (!studyHoursCheck.verified) {
      logWarn('get-all-options.study-hours.mismatch', {
        courseCode: courseCode || 'unknown',
        groupNumber: groupNumber || 'unknown',
        registrarHours: studyHours,
        ciltHours: ciltStudyHours,
      });
    }

    await fetch('https://ciltapp.wu.ac.th/stdapp/check-platform?key=1', {
      headers: { 'Cookie': getCookieHeader(), 'User-Agent': 'Mozilla/5.0' }
    });

    // Step 3: Validate to unlock
    console.log('🎯 Step 3: Validating info...');
    const { response: valRes, url: valUrl } = await followRedirects('https://ciltapp.wu.ac.th/stdapp/validate-course-info');
    let currentHtml = await valRes.text();
    let currentUrl = valUrl;

    // Step 4: Pick teacher type. CILT can expose the teacher-type links
    // without the visible heading and can redirect through different URLs,
    // so detect the actual links rather than relying on page text/URL shape.
    const teacherTypeLinks = parseTeacherTypeLinks(currentHtml);
    if (teacherTypeLinks.length === 0 && !isQuestionPage(currentHtml)) {
      return NextResponse.json({ success: false, error: 'ไม่พบประเภทผู้สอนที่มีคำถาม' }, { status: 400 });
    }

    if (teacherTypeLinks.length > 0) {
      console.log('🔍 Picking teacher type...');
      let selectedTeacherType = false;
      for (const relativeUrl of teacherTypeLinks) {
        const { response: typeRes, url: nextUrl } = await followRedirects(
          relativeUrl.startsWith('http') ? relativeUrl : `https://ciltapp.wu.ac.th${relativeUrl}`
        );
        const candidateHtml = await typeRes.text();
        if (typeRes.ok && isQuestionPage(candidateHtml)) {
          currentHtml = candidateHtml;
          currentUrl = nextUrl;
          selectedTeacherType = true;
          console.log('✅ Teacher type selected');
          break;
        }
      }
      if (!selectedTeacherType) {
        return NextResponse.json({ success: false, error: 'ไม่พบประเภทผู้สอนที่มีคำถาม' }, { status: 400 });
      }
    }

    // Small delay to let CILT server settle the session
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 5: Fetch questions
    console.log('🎯 Step 5: Fetching questions...');
    const questionOptions: any[] = [];
    const existingAnswers: any[] = [];
    const teacherIds = new Set<string>();

    for (let i = 1; i <= 50; i++) {
      const res = await fetch(`https://ciltapp.wu.ac.th/stdapp/all-officer?key=${i}`, {
        method: 'GET', headers: { 'Cookie': getCookieHeader(), 'User-Agent': 'Mozilla/5.0' }, redirect: 'manual'
      });

      console.log(`🔍 Q${i} Status: ${res.status}`);

      if ([301, 302].includes(res.status)) {
        console.log(`⚠️ Q${i} redirected by upstream`);
        break;
      }

      const html = await res.text();
      if (html.includes('Error') || html.includes('<h1>Error</h1>')) {
        console.log(`❌ Q${i} HTML error detected`);
        break;
      }

      const parsedInputs = parseQuestionInputs(html);
      parsedInputs.forEach(input => teacherIds.add(input.teacherId));
      const optMatches = parsedInputs.map(input => [String(input.score), input.teacherId] as const);
      console.log(`📋 Q${i} Matches: ${optMatches.length}`);

      if (optMatches.length === 0) {
        if (i === 1) console.log('🔍 Q1 response had no option matches');
        break;
      }

      const optionsMap = new Map();
      let selected: number | null = null;
      for (const m of optMatches) {
        const id = parseInt(m[1]);
        if (!optionsMap.has(id)) {
          const labels: any = { 1: 'ดีมาก', 2: 'ดี', 3: 'พอใช้', 4: 'ควรปรับปรุง', 5: 'ไม่เหมาะสม', 11: 'แจ้งทุกหัวข้อ', 12: 'แจ้งเกือบทุกหัวข้อ', 13: 'แจ้งบางหัวข้อ', 14: 'ไม่ได้แจ้ง' };
          optionsMap.set(id, labels[id] || `ตัวเลือก ${id}`);
        }
        if (parsedInputs.some(input => input.score === id && input.checked)) selected = id;
      }
      questionOptions.push(Array.from(optionsMap.entries()).sort((a,b)=>a[0]-b[0]).map(([id,label])=>({id,label})));
      existingAnswers.push(selected);
    }

    if (questionOptions.length === 0) {
      return NextResponse.json({
        success: false, error: 'ไม่พบตัวเลือกคำถาม (0 questions)',
        debug: { questionCount: 0, cookieCount: Object.keys(allCookies).length }
      }, { status: 400 });
    }

    await updateCiltSession(session.id, getCookieHeader());
    return NextResponse.json({
      success: true,
      data: {
        formOptions: {
          attendance: [{id:6,label:'100%'},{id:5,label:'80-99%'},{id:4,label:'<80%'}],
          studyHours: studyHoursOptions,
          listening: [{id:11,label:'พัฒนามาก'},{id:12,label:'ปานกลาง'},{id:13,label:'เล็กน้อย'},{id:14,label:'ไม่มี'}],
          speaking: [{id:15,label:'พัฒนามาก'},{id:16,label:'ปานกลาง'},{id:17,label:'เล็กน้อย'},{id:18,label:'ไม่มี'}],
          englishUsage: [{id:19,label:'100%'},{id:20,label:'75%'},{id:21,label:'50%'},{id:22,label:'25%'},{id:23,label:'0%'}],
          platform: [{id:1,label:'E-learning'},{id:2,label:'Google Classroom'},{id:3,label:'MS Teams'},{id:4,label:'Zoom'},{id:5,label:'Line/FB'},{id:6,label:'อื่นๆ'},{id:7,label:'ไม่มี'}]
        },
        questionOptions,
        teachers: [...teacherIds].map((id, index) => ({ id, name: `ผู้สอน ${index + 1}` })),
        existingFormData,
        existingAnswers,
        hasExistingData: existingAnswers.some(a => a !== null),
        studyHoursValue: studyHours,
        studyHoursCheck
      }
    });
  } catch (error) {
    const errorId = logError('get-all-options.failed', error);
    return NextResponse.json({ success: false, error: 'ไม่สามารถโหลดตัวเลือกทั้งหมดได้', errorId }, { status: 500 });
  }
}

export const POST = withApiLogging('get-all-options', handlePost);
