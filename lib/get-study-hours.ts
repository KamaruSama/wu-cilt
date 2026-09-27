import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

export interface StudyHoursBreakdown {
  creditInfo: string;
  credits: number;
  lectureHours: number;
  practiceHours: number;
  selfStudyHours: number;
  degreeLevel: string;
  groupNumber: string;
}

export async function getStudyHours(courseCode: string, semester: string, groupNumber: string = '', degreeLevel: string = ''): Promise<{
  success: boolean;
  found: boolean;
  studyHours: number | null;
  breakdown?: StudyHoursBreakdown;
  courseDetailUrl?: string;
  error?: string;
  multipleDegrees?: boolean;
  degreeOptions?: Array<{level: string, credit: string, studyHours: number, breakdown: StudyHoursBreakdown}>;
}> {
  try {
    if (!courseCode || !courseCode.trim()) {
      return {
        success: false,
        found: false,
        studyHours: null,
        error: 'Missing course code'
      };
    }

    // Parse semester: "2/68" or "2 / 2568" -> term=2, year=2568
    let term = '1';
    let year = '2568';

    if (semester) {
      // Match formats: "2/68", "2 / 68", "2/2568", "2 / 2568"
      const match = semester.match(/(\d+)\s*\/\s*(\d+)/);
      if (match) {
        term = match[1];
        const yearPart = match[2];
        // Convert to full year: 68 -> 2568, 2568 -> 2568
        year = yearPart.length === 2 ? `25${yearPart}` : yearPart;
      }
    }

    console.log(`🔍 Searching registrar: code=${courseCode}, group=${groupNumber || 'any'}, term=${term}, year=${year}`);

    // Use correct form parameters
    const formData = new URLSearchParams({
      'semester': term,
      'Acadyear': year,
      'coursecode': courseCode,
      'coursename': '',
      'facultyid': 'all',
      'maxrow': '50',
      'fSearch': 'ค้นหารายวิชา'
    });

    const response = await fetch('https://ces.wu.ac.th/registrar/class_info_1.asp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://ces.wu.ac.th/registrar/class_info.asp',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      console.log('❌ Registrar request failed:', response.status);
      return {
        success: false,
        found: false,
        studyHours: null
      };
    }

    // Read as buffer and decode TIS-620
    const buffer = await response.arrayBuffer();
    const html = iconv.decode(Buffer.from(buffer), 'tis-620');

    // Save HTML for debugging
    const fs = require('fs');
    fs.writeFileSync('/tmp/registrar-search.html', html);
    console.log('💾 Saved registrar HTML to /tmp/registrar-search.html');

    // Parse HTML to find course in table
    const $ = cheerio.load(html);

    let studyHours: number | null = null;
    let courseDetailUrl: string | null = null;

    // Track matches by degree level
    const matchesByDegree = new Map<string, {credit: string, studyHours: number, breakdown: StudyHoursBreakdown}>();
    let currentDegreeLevel = '';
    let studyHoursBreakdown: StudyHoursBreakdown | undefined;

    // Look for degree level headers and table rows
    // Degree headers: <tr bgcolor="orange"><th colspan="7">degree name</th>
    // Table rows: รหัสวิชา | ชื่อรายวิชา | นก./นว. | กลุ่ม | รับ | ลง | เหลือ

    // Parse table rows
    $('tr').each(function() {
      const row = $(this);
      const bgcolor = row.attr('bgcolor');

      // Check if this row is a degree header row (orange background with colspan=7)
      if (bgcolor === 'orange') {
        const headerCell = row.find('th[colspan="7"]');
        if (headerCell.length > 0) {
          currentDegreeLevel = headerCell.text().trim();
          console.log(`📚 Found degree level: ${currentDegreeLevel}`);
          return; // Skip to next row
        }
      }

      // Check if this row has course data
      const cells = row.find('td');
      if (cells.length >= 4) {
        const rowCourseCode = $(cells[0]).text().trim();
        const creditInfo = $(cells[2]).text().trim(); // "4 (3-2-7)"
        const rowGroup = $(cells[3]).text().trim();

        // Check if this row matches our course code
        if (rowCourseCode === courseCode) {
          // If group number specified, match it; otherwise take first match
          if (!groupNumber || rowGroup === groupNumber) {
            // Parse credit info: "4 (3-2-7)" -> extract last number (7)
            const creditPattern = /(\d+)\s*\((\d+)-(\d+)-(\d+)\)/;
            const match = creditInfo.match(creditPattern);

            if (match) {
              const selfStudy = parseInt(match[4]);
              const level = currentDegreeLevel || 'ไม่ระบุระดับ';

              const breakdown: StudyHoursBreakdown = {
                creditInfo,
                credits: parseInt(match[1], 10),
                lectureHours: parseInt(match[2], 10),
                practiceHours: parseInt(match[3], 10),
                selfStudyHours: parseInt(match[4], 10),
                degreeLevel: level,
                groupNumber: rowGroup,
              };

              matchesByDegree.set(level, {
                credit: creditInfo,
                studyHours: selfStudy,
                breakdown,
              });

              console.log(`✅ Found: ${courseCode} กลุ่ม ${rowGroup} [${level}] -> ${creditInfo} -> ${selfStudy} ชม.`);
            }
          }
        }
      }
    });

    // Handle results based on degree level matches
    if (matchesByDegree.size === 0) {
      console.log('⚠️ No matches found in table');
    } else if (matchesByDegree.size === 1) {
      // Only one degree level found - use it
      const [level, data] = Array.from(matchesByDegree.entries())[0];
      studyHours = data.studyHours;
      studyHoursBreakdown = data.breakdown;
      console.log(`✅ Single degree level found: ${level} -> ${studyHours} ชม.`);
    } else {
      // Multiple degree levels found
      if (degreeLevel) {
        // User has selected a degree level
        const selected = matchesByDegree.get(degreeLevel);
        if (selected) {
          studyHours = selected.studyHours;
          studyHoursBreakdown = selected.breakdown;
          console.log(`✅ User selected: ${degreeLevel} -> ${studyHours} ชม.`);
        }
      } else {
        // Return options for user to choose
        const degreeOptions = Array.from(matchesByDegree.entries()).map(([level, data]) => ({
          level,
          credit: data.credit,
          studyHours: data.studyHours,
          breakdown: data.breakdown,
        }));

        console.log(`⚠️ Multiple degree levels found (${matchesByDegree.size}), user needs to choose`);

        return {
          success: true,
          found: true,
          studyHours: null,
          multipleDegrees: true,
          degreeOptions
        };
      }
    }

    // If not found in table, try looking for detail link as fallback
    if (studyHours === null) {
      $('a[href*="class_info_1.asp"]').each(function() {
        const href = $(this).attr('href');
        if (href && !courseDetailUrl) {
          courseDetailUrl = href.startsWith('http')
            ? href
            : `https://ces.wu.ac.th/registrar/${href}`;
        }
      });

      if (courseDetailUrl) {
        console.log(`🔗 Found course detail URL: ${courseDetailUrl}`);

        // Fetch detail page
        const detailResponse = await fetch(courseDetailUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        // Read as buffer and decode TIS-620
        const detailBuffer = await detailResponse.arrayBuffer();
        const detailHtml = iconv.decode(Buffer.from(detailBuffer), 'tis-620');

        // Save detail HTML
        fs.writeFileSync('/tmp/registrar-detail.html', detailHtml);
        console.log('💾 Saved detail HTML to /tmp/registrar-detail.html');

        // Parse credit info: "4 (3-2-7)"
        // Look for pattern: number (number-number-number)
        const creditPattern = /(\d+)\s*\((\d+)-(\d+)-(\d+)\)/;
        const match = detailHtml.match(creditPattern);

        if (match) {
          const credits = match[1];
          const lecture = match[2];
          const lab = match[3];
          const selfStudy = match[4];

          studyHours = parseInt(selfStudy);
          console.log(`✅ Found credit info from detail: ${credits} (${lecture}-${lab}-${selfStudy}) -> Study hours: ${studyHours}`);
        } else {
          console.log('⚠️ Could not parse credit info from detail page');
        }
      } else {
        console.log('⚠️ Course not found in registrar search results');
      }
    }

    return {
      success: true,
      found: studyHours !== null,
      studyHours: studyHours,
      breakdown: studyHoursBreakdown,
      courseDetailUrl: courseDetailUrl || undefined
    };

  } catch (error) {
    console.error('❌ Error fetching study hours:', error);
    return {
      success: false,
      found: false,
      studyHours: null,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
