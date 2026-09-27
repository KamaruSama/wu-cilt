import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { withApiLogging } from '@/lib/api-logger';
import { cookieHeader, parseCookieHeader } from '@/lib/cookie-jar';
import { getCiltSession, updateCiltSession } from '@/lib/cilt-session';
import { isSameOriginRequest, withinRateLimit } from '@/lib/request-guard';
import { logError, logWarn } from '@/lib/logger';
import { getRedis } from '@/lib/redis';

interface FormData {
  attendance?: number;
  studyHours?: number;
  listening?: number;
  speaking?: number;
  englishUsage?: number;
  platform?: number | number[];
  answers?: number[];
}

interface Config {
  courseIndex?: number;
  courseCode?: string;
  assessmentUrl?: string;
  teacherMode?: 'auto' | 'pick';
  selectedTeachers?: string[];
  formData?: FormData;
  autoSubmit?: boolean;
}

interface AutoRateResult {
  success: boolean;
  message?: string;
  error?: string;
  errorId?: string;
  submitted?: boolean;
  questionCount?: number;
  verifiedQuestions?: number;
}

async function followRedirects(url: string, currentCookies: { [key: string]: string }, maxRedirects = 5) {
  let currentUrl = url;
  let redirectCount = 0;
  let lastResponse: Response | null = null;

  while (redirectCount < maxRedirects) {
    const cookieHeader = Object.entries(currentCookies).map(([k, v]) => `${k}=${v}`).join('; ');
    const response = await fetch(currentUrl, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      redirect: 'manual',
    });

    lastResponse = response;
    const newCookies = response.headers.getSetCookie();
    newCookies.forEach(cookie => {
      const firstPart = cookie.split(';')[0];
      const equalsIndex = firstPart.indexOf('=');
      if (equalsIndex > 0) {
        const key = firstPart.substring(0, equalsIndex).trim();
        const value = firstPart.substring(equalsIndex + 1);
        if (key && value && value !== 'deleted') {
          currentCookies[key] = value;
        }
      }
    });

    if (response.status === 200) {
      return { response, cookies: currentCookies, url: currentUrl };
    }

    if (response.status === 301 || response.status === 302 || response.status === 307) {
      const location = response.headers.get('location');
      if (!location) return { response, cookies: currentCookies, url: currentUrl };
      const nextUrl = new URL(location, 'https://ciltapp.wu.ac.th');
      if (nextUrl.hostname !== 'ciltapp.wu.ac.th' || !['http:', 'https:'].includes(nextUrl.protocol)) throw new Error('CILT redirected to an untrusted origin');
      nextUrl.protocol = 'https:';
      currentUrl = nextUrl.toString();
      redirectCount++;
    } else {
      return { response, cookies: currentCookies, url: currentUrl };
    }
  }
  return { response: lastResponse!, cookies: currentCookies, url: currentUrl };
}

const upstreamHeaders = (cookieHeader: string) => ({
  Cookie: cookieHeader,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
});

