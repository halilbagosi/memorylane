import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DatePickerModal } from 'react-native-paper-dates';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { AppIcon } from '../../src/components/AppIcon';
import { CaregiverAvatarButton } from '../../src/components/CaregiverAvatarButton';
import { API_BASE_URL } from '../../src/config/api';
import { clearAuth, getCaregiverInfo, getToken } from '../../src/utils/auth';

type FilterKey = 'day' | 'week' | 'month' | 'year' | 'custom';

type QuizReport = {
  id: string;
  name: string;
  attempts: number;
  averagePercent: number;
  pointsEarned: number;
  pointsTotal: number;
  completed: number;
};

type QuestionOutcome = {
  id: string;
  prompt: string;
  status: 'Correct' | 'Wrong' | 'Skipped';
  attemptsUntilResult: number;
  duration: string;
  takenAt: string;
};

type QuizTypeReport = {
  id: string;
  label: string;
  description: string;
  quizzes: QuizReport[];
};

type DateOption = {
  label: string;
  value: string;
};

type FilterOption = {
  key: FilterKey;
  label: string;
};

type PatientListItem = {
  id: string;
  name: string;
  surname: string;
};

type AppliedFilter = {
  filter: FilterKey;
  dateValue: string;
  customFrom: string;
  customTo: string;
};

const FILTERS: FilterOption[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' },
];

const TODAY = new Date(2026, 4, 7);
const CAREGIVER_REGISTERED_AT = new Date(2024, 0, 12);

