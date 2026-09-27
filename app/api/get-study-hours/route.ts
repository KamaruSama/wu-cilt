import { NextRequest, NextResponse } from 'next/server';
import { getStudyHours } from '@/lib/get-study-hours';
import { withApiLogging } from '@/lib/api-logger';
import { logError } from '@/lib/logger';

async function handlePost(request: NextRequest) {
  try {
    const { courseCode, semester, groupNumber } = await request.json();

    if (!courseCode) {
      return NextResponse.json(
        { success: false, error: 'Missing course code' },
        { status: 400 }
      );
    }

    const result = await getStudyHours(courseCode, semester || '', groupNumber || '');

    return NextResponse.json(result);

  } catch (error) {
    const errorId = logError('get-study-hours.failed', error);
    return NextResponse.json(
      {
        success: false,
        found: false,
        studyHours: null,
        error: 'ไม่สามารถดึงชั่วโมงเรียนได้',
        errorId
      },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging('get-study-hours', handlePost);