function parseTeacherTypeLinks(html: string) {
  const links = new Set<string>();
  const pattern = /location\.href\s*=\s*['"]([^'"]*\/stdapp\/select-teacher-type\?[^'"]+)['"]/gi;
  for (const match of html.matchAll(pattern)) {
    links.add(match[1]);
  }
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

function parseCiltStudyHours(html: string): number | null {
  const match = html.match(/<input\b[^>]*\bname=["']typingValue["'][^>]*\bvalue=["'](\d+)["']/i)
    || html.match(/<input\b[^>]*\bvalue=["'](\d+)["'][^>]*\bname=["']typingValue["']/i);
  return match ? Number(match[1]) : null;
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as { st?: number; key?: number; msg?: string };
  } catch {
    throw new Error(`CILT returned non-JSON response (HTTP ${response.status})`);
  }
}

async function autoRate(config: Config, allCookies: Record<string, string>): Promise<AutoRateResult> {
  const getCookieHeader = () => cookieHeader(allCookies);

  try {
    const {
      courseIndex = 0, courseCode, teacherMode = 'pick',
      selectedTeachers = [], formData = {}, autoSubmit = true,
    } = config;

    // Step 1: Confirm the existing, server-side CILT session and enter its assessment.
    console.log('📋 Entering assessment system...');
    const indexRes = await fetch('https://ciltapp.wu.ac.th/stdapp/index', {
      headers: { 'Cookie': getCookieHeader(), 'User-Agent': 'Mozilla/5.0' }
    });
    const indexHtml = await indexRes.text();
    if (!indexRes.ok || /name=["']LoginForm\[username\]/i.test(indexHtml)) {
      throw new Error('CILT rejected the login session');
    }
    if (!config.assessmentUrl || !/^\/stdapp\/select-assessment\?/.test(config.assessmentUrl)) {
      throw new Error('Assessment selection is required');
    }
    await followRedirects(`https://ciltapp.wu.ac.th${config.assessmentUrl}`, allCookies);

    // Step 2: Select course
    console.log('🎯 Selecting course...');
    const { response: formRes } = await followRedirects(`https://ciltapp.wu.ac.th/stdapp/select-course?key=${courseIndex}`, allCookies);
    const formHtml = await formRes.text();
    if (!formRes.ok || /ไม่พบผู้สอน|internal server error/i.test(formHtml)) {
      throw new Error('CILT could not open the selected course');
    }
    if (courseCode && !formHtml.toUpperCase().includes(courseCode.toUpperCase())) {
      throw new Error('CILT opened a different course than the one selected');
    }

    // Step 3: Fill basic info
    console.log('📝 Filling basic info...');
    const defaults = [
      { key: 1, value: formData.attendance || 6 },
      // Zero is a valid weekly self-study value from the Registrar.
      { key: 2, value: formData.studyHours ?? 6 },
      { key: 3, value: formData.listening || 11 },
      { key: 4, value: formData.speaking || 15 },
      { key: 5, value: formData.englishUsage || 19 },
      { key: 6, value: '-' },
    ];

    for (const { key, value } of defaults) {
      const response = await fetch(`https://ciltapp.wu.ac.th/stdapp/select-register-type?key=${key}&param=${encodeURIComponent(String(value))}`, {
        headers: upstreamHeaders(getCookieHeader()),
      });
      const result = await readJson(response);
      if (!response.ok || result.st === -1) throw new Error(`CILT rejected register type ${key}`);
    }

    // Verify the value by reading the upstream form back. This catches both
    // parser mistakes and the valid-zero case before any rating is submitted.
    const { response: studyHoursCheckRes } = await followRedirects('https://ciltapp.wu.ac.th/stdapp/render-course-info', allCookies);
    const studyHoursCheckHtml = await studyHoursCheckRes.text();
    const expectedStudyHours = formData.studyHours ?? 6;
    const actualStudyHours = parseCiltStudyHours(studyHoursCheckHtml);
    if (actualStudyHours === null) {
      throw new Error('CILT study-hours field could not be verified');
    }
    if (actualStudyHours !== expectedStudyHours) {
      logWarn('submit-rating-v2.study-hours.mismatch', {
        courseCode: courseCode || 'unknown',
        expectedStudyHours,
        actualStudyHours,
      });
      throw new Error(`CILT study-hours verification failed (expected ${expectedStudyHours}, got ${actualStudyHours})`);
    }
    console.log(`✅ Study-hours check passed: ${actualStudyHours} ชั่วโมง/สัปดาห์`);

    const selectedPlatforms = Array.isArray(formData.platform)
      ? formData.platform
      : typeof formData.platform === 'number' ? [formData.platform] : [1];
    for (const platform of selectedPlatforms.length > 0 ? selectedPlatforms : [1]) {
      const platformResponse = await fetch(`https://ciltapp.wu.ac.th/stdapp/check-platform?key=${platform}`, {
        headers: upstreamHeaders(getCookieHeader()),
      });
      const result = await readJson(platformResponse);
      if (!platformResponse.ok || result.st === -1) throw new Error(`CILT rejected platform ${platform}`);
    }

    // Step 4: Validate and pick teacher type
    console.log('🎯 Validating and picking teacher...');
    const { response: valRes, url: valUrl } = await followRedirects('https://ciltapp.wu.ac.th/stdapp/validate-course-info', allCookies);
    let currentHtml = await valRes.text();
    let currentUrl = valUrl;
    if (!valRes.ok) throw new Error(`CILT validation failed (HTTP ${valRes.status})`);

    const teacherTypeLinks = parseTeacherTypeLinks(currentHtml);
    if (teacherTypeLinks.length === 0 && !isQuestionPage(currentHtml)) {
      throw new Error('CILT teacher-type page was not found');
    }

    if (teacherTypeLinks.length > 0) {
      let selectedTeacherType = false;
      for (const relativeUrl of teacherTypeLinks) {
        const selected = await followRedirects(
          relativeUrl.startsWith('http') ? relativeUrl : `https://ciltapp.wu.ac.th${relativeUrl}`,
          allCookies,
        );
        const candidateHtml = await selected.response.text();
        currentHtml = candidateHtml;
        currentUrl = selected.url;
        if (selected.response.ok && isQuestionPage(candidateHtml)) {
          selectedTeacherType = true;
          break;
        }
      }
      if (!selectedTeacherType) throw new Error('CILT has no teacher type with available questions');
    }

    // Step 5: Rate all questions
    console.log('⭐ Rating questions...');
    const answers = formData.answers || [];
    let questionCount = 0;
    let verifiedQuestions = 0;
    for (let questionKey = 1; questionKey <= 50; questionKey++) {
      // all-officer selects the active question in CILT's session. It must be
      // immediately followed by select-opt/verify before requesting another key.
      const qRes = await fetch(`https://ciltapp.wu.ac.th/stdapp/all-officer?key=${questionKey}`, {
        headers: upstreamHeaders(getCookieHeader()),
      });
      const inputs = parseQuestionInputs(await qRes.text());
      if (!qRes.ok || inputs.length === 0) break;
      questionCount++;

      const targetScore = answers[questionKey - 1] || 1;
      const teachers = [...new Set(inputs
        .filter(input => input.score === targetScore)
        .map(input => input.teacherId))];
      if (teachers.length === 0) throw new Error(`Answer ${targetScore} is not available for question ${questionKey}`);

      const teachersToRate = teacherMode === 'auto'
        ? teachers
        : selectedTeachers.length > 0
          ? teachers.filter(id => selectedTeachers.includes(id))
          : teachers.slice(0, 1);
      if (teachersToRate.length === 0) throw new Error(`No selected teacher is available for question ${questionKey}`);

      for (const teacherId of teachersToRate) {
        const selectResponse = await fetch(`https://ciltapp.wu.ac.th/stdapp/select-opt?key=${targetScore}&tKey=${teacherId}`, {
          headers: upstreamHeaders(getCookieHeader()),
        });
        const result = await readJson(selectResponse);
        if (!selectResponse.ok || result.st === -1) throw new Error(`CILT rejected question ${questionKey}, teacher ${teacherId}`);
      }

      const verifyResponse = await fetch('https://ciltapp.wu.ac.th/stdapp/verify-select-opt', {
        headers: upstreamHeaders(getCookieHeader()),
      });
      const verifyResult = await readJson(verifyResponse);
      if (!verifyResponse.ok || verifyResult.st !== 1) {
        throw new Error(`Question ${questionKey} verification failed: ${verifyResult.msg || 'unknown error'}`);
      }

      let checkedInputs: ReturnType<typeof parseQuestionInputs> = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        const checkResponse = await fetch(`https://ciltapp.wu.ac.th/stdapp/all-officer?key=${questionKey}`, {
          headers: upstreamHeaders(getCookieHeader()),
        });
        checkedInputs = parseQuestionInputs(await checkResponse.text());
        const persisted = teachersToRate.every(teacherId => checkedInputs.some(input =>
          input.teacherId === teacherId && input.score === targetScore && input.checked));
        if (persisted) break;
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 250));
      }
      const notPersisted = teachersToRate.some(teacherId => !checkedInputs.some(input =>
        input.teacherId === teacherId && input.score === targetScore && input.checked));
      if (notPersisted) {
        const checked = checkedInputs.filter(input => input.checked).map(input => `${input.score}:${input.teacherId}`);
        throw new Error(`Question ${questionKey} was not persisted by CILT (expected ${targetScore}:${teachersToRate.join(',')}; checked ${checked.join(',') || 'none'})`);
      }
      verifiedQuestions++;
    }

    if (questionCount === 0) {
      throw new Error('CILT returned no answerable questions');
    }
    if (verifiedQuestions !== questionCount) {
      throw new Error(`CILT answer verification incomplete (${verifiedQuestions}/${questionCount})`);
    }
    console.log(`✅ Answer verification passed: ${verifiedQuestions}/${questionCount} questions`);

    // Step 6: Final Submit
    if (autoSubmit) {
      console.log('📤 Submitting...');
      const finRes = await fetch('https://ciltapp.wu.ac.th/stdapp/send-out', {
        headers: { 'Cookie': getCookieHeader(), 'User-Agent': 'Mozilla/5.0' }
      });
      const result = await readJson(finRes);
      if (!finRes.ok || result.st !== 1) throw new Error(result.msg || 'Submit failed');
      return { success: true, submitted: true, questionCount, verifiedQuestions };
    }

    return { success: true, submitted: false, questionCount, verifiedQuestions };

  } catch (error) {
    const errorId = logError('submit-rating-v2.auto-rate.failed', error);
    return { success: false, error: 'ระบบให้คะแนนอัตโนมัติทำงานไม่สำเร็จ', errorId };
  }
}

async function handlePost(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json({ success: false, error: 'Origin ของคำขอไม่ถูกต้อง' }, { status: 403 });
    }
    const config = await request.json() as Config;
    const session = await getCiltSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' }, { status: 401 });
    }
    // Auto deliberately processes one course at a time. The former 5/10-min
    // cap turned a valid 10-course batch into exactly 5 successes + 5 false
    // failures. Keep Pick guarded tightly, while allowing one authenticated
    // student's sequential Auto batch to finish.
    const autoBatch = config.teacherMode === 'auto';
    const limit = autoBatch ? 60 : 5;
    const windowMs = autoBatch ? 60 * 60 * 1000 : 10 * 60 * 1000;
    if (!await withinRateLimit(request, autoBatch ? 'submit-rating-v2-auto' : 'submit-rating-v2-pick', limit, windowMs, session.id)) {
      return NextResponse.json({ success: false, error: autoBatch ? 'Auto ส่งเกิน 60 วิชาภายใน 1 ชั่วโมง กรุณารอแล้วลองใหม่' : 'ส่งคำขอบ่อยเกินไป กรุณารอ 10 นาที' }, { status: 429 });
    }
    // A session represents one upstream CILT browser state. A second tab (or
    // double-click) must never mutate it while Auto is processing a course.
    const lockKey = autoBatch ? `wu-s:auto-lock:${session.id}` : null;
    const lockToken = autoBatch ? randomUUID() : null;
    if (lockKey && lockToken) {
      const acquired = await (await getRedis()).set(lockKey, lockToken, { NX: true, PX: 30 * 60 * 1000 });
      if (!acquired) {
        return NextResponse.json({ success: false, error: 'Auto ของบัญชีนี้กำลังทำงานอยู่ กรุณารอให้วิชาปัจจุบันเสร็จ' }, { status: 409 });
      }
    }

    try {
      const allCookies = parseCookieHeader(session.cookies);
      const result = await autoRate(config, allCookies);
      await updateCiltSession(session.id, cookieHeader(allCookies));
      return NextResponse.json(result, { status: result.success ? 200 : 500 });
    } finally {
      if (lockKey && lockToken) {
        // Delete only a lock held by this exact request; never release a new
        // request's lock after an expiry race.
        await (await getRedis()).eval(
          'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0',
          { keys: [lockKey], arguments: [lockToken] },
        ).catch(() => undefined);
      }
    }
  } catch (error) {
    const errorId = logError('submit-rating-v2.request.failed', error);
    return NextResponse.json({ success: false, error: 'คำขอไม่ถูกต้อง', errorId }, { status: 500 });
  }
}

export const POST = withApiLogging('submit-rating-v2', handlePost);
