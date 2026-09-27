'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const AUTO_COURSE_DELAY_MS = 3_000;
const SOURCE_REPOSITORY_URL = 'https://github.com/KamaruSama/wu-cilt';
const LAST_UPDATED_LABEL = '27 กันยายน 2026';

// Toast notification types
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message: string;
}

// Toast Component - SweetAlert2 Style
function ToastNotification({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [progress, setProgress] = useState(100);
  const duration = 5000; // 5 seconds

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onClose();
      }
    }, 50);
    return () => clearInterval(interval);
  }, [onClose]);

  const styles = {
    success: {
      bg: 'bg-white',
      border: 'border-l-4 border-l-green-500',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-500',
      progressBg: 'bg-green-500',
    },
    error: {
      bg: 'bg-white',
      border: 'border-l-4 border-l-red-500',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-500',
      progressBg: 'bg-red-500',
    },
    warning: {
      bg: 'bg-white',
      border: 'border-l-4 border-l-yellow-500',
      iconBg: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
      progressBg: 'bg-yellow-500',
    },
    info: {
      bg: 'bg-white',
      border: 'border-l-4 border-l-blue-500',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-500',
      progressBg: 'bg-blue-500',
    },
  };

  const icons = {
    success: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    warning: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    info: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  const style = styles[toast.type];

  return (
    <div className={`${style.bg} ${style.border} rounded-lg shadow-2xl min-w-[320px] max-w-[420px] animate-slide-in overflow-hidden`}>
      <div className="px-4 py-3 flex items-start gap-3">
        <div className={`${style.iconBg} ${style.iconColor} p-2 rounded-full flex-shrink-0`}>
          {icons[toast.type]}
        </div>
        <div className="flex-1 pt-1">
          <p className="font-semibold text-gray-800">{toast.title}</p>
          <p className="text-sm text-gray-600 whitespace-pre-wrap mt-0.5">{toast.message}</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl font-light leading-none p-1 hover:bg-gray-100 rounded transition-colors"
        >
          ×
        </button>
      </div>
      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div
          className={`h-full ${style.progressBg} transition-all duration-50 ease-linear`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// Toast Container
function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: number) => void }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastNotification key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

// Loading Modal Component
function LoadingModal({ isOpen, title, message }: { isOpen: boolean; title: string; message: string }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4 text-center">
        <div className="mb-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">{title}</h3>
        <p className="text-gray-600 text-sm">{message}</p>
      </div>
    </div>
  );
}

type TicketFilter = 'all' | 'bad' | 'neutral' | 'good' | 'excellent';

interface PublicTicket {
  id: string;
  title: string;
  details: string;
  stars: number;
  status: 'open' | 'reviewing' | 'resolved';
  createdAt: number;
  updatedAt: number;
}