function ordinal(day: number) {
  if (day > 3 && day < 21) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function formatLongDate(date: Date) {
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${weekdays[date.getDay()]}, ${months[date.getMonth()]} ${ordinal(date.getDate())}, ${date.getFullYear()}`;
}

function formatShortDate(date: Date) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[date.getMonth()]} ${ordinal(date.getDate())}, ${date.getFullYear()}`;
}

function formatExportTimestamp(date: Date) {
  return `${formatShortDate(date)} at ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromISODate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getFilterScopeLabel(filter: FilterKey, dateValue: string, customFrom: string, customTo: string) {
  if (filter === 'custom') {
    return `${formatShortDate(fromISODate(customFrom))} - ${formatShortDate(fromISODate(customTo))}`;
  }

  if (filter === 'day') {
    return formatLongDate(fromISODate(dateValue));
  }

  const option = DATE_OPTIONS[filter].find((item) => item.value === dateValue) ?? DATE_OPTIONS[filter][0];
  return option?.label ?? '';
}

function buildMonthOptions(start: Date, end: Date): DateOption[] {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const options: DateOption[] = [];
  const cursor = new Date(end.getFullYear(), end.getMonth(), 1);
  const first = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor >= first) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    options.push({
      label: `${months[month]} ${year}`,
      value: `${year}-${String(month + 1).padStart(2, '0')}`,
    });
    cursor.setMonth(cursor.getMonth() - 1);
  }

  return options;
}

function buildYearOptions(start: Date, end: Date): DateOption[] {
  const options: DateOption[] = [];
  for (let year = end.getFullYear(); year >= start.getFullYear(); year -= 1) {
    options.push({ label: String(year), value: String(year) });
  }
  return options;
}

const DATE_OPTIONS: Record<Exclude<FilterKey, 'custom'>, DateOption[]> = {
  day: [
    { label: formatLongDate(TODAY), value: toISODate(TODAY) },
  ],
  week: [
    { label: 'May 4th - May 10th, 2026', value: '2026-W19' },
    { label: 'April 27th - May 3rd, 2026', value: '2026-W18' },
    { label: 'April 20th - April 26th, 2026', value: '2026-W17' },
  ],
  month: buildMonthOptions(CAREGIVER_REGISTERED_AT, TODAY),
  year: buildYearOptions(CAREGIVER_REGISTERED_AT, TODAY),
};

const DEFAULT_CUSTOM_FROM = '2026-05-01';
const DEFAULT_CUSTOM_TO = toISODate(TODAY);

const QUIZ_TYPES: QuizTypeReport[] = [
  {
    id: 'face',
    label: 'Type A',
    description: 'Face recognition',
    quizzes: [
      { id: 'face-1', name: 'Morning Family Faces', attempts: 18, averagePercent: 82, pointsEarned: 410, pointsTotal: 500, completed: 15 },
      { id: 'face-2', name: 'Close Friends', attempts: 13, averagePercent: 68, pointsEarned: 272, pointsTotal: 400, completed: 10 },
      { id: 'face-3', name: 'Grandchildren', attempts: 9, averagePercent: 91, pointsEarned: 273, pointsTotal: 300, completed: 8 },
    ],
  },
  {
    id: 'voice',
    label: 'Type B',
    description: 'Voice matching',
    quizzes: [
      { id: 'voice-1', name: 'Who Said It?', attempts: 11, averagePercent: 74, pointsEarned: 222, pointsTotal: 300, completed: 9 },
      { id: 'voice-2', name: 'Familiar Voices', attempts: 7, averagePercent: 57, pointsEarned: 171, pointsTotal: 300, completed: 5 },
    ],
  },
  {
    id: 'memory',
    label: 'Type C',
    description: 'Memory prompts',
    quizzes: [
      { id: 'memory-1', name: 'Places We Know', attempts: 16, averagePercent: 79, pointsEarned: 316, pointsTotal: 400, completed: 13 },
      { id: 'memory-2', name: 'Holiday Moments', attempts: 8, averagePercent: 64, pointsEarned: 192, pointsTotal: 300, completed: 6 },
      { id: 'memory-3', name: 'Daily Routines', attempts: 14, averagePercent: 86, pointsEarned: 344, pointsTotal: 400, completed: 12 },
      { id: 'memory-4', name: 'Favorite Songs', attempts: 6, averagePercent: 48, pointsEarned: 96, pointsTotal: 200, completed: 4 },
    ],
  },
];

function summarize(quizzes: QuizReport[]) {
  const attempts = quizzes.reduce((sum, quiz) => sum + quiz.attempts, 0);
  const completed = quizzes.reduce((sum, quiz) => sum + quiz.completed, 0);
  const pointsEarned = quizzes.reduce((sum, quiz) => sum + quiz.pointsEarned, 0);
  const pointsTotal = quizzes.reduce((sum, quiz) => sum + quiz.pointsTotal, 0);
  const averagePercent = pointsTotal > 0 ? Math.round((pointsEarned / pointsTotal) * 100) : 0;

  return { attempts, completed, pointsEarned, pointsTotal, averagePercent };
}

function filterMultiplier(filter: FilterKey | null) {
  switch (filter) {
    case 'day':
      return 0.38;
    case 'week':
      return 0.62;
    case 'month':
      return 0.82;
    case 'custom':
      return 0.72;
    case 'year':
    default:
      return 1;
  }
}

function applyTimeFilterToQuiz(quiz: QuizReport, filter: FilterKey | null): QuizReport {
  if (!filter) return quiz;

  const multiplier = filterMultiplier(filter);
  const attempts = Math.max(1, Math.round(quiz.attempts * multiplier));
  const completed = Math.min(attempts, Math.max(1, Math.round(quiz.completed * multiplier)));
  const percentShift = filter === 'day' ? -3 : filter === 'week' ? -1 : filter === 'custom' ? 1 : 0;
  const averagePercent = Math.max(0, Math.min(100, quiz.averagePercent + percentShift));
  const pointsTotal = Math.max(50, Math.round(quiz.pointsTotal * multiplier));
  const pointsEarned = Math.min(pointsTotal, Math.round(pointsTotal * (averagePercent / 100)));

  return {
    ...quiz,
    attempts,
    completed,
    averagePercent,
    pointsEarned,
    pointsTotal,
  };
}

function thresholdStage(percent: number) {
  if (percent < 20) return 1;
  if (percent < 40) return 2;
  if (percent < 60) return 3;
  if (percent < 80) return 4;
  return 5;
}

function getQuestionOutcomes(quizId: string): QuestionOutcome[] {
  const outcomes: Record<string, QuestionOutcome[]> = {
    'face-1': [
      { id: 'q1', prompt: 'Recognize Elena from family photos', status: 'Correct', attemptsUntilResult: 1, duration: '00:18', takenAt: 'May 6th, 2026 at 09:14' },
      { id: 'q2', prompt: 'Recognize Arben at the beach', status: 'Wrong', attemptsUntilResult: 2, duration: '01:07', takenAt: 'May 6th, 2026 at 09:16' },
      { id: 'q3', prompt: 'Recognize Mira with grandchildren', status: 'Skipped', attemptsUntilResult: 3, duration: '02:12', takenAt: 'May 6th, 2026 at 09:19' },
      { id: 'q4', prompt: 'Recognize Drita in the garden', status: 'Correct', attemptsUntilResult: 1, duration: '00:24', takenAt: 'May 6th, 2026 at 09:21' },
    ],
    'face-2': [
      { id: 'q1', prompt: 'Match Luan to his portrait', status: 'Correct', attemptsUntilResult: 1, duration: '00:31', takenAt: 'May 5th, 2026 at 15:08' },
      { id: 'q2', prompt: 'Find Ana in the group photo', status: 'Wrong', attemptsUntilResult: 2, duration: '01:26', takenAt: 'May 5th, 2026 at 15:10' },
      { id: 'q3', prompt: 'Recognize Besa from dinner', status: 'Correct', attemptsUntilResult: 1, duration: '00:43', takenAt: 'May 5th, 2026 at 15:13' },
    ],
    'face-3': [
      { id: 'q1', prompt: 'Recognize grandchildren together', status: 'Correct', attemptsUntilResult: 1, duration: '00:15', takenAt: 'May 4th, 2026 at 10:02' },
      { id: 'q2', prompt: 'Match portrait to name', status: 'Correct', attemptsUntilResult: 1, duration: '00:28', takenAt: 'May 4th, 2026 at 10:04' },
    ],
  };

  return outcomes[quizId] ?? [
    { id: 'q1', prompt: 'Question 1', status: 'Correct', attemptsUntilResult: 1, duration: '00:29', takenAt: 'May 6th, 2026 at 11:20' },
    { id: 'q2', prompt: 'Question 2', status: 'Wrong', attemptsUntilResult: 2, duration: '01:03', takenAt: 'May 6th, 2026 at 11:23' },
    { id: 'q3', prompt: 'Question 3', status: 'Skipped', attemptsUntilResult: 2, duration: '01:48', takenAt: 'May 6th, 2026 at 11:26' },
  ];
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function chunkRows(rows: string[], size: number) {
  const chunks: string[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

function buildPdfHtml({
  title,
  eyebrow,
  filterLabel,
  summary,
  quizzes,
  selectedQuiz,
  patientName,
  caregiverName,
  exportedAt,
}: {
  title: string;
  eyebrow: string;
  filterLabel: string;
  summary: ReturnType<typeof summarize>;
  quizzes: QuizReport[];
  selectedQuiz: QuizReport | null;
  patientName: string;
  caregiverName: string;
  exportedAt: string;
}) {
  const tableHeader = selectedQuiz
    ? '<tr><th>Question</th><th>Result</th><th>Tries</th><th>Time</th><th>Taken</th></tr>'
    : '<tr><th>Quiz</th><th>Score</th><th>Points</th><th>Threshold</th><th>Completed/Attempts</th></tr>';
  const rowItems: string[] = selectedQuiz
    ? getQuestionOutcomes(selectedQuiz.id).map((outcome) => `
      <tr>
        <td>${escapeHtml(outcome.prompt)}</td>
        <td>${escapeHtml(outcome.status)}</td>
        <td>${outcome.attemptsUntilResult}</td>
        <td>${escapeHtml(outcome.duration)}</td>
        <td>${escapeHtml(outcome.takenAt)}</td>
      </tr>
    `)
    : quizzes.map((quiz) => `
      <tr>
        <td>${escapeHtml(quiz.name)}</td>
        <td>${quiz.averagePercent}%</td>
        <td>${quiz.pointsEarned}/${quiz.pointsTotal}</td>
        <td>${thresholdStage(quiz.averagePercent)}/5</td>
        <td>${quiz.completed}/${quiz.attempts}</td>
      </tr>
    `);
  const firstPageRowCount = selectedQuiz ? 8 : 6;
  const continuationRowCount = selectedQuiz ? 10 : 12;
  const tableChunks = rowItems.length <= firstPageRowCount
    ? [rowItems]
    : [
        rowItems.slice(0, firstPageRowCount),
        ...chunkRows(rowItems.slice(firstPageRowCount), continuationRowCount),
      ];
  const chartRows = quizzes.map((quiz) => `
    <div class="bar-row">
      <div class="bar-name">${escapeHtml(quiz.name)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${quiz.averagePercent}%"></div></div>
      <div class="bar-value">${quiz.averagePercent}%</div>
    </div>
  `).join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 18mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; color: #1A1A1A; padding: 0; }
          .pdf-page { padding: 28px; }
          .pdf-page.page-break { page-break-after: always; break-after: page; }
          .continued-page { padding-top: 42px; }
          .continued-title { color: #666; font-size: 12px; font-weight: 700; margin-bottom: 10px; text-transform: uppercase; }
          .eyebrow { color: #03573a; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
          h1 { font-size: 28px; margin: 0 0 8px; }
          .metadata { margin-bottom: 22px; }
          .scope { color: #666; font-size: 13px; margin: 0 0 4px; }
          .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 22px; }
          .metric { border: 1px solid #dfe7e2; border-radius: 8px; padding: 12px; background: #f7fbf8; }
          .metric-label { color: #666; font-size: 11px; font-weight: 600; margin-bottom: 5px; }
          .metric-value { font-size: 20px; font-weight: 800; }
          h2 { font-size: 17px; margin: 24px 0 10px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          @media print {
            .pdf-page.page-break { page-break-after: always; break-after: page; }
            .continued-page { padding-top: 42px; }
            tr { break-inside: avoid; page-break-inside: avoid; }
          }
          th { text-align: left; background: #E8F5EC; padding: 9px; }
          td { border-bottom: 1px solid #e3e8e5; padding: 9px; vertical-align: top; }
          .bar-row { display: grid; grid-template-columns: 170px 1fr 44px; align-items: center; gap: 10px; margin: 8px 0; font-size: 12px; }
          .bar-track { height: 10px; border-radius: 5px; background: rgba(3, 87, 58, 0.12); overflow: hidden; }
          .bar-fill { height: 10px; border-radius: 5px; background: #03573a; }
          .bar-value { text-align: right; font-weight: 700; }
          .note { color: #666; font-size: 11px; margin-top: 18px; }
        </style>
      </head>
      <body>
        <section class="pdf-page ${tableChunks.length > 1 ? 'page-break' : ''}">
          <div class="eyebrow">${escapeHtml(eyebrow)}</div>
          <h1>${escapeHtml(title)}</h1>
          <div class="metadata">
            <div class="scope">Patient: ${escapeHtml(patientName)}</div>
            <div class="scope">Exported by: ${escapeHtml(caregiverName)}</div>
            <div class="scope">Exported at: ${escapeHtml(exportedAt)}</div>
            <div class="scope">Filtered by ${escapeHtml(filterLabel)}</div>
          </div>

          <div class="metrics">
            <div class="metric"><div class="metric-label">Score</div><div class="metric-value">${summary.averagePercent}%</div></div>
            <div class="metric"><div class="metric-label">Points</div><div class="metric-value">${summary.pointsEarned}/${summary.pointsTotal}</div></div>
            <div class="metric"><div class="metric-label">Threshold</div><div class="metric-value">${thresholdStage(summary.averagePercent)}/5</div></div>
            <div class="metric"><div class="metric-label">Attempts</div><div class="metric-value">${summary.completed}/${summary.attempts}</div></div>
          </div>

          ${selectedQuiz ? '' : `<h2>Score comparison</h2>${chartRows}`}

          <h2>${selectedQuiz ? 'Question feedback' : 'Quiz report'}</h2>
          <table>
            <thead>${tableHeader}</thead>
            <tbody>${tableChunks[0]?.join('') ?? ''}</tbody>
          </table>
        </section>
        ${tableChunks.slice(1).map((chunk, index) => `
          <section class="pdf-page continued-page ${index < tableChunks.slice(1).length - 1 ? 'page-break' : ''}">
            <div class="continued-title">${selectedQuiz ? 'Question feedback' : 'Quiz report'} continued</div>
            <table>
              <thead>${tableHeader}</thead>
              <tbody>${chunk.join('')}</tbody>
            </table>
          </section>
        `).join('')}
        <div class="note">MemoryLane progress report generated from mock visualization data.</div>
      </body>
    </html>
  `;
}

export default function AnalyticsTab() {
  const router = useRouter();
  const [draftFilter, setDraftFilter] = useState<FilterKey>('day');
  const [draftDateValue, setDraftDateValue] = useState(DATE_OPTIONS.day[0].value);
  const [draftCustomFrom, setDraftCustomFrom] = useState(DEFAULT_CUSTOM_FROM);
  const [draftCustomTo, setDraftCustomTo] = useState(DEFAULT_CUSTOM_TO);
  const [appliedFilter, setAppliedFilter] = useState<AppliedFilter | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<'day' | 'from' | 'to' | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [patientOptions, setPatientOptions] = useState<DateOption[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [caregiverName, setCaregiverName] = useState('Caregiver');
  const [exporting, setExporting] = useState(false);

  const allQuizzes = useMemo(
    () => QUIZ_TYPES.flatMap((type) => type.quizzes),
    []
  );
  const selectedType = QUIZ_TYPES.find((type) => type.id === selectedTypeId) ?? null;
  const isOverallSelected = selectedTypeId === 'overall';
  const detailQuizzes = isOverallSelected ? allQuizzes : selectedType?.quizzes ?? [];
  const activeFilterKey = appliedFilter?.filter ?? null;
  const visibleDetailQuizzes = useMemo(
    () => detailQuizzes.map((quiz) => applyTimeFilterToQuiz(quiz, activeFilterKey)),
    [detailQuizzes, activeFilterKey]
  );
  const detailSummary = summarize(visibleDetailQuizzes);
  const detailTitle = isOverallSelected ? 'All quiz types' : selectedType?.description ?? '';
  const detailEyebrow = isOverallSelected ? 'Overall' : `${selectedType?.label} overall`;
  const draftDateOptions = draftFilter === 'custom' ? [] : DATE_OPTIONS[draftFilter];
  const draftDate = draftDateOptions.find((option) => option.value === draftDateValue) ?? draftDateOptions[0];
  const draftDateLabel = getFilterScopeLabel(draftFilter, draftDateValue, draftCustomFrom, draftCustomTo);
  const selectedQuiz = visibleDetailQuizzes.find((quiz) => quiz.id === selectedQuizId) ?? null;
  const selectedQuizSummary = selectedQuiz ? summarize([selectedQuiz]) : null;
  const selectedPatient = patientOptions.find((patient) => patient.value === selectedPatientId) ?? null;

  useEffect(() => {
    let cancelled = false;

    const fetchPatients = async () => {
      try {
        const token = await getToken();
        const caregiver = await getCaregiverInfo();
        if (caregiver && !cancelled) {
          setCaregiverName(`${caregiver.name} ${caregiver.surname}`.trim());
        }

        if (!token) {
          router.replace('/login');
          return;
        }

        const res = await fetch(`${API_BASE_URL}/patients/my-list`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          await clearAuth();
          router.replace('/login');
          return;
        }

        if (!res.ok) {
          throw new Error('Could not load patients.');
        }

        const data = await res.json();
        const list: PatientListItem[] = Array.isArray(data) ? data : (data.patients || []);
        const options = list.map((patient) => ({
          label: `${patient.name} ${patient.surname}`,
          value: patient.id,
        }));

        if (!cancelled) {
          setPatientOptions(options);
          setSelectedPatientId((current) => current ?? options[0]?.value ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          Alert.alert('Patients unavailable', error instanceof Error ? error.message : 'Could not load patients.');
        }
      } finally {
        if (!cancelled) setPatientsLoading(false);
      }
    };

    fetchPatients();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleFilterChange = (filter: FilterKey) => {
    setDraftFilter(filter);
    if (filter !== 'custom') {
      setDraftDateValue(DATE_OPTIONS[filter][0].value);
    }
  };
  const activeFilterLabel = appliedFilter
    ? `${FILTERS.find((filter) => filter.key === appliedFilter.filter)?.label ?? 'Day'}: ${getFilterScopeLabel(appliedFilter.filter, appliedFilter.dateValue, appliedFilter.customFrom, appliedFilter.customTo)}`
    : null;
  const openFilter = () => {
    if (appliedFilter) {
      setDraftFilter(appliedFilter.filter);
      setDraftDateValue(appliedFilter.dateValue);
      setDraftCustomFrom(appliedFilter.customFrom);
      setDraftCustomTo(appliedFilter.customTo);
    }
    setFilterOpen(true);
  };
  const clearFilter = () => {
    setAppliedFilter(null);
    setDraftFilter('day');
    setDraftDateValue(DATE_OPTIONS.day[0].value);
    setDraftCustomFrom(DEFAULT_CUSTOM_FROM);
    setDraftCustomTo(DEFAULT_CUSTOM_TO);
    setFilterOpen(false);
    setDatePickerTarget(null);
  };
  const exportReport = async () => {
    if (exporting) return;

    try {
      setExporting(true);
      const title = selectedQuiz ? selectedQuiz.name : detailTitle;
      const summary = selectedQuizSummary ?? detailSummary;
      const exportedAt = formatExportTimestamp(new Date());
      const pdf = await Print.printToFileAsync({
        html: buildPdfHtml({
          title,
          eyebrow: selectedQuiz ? 'Individual quiz' : detailEyebrow,
          filterLabel: activeFilterLabel ?? 'No time filter',
          summary,
          quizzes: selectedQuiz ? [selectedQuiz] : visibleDetailQuizzes,
          selectedQuiz,
          patientName: selectedPatient?.label ?? 'No patient selected',
          caregiverName,
          exportedAt,
        }),
        base64: false,
      });

      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        Alert.alert('PDF created', `The report was created at ${pdf.uri}`);
        return;
      }

      await Sharing.shareAsync(pdf.uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: 'Share progress report',
      });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not create the PDF report.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Progress</Text>
          <Text style={styles.headerSubtitle}>Mock quiz reports for patient progress</Text>
        </View>
        <CaregiverAvatarButton />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {selectedTypeId ? (
          <>
            <Pressable
              style={styles.backButton}
              onPress={() => {
                if (selectedQuizId) {
                  setSelectedQuizId(null);
                } else {
                  setSelectedTypeId(null);
                  setFilterOpen(false);
                }
              }}
            >
              <AppIcon iosName="chevron.left" androidFallback="<" size={18} color={colors.secondary} />
              <Text style={styles.backButtonText}>{selectedQuizId ? detailTitle : 'All quiz types'}</Text>
            </Pressable>

            <ActionRow
              onOpenFilter={openFilter}
              activeFilterLabel={activeFilterLabel}
              onClearFilter={clearFilter}
              onExport={exportReport}
              exporting={exporting}
            />

            {selectedQuiz ? (
              <>
                <ReportPanel
                  eyebrow="Individual quiz"
                  title={selectedQuiz.name}
                  summary={selectedQuizSummary!}
                  quizCount={1}
                />
                <QuizAttemptDetails quiz={selectedQuiz} />
              </>
            ) : (
              <>
                <ReportPanel
                  eyebrow={detailEyebrow}
                  title={detailTitle}
                  summary={detailSummary}
                  quizCount={visibleDetailQuizzes.length}
                />

                <ReportCharts quizzes={visibleDetailQuizzes} selectedFilter={activeFilterKey ?? 'year'} />

                <Text style={styles.sectionTitle}>Individual quizzes</Text>
                {visibleDetailQuizzes.map((quiz) => (
                  <QuizRow key={quiz.id} quiz={quiz} onPress={() => setSelectedQuizId(quiz.id)} />
                ))}
              </>
            )}
          </>
        ) : (
          <>
            <View style={styles.patientPanel}>
              <Text style={styles.filterLabel}>Choose patient</Text>
              {patientsLoading ? (
                <Text style={styles.emptyText}>Loading patients...</Text>
              ) : patientOptions.length > 0 ? (
                <SelectDropdown
                  value={selectedPatientId ?? ''}
                  label={selectedPatient?.label ?? 'Choose patient'}
                  options={patientOptions}
                  onSelect={(value) => {
                    setSelectedPatientId(value);
                    setSelectedTypeId(null);
                    setSelectedQuizId(null);
                    setFilterOpen(false);
                  }}
                />
              ) : (
                <Text style={styles.emptyText}>No patients found for this caregiver account.</Text>
              )}
            </View>

            <Text style={styles.sectionTitle}>Quiz types</Text>
            <TypeRow
              label="Overall"
              description="All Type A, B, and C quizzes"
              quizCount={allQuizzes.length}
              onPress={() => setSelectedTypeId('overall')}
            />
            {QUIZ_TYPES.map((type) => (
              <TypeRow
                key={type.id}
                label={type.label}
                description={type.description}
                quizCount={type.quizzes.length}
                onPress={() => setSelectedTypeId(type.id)}
              />
            ))}
          </>
        )}
      </ScrollView>

      <FilterModal
        visible={filterOpen}
        selectedFilter={draftFilter}
        selectedDate={draftDate}
        selectedDateOptions={draftDateOptions}
        selectedDateLabel={draftDateLabel}
        customFromValue={draftCustomFrom}
        customToValue={draftCustomTo}
        onFilterChange={handleFilterChange}
        onDateValueChange={setDraftDateValue}
        onOpenCalendar={setDatePickerTarget}
        onApply={() => {
          setAppliedFilter({
            filter: draftFilter,
            dateValue: draftDateValue,
            customFrom: draftCustomFrom,
            customTo: draftCustomTo,
          });
          setFilterOpen(false);
        }}
        onClose={() => setFilterOpen(false)}
      />

      <DatePickerModal
        locale="en"
        mode="single"
        visible={datePickerTarget != null}
        onDismiss={() => setDatePickerTarget(null)}
        date={datePickerTarget === 'from' ? fromISODate(draftCustomFrom) : datePickerTarget === 'to' ? fromISODate(draftCustomTo) : fromISODate(draftDateValue)}
        onConfirm={({ date }: { date: Date | undefined }) => {
          setDatePickerTarget(null);
          if (!date) return;
          const iso = toISODate(date);
          if (datePickerTarget === 'from') {
            setDraftCustomFrom(iso);
          } else if (datePickerTarget === 'to') {
            setDraftCustomTo(iso);
          } else {
            setDraftDateValue(iso);
          }
        }}
        validRange={{ startDate: CAREGIVER_REGISTERED_AT, endDate: TODAY }}
        label="Select date"
        saveLabel="OK"
      />
    </SafeAreaView>
  );
}

function SelectDropdown({
  value,
  label,
  options,
  onSelect,
  disabled = false,
  icon,
}: {
  value: string;
  label: string;
  options: DateOption[];
  onSelect: (value: string) => void;
  disabled?: boolean;
  icon?: 'calendar';
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.selectWrap, open && styles.selectWrapOpen]}>
      <Pressable
        style={[styles.selectButton, disabled && styles.selectDisabled]}
        onPress={() => {
          if (!disabled) setOpen((current) => !current);
        }}
      >
        {icon === 'calendar' && (
          <AppIcon iosName="calendar" androidFallback="C" size={16} color={colors.secondary} />
        )}
        <Text style={[styles.selectText, disabled && styles.selectTextDisabled]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.selectChevron}>v</Text>
      </Pressable>

      {open && !disabled && (
        <View style={styles.selectMenu}>
          <ScrollView nestedScrollEnabled style={styles.selectMenuScroll}>
            {options.map((option) => {
              const active = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.selectOption, active && styles.selectOptionActive]}
                  onPress={() => {
                    onSelect(option.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.selectOptionText, active && styles.selectOptionTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function CalendarField({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.selectWrap}>
      <Pressable style={styles.selectButton} onPress={onPress}>
        <AppIcon iosName="calendar" androidFallback="C" size={16} color={colors.secondary} />
        <Text style={styles.selectText} numberOfLines={1}>{label}</Text>
        <Text style={styles.selectChevron}>v</Text>
      </Pressable>
    </View>
  );
}

function ActionRow({
  onOpenFilter,
  activeFilterLabel,
  onClearFilter,
  onExport,
  exporting,
}: {
  onOpenFilter: () => void;
  activeFilterLabel: string | null;
  onClearFilter: () => void;
  onExport: () => void;
  exporting: boolean;
}) {
  return (
    <View style={styles.actionRow}>
      <Pressable
        style={[styles.actionButton, styles.filterActionButton, activeFilterLabel && styles.filterActionButtonActive]}
        onPress={onOpenFilter}
      >
        <AppIcon iosName="calendar" androidFallback="C" size={16} color={colors.secondary} />
        <Text style={styles.actionButtonText} numberOfLines={1}>
          {activeFilterLabel ?? 'Filter time'}
        </Text>
        {activeFilterLabel && (
          <Pressable
            style={styles.clearFilterButton}
            onPress={(event) => {
              event.stopPropagation();
              onClearFilter();
            }}
          >
            <Text style={styles.clearFilterText}>X</Text>
          </Pressable>
        )}
      </Pressable>
      <Pressable
        style={[styles.actionButton, styles.exportButton, exporting && styles.actionDisabled]}
        onPress={onExport}
        disabled={exporting}
      >
        <AppIcon iosName="doc.on.doc" androidFallback="PDF" size={16} color={colors.textLight} />
        <Text style={styles.exportButtonText}>{exporting ? 'Creating PDF...' : 'Export as PDF'}</Text>
      </Pressable>
    </View>
  );
}

function FilterModal({
  visible,
  selectedFilter,
  selectedDate,
  selectedDateOptions,
  selectedDateLabel,
  customFromValue,
  customToValue,
  onFilterChange,
  onDateValueChange,
  onOpenCalendar,
  onApply,
  onClose,
}: {
  visible: boolean;
  selectedFilter: FilterKey;
  selectedDate: DateOption | undefined;
  selectedDateOptions: DateOption[];
  selectedDateLabel: string;
  customFromValue: string;
  customToValue: string;
  onFilterChange: (filter: FilterKey) => void;
  onDateValueChange: (value: string) => void;
  onOpenCalendar: (target: 'day' | 'from' | 'to') => void;
  onApply: () => void;
  onClose: () => void;
}) {
  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.filterModalCard}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Filter time</Text>
          <Pressable style={styles.modalCloseButton} onPress={onClose}>
            <Text style={styles.modalCloseText}>X</Text>
          </Pressable>
        </View>

        <Text style={styles.filterLabel}>Filter time:</Text>
        <View style={styles.filterControls}>
          <SelectDropdown
            value={selectedFilter}
            label={FILTERS.find((filter) => filter.key === selectedFilter)?.label ?? 'Day'}
            options={FILTERS.map((filter) => ({ label: filter.label, value: filter.key }))}
            onSelect={(value) => onFilterChange(value as FilterKey)}
          />
          {selectedFilter === 'custom' ? (
            <>
              <CalendarField
                label={`From ${formatShortDate(fromISODate(customFromValue))}`}
                onPress={() => onOpenCalendar('from')}
              />
              <CalendarField
                label={`To ${formatShortDate(fromISODate(customToValue))}`}
                onPress={() => onOpenCalendar('to')}
              />
            </>
          ) : selectedFilter === 'day' ? (
            <CalendarField
              label={selectedDateLabel}
              onPress={() => onOpenCalendar('day')}
            />
          ) : (
            <SelectDropdown
              value={selectedDate?.value ?? ''}
              label={selectedDate?.label ?? ''}
              options={selectedDateOptions}
              onSelect={onDateValueChange}
              disabled={!selectedFilter}
            />
          )}
        </View>

        <View style={styles.modalActions}>
          <Pressable style={[styles.modalButton, styles.modalCancelButton]} onPress={onClose}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </Pressable>
          <Pressable style={[styles.modalButton, styles.modalApplyButton]} onPress={onApply}>
            <Text style={styles.modalApplyText}>Apply filter</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ReportPanel({
  eyebrow,
  title,
  summary,
  quizCount,
}: {
  eyebrow: string;
  title: string;
  summary: ReturnType<typeof summarize>;
  quizCount: number;
}) {
  return (
    <View style={styles.reportPanel}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.reportTitle}>{title}</Text>
      </View>
      <View style={styles.scoreGrid}>
        <Metric label="Score" value={`${summary.averagePercent}%`} />
        <Metric label="Points" value={`${summary.pointsEarned}/${summary.pointsTotal}`} />
        <Metric label="Threshold" value={`${thresholdStage(summary.averagePercent)}/5`} />
        <Metric label="Quizzes" value={String(quizCount)} />
      </View>
      <Text style={styles.reportNote}>
        {summary.completed} completed attempts from {summary.attempts} total attempts.
      </Text>
    </View>
  );
}

function TypeRow({
  label,
  description,
  quizCount,
  onPress,
}: {
  label: string;
  description: string;
  quizCount: number;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        onPress && pressed ? styles.rowPressed : undefined,
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowSubtitle}>{description}</Text>
        <Text style={styles.rowMeta}>{quizCount} quizzes</Text>
      </View>
      {onPress && (
        <AppIcon iosName="chevron.right" androidFallback=">" size={20} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

function QuizRow({ quiz, onPress }: { quiz: QuizReport; onPress?: () => void }) {
  const summary = summarize([quiz]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        onPress && pressed ? styles.rowPressed : undefined,
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{quiz.name}</Text>
        <Text style={styles.rowSubtitle}>{quiz.completed} completed attempts</Text>
        <Text style={styles.rowMeta}>{quiz.attempts} total attempts</Text>
      </View>
      <View style={styles.rowScore}>
        <Text style={styles.percent}>{summary.averagePercent}%</Text>
        <Text style={styles.points}>{summary.pointsEarned}/{summary.pointsTotal}</Text>
        <Text style={styles.stage}>{thresholdStage(summary.averagePercent)}/5</Text>
      </View>
      {onPress && (
        <AppIcon iosName="chevron.right" androidFallback=">" size={20} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

function QuizAttemptDetails({ quiz }: { quiz: QuizReport }) {
  const outcomes = getQuestionOutcomes(quiz.id);

  return (
    <View>
      <Text style={styles.sectionTitle}>Question feedback</Text>
      {outcomes.map((outcome) => (
        <View key={outcome.id} style={styles.questionCard}>
          <View style={styles.questionHeader}>
            <Text style={styles.questionPrompt}>{outcome.prompt}</Text>
            <Text style={[
              styles.questionStatus,
              outcome.status === 'Correct' ? styles.statusCorrect : undefined,
              outcome.status === 'Wrong' ? styles.statusWrong : undefined,
              outcome.status === 'Skipped' ? styles.statusSkipped : undefined,
            ]}>
              {outcome.status}
            </Text>
          </View>
          <View style={styles.questionMetaGrid}>
            <Metric label="Tries" value={String(outcome.attemptsUntilResult)} />
            <Metric label="Time" value={outcome.duration} />
          </View>
          <Text style={styles.questionTakenAt}>Taken {outcome.takenAt}</Text>
        </View>
      ))}
    </View>
  );
}

function ReportCharts({
  quizzes,
  selectedFilter,
}: {
  quizzes: QuizReport[];
  selectedFilter: FilterKey;
}) {
  const maxAttempts = Math.max(...quizzes.map((quiz) => quiz.attempts), 1);
  const stageCounts = [1, 2, 3, 4, 5].map((stage) => ({
    stage,
    count: quizzes.filter((quiz) => thresholdStage(quiz.averagePercent) === stage).length,
  }));
  const maxStageCount = Math.max(...stageCounts.map((item) => item.count), 1);
  const selectedLabel = FILTERS.find((filter) => filter.key === selectedFilter)?.label ?? 'Week';

  return (
    <View style={styles.chartsSection}>
      <View style={styles.chartPanel}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>Quiz score comparison</Text>
          <Text style={styles.chartRange}>{selectedLabel}</Text>
        </View>
        {quizzes.map((quiz) => (
          <View key={quiz.id} style={styles.barRow}>
            <View style={styles.barLabelWrap}>
              <Text style={styles.barLabel} numberOfLines={1}>{quiz.name}</Text>
              <Text style={styles.barSubLabel}>{quiz.pointsEarned}/{quiz.pointsTotal} pts</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.scoreBar, { width: `${quiz.averagePercent}%` }]} />
            </View>
            <Text style={styles.barValue}>{quiz.averagePercent}%</Text>
          </View>
        ))}
      </View>

      <View style={styles.chartPanel}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>Report distribution</Text>
          <Text style={styles.chartRange}>1/5 - 5/5</Text>
        </View>
        <View style={styles.stageChart}>
          {stageCounts.map((item) => (
            <View key={item.stage} style={styles.stageColumn}>
              <View style={styles.stageTrack}>
                <View
                  style={[
                    styles.stageBar,
                    { height: `${Math.max((item.count / maxStageCount) * 100, item.count > 0 ? 12 : 0)}%` },
                  ]}
                />
              </View>
              <Text style={styles.stageCount}>{item.count}</Text>
              <Text style={styles.stageLabel}>{item.stage}/5</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.chartPanel}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>Attempts by quiz</Text>
          <Text style={styles.chartRange}>{quizzes.reduce((sum, quiz) => sum + quiz.attempts, 0)} total</Text>
        </View>
        {quizzes.map((quiz) => (
          <View key={`${quiz.id}-attempts`} style={styles.barRow}>
            <View style={styles.barLabelWrap}>
              <Text style={styles.barLabel} numberOfLines={1}>{quiz.name}</Text>
              <Text style={styles.barSubLabel}>{quiz.completed} completed</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.attemptBar, { width: `${Math.max((quiz.attempts / maxAttempts) * 100, 6)}%` }]} />
            </View>
            <Text style={styles.barValue}>{quiz.attempts}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.neutral,
    position: 'relative',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 26,
    color: colors.textDark,
  },
  headerSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginBottom: 12,
  },
  actionButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(3, 87, 58, 0.22)',
    backgroundColor: colors.neutralLight,
    paddingHorizontal: 14,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  filterActionButton: {
    maxWidth: '100%',
  },
  filterActionButtonActive: {
    justifyContent: 'flex-start',
    backgroundColor: 'rgba(3, 87, 58, 0.10)',
  },
  actionButtonText: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.secondary,
    marginLeft: 8,
  },
  exportButton: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  actionDisabled: {
    opacity: 0.6,
  },
  exportButtonText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.textLight,
    marginLeft: 8,
  },
  clearFilterButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  clearFilterText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 13,
    color: colors.secondary,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
    zIndex: 100,
    elevation: 100,
  },
  filterModalCard: {
    borderRadius: 8,
    padding: 16,
    backgroundColor: colors.neutralLight,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    zIndex: 60,
    elevation: 60,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 19,
    color: colors.textDark,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  modalCloseText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.textDark,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  modalButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 14,
    marginLeft: 8,
  },
  modalCancelButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  modalApplyButton: {
    backgroundColor: colors.secondary,
  },
  modalCancelText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.textDark,
  },
  modalApplyText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.textLight,
  },
  patientPanel: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: colors.neutralLight,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    marginBottom: 16,
    zIndex: 20,
    elevation: 20,
  },
  emptyText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  filterLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.textDark,
    marginBottom: 10,
  },
  filterControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginBottom: -8,
  },
  selectWrap: {
    minWidth: '46%',
    flexGrow: 1,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  selectWrapOpen: {
    zIndex: 30,
    elevation: 30,
  },
  selectButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(3, 87, 58, 0.22)',
    backgroundColor: 'rgba(232, 245, 236, 0.55)',
    paddingHorizontal: 12,
  },
  selectDisabled: {
    opacity: 0.45,
  },
  selectText: {
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: 13,
    color: colors.textDark,
    marginLeft: 6,
  },
  selectTextDisabled: {
    color: colors.textMuted,
  },
  selectChevron: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.secondary,
    marginLeft: 8,
  },
  selectMenu: {
    position: 'absolute',
    top: 46,
    left: 0,
    right: 0,
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    backgroundColor: colors.neutralLight,
    overflow: 'hidden',
    zIndex: 40,
    elevation: 40,
  },
  selectMenuScroll: {
    maxHeight: 240,
  },
  selectOption: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  selectOptionActive: {
    backgroundColor: 'rgba(3, 87, 58, 0.10)',
  },
  selectOptionText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.textDark,
  },
  selectOptionTextActive: {
    fontFamily: typography.fontFamily.bold,
    color: colors.secondary,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingRight: 12,
    marginBottom: 8,
  },
  backButtonText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.secondary,
  },
  reportPanel: {
    borderRadius: 8,
    padding: 16,
    backgroundColor: colors.neutralLight,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    marginBottom: 18,
  },
  eyebrow: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.secondary,
    textTransform: 'uppercase',
  },
  reportTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 21,
    color: colors.textDark,
    marginTop: 4,
  },
  scoreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginTop: 14,
  },
  metric: {
    width: '50%',
    padding: 4,
  },
  metricLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
  metricValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 20,
    color: colors.textDark,
    marginTop: 2,
  },
  reportNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 10,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: colors.textDark,
    marginBottom: 10,
  },
  chartsSection: {
    marginBottom: 18,
  },
  chartPanel: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: colors.neutralLight,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    marginBottom: 10,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  chartTitle: {
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: colors.textDark,
    paddingRight: 10,
  },
  chartRange: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.secondary,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    marginBottom: 8,
  },
  barLabelWrap: {
    width: 112,
    paddingRight: 8,
  },
  barLabel: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.textDark,
  },
  barSubLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  barTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(3, 87, 58, 0.10)',
    overflow: 'hidden',
  },
  scoreBar: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: colors.secondary,
  },
  attemptBar: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: '#7AAE8A',
  },
  barValue: {
    width: 42,
    textAlign: 'right',
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.textDark,
  },
  stageChart: {
    height: 150,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  stageColumn: {
    flex: 1,
    alignItems: 'center',
  },
  stageTrack: {
    width: 24,
    height: 96,
    borderRadius: 8,
    backgroundColor: 'rgba(3, 87, 58, 0.10)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  stageBar: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: colors.secondary,
  },
  stageCount: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.textDark,
    marginTop: 6,
  },
  stageLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 14,
    backgroundColor: colors.neutralLight,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    marginBottom: 10,
  },
  rowPressed: {
    opacity: 0.75,
  },
  rowMain: {
    flex: 1,
    paddingRight: 12,
  },
  rowTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    color: colors.textDark,
  },
  rowSubtitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  rowMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 6,
  },
  rowScore: {
    minWidth: 76,
    alignItems: 'flex-end',
  },
  percent: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: colors.textDark,
  },
  points: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  stage: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    color: colors.secondary,
    marginTop: 4,
  },
  questionCard: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: colors.neutralLight,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    marginBottom: 10,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  questionPrompt: {
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: colors.textDark,
    paddingRight: 10,
  },
  questionStatus: {
    minWidth: 72,
    textAlign: 'center',
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    borderRadius: 8,
    overflow: 'hidden',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  statusCorrect: {
    color: '#1E6F43',
    backgroundColor: 'rgba(30, 111, 67, 0.12)',
  },
  statusWrong: {
    color: '#A33A2A',
    backgroundColor: 'rgba(163, 58, 42, 0.12)',
  },
  statusSkipped: {
    color: '#7A5A12',
    backgroundColor: 'rgba(122, 90, 18, 0.12)',
  },
  questionMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginTop: 10,
  },
  questionTakenAt: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
  },
});