function TicketBoard() {
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>('all');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [stars, setStars] = useState(3);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [ticketError, setTicketError] = useState('');
  const [ticketSuccess, setTicketSuccess] = useState('');
  const [ticketTotal, setTicketTotal] = useState(0);
  const [ticketLimited, setTicketLimited] = useState(false);

  const loadTickets = useCallback(async (filter: TicketFilter) => {
    try {
      const response = await fetch(`${basePath}/api/tickets?filter=${encodeURIComponent(filter)}`);
      const data = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(data.tickets)) {
        setTickets(data.tickets);
        setTicketTotal(Number(data.total) || 0);
        setTicketLimited(Boolean(data.limited));
      }
    } catch {
      // The form remains available; infrastructure detail is not public.
    }
  }, []);

  useEffect(() => { void loadTickets(ticketFilter); }, [ticketFilter, loadTickets]);

  const submitTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setTicketError('');
    setTicketSuccess('');
    try {
      const response = await fetch(`${basePath}/api/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, details, stars, startedAt, website: '' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setTicketError(data.error || 'ไม่สามารถเปิดตั๋วได้');
        return;
      }
      setTicketSuccess(data.ticketId ? `เปิดตั๋ว ${data.ticketId} แล้ว ทุกคนดูรายการได้ด้านล่าง` : 'รับข้อมูลแล้ว');
      setTitle('');
      setDetails('');
      setStars(3);
      setStartedAt(Date.now());
      await loadTickets(ticketFilter);
    } catch {
      setTicketError('เชื่อมต่อเพื่อเปิดตั๋วไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const filterButtons: Array<[TicketFilter, string]> = [
    ['all', 'ทั้งหมด'], ['bad', 'ต้องแก้ 1–2★'], ['neutral', 'กลาง 3★'], ['good', 'ดี 4★'], ['excellent', 'ดีมาก 5★'],
  ];

  return (
    <section className="ticket-board" id="tickets" aria-labelledby="ticket-heading">
      <div className="ticket-board-heading">
        <div>
          <p className="eyebrow">OPEN TICKETS</p>
          <h2 id="ticket-heading">เจอปัญหา? เปิดตั๋วได้เลย</h2>
          <p>ไม่ต้องเข้าสู่ระบบ รายงานทุกใบเป็นสาธารณะและเก็บถาวร เพื่อให้ทุกคนเห็นปัญหาเดียวกัน</p>
        </div>
        <span className="ticket-count">{ticketTotal} ตั๋ว</span>
      </div>

      <div className="ticket-grid">
        <form onSubmit={submitTicket} className="ticket-form">
          <label htmlFor="ticket-title">เกิดอะไรขึ้น</label>
          <input id="ticket-title" value={title} onChange={(event) => setTitle(event.target.value)} minLength={8} maxLength={120} placeholder="เช่น Auto หยุดหลังวิชาที่ 2" required />
          <label htmlFor="ticket-details">รายละเอียด</label>
          <textarea id="ticket-details" value={details} onChange={(event) => setDetails(event.target.value)} minLength={20} maxLength={3000} rows={5} placeholder="บอกขั้นตอนที่ทำ สิ่งที่คาดหวัง และสิ่งที่เกิดขึ้นจริง" required />
          <p className="ticket-text-only">พิมพ์ข้อความเท่านั้น ระบบไม่รับลิงก์หรือไฟล์แนบ · ข้อความนี้เผยแพร่สาธารณะและเก็บถาวร</p>
          <fieldset>
            <legend>ประสบการณ์เป็นอย่างไร</legend>
            <div className="star-picker" aria-label="ให้คะแนน 1 ถึง 5 ดาว">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" onClick={() => setStars(value)} aria-label={`${value} ดาว`} aria-pressed={stars === value} className={value <= stars ? 'selected' : ''}>★</button>
              ))}
            </div>
            <p>{stars <= 2 ? 'แย่ — ต้องรีบดู' : stars === 3 ? 'กลาง — มีจุดให้ปรับ' : 'ดี — ใช้งานได้ดี'}</p>
          </fieldset>
          <input className="ticket-honeypot" tabIndex={-1} autoComplete="off" name="website" aria-hidden="true" />
          {ticketError && <p className="ticket-message error">{ticketError}</p>}
          {ticketSuccess && <p className="ticket-message success">{ticketSuccess}</p>}
          <button className="ticket-submit" type="submit" disabled={submitting}>{submitting ? 'กำลังเปิดตั๋ว...' : 'เปิดตั๋ว'}</button>
        </form>

        <div className="ticket-list-wrap">
          <div className="ticket-filters" aria-label="กรองตั๋วตามดาว">
            {filterButtons.map(([value, label]) => <button key={value} type="button" onClick={() => setTicketFilter(value)} className={ticketFilter === value ? 'active' : ''}>{label}</button>)}
          </div>
          <div className="ticket-list">
            {ticketLimited && <p className="ticket-limited">แสดง 100 ตั๋วล่าสุดจาก {ticketTotal} ตั๋วในกลุ่มนี้</p>}
            {tickets.length === 0 ? <p className="ticket-empty">ยังไม่มีตั๋วในกลุ่มนี้</p> : tickets.map((ticket) => (
              <article className="ticket-item" key={ticket.id}>
                <div className="ticket-item-top"><span className="ticket-id">{ticket.id}</span><span className={`ticket-stars stars-${ticket.stars}`}>{'★'.repeat(ticket.stars)}{'☆'.repeat(5 - ticket.stars)}</span></div>
                <h3>{ticket.title}</h3>
                <p>{ticket.details}</p>
                <time dateTime={new Date(ticket.createdAt).toISOString()}>{new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(ticket.createdAt)}</time>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

interface Assessment {
  id: number;
  title: string;
  department: string;
  semester: string;
  url: string;
}

interface LoginResult {
  username: string;
  assessmentCount: number;
  assessmentList: Assessment[];
}

interface Course {
  id: number;
  courseKey: number;
  name: string;
  code: string;
  url: string;
  html: string;
  isCompleted?: boolean;
}

type AutoRunStatus = 'running' | 'completed';

interface AutoProgress {
  status: AutoRunStatus;
  totalAssessments: number;
  currentAssessment: number;
  totalCourses: number;
  currentCourse: number;
  completed: number;
  skipped: number;
  failed: number;
  failedAssessments: number;
  lastError: string;
  waitingForNextCourse: boolean;
}

interface StudyHoursCheck {
  status: 'verified' | 'mismatch' | 'unverified' | 'fallback';
  registrarHours: number;
  ciltHours: number | null;
  verified: boolean;
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
}

interface AutoStudyHoursChoice {
  key: string;
  courseName: string;
  courseCode: string;
  assessmentTitle: string;
  hours: number;
  breakdown: NonNullable<StudyHoursCheck['breakdown']>;
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<LoginResult | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [currentAssessment, setCurrentAssessment] = useState<Assessment | null>(null);
  const [showCourses, setShowCourses] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [autoProgress, setAutoProgress] = useState<AutoProgress | null>(null);
  const autoRunInFlight = useRef(false);
  const [settings, setSettings] = useState({
    courseMode: 'pick' as 'pick' | 'auto',
    teacherMode: 'pick' as 'pick' | 'auto',
    selectedAssessments: [] as number[],
  });
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [showDegreeModal, setShowDegreeModal] = useState(false);
  const [showAutoStudyHoursModal, setShowAutoStudyHoursModal] = useState(false);
  const [autoStudyHoursChoices, setAutoStudyHoursChoices] = useState<AutoStudyHoursChoice[]>([]);
  const [studyHoursCheck, setStudyHoursCheck] = useState<StudyHoursCheck | null>(null);
  const [degreeOptions, setDegreeOptions] = useState<Array<{level: string, credit: string, studyHours: number}>>([]);
  const [pendingCourseData, setPendingCourseData] = useState<{courseCode: string, groupNumber: string, semester: string} | null>(null);
  const [formData, setFormData] = useState({
    attendance: 6,
    studyHours: 6,
    listening: 11,
    speaking: 15,
    englishUsage: 19,
    platform: [] as number[], // Changed to array for multiple selection
    answers: [] as number[] // Dynamic array based on question count
  });
  const [questionOptions, setQuestionOptions] = useState<Array<Array<{id: number, label: string}>>>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [courseError, setCourseError] = useState<{
    type: string;
    message: string;
    debug?: {
      htmlSnippet?: string;
      cookieCount?: number;
    }
  } | null>(null);
  const [existingCiltData, setExistingCiltData] = useState<{
    formData: {
      attendance: number | null;
      listening: number | null;
      speaking: number | null;
      englishUsage: number | null;
      platform: number[];
    } | null;
    answers: (number | null)[];
    hasExistingData: boolean;
  }>({ formData: null, answers: [], hasExistingData: false });
  const [formOptions, setFormOptions] = useState<{
    attendance: Array<{id: number, label: string}>;
    studyHours: Array<{id: number, label: string}>;
    listening: Array<{id: number, label: string}>;
    speaking: Array<{id: number, label: string}>;
    englishUsage: Array<{id: number, label: string}>;
    platform: Array<{id: number, label: string}>;
  }>({
    attendance: [],
    studyHours: [],
    listening: [],
    speaking: [],
    englishUsage: [],
    platform: []
  });

  // Teacher selection state (for pick mode)
  const [teachers, setTeachers] = useState<Array<{id: string, name: string}>>([]);
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);

  // Toast notifications state
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loadingModal, setLoadingModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: ''
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Toast helper functions
  const addToast = (type: ToastType, title: string, message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message }]);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const showLoading = (title: string, message: string) => {
    setLoadingModal({ isOpen: true, title, message });
  };

  const hideLoading = () => {
    setLoadingModal({ isOpen: false, title: '', message: '' });
  };

  const toggleAssessment = (id: number) => {
    setSettings(prev => ({
      ...prev,
      selectedAssessments: prev.selectedAssessments.includes(id)
        ? prev.selectedAssessments.filter(i => i !== id)
        : [...prev.selectedAssessments, id]
    }));
  };

  const getCourseContext = (course: Course) => {
    const courseCodeMatch = course.name.match(/^([A-Z]+\d+-\d+)/i);
    const groupMatch = course.name.match(/กลุ่ม\s*(\d+)/i);
    return {
      courseCode: courseCodeMatch ? courseCodeMatch[1] : course.code,
      groupNumber: groupMatch ? groupMatch[1] : '',
    };
  };

  if (!mounted) return null;

  const handleStartRating = async (skipAutoStudyHoursPreflight = false) => {
    if (!result) return;

    if (settings.courseMode === 'pick' && settings.selectedAssessments.length !== 1) {
      setError('โหมดเลือกเองรองรับแบบประเมินครั้งละ 1 รายการ กรุณาเลือกเพียงรายการเดียว');
      return;
    }
    if (settings.courseMode === 'auto' && settings.teacherMode !== 'auto') {
      setError('โหมดอัตโนมัติจะส่งให้ผู้สอนทุกคนเท่านั้น กรุณาเลือกโหมดผู้สอน Auto');
      return;
    }

    const isAutoRun = settings.courseMode === 'auto';
    if (isAutoRun && autoRunInFlight.current) {
      setError('Auto กำลังทำงานอยู่ กรุณารอให้วิชาปัจจุบันเสร็จก่อน');
      return;
    }
    if (isAutoRun) autoRunInFlight.current = true;

    try {
      // If Auto course mode, process all selected assessments
      if (settings.courseMode === 'auto') {
        const selectedAssessments = result.assessmentList.filter(a =>
          settings.selectedAssessments.includes(a.id)
        );

        if (selectedAssessments.length === 0) {
          setError('กรุณาเลือกการประเมินอย่างน้อย 1 รายการ');
          return;
        }

        // Auto mode has no per-course confirmation screen. Check the CES
        // schedule first, so a course whose self-study value is 0 receives the
        // same explicit user choice and recommended value as Pick mode.
        if (!skipAutoStudyHoursPreflight) {
          setIsLoading(true);
          const zeroHourChoices: AutoStudyHoursChoice[] = [];

          for (const assessment of selectedAssessments) {
            const coursesResponse = await fetch(`${basePath}/api/get-courses`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ assessmentUrl: assessment.url }),
            });
            const coursesData = await coursesResponse.json().catch(() => ({}));
            const courseList = coursesData?.data?.courseList;
            if (!coursesResponse.ok || !Array.isArray(courseList)) {
              throw new Error(`${assessment.title}: ${coursesData?.error || 'โหลดรายการวิชาเพื่อตรวจสอบชั่วโมงไม่สำเร็จ'}`);
            }

            for (const course of courseList as Course[]) {
              if (course.isCompleted) continue;
              const { courseCode, groupNumber } = getCourseContext(course);
              const hoursResponse = await fetch(`${basePath}/api/get-study-hours`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseCode, groupNumber, semester: assessment.semester }),
              });
              const hoursData = await hoursResponse.json().catch(() => ({}));
              if (!hoursResponse.ok || !hoursData?.success) {
                throw new Error(`${assessment.title} / ${courseCode}: ${hoursData?.error || 'ตรวจสอบชั่วโมงไม่สำเร็จ'}`);
              }
              if (hoursData.studyHours === 0 && hoursData.breakdown) {
                zeroHourChoices.push({
                  key: `${assessment.id}:${course.courseKey}`,
                  courseName: course.name,
                  courseCode,
                  assessmentTitle: assessment.title,
                  hours: 6,
                  breakdown: hoursData.breakdown,
                });
              }
            }
          }

          if (zeroHourChoices.length > 0) {
            setAutoStudyHoursChoices(zeroHourChoices);
            setShowAutoStudyHoursModal(true);
            return;
          }
        }

        const progress: AutoProgress = {
          status: 'running',
          totalAssessments: selectedAssessments.length,
          currentAssessment: 0,
          totalCourses: 0,
          currentCourse: 0,
          completed: 0,
          skipped: 0,
          failed: 0,
          failedAssessments: 0,
          lastError: '',
          waitingForNextCourse: false,
        };

        setError('');
        setShowSettings(false);
        setShowCourses(false);
        setAutoProgress({ ...progress });
        setIsLoading(true);

        for (let assessmentIndex = 0; assessmentIndex < selectedAssessments.length; assessmentIndex++) {
          const assessment = selectedAssessments[assessmentIndex];
          progress.currentAssessment = assessmentIndex + 1;
          progress.currentCourse = 0;
          setAutoProgress({ ...progress });

          try {
            const response = await fetch(`${basePath}/api/get-courses`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                assessmentUrl: assessment.url,
              }),
            });

            const data = await response.json().catch(() => ({}));
            const courseList = data?.data?.courseList;
            if (!response.ok || !Array.isArray(courseList)) {
              progress.failedAssessments += 1;
              progress.lastError = data?.error || `โหลดรายการวิชาไม่สำเร็จ (${response.status})`;
              setAutoProgress({ ...progress });
              continue;
            }

            progress.totalCourses += courseList.length;
            setAutoProgress({ ...progress });

            for (let i = 0; i < courseList.length; i++) {
              const course = courseList[i] as Course;
              progress.currentCourse = i + 1;
              setAutoProgress({ ...progress });

              if (course.isCompleted) {
                progress.skipped += 1;
                setAutoProgress({ ...progress });
                continue;
              }

              try {
                const ratingResponse = await fetch(`${basePath}/api/submit-rating-v2`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    courseIndex: course.courseKey,
                    courseCode: course.code,
                  assessmentUrl: assessment.url,
                  teacherMode: settings.teacherMode,
                  formData: {
                    studyHours: autoStudyHoursChoices.find(choice => choice.key === `${assessment.id}:${course.courseKey}`)?.hours ?? 6,
                  },
                }),
                });
                const ratingData = await ratingResponse.json().catch(() => ({}));

                if (ratingResponse.ok && ratingData.success) {
                  progress.completed += 1;
                } else {
                  progress.failed += 1;
                  progress.lastError = ratingData?.error || `ส่งคะแนนไม่สำเร็จ (${ratingResponse.status})`;
                }
              } catch {
                progress.failed += 1;
                progress.lastError = 'เชื่อมต่อเซิร์ฟเวอร์ระหว่างส่งคะแนนไม่สำเร็จ';
              }
              setAutoProgress({ ...progress });

              // CILT is a stateful upstream service. Finish and verify one
              // course, then deliberately pause before touching the next;
              // never fan out parallel submissions.
              const hasNextCourse = i < courseList.length - 1 || assessmentIndex < selectedAssessments.length - 1;
              if (hasNextCourse) {
                progress.waitingForNextCourse = true;
                setAutoProgress({ ...progress });
                await new Promise(resolve => setTimeout(resolve, AUTO_COURSE_DELAY_MS));
                progress.waitingForNextCourse = false;
                setAutoProgress({ ...progress });
              }
            }
          } catch {
            progress.failedAssessments += 1;
            progress.lastError = 'เชื่อมต่อเซิร์ฟเวอร์เพื่อโหลดรายวิชาไม่สำเร็จ';
            setAutoProgress({ ...progress });
          }
        }

        progress.status = 'completed';
        progress.currentAssessment = progress.totalAssessments;
        setAutoProgress({ ...progress });
        addToast(
          progress.failed > 0 || progress.failedAssessments > 0 || progress.completed === 0 ? 'warning' : 'success',
          progress.failed > 0 || progress.failedAssessments > 0 ? 'ดำเนินการเสร็จบางส่วน' : progress.completed === 0 ? 'ไม่มีรายการถูกส่ง' : 'สำเร็จ',
          progress.failed > 0 || progress.failedAssessments > 0 || progress.completed === 0
            ? `สำเร็จ ${progress.completed} วิชา · ข้าม ${progress.skipped} วิชา · ล้มเหลว ${progress.failed} วิชา${progress.failedAssessments > 0 ? ` · โหลดแบบประเมินไม่ได้ ${progress.failedAssessments} รายการ` : ''}`
            : `ส่งคะแนนสำเร็จ ${progress.completed} รายการ`
        );
        setIsLoading(false);
        return;
      }

      setShowSettings(false);
      setIsLoading(true);
      setError('');

      // Pick mode: Show first selected assessment's courses
      const firstAssessment = result.assessmentList.find(a =>
        settings.selectedAssessments.includes(a.id)
      );

      if (!firstAssessment) {
        setError('กรุณาเลือกการประเมินอย่างน้อย 1 รายการ');
        setIsLoading(false);
        return;
      }

      // Store current assessment for later use
      setCurrentAssessment(firstAssessment);

      const response = await fetch(`${basePath}/api/get-courses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentUrl: firstAssessment.url,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'เกิดข้อผิดพลาด');
        setIsLoading(false);
        return;
      }

      setCourses(data.data.courseList);
      setShowCourses(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      if (isAutoRun) autoRunInFlight.current = false;
      setIsLoading(false);
    }
  };

  const handleSelectCourse = async (course: Course) => {
    setSelectedCourse(course);
    setShowConfirmModal(true);
    setCourseError(null); // Reset error when selecting new course
    setStudyHoursCheck(null);
    setFormOptions({ attendance: [], studyHours: [], listening: [], speaking: [], englishUsage: [], platform: [] });
    setQuestionOptions([]);
    setTeachers([]);
    setSelectedTeachers([]);
    setExistingCiltData({ formData: null, answers: [], hasExistingData: false });

    // Load options dynamically
    if (!result) return;

    setLoadingOptions(true);
    try {
      const courseIndex = course.courseKey;

      // Extract course code and group from name
      // Format: "EDU66-314 ( กลุ่ม 8 )" -> code: "EDU66-314", group: "8"
      const courseCodeMatch = course.name.match(/^([A-Z]+\d+-\d+)/i);
      const groupMatch = course.name.match(/กลุ่ม\s*(\d+)/i);

      const actualCourseCode = courseCodeMatch ? courseCodeMatch[1] : course.code;
      const groupNumber = groupMatch ? groupMatch[1] : '';

      // Fetch all options in one API call
      const response = await fetch(`${basePath}/api/get-all-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseIndex: courseIndex,
          courseCode: actualCourseCode,
          groupNumber: groupNumber,
          semester: currentAssessment?.semester || '',
        }),
      });

      const data = await response.json();

      // Check if multiple degree levels found
      if (data.multipleDegrees && data.degreeOptions) {
        setDegreeOptions(data.degreeOptions);
        setPendingCourseData({
          courseCode: actualCourseCode,
          groupNumber: groupNumber,
          semester: currentAssessment?.semester || ''
        });
        setLoadingOptions(false);
        setShowDegreeModal(true);
        return;
      }

      if (data.success) {
        setFormOptions(data.data.formOptions);
        setQuestionOptions(data.data.questionOptions);
        setStudyHoursCheck(data.data.studyHoursCheck || null);
        const loadedTeachers = Array.isArray(data.data.teachers) ? data.data.teachers : [];
        setTeachers(loadedTeachers);
        setSelectedTeachers(loadedTeachers.map((teacher: {id: string}) => teacher.id));

        // Store existing CILT data for warnings
        setExistingCiltData({
          formData: data.data.existingFormData || null,
          answers: data.data.existingAnswers || [],
          hasExistingData: data.data.hasExistingData || false,
        });

        // Initialize answers array with default value 1 for each question
        const questionCount = data.data.questionOptions.length;

        // Set study hours from registrar if found
        // Zero is a valid Registrar value; only fall back when it is absent.
        const studyHoursValue = data.data.studyHoursValue ?? 6;

        // Use existing CILT data as defaults, or fall back to E-learning
        const existingPlatforms = data.data.existingFormData?.platform || [];
        let defaultPlatforms = existingPlatforms;
        if (defaultPlatforms.length === 0) {
          const elearningPlatform = data.data.formOptions.platform.find(
            (p: {id: number, label: string}) => p.label.toLowerCase().includes('e-learning')
          );
          defaultPlatforms = elearningPlatform ? [elearningPlatform.id] : [];
        }

        // Use existing form data from CILT if available
        const existingForm = data.data.existingFormData;
        const existingAnswersData = data.data.existingAnswers || [];

        setFormData(prev => ({
          ...prev,
          attendance: existingForm?.attendance ?? prev.attendance,
          studyHours: studyHoursValue,
          listening: existingForm?.listening ?? prev.listening,
          speaking: existingForm?.speaking ?? prev.speaking,
          englishUsage: existingForm?.englishUsage ?? prev.englishUsage,
          platform: defaultPlatforms,
          // Use existing answers if available, otherwise default to 1
          answers: existingAnswersData.length > 0
            ? existingAnswersData.map((a: number | null) => a ?? 1)
            : Array(questionCount).fill(1)
        }));
        addToast('success', 'โหลดข้อมูลสำเร็จ', `พร้อมส่งคะแนนวิชา ${selectedCourse?.code || ''}`);

      } else {
        // Check for specific errors
        if (data.error === 'no_instructor' && data.message) {
          console.log('Course has no instructor:', data.error);
          setCourseError({ type: 'no_instructor', message: data.message });
          addToast('warning', 'ไม่พบผู้สอน', 'รายวิชานี้ยังไม่มีผู้สอนในระบบ CILT');
        } else {
          console.error('Failed to load options:', data.error);
          setCourseError({
            type: 'error',
            message: data.error || 'ไม่สามารถโหลดข้อมูลได้',
            debug: data.debug
          });
          addToast('error', 'เกิดข้อผิดพลาด', data.error || 'ไม่สามารถโหลดข้อมูลได้');
        }
      }
    } catch (err) {
      console.error('Failed to load options:', err);
      setCourseError({ type: 'error', message: 'ไม่สามารถโหลดข้อมูลได้' });
      addToast('error', 'เกิดข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleDegreeSelect = async (selectedDegree: string) => {
    if (!result || !pendingCourseData) return;

    setShowDegreeModal(false);
    setLoadingOptions(true);

    try {
      const courseIndex = selectedCourse?.courseKey ?? 0;

      // Fetch again with selected degree level
      const response = await fetch(`${basePath}/api/get-all-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseIndex: courseIndex,
          courseCode: pendingCourseData.courseCode,
          groupNumber: pendingCourseData.groupNumber,
          semester: pendingCourseData.semester,
          degreeLevel: selectedDegree,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setFormOptions(data.data.formOptions);
        setQuestionOptions(data.data.questionOptions);
        setStudyHoursCheck(data.data.studyHoursCheck || null);

        // Store existing CILT data for warnings
        setExistingCiltData({
          formData: data.data.existingFormData || null,
          answers: data.data.existingAnswers || [],
          hasExistingData: data.data.hasExistingData || false,
        });

        const questionCount = data.data.questionOptions.length;

        // Set study hours from registrar if found
        // Zero is a valid Registrar value; only fall back when it is absent.
        const studyHoursValue = data.data.studyHoursValue ?? 6;

        // Use existing CILT data as defaults, or fall back to E-learning
        const existingPlatforms = data.data.existingFormData?.platform || [];
        let defaultPlatforms = existingPlatforms;
        if (defaultPlatforms.length === 0) {
          const elearningPlatform = data.data.formOptions.platform.find(
            (p: {id: number, label: string}) => p.label.toLowerCase().includes('e-learning')
          );
          defaultPlatforms = elearningPlatform ? [elearningPlatform.id] : [];
        }

        // Use existing form data from CILT if available
        const existingForm = data.data.existingFormData;
        const existingAnswersData = data.data.existingAnswers || [];

        setFormData(prev => ({
          ...prev,
          attendance: existingForm?.attendance ?? prev.attendance,
          studyHours: studyHoursValue,
          listening: existingForm?.listening ?? prev.listening,
          speaking: existingForm?.speaking ?? prev.speaking,
          englishUsage: existingForm?.englishUsage ?? prev.englishUsage,
          platform: defaultPlatforms,
          // Use existing answers if available, otherwise default to 1
          answers: existingAnswersData.length > 0
            ? existingAnswersData.map((a: number | null) => a ?? 1)
            : Array(questionCount).fill(1)
        }));
        addToast('success', 'โหลดข้อมูลสำเร็จ', `พร้อมส่งคะแนนวิชา ${selectedCourse?.code || ''}`);
      } else {
        // Check for specific errors
        if (data.error === 'no_instructor' && data.message) {
          console.log('Course has no instructor:', data.error);
          setCourseError({ type: 'no_instructor', message: data.message });
          addToast('warning', 'ไม่พบผู้สอน', 'รายวิชานี้ยังไม่มีผู้สอนในระบบ CILT');
        } else {
          console.error('Failed to load options:', data.error);
          setCourseError({
            type: 'error',
            message: data.error || 'ไม่สามารถโหลดข้อมูลได้',
            debug: data.debug
          });
          addToast('error', 'เกิดข้อผิดพลาด', data.error || 'ไม่สามารถโหลดข้อมูลได้');
        }
      }
    } catch (err) {
      console.error('Failed to load options:', err);
      setCourseError({ type: 'error', message: 'ไม่สามารถโหลดข้อมูลได้' });
      addToast('error', 'เกิดข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
      setLoadingOptions(false);
      setPendingCourseData(null);
    }
  };

  const handleConfirmRating = async () => {
    if (!result || !selectedCourse) return;

    setIsLoading(true);
    setError('');
    setShowConfirmModal(false);
    showLoading('กำลังส่งคะแนน', `วิชา ${selectedCourse.code}\nกรุณารอสักครู่...`);

    try {
      const courseIndex = selectedCourse.courseKey;

      const response = await fetch(`${basePath}/api/submit-rating-v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courseIndex,
          courseCode: selectedCourse.code, // Use courseCode to find correct course
          assessmentUrl: currentAssessment?.url,
          teacherMode: settings.teacherMode,
          selectedTeachers: settings.teacherMode === 'pick' ? selectedTeachers : [], // Pass selected teachers for pick mode
          formData: formData, // Send custom form data
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'เกิดข้อผิดพลาด');
        setIsLoading(false);
        return;
      }

      // Success
      addToast('success', 'ส่งคะแนนสำเร็จ', `วิชา ${selectedCourse.code} ถูกส่งคะแนนเรียบร้อยแล้ว`);

      // Reset to course selection state
      setCourses(previous => previous.map(course => course.id === selectedCourse.id ? { ...course, isCompleted: true } : course));
      setSelectedCourse(null);
      setStudyHoursCheck(null);
      setFormOptions({
        attendance: [],
        studyHours: [],
        listening: [],
        speaking: [],
        englishUsage: [],
        platform: []
      });
      setQuestionOptions([]);
      setFormData({
        attendance: 6,
        studyHours: 6,
        listening: 11,
        speaking: 15,
        englishUsage: 19,
        platform: [],
        answers: []
      });
      setExistingCiltData({ formData: null, answers: [], hasExistingData: false });
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการให้คะแนน');
      addToast('error', 'เกิดข้อผิดพลาด', 'ไม่สามารถส่งคะแนนได้');
    } finally {
      setIsLoading(false);
      hideLoading();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${basePath}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: studentId,
          password: password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'เกิดข้อผิดพลาด');
        setIsLoading(false);
        return;
      }

      setResult(data.data);
      setIsLoggedIn(true);
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoggedIn && result) {
    // Settings Panel
    if (showSettings) {
      return (
        <>
          <ToastContainer toasts={toasts} removeToast={removeToast} />
          <LoadingModal isOpen={loadingModal.isOpen} title={loadingModal.title} message={loadingModal.message} />
          <div className="portal-shell workspace-shell">
            <div className="workspace-card max-w-4xl">
              <h2 className="text-2xl font-light text-gray-800 mb-2">ตั้งค่าการให้คะแนน</h2>
              <p className="text-gray-600 mb-6">รหัสนักศึกษา: {result.username}</p>

              {/* Settings Form */}
            <div className="space-y-6">
              {/* Course Mode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  โหมดการเลือกรายวิชา
                </label>
                <div className="grid grid-cols-2 gap-6">
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, courseMode: 'pick' }))}
                    className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      settings.courseMode === 'pick'
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Pick - เลือกรายวิชาเอง
                  </button>
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, courseMode: 'auto' }))}
                    className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      settings.courseMode === 'auto'
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Auto - ให้คะแนนทั้งหมดอัตโนมัติ
                  </button>
                </div>
              </div>

              {/* Teacher Mode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  โหมดการเลือกอาจารย์
                </label>
                <div className="grid grid-cols-2 gap-6">
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, teacherMode: 'pick' }))}
                    className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      settings.teacherMode === 'pick'
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Pick - เลือกอาจารย์เอง
                  </button>
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, teacherMode: 'auto' }))}
                    className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      settings.teacherMode === 'auto'
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Auto - ให้คะแนนทุกอาจารย์
                  </button>
                </div>
              </div>

              {/* Assessment Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  เลือกการประเมินที่ต้องการทำ ({result.assessmentCount} รายการ)
                </label>
                <div className="space-y-2">
                  {result.assessmentList.map((assessment) => (
                    <div
                      key={assessment.id}
                      onClick={() => toggleAssessment(assessment.id)}
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        settings.selectedAssessments.includes(assessment.id)
                          ? 'border-gray-800 bg-gray-50'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={settings.selectedAssessments.includes(assessment.id)}
                          onChange={() => {}}
                          className="w-4 h-4"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-gray-800">{assessment.title}</p>
                          <div className="flex items-center gap-3 text-sm text-gray-600 mt-1">
                            <span>{assessment.department}</span>
                            {assessment.semester && (
                              <>
                                <span className="text-gray-400">•</span>
                                <span className="text-gray-500">{assessment.semester}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Start Button */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => void handleStartRating()}
                  disabled={isLoading || settings.selectedAssessments.length === 0}
                  className="flex-1 px-6 py-3 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'กำลังดำเนินการ...' : 'เริ่มให้คะแนน'}
                </button>
              </div>

              {settings.selectedAssessments.length === 0 && (
                <p className="text-sm text-gray-500 text-center">
                  กรุณาเลือกการประเมินอย่างน้อย 1 รายการ
                </p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mt-6">
                {error}
              </div>
            )}
            </div>
          </div>

          {showAutoStudyHoursModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
                <h3 className="text-xl font-light text-gray-800">ตรวจสอบชั่วโมงศึกษาด้วยตนเองก่อนเริ่ม Auto</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  CES ระบุชั่วโมงศึกษาด้วยตนเองเป็น 0 ชั่วโมง แต่ CILT จะไม่พาไปหน้าคำถามเมื่อใช้ 0 ระบบจึงกรอก 6 ชั่วโมงไว้เป็นค่าแนะนำสำหรับแต่ละวิชา กรุณาตรวจสอบหรือแก้ไขก่อนเริ่ม
                </p>

                <div className="mt-5 space-y-4">
                  {autoStudyHoursChoices.map((choice, index) => (
                    <div key={choice.key} className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                      <p className="font-medium text-amber-950">{choice.courseName || choice.courseCode}</p>
                      <p className="mt-1 text-xs text-amber-800">{choice.assessmentTitle}</p>
                      <p className="mt-3 text-sm text-amber-900">
                        CES: {choice.breakdown.creditInfo} · บรรยาย {choice.breakdown.lectureHours} ชม. · ปฏิบัติ {choice.breakdown.practiceHours} ชม. · ศึกษาด้วยตนเอง {choice.breakdown.selfStudyHours} ชม. ต่อสัปดาห์
                      </p>
                      <label className="mt-3 block text-sm font-medium text-amber-950" htmlFor={`auto-study-hours-${index}`}>
                        ค่าที่จะส่งให้ CILT
                      </label>
                      <select
                        id={`auto-study-hours-${index}`}
                        value={choice.hours}
                        onChange={(event) => {
                          const hours = parseInt(event.target.value, 10);
                          setAutoStudyHoursChoices(previous => previous.map(item => item.key === choice.key ? { ...item, hours } : item));
                        }}
                        className="mt-1 w-full rounded border border-amber-400 bg-white px-3 py-2 text-gray-800"
                      >
                        {Array.from({ length: 9 }, (_, itemIndex) => itemIndex + 1).map(hours => (
                          <option key={hours} value={hours}>{hours === 9 ? '9+ ชม.' : `${hours} ชม.`}{hours === 6 ? ' — แนะนำ' : ''}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => {
                      setShowAutoStudyHoursModal(false);
                      setAutoStudyHoursChoices([]);
                    }}
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={() => {
                      setShowAutoStudyHoursModal(false);
                      void handleStartRating(true);
                    }}
                    className="flex-1 rounded-lg bg-gray-800 px-4 py-2 text-white transition-colors hover:bg-gray-700"
                  >
                    ยืนยันและเริ่ม Auto
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      );
    }

    if (settings.courseMode === 'auto' && autoProgress) {
      const courseProgress = autoProgress.totalCourses > 0
        ? Math.min(100, Math.round(((autoProgress.completed + autoProgress.skipped + autoProgress.failed) / autoProgress.totalCourses) * 100))
        : 0;

      return (
        <>
          <ToastContainer toasts={toasts} removeToast={removeToast} />
          <div className="portal-shell workspace-shell">
            <div className="workspace-card mx-auto max-w-3xl">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">WU · CILT Assistant</p>
                  <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
                    {autoProgress.status === 'running' ? 'กำลังให้คะแนนอัตโนมัติ' : 'สรุปการให้คะแนน'}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">รหัสนักศึกษา: {result.username}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${autoProgress.status === 'running' ? 'bg-blue-100 text-blue-700' : autoProgress.failed > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {autoProgress.status === 'running' ? 'กำลังทำงาน' : autoProgress.failed > 0 || autoProgress.failedAssessments > 0 ? 'เสร็จบางส่วน' : 'เสร็จแล้ว'}
                </span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="mb-5 flex items-center justify-between text-sm text-slate-600">
                  <span>การประเมิน {autoProgress.currentAssessment}/{autoProgress.totalAssessments}</span>
                  <span>{courseProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-slate-900 transition-all duration-500" style={{ width: `${courseProgress}%` }} />
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ['สำเร็จ', autoProgress.completed, 'text-emerald-700 bg-emerald-50'],
                    ['ข้ามแล้ว', autoProgress.skipped, 'text-slate-700 bg-slate-100'],
                    ['ล้มเหลว', autoProgress.failed, 'text-red-700 bg-red-50'],
                    ['วิชาที่พบ', autoProgress.totalCourses, 'text-blue-700 bg-blue-50'],
                    ['โหลดแบบประเมินไม่ได้', autoProgress.failedAssessments, 'text-amber-700 bg-amber-50'],
                  ].map(([label, value, style]) => (
                    <div key={label} className={`rounded-xl p-4 ${style}`}>
                      <p className="text-xs font-medium opacity-75">{label}</p>
                      <p className="mt-1 text-2xl font-semibold">{value}</p>
                    </div>
                  ))}
                </div>

                {autoProgress.status === 'running' && (
                  <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                    {autoProgress.waitingForNextCourse
                      ? 'ตรวจวิชานี้เสร็จแล้ว กำลังพัก 3 วินาทีก่อนเริ่มวิชาถัดไป'
                      : `กำลังประมวลผลวิชาที่ ${autoProgress.currentCourse || '-'} ของการประเมินปัจจุบัน ระบบจะทำรายการถัดไปต่อแม้บางรายการมีปัญหา`}
                  </div>
                )}

                {autoProgress.lastError && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    รายการล่าสุดที่มีปัญหา: {autoProgress.lastError}
                  </div>
                )}

                {autoProgress.status === 'completed' && (
                  <button
                    onClick={() => setShowSettings(true)}
                    className="mt-6 w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
                  >
                    กลับไปตั้งค่า
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      );
    }

    // Pick Mode - Course Selection View
    return (
      <>
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <LoadingModal isOpen={loadingModal.isOpen} title={loadingModal.title} message={loadingModal.message} />
        <div className="portal-shell workspace-shell">
          <div className="workspace-card max-w-4xl">
            <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-light text-gray-800">เลือกรายวิชา</h2>
              <p className="text-gray-600 mt-1">รหัสนักศึกษา: {result.username}</p>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ← กลับไปตั้งค่า
            </button>
            </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-6">
              {error}
            </div>
          )}

          {showCourses && courses.length > 0 && (
            <div>
              <h3 className="text-lg font-light text-gray-700 mb-4">
                พบรายวิชา {courses.length} วิชา
              </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {courses.map((course) => (
                    <div
                      key={course.id}
                      className={`border rounded-lg p-4 transition-all cursor-pointer relative ${
                        course.isCompleted
                          ? 'border-green-200 bg-green-50/30 hover:border-green-400'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                      onClick={() => { if (!course.isCompleted) handleSelectCourse(course); }}
                    >
                      {course.isCompleted && (
                        <div className="absolute top-2 right-2 text-green-500" title="ประเมินแล้ว">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className={`font-medium ${course.isCompleted ? 'text-green-800' : 'text-gray-800'}`}>
                            {course.name}
                          </p>
                          {course.code && (
                            <p className={`text-sm mt-1 ${course.isCompleted ? 'text-green-600/70' : 'text-gray-500'}`}>
                              {course.code}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!course.isCompleted) handleSelectCourse(course);
                          }}
                          disabled={isLoading || !!course.isCompleted}
                          className={`px-4 py-2 rounded-lg text-sm transition-colors disabled:bg-gray-400 ml-4 ${
                            course.isCompleted
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-gray-800 text-white hover:bg-gray-700'
                          }`}
                        >
                          {isLoading ? '...' : course.isCompleted ? 'ประเมินแล้ว' : 'ให้คะแนน'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Confirmation Modal */}
          {showConfirmModal && selectedCourse && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                  <h3 className="text-xl font-light text-gray-800 mb-4">
                    ยืนยันการให้คะแนน
                  </h3>

                  <div className="mb-6">
                    <p className="text-gray-700 font-medium">{selectedCourse.name}</p>
                    {selectedCourse.code && (
                      <p className="text-sm text-gray-500">{selectedCourse.code}</p>
                    )}
                  </div>

                  {/* Settings Summary */}
                  <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-blue-900 mb-2">การตั้งค่า:</h4>
                    <div className="space-y-1 text-sm text-blue-800">
                      <div>• รายวิชา: <span className="font-medium">{settings.courseMode === 'pick' ? 'Pick (เลือกเอง)' : 'Auto (ทั้งหมด)'}</span></div>
                      <div>• อาจารย์: <span className="font-medium">{settings.teacherMode === 'pick' ? 'Pick (เลือกเอง)' : 'Auto (ทุกคน)'}</span></div>
                    </div>
                  </div>

                  {/* Teacher Selection (Pick Mode Only) */}
                  {settings.teacherMode === 'pick' && (
                    <div className="mb-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-purple-900 mb-3">เลือกอาจารย์ที่ต้องการให้คะแนน:</h4>
                      {loadingTeachers ? (
                        <div className="text-center text-purple-600 animate-pulse">กำลังโหลดรายชื่ออาจารย์...</div>
                      ) : teachers.length === 0 ? (
                        <div className="text-sm text-purple-700">ไม่พบรายชื่ออาจารย์</div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-purple-700">พบอาจารย์ {teachers.length} คน</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedTeachers.length === teachers.length) {
                                  setSelectedTeachers([]);
                                } else {
                                  setSelectedTeachers(teachers.map(t => t.id));
                                }
                              }}
                              className="text-xs text-purple-600 hover:text-purple-800 underline"
                            >
                              {selectedTeachers.length === teachers.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                            </button>
                          </div>
                          {teachers.map(teacher => (
                            <label key={teacher.id} className="flex items-center space-x-2 cursor-pointer hover:bg-purple-100 p-2 rounded">
                              <input
                                type="checkbox"
                                checked={selectedTeachers.includes(teacher.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedTeachers(prev => [...prev, teacher.id]);
                                  } else {
                                    setSelectedTeachers(prev => prev.filter(id => id !== teacher.id));
                                  }
                                }}
                                className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                              />
                              <span className="text-sm text-purple-800">{teacher.name}</span>
                            </label>
                          ))}
                          {selectedTeachers.length === 0 && (
                            <div className="text-xs text-red-500 mt-2">* กรุณาเลือกอาจารย์อย่างน้อย 1 คน</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Editable Form Data */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">ข้อมูลที่จะส่ง:</h4>
                    {loadingOptions ? (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-600">
                        <div className="animate-pulse">กำลังโหลดข้อมูล...</div>
                      </div>
                    ) : courseError ? (
                      <div className={`${courseError.type === 'no_instructor' ? 'bg-yellow-50 border-yellow-300' : 'bg-red-50 border-red-200'} border rounded-lg p-4 text-sm`}>
                        <p className={`font-medium mb-2 ${courseError.type === 'no_instructor' ? 'text-yellow-800' : 'text-red-700'}`}>
                          {courseError.type === 'no_instructor' ? '⚠️ ไม่พบผู้สอน' : '⚠️ เกิดข้อผิดพลาด'}
                        </p>
                        <p className={`${courseError.type === 'no_instructor' ? 'text-yellow-700' : 'text-red-600'} whitespace-pre-wrap`}>
                          {courseError.message}
                        </p>
                      </div>
                    ) : formOptions.attendance.length === 0 ? (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                        <p className="font-medium mb-2">⚠️ ไม่พบข้อมูลตัวเลือก</p>
                        <p>กรุณาถ่ายภาพหน้าจอนี้และส่งให้ผู้พัฒนาเพื่อแก้ไข</p>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-lg p-4 space-y-4 text-sm">
                        {studyHoursCheck?.requiresUserChoice && studyHoursCheck.breakdown && (
                          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
                            <p className="font-semibold">ตรวจสอบชั่วโมงศึกษาด้วยตนเองก่อนส่ง</p>
                            <p className="mt-1 text-xs leading-5 text-amber-800">
                              ระบบทะเบียนระบุ {studyHoursCheck.breakdown.creditInfo}: บรรยาย {studyHoursCheck.breakdown.lectureHours} ชม. · ปฏิบัติ {studyHoursCheck.breakdown.practiceHours} ชม. · ศึกษาด้วยตนเอง {studyHoursCheck.breakdown.selfStudyHours} ชม. ต่อสัปดาห์
                            </p>
                            <p className="mt-2 text-xs leading-5 text-amber-800">
                              CILT รับค่า 0 ได้ แต่จะไม่พาไปหน้าคำถาม จึงตั้งค่า {studyHoursCheck.recommendedHours} ชม. ไว้ให้เป็นคำแนะนำ กรุณาตรวจสอบหรือเลือกค่าอื่นก่อนยืนยัน
                            </p>
                          </div>
                        )}
                        <div>
                          <div className="text-gray-600 mb-1">ร้อยละเวลาเข้าชั้น:</div>
                          <select
                            value={formData.attendance}
                            onChange={(e) => setFormData(prev => ({ ...prev, attendance: parseInt(e.target.value) }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-gray-800"
                          >
                            {formOptions.attendance.map(opt => (
                              <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <div className="text-gray-600 mb-1 flex items-center justify-between gap-2">
                            <span>ชั่วโมงศึกษาด้วยตนเองต่อสัปดาห์:</span>
                            {studyHoursCheck?.status === 'verified' && (
                              <span className="text-xs text-green-600">ตรวจสอบแล้วจาก CILT</span>
                            )}
                            {studyHoursCheck?.status === 'mismatch' && (
                              <span className="text-xs text-red-600">ค่าต้นทางไม่ตรงกับ CILT</span>
                            )}
                            {studyHoursCheck?.status === 'unverified' && (
                              <span className="text-xs text-yellow-600">ยังตรวจสอบกับ CILT ไม่สำเร็จ</span>
                            )}
                          </div>
                          {studyHoursCheck && (
                            <div className="mb-2 text-xs text-gray-500">
                              Registrar: {studyHoursCheck.registrarHours} ชม. → CILT: {studyHoursCheck.ciltHours ?? '-'} ชม.
                            </div>
                          )}
                          <select
                            value={formData.studyHours}
                            onChange={(e) => setFormData(prev => ({ ...prev, studyHours: parseInt(e.target.value) }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-gray-800"
                          >
                            {formOptions.studyHours.map(opt => (
                              <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <div className="text-gray-600 mb-1">ทักษะฟังภาษาอังกฤษ:</div>
                          <select
                            value={formData.listening}
                            onChange={(e) => setFormData(prev => ({ ...prev, listening: parseInt(e.target.value) }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-gray-800"
                          >
                            {formOptions.listening.map(opt => (
                              <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <div className="text-gray-600 mb-1">ทักษะพูดภาษาอังกฤษ:</div>
                          <select
                            value={formData.speaking}
                            onChange={(e) => setFormData(prev => ({ ...prev, speaking: parseInt(e.target.value) }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-gray-800"
                          >
                            {formOptions.speaking.map(opt => (
                              <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <div className="text-gray-600 mb-1">การใช้ภาษาอังกฤษ:</div>
                          <select
                            value={formData.englishUsage}
                            onChange={(e) => setFormData(prev => ({ ...prev, englishUsage: parseInt(e.target.value) }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-gray-800"
                          >
                            {formOptions.englishUsage.map(opt => (
                              <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <div className="text-gray-600 mb-1">Platform:</div>
                          <div className="space-y-2">
                            {formOptions.platform.map(opt => (
                              <label key={opt.id} className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={formData.platform.includes(opt.id)}
                                  onChange={(e) => {
                                    setFormData(prev => ({
                                      ...prev,
                                      platform: e.target.checked
                                        ? [...prev.platform, opt.id]
                                        : prev.platform.filter(id => id !== opt.id)
                                    }));
                                  }}
                                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="text-gray-800">{opt.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Editable Questions */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">คำตอบ 24 ข้อ:</h4>
                    {loadingOptions ? (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-600">
                        <div className="animate-pulse">กำลังโหลดคำถาม...</div>
                      </div>
                    ) : courseError ? (
                      <div className={`${courseError.type === 'no_instructor' ? 'bg-yellow-50 border-yellow-300' : 'bg-red-50 border-red-200'} border rounded-lg p-4 text-sm`}>
                        <p className={`${courseError.type === 'no_instructor' ? 'text-yellow-700' : 'text-red-600'} font-medium`}>
                          {courseError.message}
                        </p>
                        {courseError.debug && (
                          <div className="mt-3 pt-3 border-t border-red-200/50">
                            <p className="text-xs font-bold text-red-800 mb-1 uppercase tracking-wider">Debug Info:</p>
                            <div className="bg-black/5 p-2 rounded text-[10px] font-mono overflow-x-auto whitespace-pre">
                              {JSON.stringify(courseError.debug, null, 2)}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : questionOptions.length === 0 ? (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                        <p className="font-medium mb-2">⚠️ ไม่พบตัวเลือกคำถาม</p>
                        <p>กรุณาถ่ายภาพหน้าจอนี้และส่งให้ผู้พัฒนาเพื่อแก้ไข</p>
                      </div>
                    ) : (
                      <>
                        {/* Warning for existing answers */}
                        {existingCiltData.hasExistingData && existingCiltData.answers.some(a => a !== null) && (
                          <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-3">
                            <p className="text-red-700 text-sm font-medium">
                              ⚠️ พบคำตอบเดิมใน CILT ({existingCiltData.answers.filter(a => a !== null).length} ข้อ)
                            </p>
                            <p className="text-red-600 text-xs mt-1">
                              คำตอบที่แสดงด้านล่างจะถูกส่งไปวางทับคำตอบเดิม
                            </p>
                          </div>
                        )}
                        <div className="bg-gray-50 rounded-lg p-4 max-h-80 overflow-y-auto">
                          <div className="space-y-2 text-sm">
                            {questionOptions.map((options, i) => {
                              if (!options || options.length === 0) {
                                return (
                                  <div key={i} className="flex items-center gap-2 text-red-600">
                                    <span className="w-12">{i + 1}.</span>
                                    <span className="text-xs">ไม่พบตัวเลือก - กรุณาแจ้งผู้พัฒนา</span>
                                  </div>
                                );
                              }

                              const hasExistingAnswer = existingCiltData.answers[i] !== null && existingCiltData.answers[i] !== undefined;
                              const existingAnswer = existingCiltData.answers[i];
                              const currentAnswer = formData.answers[i] || 1;
                              const willOverwrite = hasExistingAnswer && existingAnswer !== currentAnswer;

                              return (
                                <div key={i} className={`flex items-center justify-between gap-2 ${hasExistingAnswer ? 'bg-red-50 -mx-2 px-2 py-1 rounded' : ''}`}>
                                  <span className={`w-12 ${hasExistingAnswer ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                                    {i + 1}.{hasExistingAnswer && ' *'}
                                  </span>
                                  <select
                                    value={currentAnswer}
                                    onChange={(e) => {
                                      const newAnswers = [...formData.answers];
                                      newAnswers[i] = parseInt(e.target.value);
                                      setFormData(prev => ({ ...prev, answers: newAnswers }));
                                    }}
                                    className={`flex-1 px-2 py-1 border rounded text-gray-800 ${willOverwrite ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                                  >
                                    {options.map((opt) => (
                                      <option key={opt.id} value={opt.id}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                  {hasExistingAnswer && (
                                    <span className="text-xs text-red-500 whitespace-nowrap">
                                      เดิม: {existingAnswer}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          * ค่าเริ่มต้น: option 1 (ดีที่สุด) สำหรับทุกคำถาม ({questionOptions.length} คำถาม)
                          {existingCiltData.answers.some(a => a !== null) && (
                            <span className="text-red-500 ml-2">| * = มีคำตอบเดิมใน CILT</span>
                          )}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowConfirmModal(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                      disabled={isLoading}
                    >
                      ยกเลิก
                    </button>
                    <button
                      onClick={handleConfirmRating}
                      className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                      disabled={isLoading || loadingOptions || loadingTeachers || !!courseError || Object.values(formOptions).every(arr => arr.length === 0)}
                    >
                      {isLoading ? 'กำลังส่ง...' : loadingOptions || loadingTeachers || Object.values(formOptions).every(arr => arr.length === 0) ? 'กำลังโหลด...' : 'ยืนยันและส่ง'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Degree Selection Modal */}
          {showDegreeModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 className="text-xl font-light text-gray-800 mb-4">
                  เลือกระดับการศึกษา
                </h3>

                <p className="text-sm text-gray-600 mb-4">
                  พบรายวิชานี้ในหลายระดับการศึกษา กรุณาเลือกระดับที่ต้องการ:
                </p>

                <div className="space-y-3">
                  {degreeOptions.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => handleDegreeSelect(option.level)}
                      className="w-full text-left p-4 border border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium text-gray-800">
                            {option.level}
                          </div>
                          <div className="text-sm text-gray-500 mt-1">
                            {option.credit} → {option.studyHours} ชม.ศึกษาด้วยตนเอง
                          </div>
                        </div>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setShowDegreeModal(false);
                    setPendingCourseData(null);
                  }}
                  className="w-full mt-4 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Loading Modal */}
      <LoadingModal
        isOpen={loadingModal.isOpen}
        title={loadingModal.title}
        message={loadingModal.message}
      />

      <div className="portal-shell">
        <header className="site-header">
          <Link className="site-brand" href="/">WU / CILT</Link>
          <nav className="site-nav" aria-label="เมนูหลัก">
            <a className="site-report-link" href="#tickets">รายงานปัญหา ↘</a>
            <a className="site-source-link" href={SOURCE_REPOSITORY_URL} target="_blank" rel="noreferrer">GitHub · Open source ↗</a>
          </nav>
        </header>
        <main className="home-layout">
          <section className="home-intro">
            <p className="eyebrow">CILT ASSISTANT · WU</p>
            <h2>ลดงานซ้ำ<br />ทีละวิชา</h2>
            <p>พัฒนาเพื่อการเรียนรู้และลดงานซ้ำ เราแค่ไม่อยากกรอกและกดขั้นตอนเดิมซ้ำ ๆ ไม่ได้ต้องการทำให้ CILT หรือเว็บไซต์เสียหาย</p>
            <dl>
              <div><dt>01</dt><dd>ใช้ session เฉพาะฝั่ง server</dd></div>
              <div><dt>02</dt><dd>Auto ทำทีละวิชาและพัก 3 วินาที</dd></div>
              <div><dt>03</dt><dd>โค้ดเปิดให้ตรวจและช่วยพัฒนาได้</dd></div>
            </dl>
          </section>
          <section className="auth-form">
          <h1 className="mb-2 text-center text-4xl font-semibold text-gray-800">
            ระบบให้คะแนนบุคลากร
          </h1>
          <p className="mb-8 text-center text-base font-medium text-gray-500">
            เครื่องมือช่วยลดงานซ้ำ สำหรับคนที่ไม่อยากกดเดิม ๆ
          </p>

          <div className="mb-8 space-y-2 border-l-4 border-amber-400 bg-amber-50 p-5 text-sm leading-6 text-amber-800">
            <p className="text-base font-bold">⚠️ คำเตือนและข้อตกลงการใช้งาน</p>
            <p>เป้าหมายคือช่วยลดขั้นตอนซ้ำ ไม่ใช่ทำให้ CILT ล่ม เสียหาย หรือข้ามการยืนยันตัวตนของระบบ</p>
            <p>Auto ส่งตามลำดับทีละวิชาและพัก 3 วินาทีก่อนวิชาถัดไป; ระบบไม่ยิงวิชาพร้อมกัน</p>
            <p>รหัสนักศึกษาและรหัสผ่านส่งต่อไปยัง CILT แบบ real-time และไม่บันทึกเป็นข้อมูลผู้ใช้ในฐานข้อมูล ระบบใช้เฉพาะ CILT session ฝั่ง server ชั่วคราว 15 นาทีเพื่อทำงานต่อ</p>
            <p>เครื่องมือนี้ไม่ใช่ระบบอย่างเป็นทางการของมหาวิทยาลัย ผู้ใช้รับผิดชอบผลจากการใช้งานด้วยตนเอง</p>
            <p>ตั๋วปัญหาเป็นข้อยกเว้น: เป็นข้อความสาธารณะและเก็บถาวร จึงห้ามใส่ข้อมูลส่วนตัว รหัสผ่าน หรือ OTP</p>
            <p>อัปเดตล่าสุด: {LAST_UPDATED_LABEL}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="studentId" className="mb-2 block text-base font-semibold text-gray-700">
                รหัสนักศึกษา
              </label>
              <input
                type="text"
                id="studentId"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                autoComplete="username"
                inputMode="numeric"
                placeholder="กรอกรหัสนักศึกษา"
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3.5 text-base text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-500 focus:ring-1 focus:ring-gray-400"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-base font-semibold text-gray-700">
                รหัสผ่าน
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="กรอกรหัสผ่าน CILT"
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3.5 text-base text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-500 focus:ring-1 focus:ring-gray-400"
                required
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-gray-800 py-3.5 text-base font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
              disabled={isLoading}
            >
              {isLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>

            <div className="mt-6 border-t border-gray-200 pt-5 text-center text-sm text-gray-400">
              <p>
                อ้างอิงข้อมูลจาก{' '}
                <a
                  href="https://ciltapp.wu.ac.th/site/login"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-500 hover:underline"
                >
                  ciltapp.wu.ac.th
                </a>
              </p>
              <p className="mt-1">V {process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'}</p>
            </div>
          </form>
          <aside className="source-note">
            <p className="source-kicker">GITHUB · OPEN SOURCE</p>
            <h2>ตรวจโค้ดได้ทั้งหมด</h2>
            <p>ตรวจได้ว่าระบบทำอะไรบ้าง: ลดขั้นตอนซ้ำ, ทำงานทีละวิชา, และไม่เก็บบัญชีผู้ใช้เป็นฐานข้อมูล</p>
            <p>fork ไปพัฒนาต่อ หรือส่ง Pull Request เพื่อช่วยพัฒนาได้</p>
            <p>การเปลี่ยนแปลงทุก Pull Request ต้องผ่านการตรวจโดย maintainer ก่อน merge</p>
            <p>อัปเดตล่าสุด: {LAST_UPDATED_LABEL}</p>
            <a className="source-button" href={SOURCE_REPOSITORY_URL} target="_blank" rel="noreferrer">เปิด GitHub repository ↗</a>
          </aside>
          </section>
        </main>
        <TicketBoard />
      </div>
    </>
  );
}
